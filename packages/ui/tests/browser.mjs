import { chromium, expect } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

assert(Number(process.versions.node.split('.')[0]) >= 24, 'Node.js 24 or newer is required');
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(packageRoot, '../..');
const dist = path.join(packageRoot, 'dist-playground');
const evidence = path.join(repository, 'artifacts/browser/ui', `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(evidence, { recursive: true });
const scenario = process.env.BETWEEN_UI_BROWSER_ONLY || '';
assert(['', 'production', 'fixture'].includes(scenario), 'Unknown UI browser scenario');
const checks = [], errors = [], blockedRequests = [], observations = [];
let server, browser, page, context, stage = 'bootstrap';
const startedAt = new Date().toISOString();
const index = await fs.readFile(path.join(dist, 'index.html'));
const assets = [];
for (const name of (await fs.readdir(path.join(dist, 'assets'))).sort()) {
  const bytes = await fs.readFile(path.join(dist, 'assets', name));
  if (/\.(?:js|css)$/.test(name)) assert(!bytes.toString('utf8').includes('uiFixture'), 'Test fixture leaked into the production playground');
  assets.push({ name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
const builtFrontend = { indexSha256: crypto.createHash('sha256').update(index).digest('hex'), assets };
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'between-ui-browser-'));
const fixtureDist = path.join(temporary, 'fixture');
const step = async (name, operation) => { if (scenario && !name.startsWith(scenario)) return; stage = name; await operation(); checks.push(name); console.log('PASS', name); };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function startServer() {
  const instance = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const fixture = pathname.startsWith('/fixture/');
      const root = fixture ? fixtureDist : dist;
      const relative = fixture ? pathname.slice('/fixture/'.length) : pathname.slice(1);
      const filename = path.resolve(root, relative || (fixture ? 'browser-fixture.html' : 'index.html'));
      if (!filename.startsWith(root + path.sep)) throw new Error('path outside fixture');
      const data = await fs.readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(data);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return instance;
}

const visibleDialog = (name) => page.getByRole('dialog', { name, exact: true }).filter({ visible: true });
async function category(label) {
  const navigation = page.getByRole('navigation', { name: '组件类别' });
  if (await navigation.isVisible()) await navigation.getByRole('button', { name: label, exact: true }).click();
  else {
    await page.locator('.pg-mobile-navigation').getByRole('button').click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible();
}

async function choose(label, text) {
  const trigger = page.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: text, exact: true }).click();
  await expect(trigger).toContainText(text);
}

try {
  await build({ configFile: false, root: path.join(packageRoot, 'tests'), base: '/fixture/', publicDir: false,
    plugins: [react(), tailwindcss()], logLevel: 'error',
    build: { outDir: fixtureDist, emptyOutDir: true, rollupOptions: { input: path.join(packageRoot, 'tests/browser-fixture.html') } } });
  server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, chromiumSandbox: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  context.setDefaultTimeout(10000);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { blockedRequests.push(url.href); await route.abort('blockedbyclient'); }
    else await route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.uiAnimationCalls = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      window.uiAnimationCalls.push({ className: String(this.className), duration: typeof args[1] === 'number' ? args[1] : args[1]?.duration });
      return animate.apply(this, args);
    };
  });
  await page.goto(origin);

  await step('production-dialog-combobox-escape-and-focus', async () => {
    await category('弹窗与菜单');
    const opener = page.getByRole('button', { name: '打开长表单弹窗', exact: true });
    await opener.click();
    const dialog = visibleDialog('编辑任务');
    await expect(dialog).toBeVisible();
    const combo = dialog.getByRole('combobox', { name: '负责人', exact: true });
    await combo.fill('周');
    await expect(page.getByRole('option', { name: '周序 · 产品协作', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(combo).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  await step('production-menu-to-dialog-does-not-steal-focus', async () => {
    const trigger = page.getByRole('button', { name: '项目操作', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: '项目操作' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole('menu', { name: '项目操作' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '发布（暂不可用）', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('menuitem', { name: '编辑任务', exact: true }).click();
    const dialog = visibleDialog('编辑任务');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const tooltipTrigger = page.getByRole('button', { name: '了解提示说明', exact: true });
    await tooltipTrigger.hover();
    await expect(page.getByRole('tooltip')).toContainText('提示只补充含义');
    const tipId = await page.getByRole('tooltip').getAttribute('id');
    assert(tipId);
    await expect(tooltipTrigger).toHaveAttribute('aria-describedby', tipId);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  await step('production-dialog-popover-escape-only-closes-current-layer', async () => {
    await page.getByRole('button', { name: '打开长表单弹窗', exact: true }).click();
    const dialog = visibleDialog('编辑任务');
    const help = dialog.getByRole('button', { name: '编辑帮助', exact: true });
    await help.click();
    await expect(visibleDialog('编辑帮助')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(visibleDialog('编辑帮助')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(help).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  await step('production-drawer-unsaved-confirmation-keeps-draft', async () => {
    const opener = page.getByRole('button', { name: '打开编辑抽屉', exact: true });
    await opener.click();
    const drawer = visibleDialog('编辑交接说明');
    const field = drawer.getByRole('textbox', { name: '任务名称', exact: true });
    await field.fill('临时修改的中文交接草稿');
    await drawer.getByRole('button', { name: '取消', exact: true }).click();
    const confirm = visibleDialog('放弃未保存的修改？');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(field).toHaveValue('临时修改的中文交接草稿');
    await drawer.getByRole('button', { name: '取消', exact: true }).click();
    await visibleDialog('放弃未保存的修改？').getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  await step('production-selection-keyboard-disabled-and-reduced-motion', async () => {
    await category('选择与切换');
    const select = page.getByRole('combobox', { name: '任务状态', exact: true });
    await select.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(select).toContainText('已完成');
    await expect(select).toBeFocused();
    const combo = page.getByRole('combobox', { name: '查找负责人', exact: true });
    await combo.fill('不存在的负责人');
    await expect(page.getByText('没有匹配的选项', { exact: true })).toBeVisible();
    await combo.fill('陈予安');
    await page.getByRole('option', { name: '陈予安 · 长文本审核与发布协调', exact: true }).click();
    await expect(combo).toHaveValue('陈予安 · 长文本审核与发布协调');
    await choose('组件测试状态', '禁用');
    await expect(select).toBeDisabled();
    await expect(combo).toBeDisabled();
    await choose('组件测试状态', '正常');
    await page.getByRole('button', { name: '预览环境', exact: true }).click();
    await choose('界面动效', '进一步减少动态');
    await page.keyboard.press('Escape');
    await category('弹窗与菜单');
    const from = await page.evaluate(() => window.uiAnimationCalls.length);
    await page.getByRole('button', { name: '打开长表单弹窗', exact: true }).click();
    await expect(visibleDialog('编辑任务')).toBeVisible();
    const durations = await page.evaluate(from => window.uiAnimationCalls.slice(from).filter(call => /bt-ui-modal|gw-glass-backdrop|bt-ui-dialog-scrim/.test(call.className)).map(call => call.duration), from);
    assert(durations.length > 0, 'The reduced-motion test did not observe a real material animation');
    assert(durations.every(duration => typeof duration === 'number' && duration <= 60), JSON.stringify(durations));
    observations.push({ stage, reducedMaterialDurations: durations });
    await page.keyboard.press('Escape');
    await expect(visibleDialog('编辑任务')).toHaveCount(0);
  });

  await step('production-narrow-navigation-and-nested-selection', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await category('弹窗与菜单');
    await page.getByRole('button', { name: '打开长表单弹窗', exact: true }).click();
    const dialog = visibleDialog('编辑任务');
    await dialog.getByRole('combobox', { name: '状态', exact: true }).click();
    await expect(page.getByRole('option', { name: '待审核', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
  });

  await step('fixture-close-preserves-presentation-and-blocks-background-scroll', async () => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(`${origin}/fixture/`);
    const opener = page.getByRole('button', { name: '打开测试窗口', exact: true });
    await opener.click();
    await expect(visibleDialog('受控浮层')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.getAttribute('data-motion-state') === 'open');
    const position = await page.evaluate(() => scrollY);
    await page.mouse.move(15, 200);
    await page.mouse.wheel(0, 450);
    assert.equal(await page.evaluate(() => scrollY), position, 'Background scrolled while open');
    await visibleDialog('受控浮层').getByRole('button', { name: '关闭', exact: true }).click();
    const closing = await page.evaluate(() => ({ state: document.querySelector('[role="dialog"]')?.getAttribute('data-motion-state'), title: document.querySelector('[role="dialog"] h2')?.textContent, inert: document.querySelector('.bt-ui-dialog-viewport')?.inert, y: scrollY }));
    assert.equal(closing.state, 'exiting');
    assert.equal(closing.title, '受控浮层');
    assert.equal(closing.inert, true);
    await page.mouse.move(15, 200);
    await page.mouse.wheel(0, 450);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => scrollY), position, 'Background scrolled during visual exit');
    await expect(visibleDialog('受控浮层')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.mouse.wheel(0, 450);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(position);
    observations.push({ stage, closing });
  });

  await step('fixture-fast-reopen-cancels-old-completion', async () => {
    await page.goto(`${origin}/fixture/`);
    await page.getByRole('button', { name: '打开测试窗口', exact: true }).click();
    await expect(visibleDialog('受控浮层')).toBeVisible();
    await page.evaluate(() => window.uiFixture.reopen());
    const reopened = visibleDialog('中断后重新打开');
    await expect(reopened).toBeVisible();
    await page.waitForTimeout(300);
    await expect(reopened).toBeVisible();
    await expect(reopened.getByRole('textbox', { name: '窗口草稿', exact: true })).toHaveValue('完整草稿仍由调用方持有');
    await expect.poll(() => reopened.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(reopened).toHaveCount(0);
  });

  await step('fixture-authorization-loss-immediately-removes-private-portals', async () => {
    await page.goto(`${origin}/fixture/`);
    await page.getByRole('button', { name: '打开测试窗口', exact: true }).click();
    const dialog = visibleDialog('受控浮层');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '权限气泡', exact: true }).click();
    await expect(visibleDialog('权限气泡')).toBeVisible();
    const result = await page.evaluate(async () => {
      window.uiFixture.revoke();
      await new Promise(requestAnimationFrame);
      return { dialogs: document.querySelectorAll('[role="dialog"]').length, portals: document.querySelectorAll('.bt-ui-dialog-portal, .bt-ui-popup').length, enabled: document.querySelector('[data-testid="authorization"]')?.textContent };
    });
    assert.deepEqual(result, { dialogs: 0, portals: 0, enabled: '权限失效' });
    await expect(page.getByRole('textbox', { name: '后台原有草稿', exact: true })).toHaveValue('完整草稿仍由调用方持有');
    await expect(page.getByRole('textbox', { name: '后台原有草稿', exact: true })).toBeDisabled();
    observations.push({ stage, result });
  });

  assert.deepEqual(errors, [], 'Uncaught browser errors');
  assert.deepEqual(blockedRequests, [], 'Unexpected non-loopback requests');
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify({ status: 'PASS', selectedScenario: scenario || 'full-suite', startedAt, finishedAt: new Date().toISOString(), checks, observations, errors, blockedRequests, builtFrontend, node: process.version,
    scope: 'Production component playground plus separately compiled test-only lifecycle fixture. Disposable browser and random loopback origin. No business API, real data, external network or model.',
    limitations: ['Automated interaction and runtime assertions only; not human pixel or normal-speed visual acceptance.', 'Chromium desktop and emulated 390px viewport; no Safari, native IME, touch hardware or continuous FPS verification.'] }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, evidence }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', stage, error: error.stack || error.message, checks, errors, blockedRequests, observations, builtFrontend }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(temporary, { recursive: true, force: true });
}
