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

  await step('production-multiple-tags-and-exact-numeric-controls', async () => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(origin);
    await category('多选与参数');
    const multi = page.getByRole('combobox', { name: /^关联集合(?:\s*\*)?$/ });
    await multi.click();
    await expect(page.getByRole('listbox', { name: '关联集合', exact: true })).toBeVisible();
    await page.getByRole('option', { name: '雨后的花园', exact: true }).click();
    await expect(page.getByRole('listbox', { name: '关联集合', exact: true })).toBeVisible();
    await page.getByRole('option', { name: '山间工坊', exact: true }).click();
    await expect(page.getByRole('button', { name: '移除雨后的花园', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '移除山间工坊', exact: true })).toBeVisible();
    await multi.fill('旧档案馆');
    await page.getByRole('option', { name: '旧档案馆与漫长旅途中尚未整理完毕的线索', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '移除港湾与来信', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '移除山间工坊', exact: true })).toBeVisible();
    const unknown = page.getByRole('combobox', { name: '保留不可用已选项', exact: true });
    await expect(unknown).toHaveAttribute('readonly', '');
    await expect(page.locator('.bt-multi-select').filter({ has: unknown })).toContainText('retired-collection');

    const tags = page.getByRole('textbox', { name: /^触发词(?:\s*\*)?$/ });
    const completeTag = '雨夜 港口，未寄出的信';
    await tags.fill(completeTag);
    await tags.press('Enter');
    await expect(page.getByRole('button', { name: `编辑${completeTag}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '编辑雨后 港口', exact: true }).click();
    await tags.fill('临时取消的 完整词组');
    await tags.press('Escape');
    await expect(page.getByRole('button', { name: '编辑雨后 港口', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑临时取消的 完整词组', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '编辑雨后 港口', exact: true }).click();
    await tags.fill('细雨 港口');
    await tags.press('Enter');
    await expect(page.getByRole('button', { name: '编辑细雨 港口', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑雨后 港口', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `移除${completeTag}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `编辑${completeTag}`, exact: true })).toHaveCount(0);
    const pendingTag = '尚未按下回车的 完整词组';
    await tags.fill(pendingTag);
    await page.getByRole('button', { name: '保存本页配置', exact: true }).click();
    await expect(page.getByRole('button', { name: `编辑${pendingTag}`, exact: true })).toBeVisible();
    const submitted = await page.locator('input[type=hidden][name=keywords]').evaluateAll(nodes => nodes.map(node => node.value));
    assert(submitted.includes(pendingTag), 'Saving silently lost a pending uncommitted phrase');
    assert(!submitted.some(value => value === '尚未按下回车的' || value === '完整词组'), 'A whole phrase was split on spaces');
    await expect(page.getByRole('status').filter({ hasText: '已保留在本页' })).toBeVisible();
    await page.getByRole('checkbox', { name: '下一次保存失败', exact: true }).check();
    await page.getByRole('button', { name: '保存本页配置', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('本次未保存');
    await expect(page.getByRole('button', { name: `编辑${pendingTag}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const optional = page.getByRole('textbox', { name: '可选条数上限', exact: true });
    await expect(optional).toHaveValue('');
    await optional.fill('16');
    await optional.press('Tab');
    await expect(optional).toHaveValue('16');
    await optional.fill('');
    await optional.press('Tab');
    await expect(optional).toHaveValue('');
    const exact = page.getByRole('textbox', { name: /^精确输入(?:\s*\*)?$/ });
    const slider = page.getByRole('slider', { name: '采样温度', exact: true });
    await exact.fill('1.2');
    await exact.press('Tab');
    await expect(slider).toHaveAttribute('aria-valuenow', '1.2');
    await exact.focus();
    await page.keyboard.press('ArrowUp');
    await expect(exact).toHaveValue('1.3');
    await expect(slider).toHaveAttribute('aria-valuenow', '1.3');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(exact).toHaveValue('0');
    await page.keyboard.press('ArrowRight');
    await expect(exact).toHaveValue('0.1');
    await page.keyboard.press('End');
    await expect(exact).toHaveValue('2');
    observations.push({ stage, submittedTags: submitted, optionalEmpty: await optional.inputValue(), slider: await slider.getAttribute('aria-valuenow') });
    await page.screenshot({ path: path.join(evidence, 'multi-and-numeric.png') });
    await choose('组件测试状态', '禁用');
    await expect(multi).toBeDisabled();
    await expect(tags).toBeDisabled();
    await expect(exact).toBeDisabled();
    await expect(slider).toBeDisabled();
    await choose('组件测试状态', '正常');
  });

  await step('production-document-search-editor-identity-and-responsive-split', async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(origin);
    await category('阅读与编辑');
    const reader = page.getByRole('region', { name: '资料正文阅读', exact: true });
    const bodies = reader.locator('.bt-document-content');
    const original = await bodies.allTextContents();
    assert(original[0].includes('雨停后'));
    assert(original[0].includes('\n\n'), 'Reader flattened original paragraph breaks');
    const find = reader.getByRole('searchbox', { name: '在此资料中查找', exact: true });
    await find.fill('阅读');
    await expect.poll(() => reader.locator('mark').count()).toBeGreaterThan(1);
    await reader.getByRole('button', { name: '下一个匹配', exact: true }).click();
    const matchPosition = () => reader.locator('.bt-document-match').evaluateAll(nodes => nodes.findIndex(node => node.dataset.current === 'true'));
    assert.equal(await matchPosition(), 0, 'First find action skipped the first match');
    await reader.getByRole('button', { name: '下一个匹配', exact: true }).click();
    assert.equal(await matchPosition(), 1);
    await reader.getByRole('button', { name: '上一个匹配', exact: true }).click();
    assert.equal(await matchPosition(), 0);
    await reader.getByRole('button', { name: '清空文档查找', exact: true }).click();
    await expect(find).toHaveValue('');
    await expect(find).toBeFocused();
    await expect(reader.locator('mark')).toHaveCount(0);
    assert.deepEqual(await bodies.allTextContents(), original, 'Finding altered or truncated original text');
    const outline = reader.getByRole('navigation', { name: '资料章节目录', exact: true });
    await outline.getByRole('button', { name: /补充与交接/ }).click();
    await expect(outline.getByRole('button', { name: /补充与交接/ })).toHaveAttribute('aria-current', 'location');
    const separator = page.getByRole('separator', { name: '调整资料列表宽度', exact: true });
    const originalWidth = Number(await separator.getAttribute('aria-valuenow'));
    const resizeBox = await separator.boundingBox();
    assert(resizeBox && resizeBox.height >= 44, `Resizable separator collapsed: ${JSON.stringify(resizeBox)}`);
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + Math.min(100, resizeBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 32, resizeBox.y + Math.min(100, resizeBox.height / 2));
    await page.mouse.up();
    const draggedWidth = Number(await separator.getAttribute('aria-valuenow'));
    assert.equal(draggedWidth, originalWidth + 32, 'Dragging jumped from the actual pointer-down position');
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await separator.getAttribute('aria-valuenow')), draggedWidth + 16);
    await page.keyboard.press('Home');
    assert.equal(await separator.getAttribute('aria-valuenow'), await separator.getAttribute('aria-valuemin'));
    await page.keyboard.press('End');
    assert.equal(await separator.getAttribute('aria-valuenow'), await separator.getAttribute('aria-valuemax'));

    await page.getByRole('button', { name: '编辑正文', exact: true }).click();
    const editor = page.getByRole('textbox', { name: '资料正文', exact: true });
    const longText = Array.from({ length: 70 }, (_, index) => `第${index + 1}段：沿着港口的步道整理阅读资料，保留中文、空格与换行。`).join('\n\n') + '\n\n远海末尾定位 🌧️\n  原文尾部空格  ';
    await editor.fill(longText);
    await editor.press('Shift+ArrowLeft');
    const before = await editor.evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, value: node.value }));
    const sameTextarea = await editor.elementHandle();
    await page.getByRole('button', { name: '展开编辑区', exact: true }).click();
    assert(await editor.evaluate((node, original) => node === original, sameTextarea), 'Expansion remounted the textarea');
    assert.deepEqual(await editor.evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, value: node.value })), before, 'Expansion changed text or selection');
    // Fault-inject the IAB behavior: focus/selection update succeeds but neither
    // scrolls the native control. This must still reveal the match without fake
    // input, value changes, remounting, or relying on headless Chrome's caret aid.
    await editor.evaluate(node => {
      node.__uiNativeFocus = node.focus;
      node.__uiNativeSelection = node.setSelectionRange;
      node.focus = function (...args) { this.__uiNativeFocus.apply(this, args); this.scrollTop = 0; };
      node.setSelectionRange = function (...args) { this.__uiNativeSelection.apply(this, args); this.scrollTop = 0; };
    });
    let found, narrowEditorBounds;
    const editorViewport = () => editor.evaluate(node => {
      const box = node.getBoundingClientRect();
      const host = node.closest('.pg-main').getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height, hostTop: Math.max(host.top, 0), hostBottom: Math.min(host.bottom, innerHeight), scrollTop: node.scrollTop };
    });
    const assertEditorVisible = (bounds) => {
      assert(bounds.height <= bounds.hostBottom - bounds.hostTop, JSON.stringify(bounds));
      assert(bounds.bottom <= bounds.hostBottom + 1 && bounds.top >= bounds.hostTop - 1, `The matched textarea remained clipped by its real scroll host: ${JSON.stringify(bounds)}`);
    };
    try {
      await page.getByRole('searchbox', { name: '在资料正文中查找', exact: true }).fill('远海末尾定位');
      await page.getByRole('button', { name: '在资料正文中查找下一个', exact: true }).click();
      found = await editor.evaluate(node => ({ text: node.value.slice(node.selectionStart, node.selectionEnd), top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight }));
      assert.equal(found.text, '远海末尾定位');
      assert(found.scrollHeight > found.height && found.top > 100, `Measured textarea search failed to reveal its late match: ${JSON.stringify(found)}`);
      await expect(page.locator('[data-bt-textarea-measure]')).toHaveCount(0);
      await expect(editor).toHaveValue(longText);
      assertEditorVisible(await editorViewport());
      await page.getByRole('button', { name: '收起编辑区', exact: true }).click();
      assert(await editor.evaluate((node, original) => node === original, sameTextarea));
      const collapsed = await editor.evaluate(node => ({ top: node.scrollTop, maximum: node.scrollHeight - node.clientHeight }));
      assert(Math.abs(collapsed.top - Math.min(found.top, collapsed.maximum)) <= 1, 'Collapsing the editor lost its internal scroll position');
      await page.getByRole('button', { name: '在资料正文中查找上一个', exact: true }).click();
      assert((await editor.evaluate(node => node.scrollTop)) > 100, 'Collapsed editor did not reveal its selected match');
      await expect(page.locator('[data-bt-textarea-measure]')).toHaveCount(0);
      const desktopShell = await page.locator('.pg-app').evaluate(node => ({ scrollTop: node.scrollTop, topbarTop: document.querySelector('.pg-topbar')?.getBoundingClientRect().top }));
      assert.equal(desktopShell.scrollTop, 0, `Focus scrolled the non-scrolling desktop shell: ${JSON.stringify(desktopShell)}`);
      assert.equal(desktopShell.topbarTop, 0, `Focus clipped the desktop application header: ${JSON.stringify(desktopShell)}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '在资料正文中查找下一个', exact: true }).click();
      narrowEditorBounds = await editorViewport();
      assertEditorVisible(narrowEditorBounds);
      assert(narrowEditorBounds.scrollTop > 100, 'Narrow editor did not reveal its late match');
      await expect(editor).toHaveValue(longText);
    } finally {
      await editor.evaluate(node => {
        delete node.focus;
        delete node.setSelectionRange;
        delete node.__uiNativeFocus;
        delete node.__uiNativeSelection;
      });
    }
    await page.getByRole('button', { name: '保存到本页', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '已保存到本页' })).toBeVisible();
    await page.getByRole('button', { name: '返回阅读', exact: true }).click();
    assert.equal(await reader.locator('.bt-document-content').first().textContent(), longText);
    await find.fill('远海末尾定位');
    await reader.getByRole('button', { name: '下一个匹配', exact: true }).click();
    await expect(reader.locator('mark[data-current=true]')).toBeInViewport();
    await expect(find).toBeInViewport();
    await expect(reader.getByRole('button', { name: '下一个匹配', exact: true })).toBeInViewport();
    const shellPosition = await page.locator('.pg-app').evaluate(node => ({ scrollTop: node.scrollTop, viewportWidth: innerWidth, topbarTop: document.querySelector('.pg-topbar')?.getBoundingClientRect().top }));
    assert.equal(shellPosition.scrollTop, 0, `Focus scrolled the non-scrolling application shell: ${JSON.stringify(shellPosition)}`);
    if (shellPosition.viewportWidth > 700) assert.equal(shellPosition.topbarTop, 0, `Focus clipped the application header: ${JSON.stringify(shellPosition)}`);
    await reader.getByRole('button', { name: '清空文档查找', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '展开资料列表', exact: true })).toBeVisible();
    await expect(page.locator('.bt-split-sidebar')).toBeHidden();
    await page.getByRole('button', { name: '展开资料列表', exact: true }).click();
    const list = page.getByRole('list', { name: '资料列表', exact: true });
    await expect(list).toBeVisible();
    await list.getByRole('button').filter({ hasText: '屋顶花园的季节观察与共同维护约定' }).click();
    await page.getByRole('button', { name: '收起资料列表', exact: true }).click();
    await expect(page.locator('.bt-split-sidebar')).toBeHidden();
    await expect(reader.getByText('花园分为耐旱植物', { exact: false })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
    observations.push({ stage, textareaSearch: found, nativeScrollSuppressed: true, temporaryMirrorsRemaining: await page.locator('[data-bt-textarea-measure]').count(), shellPosition, narrowEditorBounds, narrowDimensions: dimensions });
    await page.screenshot({ path: path.join(evidence, 'documents-narrow.png') });
  });

  await step('production-json-lossless-format-errors-copy-and-text-diff', async () => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await category('JSON 与差异');
    const editorRegion = page.getByRole('region', { name: '扩展配置 JSON编辑器', exact: true });
    const editor = editorRegion.getByRole('textbox', { name: '扩展配置 JSON', exact: true });
    const original = await editor.inputValue();
    assert(original.includes('900719925474099312345'));
    await editorRegion.getByRole('button', { name: '格式化', exact: true }).click();
    const formatted = await editor.inputValue();
    assert(formatted.includes('900719925474099312345'), 'Formatting rounded a large numeric literal');
    assert(formatted.includes('1e-999'), 'Formatting changed an underflowing exponent');
    assert(formatted.includes('\\u4e2d\\u6587'), 'Formatting rewrote original string escapes');
    assert(formatted.includes('\n'), 'Format control did not actually format the JSON');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await editorRegion.getByRole('button', { name: '复制 JSON', exact: true }).click();
    await expect(editorRegion.getByRole('status')).toHaveText('已复制');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), formatted);
    await page.getByRole('checkbox', { name: '复制失败', exact: true }).check();
    await editorRegion.getByRole('button', { name: '复制 JSON', exact: true }).click();
    await expect(editorRegion.getByRole('status')).toContainText('复制失败');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), formatted, 'Failed copy overwrote clipboard contents');
    await expect(editor).toHaveValue(formatted);
    await page.getByRole('checkbox', { name: '复制失败', exact: true }).uncheck();

    await page.getByRole('button', { name: '载入语法错误', exact: true }).click();
    const invalid = await editor.inputValue();
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(editorRegion.locator('.bt-json-validation')).toContainText('第 3 行，第 13 列');
    await expect(editorRegion.getByRole('button', { name: '格式化', exact: true })).toBeDisabled();
    await editorRegion.getByRole('button', { name: '定位问题', exact: true }).click();
    await expect(editor).toBeFocused();
    const problem = await editor.evaluate(node => ({ start: node.selectionStart, text: node.value.slice(node.selectionStart, node.selectionEnd) }));
    assert.equal(problem.start, invalid.indexOf('}'));
    assert.equal(problem.text, '}');
    await expect(editor).toHaveValue(invalid);
    await page.getByRole('button', { name: '载入重复键', exact: true }).click();
    const duplicate = await editor.inputValue();
    assert.equal((duplicate.match(/"mode"/g) || []).length, 2);
    await expect(editorRegion.getByRole('button', { name: '格式化', exact: true })).toBeDisabled();
    await expect(editorRegion).toContainText('重复键');
    const viewer = page.getByRole('region', { name: '原始配置', exact: true });
    await viewer.getByRole('button', { name: '显示全文', exact: true }).click();
    assert.equal(await viewer.locator('pre').textContent(), duplicate, 'Viewer discarded duplicate fields');
    await page.getByRole('button', { name: '恢复 JSON 示例', exact: true }).click();
    assert.equal(await editor.inputValue(), original);
    await viewer.getByRole('textbox', { name: '在原始配置中查找', exact: true }).fill('retained');
    await expect(viewer.locator('mark')).toHaveText('retained');
    const diff = page.getByRole('region', { name: '配置正文差异', exact: true });
    await expect(diff.locator('tr[data-kind=removed]')).toContainText('未确认的事项保留原始注释。');
    await expect(diff.locator('tr[data-kind=added]')).toContainText('把待确认事项交给下一班复核。');
    await page.getByRole('checkbox', { name: '只改变结尾换行', exact: true }).check();
    await expect(diff.locator('tr[data-kind=removed]')).toContainText('无结尾换行');
    await expect(diff.locator('tr[data-kind=added]')).toContainText('LF');
    observations.push({ stage, largeInteger: '900719925474099312345', invalidLocation: problem, clipboard: 'real write/read plus deliberate rejected handler' });
    await page.screenshot({ path: path.join(evidence, 'json-and-diff.png') });
  });

  await step('production-column-control-resize-sticky-actions-and-filter-intents', async () => {
    await category('高级表格');
    const tableRegion = page.getByRole('region', { name: '可调资料表', exact: true });
    await expect(tableRegion.getByRole('columnheader', { name: /负责人/ })).toBeVisible();
    await page.getByRole('button', { name: '资料显示列', exact: true }).click();
    const visibility = visibleDialog('资料显示列设置');
    await expect(visibility).toBeVisible();
    await expect(visibility.getByRole('checkbox', { name: '编号 必需', exact: true })).toBeDisabled();
    await expect(visibility.getByRole('checkbox', { name: '操作 必需', exact: true })).toBeDisabled();
    await visibility.getByRole('checkbox', { name: '负责人', exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(visibility).toHaveCount(0);
    await expect(tableRegion.getByRole('columnheader', { name: /负责人/ })).toHaveCount(0);
    await page.getByRole('button', { name: '资料显示列', exact: true }).click();
    await visibleDialog('资料显示列设置').getByRole('checkbox', { name: '负责人', exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(tableRegion.getByRole('columnheader', { name: /负责人/ })).toBeVisible();
    const resizer = tableRegion.getByRole('separator', { name: '调整资料名称列宽', exact: true });
    const beforeDragWidth = Number(await resizer.getAttribute('aria-valuenow'));
    const handle = await resizer.boundingBox();
    assert(handle && handle.width >= 9 && handle.height >= 16, `Column handle has no usable area: ${JSON.stringify(handle)}`);
    assert(await resizer.evaluate(node => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      return hit === node || node.contains(hit);
    }), 'Column handle center is covered by a neighboring cell');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 24, handle.y + handle.height / 2);
    await page.mouse.up();
    assert.equal(Number(await resizer.getAttribute('aria-valuenow')), beforeDragWidth + 24, 'Real mouse drag did not resize the column from its visible handle');
    await resizer.focus();
    const initialWidth = Number(await resizer.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await resizer.getAttribute('aria-valuenow')), initialWidth + 8);
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(Number(await resizer.getAttribute('aria-valuenow')), initialWidth + 32);
    await page.keyboard.press('Home');
    assert.equal(await resizer.getAttribute('aria-valuenow'), await resizer.getAttribute('aria-valuemin'));
    await page.keyboard.press('End');
    assert.equal(await resizer.getAttribute('aria-valuenow'), await resizer.getAttribute('aria-valuemax'));
    const action = tableRegion.getByRole('button', { name: '查看DOC-001', exact: true });
    const beforeScroll = await action.boundingBox();
    const scrollbox = await tableRegion.boundingBox();
    assert(beforeScroll && scrollbox);
    await page.mouse.move(scrollbox.x + scrollbox.width / 2, scrollbox.y + Math.min(100, scrollbox.height / 2));
    await page.mouse.wheel(650, 0);
    await expect.poll(() => tableRegion.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    const afterScroll = await action.boundingBox();
    assert(afterScroll && Math.abs(afterScroll.x - beforeScroll.x) < 2, 'Pinned row operation moved with horizontal content');
    await action.click();
    const detail = visibleDialog('整理阶段交接清单');
    await expect(detail).toContainText('DOC-001');
    await detail.getByRole('contentinfo').getByRole('button', { name: '关闭', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await choose('资料状态', '进行中');
    await choose('资料负责人', '陈予安');
    const filter = page.getByRole('region', { name: '资料复合筛选', exact: true });
    await expect(filter.getByRole('button', { name: '移除筛选：状态：进行中', exact: true })).toBeVisible();
    await filter.getByRole('button', { name: '移除筛选：状态：进行中', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '资料状态', exact: true })).toContainText('全部状态');
    await expect(page.getByRole('combobox', { name: '资料负责人', exact: true })).toContainText('陈予安');
    await filter.getByRole('button', { name: '清除筛选', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '资料负责人', exact: true })).toContainText('全部负责人');
    const query = page.getByRole('textbox', { name: '检索资料', exact: true });
    await query.fill('完全不存在的资料');
    await expect(page.getByRole('heading', { name: '没有匹配的资料', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除全部条件', exact: true }).click();
    await expect(query).toHaveValue('');
    await expect(tableRegion.getByRole('button', { name: '查看DOC-001', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '模拟刷新失败', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('刷新失败');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(tableRegion.getByRole('button', { name: '查看DOC-001', exact: true })).toBeVisible();
    observations.push({ stage, columnWidth: await resizer.getAttribute('aria-valuenow'), pinnedActionBefore: beforeScroll, pinnedActionAfter: afterScroll });
    await page.screenshot({ path: path.join(evidence, 'extended-table.png') });
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
  if (page) await fs.writeFile(path.join(evidence, 'failure-aria.txt'), await page.locator('body').ariaSnapshot().catch(() => '')).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', stage, error: error.stack || error.message, checks, errors, blockedRequests, observations, builtFrontend }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(temporary, { recursive: true, force: true });
}
