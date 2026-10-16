import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPlanCredentials } from '../../apps/server/plan-credentials.mjs';
import { getHostId, startLogin } from '../../apps/server/plan-oauth.mjs';
import { ISSUER, TOKEN_ENDPOINT, AUTHORIZE_ENDPOINT, SCOPES } from '../../apps/server/plan-oauth-protocol.mjs';

assert(Number(process.versions.node.split('.')[0]) >= 24, 'Browser acceptance requires Node.js 24 or newer');
const require = createRequire(new URL('../../apps/admin/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const repository = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(repository, 'artifacts/browser/oauth', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
await fs.mkdir(evidence, { recursive: true });
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'between-oauth-browser-qa-')));
const errors = [], blockedRequests = [], mockedRequests = [], interceptionErrors = [], screenshots = [], checks = [];
const startedAt = new Date().toISOString();
let browser, owner, helper, page, authUrl, exchanges = 0, stage = 'bootstrap';
const pass = (name) => { checks.push(name); console.log('PASS', name); };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'synthetic-browser-test' };

// All protocol responses are generated in memory; global fetch is never called.
const fakeFetch = async (url, options = {}) => {
  if (url === ISSUER + '/.well-known/openid-configuration') return Response.json({
    issuer: ISSUER, authorization_endpoint: AUTHORIZE_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT, jwks_uri: ISSUER + '/.well-known/jwks.json',
  });
  if (url === ISSUER + '/.well-known/jwks.json') return Response.json({ keys: [jwk] });
  assert.equal(url, TOKEN_ENDPOINT, 'Unexpected OAuth protocol request');
  assert(authUrl, 'An explicit authorization redirect must precede exchange');
  assert.equal(options.method, 'POST');
  assert.equal(options.body.get('redirect_uri'), authUrl.searchParams.get('redirect_uri'));
  assert.equal(options.body.get('code'), 'synthetic-browser-code');
  assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), authUrl.searchParams.get('code_challenge'));
  exchanges += 1;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: ISSUER, aud: 'oaiapp_browser_synthetic', sub: 'synthetic-admin',
    nonce: authUrl.searchParams.get('nonce'), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const unsigned = header + '.' + claims;
  return Response.json({
    id_token: unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url'),
    access_token: 'synthetic-browser-access', refresh_token: 'synthetic-browser-refresh',
    token_type: 'Bearer', expires_in: 3600, scope: SCOPES,
  });
};
const shot = async (name) => {
  const file = name + '.png';
  await page.screenshot({ path: path.join(evidence, file), fullPage: true, animations: 'disabled' });
  screenshots.push(file);
};

try {
  owner = await openPlanCredentials(path.join(root, 'private/grant.json'), { fetchImpl: fakeFetch });
  helper = await startLogin({ credentials: owner.credentials, hostId: await getHostId(owner.credentials.file), fetchImpl: fakeFetch, port: 0 });
  const origin = new URL(helper.url).origin;
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  assert(!['8787', '8766', '59720'].includes(new URL(origin).port), 'Do not use an existing application service port');
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, chromiumSandbox: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  // Intercept all redirected documents before network access. The fully mocked
  // official URL preserves cross-site callback and SameSite semantics. Only the
  // helper's freshly allocated loopback origin reaches a network socket.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', (event) => {
    void (async () => {
      const url = new URL(event.request.url);
      if (url.origin === origin) return cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      if (url.origin === ISSUER && url.pathname === '/api/accounts/authorize' && event.request.method === 'GET') {
        authUrl = url;
        mockedRequests.push('official-authorize-intercepted-before-network');
        return cdp.send('Fetch.fulfillRequest', {
          requestId: event.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic authorization</title><link rel="icon" href="data:,"><h1>Offline OAuth fixture</h1><p>No real authorization or external request.</p></html>').toString('base64'),
        });
      }
      blockedRequests.push({ method: event.request.method, origin: url.origin, path: url.pathname });
      return cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
    })().catch(async (error) => {
      interceptionErrors.push(error.message);
      await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
  });

  stage = 'local-helper-entry';
  await page.goto(helper.url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toBeVisible();
  assert.equal(exchanges, 0);
  assert.equal(mockedRequests.length, 0);
  assert((await context.cookies()).some((cookie) => cookie.name === 'between_oauth' && cookie.httpOnly && cookie.sameSite === 'Lax'));
  await shot('local-helper-before-explicit-login');
  pass('HttpOnly SameSite=Lax cookie; no automatic authorization or token exchange');

  stage = 'explicit-synthetic-authorization';
  await Promise.all([
    page.waitForURL(ISSUER + '/**', { waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click(),
  ]);
  assert(authUrl);
  await expect(page.getByRole('heading', { name: 'Offline OAuth fixture' })).toBeVisible();
  assert.equal(exchanges, 0);
  await shot('fully-intercepted-synthetic-authorize');
  pass('explicit redirect allowed by CSP; official page fulfilled before external network access');

  stage = 'synthetic-cross-site-callback';
  const callback = new URL(authUrl.searchParams.get('redirect_uri'));
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, '/auth/callback');
  callback.search = new URLSearchParams({
    state: authUrl.searchParams.get('state'), client_id: 'oaiapp_browser_synthetic', code: 'synthetic-browser-code',
  });
  await page.goto(callback.href, { waitUntil: 'domcontentloaded' });
  assert.equal((await helper.result).status, 'ready');
  assert.equal(exchanges, 1);
  await expect(page.locator('body')).toContainText('授权已安全保存');
  const saved = await owner.credentials.load();
  assert.equal(saved.grant_status, 'ready');
  assert.equal(saved.subject, 'synthetic-admin');
  assert.equal(saved.validated, true);
  assert.equal((await fs.stat(owner.credentials.file)).mode & 0o077, 0);
  await shot('synthetic-callback-complete');
  pass('cross-site callback cookie and state, PKCE redirect, signed token and owner-only synthetic grant');

  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  assert.deepEqual(interceptionErrors, []);
  assert.deepEqual(mockedRequests, ['official-authorize-intercepted-before-network']);
  pass('no browser errors, unexpected requests or real external requests');
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify({
    status: 'PASS', startedAt, completedAt: new Date().toISOString(), browser: await browser.version(),
    chromiumSandbox: true, checks, screenshots, exchanges, browserErrors: errors,
    blockedRequests, interceptionErrors, mockedRequests, actualExternalRequests: 0,
    scope: 'Temporary synthetic credentials, in-memory discovery/token/JWKS and pre-network intercepted authorization page. No real account, authorization, model request, or existing local service.',
  }, null, 2));
  console.log(`OAUTH BROWSER PASS ${checks.length}\nEvidence: ${evidence}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({
    status: 'FAIL', stage, error: String(error), stack: error.stack, startedAt,
    failedAt: new Date().toISOString(), checks, screenshots, exchanges,
    browserErrors: errors, blockedRequests, interceptionErrors, mockedRequests,
  }, null, 2));
  console.error(`OAuth browser acceptance failed at ${stage}. Evidence: ${evidence}`);
  throw error;
} finally {
  await browser?.close();
  await helper?.close();
  await owner?.close();
  await fs.rm(root, { recursive: true, force: true });
}
