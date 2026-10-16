import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../apps/server/server.mjs';
import { roles, snapshot } from '../../apps/server/roles.mjs';

assert(Number(process.versions.node.split('.')[0]) >= 24, 'Browser acceptance requires Node.js 24 or newer');
const require = createRequire(new URL('../../apps/admin/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const repository = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(repository, 'artifacts/browser/chat', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
await fs.mkdir(evidence, { recursive: true });
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'between-chat-browser-qa-')));
const forbiddenServicePorts = new Set(['8787', '8766', '59720']);
const checks = [], screenshots = [], errors = [], cspViolations = [], blockedRequests = [], streamResults = [], layout = [];
const startedAt = new Date().toISOString();
let app, browser, currentPage, stage = 'bootstrap';
const pass = (name) => { checks.push(name); console.log('PASS', name); };
const planProvider = {
  calls: { status: 0, generate: 0, resume: 0, disconnect: 0 },
  async status(_principal, model, reasoningEffort) {
    this.calls.status += 1;
    return {
      mode: 'chatgpt-plan', connection: 'unconfigured', canGenerate: false,
      description: '虚构离线套餐状态；未连接授权或模型。',
      model, reasoningEffort, credentialConfigured: false,
    };
  },
  async generate() {
    this.calls.generate += 1;
    throw new Error('Chat browser acceptance must never call a real plan generator');
  },
  resume() { this.calls.resume += 1; throw new Error('Unexpected plan resume'); },
  disconnect() { this.calls.disconnect += 1; throw new Error('Unexpected plan disconnect'); },
};

const mira = roles.find((role) => role.id === 'mira');
assert(mira, 'The bundled fictional Mira fixture is required');
const fixture = snapshot(mira);
// Public card descriptions and greetings are intentionally visible. These are
// private prompt/persona/world fields from the actual bundled fixture instead.
const privateValues = [
  mira.system, mira.detail, mira.world, mira.persona,
  fixture.character.personality, fixture.character.scenario,
  fixture.character.mes_example, fixture.character.data.post_history_instructions,
].filter(Boolean);
const forbiddenText = new Set(privateValues.flatMap((value) => {
  const expanded = value.replaceAll('{{char}}', mira.name).replaceAll('{{user}}', '旅人');
  return [value, expanded, ...expanded.split(/[。；：\n]/).filter((part) => part.length >= 12)];
}));
const checkMessages = async (page, label) => {
  const messages = await page.locator('#messages').innerText();
  for (const value of forbiddenText) assert(!messages.includes(value), `${label}: private context appeared in visible messages`);
  assert(!/(?:\[SYSTEM\]|<SYSTEM>|(?:^|\n)\s*SYSTEM\s*:)/i.test(messages), `${label}: a SYSTEM prompt label appeared in messages`);
  pass(`${label}: visible messages exclude bundled private context and SYSTEM labels`);
};
const shot = async (page, name) => {
  const file = name + '.png';
  await page.screenshot({ path: path.join(evidence, file), fullPage: true, animations: 'disabled' });
  screenshots.push({ file, viewport: page.viewportSize() });
};
const measure = async (page, name) => {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  layout.push({ name, viewport: page.viewportSize(), ...metrics });
  assert(metrics.documentWidth <= metrics.viewportWidth + 1, `${name}: horizontal page overflow`);
  pass(`${name}: no horizontal page overflow`);
};

try {
  // port:0 always creates a new service; no request is sent to an existing port.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    app = await createApp({ root, port: 0, demo: true, adminPassword: 'synthetic-chat-browser-password', planProvider });
    const url = new URL(app.url);
    assert.equal(url.hostname, '127.0.0.1');
    if (!forbiddenServicePorts.has(url.port)) break;
    await app.close();
    app = undefined;
  }
  assert(app, 'Could not allocate an isolated random application port');
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, chromiumSandbox: true,
  });
  for (const width of [1440, 375]) {
    stage = `chat-${width}`;
    const context = await browser.newContext({
      viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    try {
      context.setDefaultTimeout(15000);
      await context.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== app.url) {
          blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      await context.addInitScript(() => {
        window.addEventListener('securitypolicyviolation', (event) => {
          console.error('[between-csp-test]', event.violatedDirective, event.blockedURI);
        });
        const originalFetch = window.fetch.bind(window);
        const qa = window.__betweenChatQA = { turns: [] };
        window.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
          const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
          if (url.origin === window.location.origin && method.toUpperCase() === 'POST' && /^\/api\/conversations\/[a-zA-Z0-9_-]+\/turn$/.test(url.pathname)) {
            const turn = { path: url.pathname, status: response.status, body: null, error: null, completed: false };
            qa.turns.push(turn);
            // Chrome may discard SSE bodies from its debugging protocol. Observe
            // a native response clone while returning the original immediately;
            // the product continues to consume the real, unbuffered stream.
            try {
              void response.clone().text().then((body) => { turn.body = body; })
                .catch((error) => { turn.error = String(error); })
                .finally(() => { turn.completed = true; });
            } catch (error) {
              turn.error = String(error);
              turn.completed = true;
            }
          }
          return response;
        };
      });
      const page = currentPage = await context.newPage();
      page.on('pageerror', (error) => errors.push({ width, message: error.message }));
      page.on('console', (message) => {
        if (/\[between-csp-test\]|Content Security Policy|Refused to (?:load|execute|apply)/i.test(message.text())) {
          cspViolations.push({ width, message: message.text() });
        }
      });
      const response = await page.goto(app.url, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await expect(page.getByRole('heading', { name: '今天，想和谁聊聊？' })).toBeVisible();
      await expect(page.locator('#connection')).toContainText('本地合成演示');
      const card = page.locator('#roles .card').filter({ hasText: mira.name });
      await expect(card).toHaveCount(1);
      await measure(page, `welcome-${width}`);
      await shot(page, `welcome-${width}`);
      pass(`welcome-${width}: chat entry and fictional role cards load`);

      await card.click();
      await expect(page.getByRole('heading', { name: '和米拉开始对话' })).toBeVisible();
      await page.getByRole('button', { name: '进入对话', exact: true }).click();
      await expect(page.locator('#title')).toHaveText(mira.name);
      await expect(page.locator('#messages .message')).toHaveCount(1);
      await expect(page.locator('#messages')).toContainText(mira.greeting);
      await checkMessages(page, `created-${width}`);
      const conversationId = await page.evaluate(() => localStorage.getItem('between_conversation'));
      assert.match(conversationId, /^[a-zA-Z0-9_-]+$/);
      pass(`create-${width}: selecting Mira creates a conversation`);

      // Mention a world-book trigger to exercise context assembly, while checking
      // that its actual private text does not become a visible message.
      const input = `这是 ${width} 像素浏览器的虚构验收。我想聊聊灯塔和海边的地图。`;
      await page.getByLabel('消息', { exact: true }).fill(input);
      const turnResponse = page.waitForResponse((item) => item.url() === `${app.url}/api/conversations/${conversationId}/turn`);
      await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
      const streamed = await turnResponse;
      assert.equal(streamed.status(), 200);
      assert.match(streamed.headers()['content-type'], /text\/event-stream/);
      await expect(page.locator('#stop')).toBeVisible();
      await expect(page.locator('#send')).toBeDisabled();
      const turnPath = `/api/conversations/${conversationId}/turn`;
      await page.waitForFunction((pathname) => window.__betweenChatQA.turns.some((turn) => turn.path === pathname && turn.completed), turnPath);
      const captured = await page.evaluate((pathname) => window.__betweenChatQA.turns.find((turn) => turn.path === pathname && turn.completed), turnPath);
      assert.equal(captured.error, null, 'The test response clone must finish without a read error');
      assert.equal(captured.status, 200);
      assert.equal(typeof captured.body, 'string');
      const transport = captured.body;
      const deltaCount = [...transport.matchAll(/^event: delta$/gm)].length;
      assert(deltaCount > 1, 'The demonstration must use multiple actual SSE delta events');
      assert.match(transport, /^event: done$/m);
      assert.doesNotMatch(transport, /^event: error$/m);
      streamResults.push({ width, deltaCount, status: streamed.status(), capture: 'page-fetch-response-clone', demonstration: true });
      await expect(page.locator('#notice')).toHaveText('已保存');
      await expect(page.locator('#messages .message')).toHaveCount(3);
      await expect(page.locator('#messages .user')).toContainText(input);
      await expect(page.locator('#messages .message').last()).toContainText('这是本地演示回复');
      await expect(page.locator('#messages .message').last()).toContainText(input);
      await expect(page.locator('#send')).toBeEnabled();
      await checkMessages(page, `saved-${width}`);
      await measure(page, `conversation-${width}`);
      await shot(page, `conversation-${width}`);
      const savedMessages = await page.locator('#messages .message').allTextContents();
      pass(`stream-${width}: actual local synthetic SSE deltas finish and save`);

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('#title')).toHaveText(mira.name);
      await expect(page.locator('#messages .message')).toHaveCount(3);
      assert.equal(await page.evaluate(() => localStorage.getItem('between_conversation')), conversationId);
      assert.deepEqual(await page.locator('#messages .message').allTextContents(), savedMessages);
      await checkMessages(page, `restored-${width}`);
      await measure(page, `restored-${width}`);
      await shot(page, `restored-${width}`);
      pass(`reload-${width}: same browser identity restores the saved conversation`);

      const admin = await page.goto(`${app.url}/admin/`, { waitUntil: 'networkidle' });
      assert.equal(admin.status(), 200);
      await expect(page.getByLabel(/^管理员口令/)).toBeVisible();
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
      await shot(page, `admin-login-${width}`);
      pass(`admin-entry-${width}: the built administration login loads`);
    } catch (error) {
      if (currentPage && !currentPage.isClosed()) {
        await currentPage.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
      }
      throw error;
    } finally {
      await context.close();
      currentPage = undefined;
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(cspViolations, []);
  assert.deepEqual(blockedRequests, []);
  assert.equal(planProvider.calls.generate, 0);
  assert.equal(planProvider.calls.resume, 0);
  assert.equal(planProvider.calls.disconnect, 0);
  pass('no browser errors, CSP violations, external requests, or real plan operations');
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify({
    status: 'PASS', startedAt, completedAt: new Date().toISOString(),
    browser: await browser.version(), chromiumSandbox: true, checks,
    screenshots, streamResults, layout, browserErrors: errors, cspViolations,
    blockedRequests, planProviderCalls: planProvider.calls,
    scope: 'Bundled fictional Mira fixture; local synthetic demonstration SSE, browser persistence and built admin login. No real model, authorization, speech, or image validation.',
  }, null, 2));
  console.log(`CHAT BROWSER PASS ${checks.length}\nEvidence: ${evidence}`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true, animations: 'disabled' }).catch(() => {});
  }
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({
    status: 'FAIL', stage, error: String(error), stack: error.stack,
    startedAt, failedAt: new Date().toISOString(), checks, screenshots,
    streamResults, layout, browserErrors: errors, cspViolations,
    blockedRequests, planProviderCalls: planProvider.calls,
  }, null, 2));
  console.error(`Chat browser acceptance failed at ${stage}. Evidence: ${evidence}`);
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
