import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../engine/app/server.mjs';
import { fictionalPlanProvider, forbiddenServicePorts, initialConfig, syntheticPassword } from './browser-fixtures.mjs';

assert(Number(process.versions.node.split('.')[0]) >= 24);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const evidenceRoot = path.join(repository, 'design-system/between-orbit/evidence');
const evidence = path.resolve(process.env.BETWEEN_ADMIN_EVIDENCE || path.join(evidenceRoot, `targeted-${new Date().toISOString().replace(/[:.]/g, '-')}`));
assert(evidence.startsWith(evidenceRoot + path.sep));
await fs.mkdir(evidence, { recursive: true });
const root = await fs.realpath(await fs.mkdtemp('/tmp/between-admin-table-qa-'));
const config = initialConfig();
config.roles[0].name = '一位有很长中文名字和完整背景设定的虚构灯塔守望者';
await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(config), { mode: 0o600 });
const planProvider = fictionalPlanProvider();
const screenshots = [], errors = [], blockedRequests = [], visualMetrics = [];
let app, browser, page;
try {
  app = await createApp({ root, port: 0, demo: true, adminPassword: syntheticPassword, planProvider });
  assert(!forbiddenServicePorts.has(new URL(app.url).port));
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, chromiumSandbox: true,
  });
  for (let index = 0; index < 3; index += 1) {
    const user = await browser.newContext();
    const session = await user.request.post(`${app.url}/api/session`, { headers: { Origin: app.url }, data: {} });
    assert.equal(session.status(), 200);
    const { csrf } = await session.json();
    const conversation = await user.request.post(`${app.url}/api/conversations`, {
      headers: { Origin: app.url, 'X-CSRF-Token': csrf },
      data: { role: index === 1 ? config.roles[1].id : config.roles[0].id },
    });
    assert.equal(conversation.status(), 201);
    await user.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(15000);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== app.url || url.pathname.endsWith('/turn')) {
      blockedRequests.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${app.url}/admin/`);
  await page.getByLabel('管理员口令').fill(syntheticPassword);
  await page.getByRole('button', { name: '登录控制台', exact: true }).click();
  await page.getByTestId('workspace-ready').waitFor();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, heading] of [['users', 'browser-users-title'], ['sessions', 'saved-sessions-title']]) {
      await page.goto(`${app.url}/admin/#/${route}`);
      await page.reload();
      await page.getByTestId('workspace-ready').waitFor();
      const section = page.locator(`section[aria-labelledby="${heading}"]`);
      await section.getByRole('row').nth(1).waitFor();
      if (route === 'sessions') await section.getByText(config.roles[0].name + '的会话', { exact: true }).first().waitFor();
      await section.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      const metrics = await section.evaluate((element) => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        scrollContainers: [...element.querySelectorAll('*')]
          .filter((node) => node.scrollWidth > node.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(node).overflowX))
          .map((node) => ({ className: node.className, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth })),
      }));
      assert(metrics.documentWidth <= metrics.viewportWidth + 1);
      const file = `${route}-populated-table-${width}.png`;
      await page.screenshot({ path: path.join(evidence, file), animations: 'disabled' });
      screenshots.push({ file, route, width, metrics });
      if (width === 375) {
        await section.evaluate((element) => {
          for (const node of element.querySelectorAll('*')) {
            if (node.scrollWidth > node.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) node.scrollLeft = node.scrollWidth;
          }
        });
        const actionsFile = `${route}-populated-table-actions-${width}.png`;
        await page.screenshot({ path: path.join(evidence, actionsFile), animations: 'disabled' });
        screenshots.push({ file: actionsFile, route, width, note: 'Internal horizontal table scroll reveals row actions; page width remains bounded.' });
      }
    }
  }
  const navigate = async (route) => {
    await page.goto(`${app.url}/admin/#/${route}`);
    await page.reload();
    await page.getByTestId('workspace-ready').waitFor();
  };
  const capture = async (file, note) => {
    await page.screenshot({ path: path.join(evidence, file), animations: 'disabled' });
    screenshots.push({ file, width: page.viewportSize().width, note });
  };
  const measure = async (name, locator) => {
    // Settle the documented focus/hover transition before reading its end color.
    await page.waitForTimeout(400);
    const value = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      const backgroundStack = [];
      for (let current = element; current; current = current.parentElement) {
        const background = getComputedStyle(current);
        if (background.backgroundColor !== 'rgba(0, 0, 0, 0)' || background.backgroundImage !== 'none') {
          backgroundStack.push({ tag: current.tagName, className: current.className, color: background.backgroundColor, image: background.backgroundImage, opacity: background.opacity });
        }
      }
      return {
        className: element.className, text: element.tagName === 'INPUT' ? null : element.textContent?.slice(0, 120),
        color: style.color, backgroundColor: style.backgroundColor, backgroundStack,
        borderColor: style.borderColor, outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    visualMetrics.push({ name, viewport: page.viewportSize(), settledMilliseconds: 400, ...value });
    return value;
  };
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, confirmName] of [['roles', '移除角色'], ['books', '移除世界书']]) {
      await navigate(route);
      await capture(`${route}-final-first-screen-${width}.png`, 'Final CSS first screen; targeted visual evidence, not a repeat of the 64-workflow suite.');
      const card = page.getByRole('article').first();
      const remove = card.getByRole('button', { name: '移除', exact: true });
      await card.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await page.mouse.move(0, 0);
      await measure(`${route}-danger-default-${width}`, remove);
      await capture(`${route}-danger-default-${width}.png`, 'Default danger text after transition settled.');
      await remove.hover();
      await measure(`${route}-danger-hover-${width}`, remove);
      if (width === 375) {
        await remove.click();
        const confirm = page.getByRole('dialog').getByRole('button', { name: confirmName, exact: true });
        await confirm.hover();
        await measure(`${route}-danger-primary-hover-${width}`, confirm);
        await capture(`${route}-danger-primary-hover-${width}.png`, 'Danger confirmation hover only; operation is cancelled.');
        await page.getByRole('dialog').getByRole('button', { name: /^取\s*消$/ }).click();
      }
    }
    await navigate('models');
    await page.locator('section[aria-labelledby="plan-title"]').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await capture(`models-final-plan-panel-${width}.png`, 'Final CSS plan panel including disconnect control; no connection action invoked.');
    await measure(`models-disconnect-danger-default-${width}`, page.getByRole('button', { name: '断开连接', exact: true }));
    await navigate('roles');
    const card = page.getByRole('article').first();
    const edit = card.getByRole('button', { name: '编辑', exact: true });
    await edit.focus();
    await edit.press('Enter');
    await page.getByTestId('admin-editor').waitFor();
    const selectInput = page.getByLabel('绑定世界书', { exact: true });
    await selectInput.focus();
    await selectInput.press('ArrowLeft');
    const inputMetrics = await measure(`select-focused-input-${width}`, selectInput);
    assert.equal(inputMetrics.outlineStyle, 'none', 'The nested select input should not add a second outline');
    await measure(`select-focused-root-${width}`, selectInput.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'));
    await capture(`editor-final-select-focus-${width}.png`, 'Stable cyan group focus; nested input outline remains none.');
    await page.keyboard.press('Escape');
    await page.getByTestId('admin-editor').waitFor({ state: 'hidden' });
  }
  const savedConfig = await page.evaluate(() => fetch('/api/admin/state').then((response) => response.json()).then((data) => data.config));
  assert.deepEqual(savedConfig, config, 'All supplemental danger confirmations must be cancelled without changing configuration');
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  assert.equal(planProvider.calls.generate, 0);
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify({
    status: 'PASS', browser: await browser.version(), sandbox: true,
    screenshots, errors, blockedRequests, visualMetrics, planProviderCalls: planProvider.calls,
    builtAssets: [...(await fs.readFile(new URL('../dist/index.html', import.meta.url), 'utf8')).matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]),
    scope: 'Targeted final-CSS evidence only, not a repeat of the 64-workflow suite: populated tables, first screens, danger hover, and stable Select focus. Three fictional identities and conversations; no generation request.',
  }, null, 2));
  console.log(`TARGETED EVIDENCE PASS ${screenshots.length}\nEvidence: ${evidence}`);
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, 'failure.png'), animations: 'disabled' }).catch(() => {});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', error: String(error), screenshots, errors, blockedRequests }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
