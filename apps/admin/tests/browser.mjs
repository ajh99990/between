import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/server.mjs';
import { fictionalPlanProvider, forbiddenServicePorts, initialConfig, longText, roleFields, syntheticPassword, unknownFields } from './browser-fixtures.mjs';

// This is a disposable Playwright subprocess, never the user's open browser.
// Browser requests are restricted to the exact random application origin. The
// only model transport is a synthetic local SSE server created below.
assert(Number(process.versions.node.split('.')[0]) >= 24, 'Node.js 24 or newer is required');
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const distIndex = await fs.readFile(new URL('../dist/index.html', import.meta.url));
const distHtml = distIndex.toString('utf8');
const distAssetNames = [...distHtml.matchAll(/(?:src|href)="(\/admin\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
const builtFrontend = {
  indexSha256: crypto.createHash('sha256').update(distIndex).digest('hex'),
  assets: await Promise.all([...new Set(distAssetNames)].map(async url => {
    assert(!url.includes('..'));
    const bytes = await fs.readFile(new URL('../dist/' + url.slice('/admin/'.length), import.meta.url));
    return { url, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  })),
};
const evidenceRoot = path.join(repository, 'artifacts/browser/admin');
const evidence = path.resolve(process.env.BETWEEN_ADMIN_EVIDENCE || path.join(evidenceRoot, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`));
assert(evidence.startsWith(evidenceRoot + path.sep), 'Evidence must stay in a unique admin evidence subdirectory');
await fs.mkdir(evidence, { recursive: true });
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'between-admin-new-qa-')));
const initial = initialConfig();
await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(initial), { mode: 0o600 });
const planProvider = fictionalPlanProvider();
const checks = [], errors = [], csp = [], blockedRequests = [], screenshots = [], responseInjections = [], observations = [], requestCounts = {};
const startedAt = new Date().toISOString();
const selectedScenario = process.env.BETWEEN_ADMIN_BROWSER_ONLY || '';
assert(['', 'portal-expiry', 'dialog-load-failure', 'state-recovery'].includes(selectedScenario), 'Unknown browser scenario selection');
let app, browser, page, upstream, context, userContext, otherContext;
let stage = 'bootstrap', upstreamCalls = 0, controlledTurn = false;
const intervals = new Set();
const pass = name => { checks.push(name); console.log('PASS', name); };
const step = async (name, operation) => {
  const chosen = { 'portal-expiry': 'expired-login-suspends-private-portals-and-restores-book-draft', 'dialog-load-failure': 'dialog-resource-failure-is-cancellable-without-business-write', 'state-recovery': 'initial-loading-first-failure-and-refresh-error-retain-state' };
  const allowed = selectedScenario === 'state-recovery' ? [chosen[selectedScenario]] : ['login-real-failure-and-recovery', chosen[selectedScenario]];
  if (selectedScenario && !allowed.includes(name)) return;
  stage = name; await operation(); pass(name);
};
const visibleDialog = () => page.getByRole('dialog').filter({ visible: true });
const sourceRole = () => initial.roles[0];
const roleId = sourceRole().id;

async function startUpstream() {
  const instance = http.createServer(async (request, response) => {
    if (request.url !== '/v1/chat/completions' || request.method !== 'POST') { response.writeHead(404); response.end(); return; }
    let raw = '';
    for await (const chunk of request) { raw += chunk; assert(raw.length < 2 * 1024 * 1024); }
    const body = JSON.parse(raw);
    assert(controlledTurn, 'Unexpected model request outside the single controlled stop test');
    assert.equal(body.stream, true);
    upstreamCalls += 1;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"虚构回环等待回复"}}]}\n\n');
    const timer = setInterval(() => response.write('data: {"choices":[{"delta":{"content":"。"}}]}\n\n'), 100);
    intervals.add(timer);
    response.on('close', () => { clearInterval(timer); intervals.delete(timer); });
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  assert(!forbiddenServicePorts.has(String(instance.address().port)));
  return instance;
}

async function startApp() {
  const instance = await createApp({ root, port: 0, adminPassword: syntheticPassword, planProvider,
    modelUrl: `http://127.0.0.1:${upstream.address().port}/v1`, modelName: 'synthetic-local-model' });
  const url = new URL(instance.url);
  assert.equal(url.hostname, '127.0.0.1');
  assert(!forbiddenServicePorts.has(url.port));
  return instance;
}

async function attachRestrictions(target) {
  await target.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== app.url || (/\/turn$/.test(url.pathname) && !controlledTurn)) {
      blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient'); return;
    }
    const key = `${request.method()} ${url.pathname}`;
    requestCounts[key] = (requestCounts[key] || 0) + 1;
    await route.continue();
  });
}

async function api(route, method = 'GET', data) {
  assert(route.startsWith('/') && !route.includes('://') && !route.includes('/turn'));
  return page.evaluate(async ({ route, method, data }) => {
    const state = method === 'GET' ? null : await fetch('/api/admin/state').then(response => response.json());
    const response = await fetch(`/api/admin${route}`, { method, headers: { 'Content-Type': 'application/json', ...(state?.csrf ? { 'X-CSRF-Token': state.csrf } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  }, { route, method, data });
}
async function state() { const response = await api('/state'); assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; }
async function save(config) { const response = await api('/config', 'PUT', { config, expectedVersion: config.version, confirm: true }); assert.equal(response.status, 200, JSON.stringify(response.data)); }
async function nav(route, title) {
  await page.goto(`${app.url}/admin/#${route}`);
  // A hash-only goto is same-document navigation. Independent scenarios must
  // reload state after an intentional out-of-band concurrent administrator write.
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
}
async function login() {
  await page.getByLabel(/^管理员口令/).fill(syntheticPassword);
  await page.getByRole('button', { name: /登录/, exact: false }).last().click();
  await expect(page.getByRole('heading', { name: '角色卡', exact: true, level: 1 })).toBeVisible();
}
async function shot(name, target = page) {
  const filename = `${String(screenshots.length + 1).padStart(2, '0')}-${name}.png`;
  await target.screenshot({ path: path.join(evidence, filename), animations: 'disabled' });
  for (const violation of await target.evaluate(() => window.__testCsp || [])) if (!csp.some(item => JSON.stringify(item) === JSON.stringify(violation))) csp.push(violation);
  screenshots.push({ file: filename, route: new URL(target.url()).hash, viewport: target.viewportSize(), stage });
}
async function noOverflow() {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  assert(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
}
async function gallery() {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  await fs.writeFile(path.join(evidence, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Between 新后台自动截图</title><style>body{font:14px system-ui;margin:24px;background:#15191e;color:#eef1f4}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0}img{width:100%;height:320px;object-fit:contain;object-position:top;background:#252a32}figcaption{line-height:1.6}a{color:#b8d5ed}</style><h1>Between 新后台自动截图</h1><p>仅含临时虚构数据。截图与 DOM 断言属于自动证据，不代表人工视觉验收。详见 report.json。</p><main>${screenshots.map(item => `<figure><a href="${escape(item.file)}"><img src="${escape(item.file)}" alt="${escape(item.stage)}"></a><figcaption>${escape(item.route)} · ${item.viewport.width} × ${item.viewport.height}<br>${escape(item.stage)}</figcaption></figure>`).join('')}</main></html>`);
}
async function choose(label, option) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await expect(page.getByRole('listbox', { name: label, exact: true })).toBeVisible();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
}
async function editRoleField(label) {
  await page.getByRole('navigation', { name: '角色编辑字段' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
  return page.getByRole('textbox', { name: label, exact: true });
}
async function ordinaryRequest(target, route, method = 'GET', data, csrf = '') {
  assert(route.startsWith('/api/') && !route.includes('://'));
  assert(!route.endsWith('/turn') || controlledTurn);
  const response = await target.request.fetch(app.url + route, { method, headers: { Origin: app.url, 'X-CSRF-Token': csrf }, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  let result; try { result = JSON.parse(text); } catch { result = text; }
  return { status: response.status(), data: result, text };
}

try {
  upstream = await startUpstream();
  app = await startApp();
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, chromiumSandbox: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(20000);
  await attachRestrictions(context);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && /Content Security Policy/i.test(event.text())) csp.push(event.text()); });
  await page.addInitScript(() => {
    window.__testCsp = [];
    document.addEventListener('securitypolicyviolation', event => window.__testCsp.push({ directive: event.violatedDirective, blockedURI: event.blockedURI }));
  });

  await step('login-real-failure-and-recovery', async () => {
    await page.goto(`${app.url}/admin/`);
    await page.getByLabel(/^管理员口令/).fill('wrong-fictional-password');
    await page.getByRole('button', { name: /登录/ }).last().click();
    await expect(page.getByText('管理员口令不正确', { exact: true })).toBeVisible();
    await login(); await shot('roles-desktop');
    assert.equal(upstreamCalls, 0);
  });

  await step('role-eleven-fields-full-read-and-write', async () => {
    for (const [key] of roleFields) assert.equal(await page.locator(`#role-${key} .prose`).textContent(), sourceRole()[key], key);
    await page.getByRole('button', { name: '编辑角色', exact: true }).click();
    for (const [key, label] of roleFields) {
      const field = await editRoleField(label);
      await expect(field).toHaveValue(sourceRole()[key]);
      await field.fill(longText(key, 'edited'));
    }
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑角色', exact: true })).toBeVisible();
    const current = (await state()).config;
    const role = current.roles.find(item => item.id === roleId);
    for (const [key] of roleFields) { assert.equal(role[key], longText(key, 'edited')); assert.equal(await page.locator(`#role-${key} .prose`).textContent(), role[key]); }
    assert.deepEqual(role.qaRoleExtension, unknownFields);
    assert.deepEqual(role.source, sourceRole().source);
    assert.deepEqual(current.qaConfigExtension, unknownFields);
  });

  await step('role-search-cancel-and-real-409-preserve-draft', async () => {
    await page.getByLabel('搜索角色全文').fill('不存在的虚构内容-qa');
    await expect(page.getByRole('heading', { name: '没有匹配的角色', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await page.getByLabel('在角色卡中查找').fill('没有匹配的虚构段落');
    await expect(page.getByRole('heading', { name: '全文中没有匹配内容', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空查找', exact: true }).click();
    await page.getByRole('button', { name: '编辑角色', exact: true }).click();
    const field = await editRoleField('角色设定');
    await field.fill('应被取消的虚构内容');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(field).toHaveValue('应被取消的虚构内容');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '放弃修改', exact: true }).click();
    assert.equal((await state()).config.roles.find(item => item.id === roleId).detail, longText('detail', 'edited'));
    await page.getByRole('button', { name: '编辑角色', exact: true }).click();
    await (await editRoleField('角色设定')).fill('409时保留的虚构草稿');
    const current = (await state()).config;
    current.roles[1].tag = '另一管理员的虚构改动';
    await save(current);
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByText(/未保存。草稿仍在/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: '角色设定', exact: true })).toHaveValue('409时保留的虚构草稿');
    const after = (await state()).config;
    assert.equal(after.roles[1].tag, '另一管理员的虚构改动');
    assert.equal(after.roles[0].detail, longText('detail', 'edited'));
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '放弃修改', exact: true }).click();
  });

  await step('worldbook-simple-fulltext-save-and-unknown-fields', async () => {
    await nav('/books', '世界书');
    assert.equal(await page.locator('.reader-pane .prose').textContent(), initial.books[0].content);
    await page.getByRole('button', { name: '编辑世界书', exact: true }).click();
    await page.getByLabel('世界书全文', { exact: true }).fill(longText('simple', 'edited'));
    await page.getByLabel('运行时触发关键词', { exact: true }).fill('灯塔\n虚构触发');
    await page.getByRole('button', { name: '保存世界书', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑世界书', exact: true })).toBeVisible();
    const book = (await state()).config.books.find(item => item.id === 'mira-world');
    assert.equal(book.content, longText('simple', 'edited'));
    assert.deepEqual(book.keys, ['灯塔', '虚构触发']);
    assert.deepEqual(book.qaBookExtension, unknownFields);
    assert.deepEqual(book.source, initial.books[0].source);
    await page.getByLabel('管理库全文搜索').fill('没有这样的虚构世界书');
    await expect(page.getByRole('heading', { name: '没有匹配的世界书', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  });

  await step('worldbook-multientry-advanced-validation-edit-and-delete', async () => {
    await page.getByRole('button', { name: /虚构多条目世界书/ }).click();
    for (const [index, entry] of initial.books[2].entries.entries()) assert.equal(await page.locator(`#book-entry-${index} .prose`).textContent(), entry.content);
    await page.getByRole('button', { name: '编辑世界书', exact: true }).click();
    await page.getByLabel('条目全文', { exact: true }).fill(longText('entry_0', 'edited'));
    await page.getByText('高级配置与原始扩展', { exact: true }).click();
    const advanced = page.getByLabel(/^扩展配置（(?:完整 )?JSON 对象）$/);
    const originalExtra = JSON.parse(await advanced.inputValue());
    await advanced.fill('{broken');
    await page.getByRole('button', { name: '保存世界书', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '扩展配置必须是有效的 JSON 对象' })).toBeVisible();
    const editedExtra = { ...originalExtra, sticky: 5, customFuture: { keep: '虚构高级配置' } };
    delete editedExtra.cooldown;
    await advanced.fill(JSON.stringify(editedExtra, null, 2));
    await choose('注入位置', '指定聊天深度');
    await page.getByRole('button', { name: '保存世界书', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑世界书', exact: true })).toBeVisible();
    const book = (await state()).config.books.find(item => item.id === 'synthetic-entries');
    assert.equal(book.entries[0].content, longText('entry_0', 'edited'));
    assert.equal(book.entries[0].position, 4); assert.equal(book.entries[0].sticky, 5);
    assert.equal(Object.hasOwn(book.entries[0], 'cooldown'), false, 'Removing an advanced JSON property must really remove it');
    assert.deepEqual(book.entries[0].qaEntryExtension, unknownFields);
    assert.deepEqual(book.entries[0].customFuture, { keep: '虚构高级配置' });
    assert.deepEqual(book.entries[0].extensions, initial.books[2].entries[0].extensions);
    await page.getByRole('button', { name: '编辑世界书', exact: true }).click();
    await page.getByRole('navigation', { name: '编辑条目目录' }).getByRole('button', { name: /^2\./ }).click();
    await page.getByRole('button', { name: '删除此条目', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '编辑条目目录' }).getByRole('button')).toHaveCount(3);
    await page.getByRole('button', { name: '删除此条目', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '从草稿删除条目', exact: true }).click();
    assert.equal((await state()).config.books.find(item => item.id === book.id).entries.length, 3);
    await page.getByRole('button', { name: '保存世界书', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑世界书', exact: true })).toBeVisible();
    assert.deepEqual((await state()).config.books.find(item => item.id === book.id).entries.map(entry => entry.uid), [0, 2]);
  });

  await step('worldbook-create-bind-delete-and-dialog-focus', async () => {
    const create = page.getByRole('button', { name: '新建世界书', exact: true });
    await create.click();
    await expect(visibleDialog()).toBeVisible();
    await expect(page.getByRole('button', { name: '创建草稿', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(visibleDialog()).toHaveCount(0);
    await expect(create).toBeFocused();
    await create.click();
    await page.getByLabel('新世界书名称').fill('待绑定后删除的虚构书');
    await choose('内容结构', '简单世界书 · 一份全文与关键词');
    await page.getByRole('button', { name: '创建草稿', exact: true }).click();
    await page.getByLabel('世界书全文', { exact: true }).fill('这份虚构全文用于绑定与删除验收。');
    await page.getByRole('button', { name: '创建世界书', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑世界书', exact: true })).toBeVisible();
    const book = (await state()).config.books.find(item => item.name === '待绑定后删除的虚构书');
    assert(book);
    await nav('/roles', '角色卡');
    await page.getByRole('button', { name: '编辑角色', exact: true }).click();
    await page.getByRole('checkbox', { name: /待绑定后删除的虚构书/ }).check();
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑角色', exact: true })).toBeVisible();
    assert((await state()).config.roles[0].bookIds.includes(book.id));
    await nav('/books', '世界书');
    await page.getByRole('button', { name: /待绑定后删除的虚构书/ }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    assert((await state()).config.books.some(item => item.id === book.id));
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认删除世界书', exact: true }).click();
    await expect(visibleDialog()).toHaveCount(0);
    const after = (await state()).config;
    assert(!after.books.some(item => item.id === book.id));
    assert(after.roles.every(role => !role.bookIds.includes(book.id)));
  });

  await step('model-preset-and-plan-real-save-without-generation', async () => {
    await nav('/models', '模型与提示词');
    await page.getByRole('button', { name: '编辑模型连接', exact: true }).click();
    await page.getByLabel(/^兼容服务根地址/).fill(`http://127.0.0.1:${upstream.address().port}/v1`);
    await page.getByLabel(/^模型名称/).fill('synthetic-saved-model');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#model-editor')).toHaveCount(0);
    assert.equal((await state()).config.model.name, 'synthetic-saved-model');
    await page.getByRole('button', { name: '编辑预设', exact: true }).click();
    await page.getByLabel('全局历史后指令', { exact: true }).fill(longText('preset', 'edited'));
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#model-editor')).toHaveCount(0);
    const saved = (await state()).config;
    assert.equal(saved.preset.postHistory, longText('preset', 'edited'));
    assert.deepEqual(saved.preset.qaPresetExtension, unknownFields);
    await page.getByRole('button', { name: '编辑套餐设置', exact: true }).click();
    await page.getByRole('checkbox', { name: '启用套餐后端', exact: true }).check();
    await choose('思考档位', '高 · high');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#model-editor')).toHaveCount(0);
    assert.equal((await state()).config.planBackend.reasoningEffort, 'high');
    assert.equal((await state()).config.planBackend.enabled, true);
    await page.getByRole('button', { name: '编辑套餐设置', exact: true }).click();
    await page.getByRole('checkbox', { name: '启用套餐后端', exact: true }).uncheck();
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#model-editor')).toHaveCount(0);
    assert.equal((await state()).config.planBackend.enabled, false);
    await page.getByRole('button', { name: '恢复额度暂停', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '已查看额度，恢复', exact: true }).click();
    await expect(visibleDialog()).toHaveCount(0);
    assert.equal(planProvider.calls.resume, 1);
    await page.getByRole('button', { name: '断开连接', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '断开本地连接', exact: true }).click();
    await expect(visibleDialog()).toHaveCount(0);
    assert.equal(planProvider.calls.disconnect, 1);
    assert.equal(planProvider.calls.generate, 0); assert.equal(upstreamCalls, 0);
  });

  await step('model-real-validation-error-keeps-draft', async () => {
    await page.getByRole('button', { name: '编辑模型连接', exact: true }).click();
    await page.getByLabel(/^兼容服务根地址/).fill('http://example.invalid/v1');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(visibleDialog().getByRole('alert')).toBeVisible();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel(/^兼容服务根地址/)).toHaveValue('http://example.invalid/v1');
    assert.equal((await state()).config.model.name, 'synthetic-saved-model');
    await page.getByRole('button', { name: '取消编辑', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(page.locator('#model-editor')).toHaveCount(0);
  });

  let user, other, created, conversation, userId;
  if (selectedScenario !== 'state-recovery') {
    userContext = await browser.newContext({ serviceWorkers: 'block' });
    otherContext = await browser.newContext({ serviceWorkers: 'block' });
    await attachRestrictions(userContext); await attachRestrictions(otherContext);
    user = await ordinaryRequest(userContext, '/api/session', 'POST', {});
    other = await ordinaryRequest(otherContext, '/api/session', 'POST', {});
    assert.equal(user.status, 200); assert.equal(other.status, 200);
    created = await ordinaryRequest(userContext, '/api/conversations', 'POST', { role: roleId }, user.data.csrf);
    assert.equal(created.status, 201);
    conversation = created.data.id;
    userId = (await state()).users.find(item => item.conversations.some(item => item.id === conversation)).id;
  }

  await step('users-real-disable-restore-global-confirm-and-isolation', async () => {
    assert.equal((await ordinaryRequest(otherContext, `/api/conversations/${conversation}`)).status, 404);
    assert.equal((await ordinaryRequest(userContext, '/api/admin/state')).status, 401);
    await nav('/users', '用户与全局');
    await page.getByLabel('搜索用户', { exact: true }).fill('不存在的虚构用户');
    await expect(page.getByRole('heading', { name: '没有匹配的用户', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: userId });
    await row.getByRole('button', { name: '停用', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await ordinaryRequest(userContext, '/api/state')).status, 200);
    await row.getByRole('button', { name: '停用', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '停用用户', exact: true }).click();
    await expect(row.getByRole('button', { name: '恢复', exact: true })).toBeVisible();
    assert.equal((await ordinaryRequest(userContext, '/api/state')).status, 403);
    await row.getByRole('button', { name: '恢复', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '恢复用户', exact: true }).click();
    await expect(row.getByRole('button', { name: '停用', exact: true })).toBeVisible();
    assert.equal((await ordinaryRequest(userContext, '/api/state')).status, 200);
    await page.getByRole('button', { name: '暂停生成', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await state()).config.paused, false);
    await page.getByRole('button', { name: '暂停生成', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复生成', exact: true })).toBeVisible();
    assert.equal((await state()).config.paused, true);
    await page.getByRole('button', { name: '恢复生成', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(page.getByRole('button', { name: '暂停生成', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '暂停新用户', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(page.getByRole('button', { name: '开放新用户', exact: true })).toBeVisible();
    const rejectedContext = await browser.newContext();
    try { assert.equal((await ordinaryRequest(rejectedContext, '/api/session', 'POST', {})).status, 403); }
    finally { await rejectedContext.close(); }
    await page.getByRole('button', { name: '开放新用户', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(page.getByRole('button', { name: '暂停新用户', exact: true })).toBeVisible();
  });

  await step('sessions-real-running-task-stop-and-delete', async () => {
    controlledTurn = true;
    const pending = ordinaryRequest(userContext, `/api/conversations/${conversation}/turn`, 'POST', { id: 'synthetic-stop-only', input: '虚构回环任务，请等待停止。' }, user.data.csrf);
    try {
      await expect.poll(async () => (await state()).tasks.length).toBe(1);
      await expect.poll(() => upstreamCalls).toBe(1);
      await nav('/sessions', '会话与任务');
      await page.getByRole('button', { name: '停止任务', exact: true }).click();
      await visibleDialog().getByRole('button', { name: '停止任务', exact: true }).click();
      await expect(visibleDialog()).toHaveCount(0);
      const stopped = await pending;
      assert(stopped.text.includes('event: error') && stopped.text.includes('已停止'));
      assert.equal((await ordinaryRequest(userContext, `/api/conversations/${conversation}`)).data.chat.length, 1);
    } finally { controlledTurn = false; }
    assert.equal(upstreamCalls, 1);
    await page.getByLabel('搜索会话', { exact: true }).fill('不存在的虚构会话');
    await expect(page.getByRole('heading', { name: '没有匹配的会话', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: conversation });
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await ordinaryRequest(userContext, `/api/conversations/${conversation}`)).status, 200);
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '永久删除会话', exact: true }).click();
    await expect(visibleDialog()).toHaveCount(0);
    assert.equal((await ordinaryRequest(userContext, `/api/conversations/${conversation}`)).status, 404);
  });

  await step('resources-real-import-and-diagnostics-audit', async () => {
    await nav('/resources', '社区素材');
    const resource = page.locator('.resource-row').filter({ has: page.getByRole('heading', { name: '唐团团', exact: true }) });
    await resource.getByRole('button', { name: '导入素材', exact: true }).click();
    await visibleDialog().getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(resource.getByText('已导入', { exact: true })).toBeVisible();
    const current = (await state()).config;
    assert(current.roles.some(item => item.id === 'community-tangtuantuan'));
    assert.equal(current.books.find(item => item.id === 'community-tangtuantuan-world').entries.length, 7);
    await page.getByLabel('搜索素材', { exact: true }).fill('没有这样的虚构素材');
    await expect(page.getByRole('heading', { name: '没有匹配的素材', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除搜索', exact: true }).click();
    await nav('/diagnostics', '诊断与审计');
    await expect(page.getByText(/世界书最终纳入条目诊断尚未接通/)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: '导入社区素材' })).toBeVisible();
    await page.getByLabel('搜索操作记录', { exact: true }).fill('不可能匹配的虚构审计对象');
    await expect(page.getByRole('heading', { name: '没有匹配的记录', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    assert.equal(planProvider.calls.generate, 0); assert.equal(upstreamCalls, 1);
  });

  await step('expired-login-restores-role-draft', async () => {
    await nav('/roles', '角色卡');
    await page.getByRole('button', { name: '编辑角色', exact: true }).click();
    await (await editRoleField('作者说明')).fill('登录过期后仍保留的虚构草稿');
    assert.equal((await api('/logout', 'POST', {})).status, 200);
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByLabel(/^管理员口令/)).toBeVisible();
    await page.getByLabel(/^管理员口令/).fill(syntheticPassword);
    await page.getByRole('button', { name: /登录/ }).last().click();
    await expect(page.getByRole('textbox', { name: '作者说明', exact: true })).toHaveValue('登录过期后仍保留的虚构草稿');
    await page.getByRole('button', { name: '保存角色', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑角色', exact: true })).toBeVisible();
    assert.equal((await state()).config.roles[0].creatorNotes, '登录过期后仍保留的虚构草稿');
  });

  await step('expired-login-suspends-private-portals-and-restores-book-draft', async () => {
    await nav('/books', '世界书');
    await page.getByRole('button', { name: '编辑世界书', exact: true }).click();
    const privateDraft = '仅管理员可见的虚构世界书草稿：过期期间不得留在弹窗。';
    const privateServer = '仅管理员可见的虚构服务端版本：不可出现在登录屏幕。';
    await page.getByLabel('世界书全文', { exact: true }).fill(privateDraft);
    const concurrent = (await state()).config;
    concurrent.books.find(book => book.id === 'mira-world').content = privateServer;
    await save(concurrent);
    await page.getByRole('button', { name: '保存世界书', exact: true }).click();
    await expect(page.getByRole('button', { name: '刷新服务端状态', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '刷新服务端状态', exact: true }).click();
    await page.getByRole('button', { name: '比较完整版本', exact: true }).click();
    const comparison = page.getByRole('dialog', { name: '比较完整世界书版本', exact: true });
    await expect(comparison).toBeVisible();
    const comparisonElement = await comparison.elementHandle();
    assert(comparisonElement);
    assert((await comparison.getByLabel('本页完整草稿', { exact: true }).inputValue()).includes(privateDraft));
    assert((await comparison.getByLabel('服务端当前完整版本', { exact: true }).inputValue()).includes(privateServer));
    let injected = false;
    const expireNextState = async route => {
      if (!injected && route.request().method() === 'GET') {
        injected = true;
        responseInjections.push({ stage, method: 'GET', path: '/api/admin/state', status: 401, scope: 'Single synthetic auth-expiry response while a private modal is open' });
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: '管理员登录已过期（合成回归）' }) });
      } else await route.fallback();
    };
    await context.route('**/api/admin/state', expireNextState);
    try {
      // Invoke the application's real refresh handler while its modal is open.
      // This models an asynchronous auth response, not a physical click through
      // the modal scrim. The one 401 response is explicitly synthetic evidence.
      await page.getByRole('button', { name: '刷新后台数据', exact: true }).evaluate(button => button.click());
      await expect(page.getByRole('heading', { name: '重新验证管理员身份', exact: true })).toBeVisible();
      assert.equal(injected, true);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => comparisonElement.isVisible()).toBe(false);
      await expect(page.getByRole('textbox', { name: '本页完整草稿', exact: true })).toHaveCount(0);
      const password = page.getByLabel(/^管理员口令/);
      await password.fill(syntheticPassword);
      await expect(password).toBeFocused();
      await expect(password).toHaveValue(syntheticPassword);
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await expect(comparison).toBeVisible();
      assert((await comparison.getByLabel('本页完整草稿', { exact: true }).inputValue()).includes(privateDraft));
      await comparison.getByRole('button', { name: '返回草稿', exact: true }).click();
      await expect(page.getByLabel('世界书全文', { exact: true })).toHaveValue(privateDraft);
      await page.getByRole('button', { name: '取消编辑', exact: true }).click();
      await visibleDialog().getByRole('button', { name: '放弃更改', exact: true }).click();
      await expect(page.getByRole('button', { name: '编辑世界书', exact: true })).toBeVisible();
      assert.equal((await state()).config.books.find(book => book.id === 'mira-world').content, privateServer);
    } finally { await context.unroute('**/api/admin/state', expireNextState); }
  });

  await step('dialog-resource-failure-is-cancellable-without-business-write', async () => {
    const isolated = await browser.newContext({ viewport: { width: 1000, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await attachRestrictions(isolated);
    let injected = false;
    await isolated.route('**/admin/design/admin/ui.js', async route => {
      if (!injected) {
        injected = true;
        responseInjections.push({ stage, method: 'GET', path: '/admin/design/admin/ui.js', status: 503, scope: 'Single synthetic dialog module load failure in an isolated browser context' });
        await route.fulfill({ status: 503, contentType: 'text/javascript', body: 'Synthetic dialog-module load failure' });
      } else await route.fallback();
    });
    const target = await isolated.newPage();
    const pageErrors = [];
    target.on('pageerror', error => pageErrors.push(error.message));
    try {
      await target.goto(`${app.url}/admin/#/models`);
      await target.getByLabel(/^管理员口令/).fill(syntheticPassword);
      await target.getByRole('button', { name: '登录', exact: true }).click();
      await expect(target.getByRole('heading', { name: '模型与提示词', exact: true, level: 1 })).toBeVisible();
      await expect.poll(() => injected).toBe(true);
      const writes = [];
      target.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/admin/') && !['GET', 'HEAD'].includes(request.method())) writes.push({ method: request.method(), path: new URL(request.url()).pathname });
      });
      const before = (await state()).config;
      const draft = 'Dialog资源加载失败时应保留的虚构全局提示草稿。';
      await target.getByRole('button', { name: '编辑预设', exact: true }).click();
      await target.getByLabel('全局历史后指令', { exact: true }).fill(draft);
      const saveButton = target.getByRole('button', { name: '保存设置', exact: true });
      await saveButton.click();
      const fallback = target.getByRole('dialog', { name: '保存提示预设？', exact: true });
      await expect(fallback).toBeVisible();
      await expect(fallback.getByRole('alert')).toHaveText('窗口暂时无法加载，当前修改仍保留。请取消返回，再刷新页面重试。');
      await expect(fallback.getByRole('button', { name: '确认保存', exact: true })).toHaveCount(0);
      await shot('dialog-resource-failure', target);
      await fallback.getByRole('button', { name: '取消返回', exact: true }).click();
      await expect(fallback).toHaveCount(0);
      await expect(target.getByLabel('全局历史后指令', { exact: true })).toHaveValue(draft);
      await expect(saveButton).toBeFocused();
      await saveButton.click();
      await expect(fallback).toBeVisible();
      await target.keyboard.press('Escape');
      await expect(fallback).toHaveCount(0);
      await expect(target.getByLabel('全局历史后指令', { exact: true })).toHaveValue(draft);
      assert.deepEqual(writes, [], 'A failed confirmation resource must not execute a business mutation');
      assert.equal((await state()).config.version, before.version);
      assert.equal((await state()).config.preset.postHistory, before.preset.postHistory);
      assert.deepEqual(pageErrors, [], 'Resource failure must be caught and surfaced, not become an uncaught exception');
    } finally { await isolated.close(); }
  });

  await step('initial-loading-first-failure-and-refresh-error-retain-state', async () => {
    const isolated = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await attachRestrictions(isolated);
    let loginPosts = 0;
    isolated.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/login') loginPosts += 1;
    });
    let releaseInitial;
    const initialGate = new Promise(resolve => { releaseInitial = resolve; });
    let mode = 'hold-first', held = false;
    await isolated.route('**/api/admin/state', async route => {
      if (route.request().method() !== 'GET') { await route.fallback(); return; }
      if (mode === 'hold-first') {
        mode = 'normal'; held = true;
        responseInjections.push({ stage, method: 'GET', path: '/api/admin/state', response: 'delayed then actual server response', scope: 'Hold the first read for a loading-state screenshot; do not fabricate its eventual 401' });
        await initialGate;
        await route.fallback();
      } else if (mode === 'refresh503' || mode === 'initial503') {
        const initialFailure = mode === 'initial503'; mode = 'normal';
        const error = initialFailure ? '首次读取状态失败（合成503）' : '刷新状态失败，旧内容应保留（合成503）';
        responseInjections.push({ stage, method: 'GET', path: '/api/admin/state', status: 503, scope: initialFailure ? 'First read failure in a new page with an existing administrator cookie' : 'One refresh read failure while an inline role draft is open' });
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error }) });
      } else await route.fallback();
    });
    const target = await isolated.newPage();
    const pageErrors = [];
    target.on('pageerror', error => pageErrors.push(error.message));
    try {
      await target.goto(`${app.url}/admin/#/roles`);
      await expect.poll(() => held).toBe(true);
      await expect(target.getByRole('status').filter({ hasText: '正在验证管理员会话' })).toBeVisible();
      await expect(target.getByLabel(/^管理员口令/)).toHaveCount(0);
      await shot('state-initial-loading', target);
      const firstResponse = target.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/state');
      releaseInitial();
      assert.equal((await firstResponse).status(), 401);
      await target.getByLabel(/^管理员口令/).fill(syntheticPassword);
      const actualState = target.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/state' && response.status() === 200);
      await target.getByRole('button', { name: '登录', exact: true }).click();
      const baseline = await (await actualState).json();
      await expect(target.getByRole('heading', { name: '角色卡', exact: true, level: 1 })).toBeVisible();
      await target.getByRole('button', { name: '编辑角色', exact: true }).click();
      await target.getByRole('navigation', { name: '角色编辑字段' }).getByRole('button', { name: /^角色设定/ }).click();
      const draft = '刷新失败时必须保留的虚构角色草稿。';
      await target.getByRole('textbox', { name: '角色设定', exact: true }).fill(draft);
      mode = 'refresh503';
      await target.getByRole('button', { name: '刷新后台数据', exact: true }).click();
      await expect(target.getByRole('alert').filter({ hasText: '刷新状态失败，旧内容应保留（合成503）' })).toBeVisible();
      await expect(target.getByRole('textbox', { name: '角色设定', exact: true })).toHaveValue(draft);
      await expect(target.getByRole('heading', { name: baseline.config.roles[0].name, exact: true, level: 2 })).toBeVisible();
      await expect(target.getByRole('button', { name: /^米拉/ })).toBeVisible();
      await expect(target.getByRole('status').filter({ hasText: /后台数据已刷新|运行状态已刷新|配置已保存|已保存/ })).toHaveCount(0);
      await shot('state-refresh-failure-draft-retained', target);
      const persisted = await target.evaluate(() => fetch('/api/admin/state').then(response => response.json()));
      assert.equal(persisted.config.version, baseline.config.version);
      assert.equal(persisted.config.roles[0].detail, baseline.config.roles[0].detail);

      mode = 'initial503';
      const firstFailurePage = await isolated.newPage();
      firstFailurePage.on('pageerror', error => pageErrors.push(error.message));
      await firstFailurePage.goto(`${app.url}/admin/#/roles`);
      await expect(firstFailurePage.getByRole('alert').filter({ hasText: '首次读取状态失败（合成503）' })).toBeVisible();
      await shot('state-first-read-failure', firstFailurePage);
      const retry = firstFailurePage.getByRole('button', { name: '重试会话验证', exact: true });
      await expect(retry).toBeVisible();
      const loginPostsBeforeRetry = loginPosts;
      assert.equal(loginPostsBeforeRetry, 1, 'Only the first page should have logged in');
      const retryResponse = firstFailurePage.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/state' && response.status() === 200);
      await retry.click();
      assert.equal((await retryResponse).status(), 200);
      await expect(firstFailurePage.getByRole('heading', { name: '角色卡', exact: true, level: 1 })).toBeVisible();
      assert.equal(loginPosts, loginPostsBeforeRetry, 'Read-only state retry must reuse the existing cookie without a new login POST');
      observations.push({ stage, initialFailure: { explicitRetryAvailable: true, recoveredThrough: 'read-only GET state retry using the existing administrator cookie', loginPostsBeforeRetry, loginPostsAfterRetry: loginPosts }, refreshFailure: { oldRoleVisible: true, draftPreserved: true, successNoticeAbsent: true, serverConfigUnchanged: true } });
      assert.deepEqual(pageErrors, []);
    } finally { releaseInitial(); await isolated.close(); }
  });

  for (const width of [1440, 750, 390]) await step(`responsive-routes-and-select-${width}`, async () => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [route, title] of [['/roles', '角色卡'], ['/books', '世界书'], ['/models', '模型与提示词'], ['/sessions', '会话与任务'], ['/users', '用户与全局'], ['/resources', '社区素材'], ['/diagnostics', '诊断与审计']]) {
      await nav(route, title); await noOverflow();
      if (route === '/books') {
        await page.getByRole('button', { name: '新建世界书', exact: true }).click();
        await page.getByRole('combobox', { name: '内容结构', exact: true }).click();
        await expect(page.getByRole('listbox', { name: '内容结构', exact: true })).toBeVisible();
        await shot(`book-select-open-${width}`);
        await page.keyboard.press('Escape');
        await expect(visibleDialog()).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(visibleDialog()).toHaveCount(0);
        await expect(page.getByRole('button', { name: '新建世界书', exact: true })).toBeFocused();
      }
      if (route === '/roles' || route === '/diagnostics') await shot(`${route.slice(1)}-${width}`);
    }
  });

  await step('final-security-and-network-scope', async () => {
    csp.push(...await page.evaluate(() => window.__testCsp || []));
    assert.deepEqual(errors, [], 'Uncaught page exceptions');
    assert.deepEqual(csp, [], 'CSP violations');
    assert.deepEqual(blockedRequests, [], 'The UI attempted an external or forbidden request');
    assert.equal(planProvider.calls.generate, 0);
    assert.equal(upstreamCalls, 1, 'Only the single synthetic stop task may reach a model transport');
    const publicState = await ordinaryRequest(userContext, '/api/state');
    assert.equal(publicState.status, 200);
    assert(!publicState.text.includes('qaRoleExtension') && !publicState.text.includes(longText('system', 'edited')));
    for (const role of publicState.data.roles) assert.deepEqual(Object.keys(role).sort(), ['description', 'icon', 'id', 'name', 'tag']);
  });

  const result = { status: 'PASS', selectedScenario: selectedScenario || 'full-suite', supplemental: selectedScenario === 'state-recovery' ? 'Adds direct loading and read-failure evidence to the existing full browser regression; this run does not repeat the earlier 18-flow, chat, or OAuth suite.' : undefined, builtFrontend, startedAt, finishedAt: new Date().toISOString(), checks, screenshots, responseInjections, observations, requestCounts,
    scope: 'New React UI, real admin API writes and disposable fictional data. Only the controlled synthetic loopback SSE task is allowed; actual request counts are recorded below. No external network, runtime credentials, real model, or real user data.',
    limitations: ['Screenshots and DOM assertions are automatic evidence, not human visual acceptance.', 'No real system IME, real model quality, real authorization, media provider, or hosted multiuser acceptance.'],
    modelRequests: { syntheticLoopback: upstreamCalls, plan: planProvider.calls.generate }, node: process.version };
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  await gallery();
  console.log(JSON.stringify({ status: result.status, checks: checks.length, evidence, scope: result.scope }, null, 2));
} catch (error) {
  if (page) await shot('failure').catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', builtFrontend, stage, error: error.stack || error.message, checks, errors, csp, blockedRequests, screenshots, responseInjections, observations, requestCounts }, null, 2));
  await gallery();
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  for (const timer of intervals) clearInterval(timer);
  if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
  await fs.rm(root, { recursive: true, force: true });
}
