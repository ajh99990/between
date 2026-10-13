import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../engine/app/server.mjs';
import {
  fictionalPlanProvider, forbiddenServicePorts, initialConfig, roleFieldKeys,
  syntheticPassword, unknownFields,
} from './browser-fixtures.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const evidenceRoot = path.join(repository, 'design-system/between-orbit/evidence');
const evidence = path.resolve(process.env.BETWEEN_ADMIN_EVIDENCE || path.join(
  evidenceRoot, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`,
));
assert(evidence.startsWith(evidenceRoot + path.sep), 'Keep every run in its own current design evidence directory');
await fs.mkdir(evidence, { recursive: true });
const root = await fs.realpath(await fs.mkdtemp('/tmp/between-admin-qa-'));
await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(initialConfig()), { mode: 0o600 });
const planProvider = fictionalPlanProvider();
const checks = [], errors = [], csp = [], blockedRequests = [], screenshots = [], planMutations = [], visualMetrics = [];
let app, browser, page, stage = 'bootstrap';
const startedAt = new Date().toISOString();
const pass = (name) => { checks.push(name); console.log('PASS', name); };
const step = async (name, fn) => { stage = name; await fn(); pass(name); };
const writeGallery = async () => {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;');
  await fs.writeFile(path.join(evidence, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Between 浏览器验收截图</title><style>body{margin:24px;background:#f2f4f7;color:#152238;font:14px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0;padding:12px;background:white;border:1px solid #dce1e7;border-radius:12px}img{display:block;width:100%;height:320px;object-fit:contain;object-position:top;background:#e8edf3}figcaption{margin-top:12px;line-height:1.7;overflow-wrap:anywhere}a{color:#174c7e}</style><h1>Between 浏览器验收截图</h1><p>所有页面仅含临时虚构数据。具体断言结论见同目录 JSON；截图不是测试通过证明。</p><main>${screenshots.map((item) => `<figure><a href="${escape(item.file)}"><img src="${escape(item.file)}" alt="${escape(item.stage)}" loading="lazy"></a><figcaption><strong>${escape(item.file)}</strong><br>${escape(item.route)} · ${item.viewport.width} × ${item.viewport.height}<br>${escape(item.stage)}</figcaption></figure>`).join('')}</main></html>`);
};
const startApp = async () => {
  const instance = await createApp({ root, port: 0, demo: true, adminPassword: syntheticPassword, planProvider });
  const url = new URL(instance.url);
  if (url.hostname !== '127.0.0.1' || forbiddenServicePorts.has(url.port)) {
    await instance.close();
    throw new Error('Acceptance server must use an isolated random loopback port');
  }
  return instance;
};

try {
  app = await startApp();
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, chromiumSandbox: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(15000);
  // Origin equality includes the random port. Merely allowing 127.0.0.1 would
  // accidentally grant access to the user's pre-existing services.
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== app.url || /\/turn(?:$|\?)/.test(url.pathname)) {
      blockedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    if (url.pathname === '/api/admin/plan' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      planMutations.push({ enabled: body.enabled, model: body.model, reasoningEffort: body.reasoningEffort, expectedVersion: body.expectedVersion, confirm: body.confirm });
    }
    await route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) csp.push(message.text());
  });
  await page.addInitScript(() => {
    window.__acceptanceCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__acceptanceCspViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    });
  });
  const shot = async (name) => {
    const filename = `${String(screenshots.length + 1).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(evidence, filename), fullPage: false, animations: 'disabled' });
    const violations = await page.evaluate(() => window.__acceptanceCspViolations || []);
    for (const violation of violations) {
      const summary = JSON.stringify(violation);
      if (!csp.includes(summary)) csp.push(summary);
    }
    screenshots.push({ file: filename, route: new URL(page.url()).hash, viewport: page.viewportSize(), stage });
  };
  const recordVisualMetrics = async (name) => {
    const metrics = await page.evaluate(() => {
      const styles = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        const backgroundStack = [];
        for (let current = element; current; current = current.parentElement) {
          const background = getComputedStyle(current);
          if (background.backgroundColor !== 'rgba(0, 0, 0, 0)' || background.backgroundImage !== 'none') {
            backgroundStack.push({ tag: current.tagName, className: current.className, color: background.backgroundColor, image: background.backgroundImage, opacity: background.opacity });
          }
        }
        return {
          className: element.className, color: style.color, backgroundColor: style.backgroundColor, backgroundStack,
          borderColor: style.borderColor, outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, boxShadow: style.boxShadow,
        };
      };
      return {
        tags: [...document.querySelectorAll('.ant-tag-processing, .ant-tag-geekblue, .ant-tag-cyan, .ant-tag-success, .ant-tag-green')]
          .map((element) => ({ text: element.textContent, ...styles(element) })),
        dangerButtons: [...document.querySelectorAll('.ant-btn-dangerous, .ant-btn-color-dangerous')]
          .map((element) => ({ text: element.textContent, ...styles(element) })),
        focusedSelectInputs: [...document.querySelectorAll('.ant-select input')]
          .filter((element) => element === document.activeElement)
          .map((element) => ({
            input: styles(element),
            selector: styles(element.closest('.ant-select')?.querySelector('.ant-select-selector')),
            content: styles(element.closest('.ant-select-content')),
            selectRoot: styles(element.closest('.ant-select')),
          })),
      };
    });
    visualMetrics.push({ name, viewport: page.viewportSize(), ...metrics });
  };
  const ready = async () => {
    await page.getByRole('button', { name: '刷新状态', exact: true }).waitFor();
    await page.getByTestId('workspace-ready').waitFor();
  };
  const nav = async (route) => {
    await page.goto(`${app.url}/admin/#${route}`);
    await page.reload();
    await ready();
  };
  const api = async (route, method = 'GET', data) => {
    assert(route.startsWith('/') && !route.includes('://') && !route.includes('/turn'));
    return page.evaluate(async ({ route, method, data }) => {
      const state = method === 'GET' ? null : await fetch('/api/admin/state').then((response) => response.json());
      const response = await fetch(`/api/admin${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(state ? { 'X-CSRF-Token': state.csrf } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { status: response.status, data: await response.json() };
    }, { route, method, data });
  };
  const state = async () => {
    const response = await api('/state');
    assert.equal(response.status, 200);
    return response.data;
  };
  const save = async (config) => {
    const response = await api('/config', 'PUT', { config, expectedVersion: config.version, confirm: true });
    assert.equal(response.status, 200, JSON.stringify(response.data));
  };
  const editor = () => page.getByTestId('admin-editor');
  // Ant places the test id on its panel wrapper; the parent Drawer owns initial focus.
  const editorFocusScope = () => editor().locator('xpath=..');
  const confirmSave = async () => {
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.getByRole('button', { name: '确认保存', exact: true }).click();
  };
  const waitSaved = async () => { await editor().waitFor({ state: 'hidden' }); };
  const discard = async () => {
    await page.getByRole('button', { name: '取消返回', exact: true }).click();
    await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await waitSaved();
  };
  const noOverflow = async (name) => {
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
    }));
    assert(dimensions.scroll <= dimensions.client + 1, `${name}: ${JSON.stringify(dimensions)}`);
  };
  const login = async () => {
    await page.goto(`${app.url}/admin`);
    await page.getByLabel('管理员口令').fill(syntheticPassword);
    await page.getByRole('button', { name: '登录控制台' }).click();
    await ready();
    await page.getByRole('button', { name: '新建角色', exact: true }).waitFor();
  };

  await step('login-failure-recoverable', async () => {
    await page.goto(`${app.url}/admin`);
    await page.getByLabel('管理员口令').fill('wrong-synthetic-password');
    await page.getByRole('button', { name: '登录控制台' }).click();
    await page.getByText('管理员口令不正确', { exact: true }).waitFor();
    await shot('login-error');
    await page.getByLabel('管理员口令').fill(syntheticPassword);
    await page.getByLabel('管理员口令').press('Enter');
    await ready();
  });
  pass('real-browser-login-route');

  await step('keyboard-skip-link-keeps-route-and-focuses-main', async () => {
    await nav('/roles');
    assert.equal(new URL(page.url()).hash, '#/roles');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '跳到主要内容', exact: true });
    await expect(skip).toBeFocused();
    const bounds = await skip.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0, 'The focused skip link must be visible');
    await shot('keyboard-skip-link');
    await page.keyboard.press('Enter');
    await expect(page.locator('main#workspace-main')).toBeFocused();
    assert.equal(new URL(page.url()).hash, '#/roles', 'The skip link must not replace the application route');
    await ready();
    await expect(page.getByRole('button', { name: '新建角色', exact: true })).toBeVisible();
    await shot('keyboard-main-focus');
  });

  await step('empty-sessions-and-users', async () => {
    await nav('/sessions');
    await page.getByText('当前没有运行任务', { exact: true }).waitFor();
    await page.getByText('还没有保存的会话', { exact: true }).waitFor();
    await shot('sessions-empty');
    await nav('/users');
    await page.getByText('还没有浏览器用户', { exact: true }).waitFor();
    await shot('users-empty');
  });

  await step('community-import-through-ui', async () => {
    await nav('/resources');
    const card = page.getByTestId('community-peiyu');
    await card.getByRole('button', { name: '导入角色与世界书' }).click();
    await page.getByRole('button', { name: '导入资源', exact: true }).click();
    await card.getByRole('button', { name: '阅读角色', exact: true }).waitFor();
    for (const id of ['tangtuantuan', 'wangushi', 'huoyushen']) {
      const current = await state();
      assert.equal((await api('/community/import', 'POST', { id, confirm: true, expectedVersion: current.config.version })).status, 201);
    }
  });
  // Extensions are intentionally absent from UI schemas, exercising lossless edits.
  const imported = (await state()).config;
  const role = imported.roles.find((item) => item.id === 'community-peiyu');
  const book = imported.books.find((item) => item.id === role.bookIds[0]);
  role.qaRoleExtension = structuredClone(unknownFields);
  book.qaBookExtension = structuredClone(unknownFields);
  book.entries.forEach((entry) => { entry.qaEntryExtension = { ...structuredClone(unknownFields), uid: entry.uid }; });
  await save(imported);

  await step('all-role-fields-full-text', async () => {
    await nav(`/roles/${role.id}`);
    for (const key of roleFieldKeys) {
      assert.equal(await page.locator(`[data-content-id="field-${key}"]`).textContent(), role[key] || '未设置', key);
    }
    await shot('role-full-text');
    await page.getByRole('navigation', { name: '全文目录' }).getByRole('button', { name: '开场白', exact: true }).click();
    await shot('role-greeting');
  });
  await step('every-community-book-entry-full-text', async () => {
    await nav(`/books/${book.id}`);
    for (const entry of book.entries) {
      assert.equal(await page.locator(`[data-content-id="entry-${entry.uid}"]`).textContent(), entry.content || '未设置');
    }
    await shot('book-full-text');
  });
  await step('reader-search-empty-and-reset', async () => {
    await page.getByLabel('搜索全文', { exact: true }).fill('不存在的虚构搜索词zzzz');
    await page.getByText('没有匹配的正文，清空搜索可阅读全部内容', { exact: true }).waitFor();
    await shot('reader-empty-search');
    await page.getByLabel('搜索全文', { exact: true }).fill('');
    await page.locator(`[data-content-id="entry-${book.entries[0].uid}"]`).waitFor();
  });
  await step('book-directory-jump', async () => {
    const last = book.entries.at(-1);
    await page.getByRole('navigation', { name: '全文目录' }).getByRole('button', { name: last.comment || `条目 ${book.entries.length}`, exact: true }).click();
    const bounds = await page.locator(`#entry-${last.uid}`).boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y < 350, JSON.stringify(bounds));
  });
  await step('book-save-preserves-unknown-fields-and-attribution', async () => {
    await page.getByRole('button', { name: /编辑\s*世界书/ }).click();
    const content = `${book.entries[0].content}\n【虚构验收追加：完整尾部】`;
    await page.getByLabel('条目内容', { exact: true }).first().fill(content);
    await shot('book-editor');
    await confirmSave();
    await waitSaved();
    const expected = structuredClone(book);
    expected.entries[0].content = content;
    assert.deepEqual((await state()).config.books.find((item) => item.id === book.id), expected);
  });

  await step('expanded-longtext-apply-cancel-and-unsaved-protection', async () => {
    await nav(`/roles/${role.id}`);
    await page.getByRole('button', { name: /编辑\s*角色/ }).click();
    await page.getByRole('button', { name: '展开编辑 角色描述', exact: true }).click();
    const expanded = page.getByRole('textbox', { name: '全文编辑内容', exact: true });
    await expanded.fill(role.detail + '\n展开编辑验收草稿');
    await page.getByText('有尚未保存的修改', { exact: true }).waitFor();
    assert.equal((await state()).config.roles.find((item) => item.id === role.id).detail, role.detail);
    const beforeUnload = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      return !window.dispatchEvent(event);
    });
    assert(beforeUnload, 'Expanded changes must participate in the editor unload guard');
    await shot('expanded-longtext-desktop');
    await page.getByRole('button', { name: '放弃本次展开编辑', exact: true }).click();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await expanded.inputValue(), role.detail + '\n展开编辑验收草稿');
    await page.getByRole('button', { name: '放弃本次展开编辑', exact: true }).click();
    await page.getByRole('button', { name: '放弃展开修改', exact: true }).click();
    await expanded.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('textbox', { name: '角色描述', exact: true }).inputValue(), role.detail);
    await page.getByRole('button', { name: '展开编辑 角色描述', exact: true }).click();
    await expanded.fill(role.detail + '\n应用到表单验收');
    await page.getByRole('button', { name: '应用到表单', exact: true }).click();
    await expanded.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('textbox', { name: '角色描述', exact: true }).inputValue(), role.detail + '\n应用到表单验收');
    await discard();
    assert.equal((await state()).config.roles.find((item) => item.id === role.id).detail, role.detail);
  });
  await step('worldbook-advanced-json-validation-edit-and-clear', async () => {
    const saved = (await state()).config.books.find((item) => item.id === book.id);
    await nav(`/books/${book.id}`);
    await page.getByRole('button', { name: /编辑\s*世界书/ }).click();
    const advanced = page.getByLabel('扩展配置（JSON）', { exact: true }).first();
    const previous = JSON.parse(await advanced.inputValue());
    await advanced.fill('{invalid');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '确认保存', exact: true }).count(), 0);
    await advanced.fill(JSON.stringify({ ...previous, acceptanceExtension: { depth: 7, enabled: true } }, null, 2));
    await shot('worldbook-advanced-json');
    await confirmSave(); await waitSaved();
    const changed = (await state()).config.books.find((item) => item.id === book.id);
    assert.deepEqual(changed.entries[0].acceptanceExtension, { depth: 7, enabled: true });
    await page.getByRole('button', { name: /编辑\s*世界书/ }).click();
    await advanced.fill('{}');
    await confirmSave(); await waitSaved();
    const cleared = (await state()).config.books.find((item) => item.id === book.id);
    assert(!('acceptanceExtension' in cleared.entries[0]));
    assert.equal(cleared.entries[0].content, saved.entries[0].content);
    const restore = (await state()).config;
    restore.books = restore.books.map((item) => item.id === book.id ? saved : item);
    await save(restore);
  });

  await step('form-required-validation-and-draft-cancel', async () => {
    await nav(`/roles/${role.id}`);
    await page.getByRole('button', { name: /编辑\s*角色/ }).click();
    await page.getByLabel('角色名称', { exact: true }).fill('');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.getByText('请输入角色名称', { exact: true }).waitFor();
    await page.getByLabel('角色名称', { exact: true }).fill('裴聿 · 虚构验收版本');
    await page.getByLabel('开场白', { exact: true }).fill(`${role.greeting}\n保存后的虚构开场。`);
    await page.getByRole('button', { name: '取消返回', exact: true }).click();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    assert.equal(await page.getByLabel('角色名称', { exact: true }).inputValue(), '裴聿 · 虚构验收版本');
    await confirmSave();
    await waitSaved();
    await page.reload();
    await ready();
  });
  const afterRole = (await state()).config.roles.find((item) => item.id === role.id);
  assert.deepEqual(afterRole, { ...role, name: '裴聿 · 虚构验收版本', greeting: `${role.greeting}\n保存后的虚构开场。` });
  pass('role-save-reload-preserves-all-unedited-and-unknown-fields');

  await step('optimistic-conflict-preserves-server-and-draft', async () => {
    await page.getByRole('button', { name: /编辑\s*角色/ }).click();
    await page.getByLabel('角色名称', { exact: true }).fill('不得覆盖并发修改');
    const concurrent = (await state()).config;
    concurrent.paused = true;
    await save(concurrent);
    await confirmSave();
    await editor().getByText('配置已变更，请刷新后重试', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('角色名称', { exact: true }).inputValue(), '不得覆盖并发修改');
    assert.deepEqual((await state()).config.roles.find((item) => item.id === role.id), afterRole);
    await shot('version-conflict');
    await discard();
  });

  const fixture = (await state()).config;
  fixture.paused = false;
  fixture.roles[0].name = '一位有着很长中文名字与完整背景设定的虚构灯塔守望者';
  fixture.roles[0].detail = '这是边界测试的虚构长正文，保留换行和完整尾部。\n'.repeat(250)
    + 'https://example.invalid/' + 'long-token-'.repeat(80) + '\n全文终点-END';
  fixture.roles[0].tag = '中文长标签用于检查布局';
  await save(fixture);
  for (const width of [1440, 1024, 768, 375]) {
    await step(`long-content-responsive-${width}`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      await nav(`/roles/${fixture.roles[0].id}`);
      const content = page.locator('[data-content-id="field-detail"]');
      await content.waitFor();
      assert.equal(await content.textContent(), fixture.roles[0].detail);
      await noOverflow(`reader-${width}`);
      await shot(`reader-${width}`);
      await content.scrollIntoViewIfNeeded();
      await shot(`reader-content-${width}`);
    });
    for (const route of ['/roles', '/books', '/models', '/sessions', '/users', '/resources']) {
      await step(`route-render-${route.slice(1)}-${width}`, async () => {
        await nav(route);
        await noOverflow(`${route}-${width}`);
        await shot(`${route.slice(1)}-${width}`);
        if (['/roles', '/books', '/users'].includes(route)) await recordVisualMetrics(`${route.slice(1)}-status-and-danger-colors-${width}`);
        if (route === '/models') {
          for (const section of ['plan-title', 'model-title', 'preset-title']) {
            await page.locator(`#${section}`).scrollIntoViewIfNeeded();
            await noOverflow(`models-${section}-${width}`);
            await shot(`models-${section}-${width}`);
          }
        }
        if (route === '/resources') {
          await page.getByRole('tab', { name: '运行诊断', exact: true }).click();
          await page.locator('#audit-log-title').waitFor();
          await noOverflow(`diagnostics-${width}`);
          await shot(`resources-diagnostics-${width}`);
          await page.locator('#audit-log-title').scrollIntoViewIfNeeded();
          await shot(`resources-audit-${width}`);
        }
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await step('mock-task-stop-request-and-expired-error-recovery', async () => {
    const syntheticTask = {
      id: 'synthetic-running-task', userId: 'synthetic-user-for-task-layout-only',
      conversation: 'synthetic-conversation-for-task-layout-only',
      mode: 'normal', startedAt: '2026-10-13T00:00:00.000Z',
    };
    let attempted, ended = false;
    const stateHandler = async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.tasks = ended ? [] : [syntheticTask];
      await route.fulfill({ response, json: data });
    };
    const stopHandler = async (route) => {
      attempted = route.request().postDataJSON();
      ended = true;
      await route.fulfill({ status: 404, json: { error: '任务已结束（合成验收）' } });
    };
    await page.route('**/api/admin/state', stateHandler);
    await page.route('**/api/admin/stop', stopHandler);
    try {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        await nav('/sessions');
        await page.getByRole('button', { name: '停止任务', exact: true }).waitFor();
        await noOverflow(`mock-running-task-${width}`);
        await shot(`mock-running-task-${width}`);
        await recordVisualMetrics(`task-processing-tags-${width}`);
      }
      await page.getByRole('button', { name: '停止任务', exact: true }).click();
      await shot('mock-task-stop-confirmation');
      await page.getByRole('dialog').getByRole('button', { name: '停止任务', exact: true }).click();
      await page.getByText('任务已结束（合成验收）', { exact: true }).waitFor();
      assert.deepEqual(attempted, { taskId: syntheticTask.id });
      await shot('mock-task-already-ended-error');
      await page.getByRole('button', { name: '刷新状态', exact: true }).click();
      await page.getByText('当前没有运行任务', { exact: true }).waitFor();
      assert.equal(planProvider.calls.generate, 0);
    } finally {
      await page.unroute('**/api/admin/state', stateHandler);
      await page.unroute('**/api/admin/stop', stopHandler);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.deepEqual((await state()).tasks, [], 'This UI fixture must never create a backend task');
  });

  await step('keyboard-editor-focus-and-escape', async () => {
    await nav(`/roles/${fixture.roles[0].id}`);
    const trigger = page.getByRole('button', { name: /编辑\s*角色/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await editor().waitFor();
    await expect.poll(() => editorFocusScope().evaluate((element) => element.contains(document.activeElement))).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      assert(await editorFocusScope().evaluate((element) => element.contains(document.activeElement)), `Keyboard focus escaped editor after Tab ${index + 1}`);
    }
    const focus = await page.locator(':focus').evaluate((element) => {
      const style = getComputedStyle(element);
      return { tag: element.tagName, outline: style.outlineStyle, shadow: style.boxShadow, visible: element.matches(':focus-visible') };
    });
    assert(focus.visible, `Keyboard focus is not exposed as focus-visible: ${JSON.stringify(focus)}`);
    await shot('keyboard-editor-focus');
    await page.getByLabel('绑定世界书', { exact: true }).focus();
    await recordVisualMetrics('focused-role-book-select');
    await shot('keyboard-editor-select-focus');
    await page.keyboard.press('Escape');
    await waitSaved();
    await expect(trigger).toBeFocused();
  });

  await step('mobile-editor-controls-within-viewport', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await nav(`/roles/${fixture.roles[0].id}`);
    await page.getByRole('button', { name: /编辑\s*角色/ }).click();
    await editor().waitFor();
    await noOverflow('mobile-editor');
    for (const name of ['保存修改', '取消返回']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = await button.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 376 && box.y + box.height <= 813, `${name}: ${JSON.stringify(box)}`);
    }
    await shot('mobile-editor');
    await page.getByRole('button', { name: '取消返回', exact: true }).click();
    await waitSaved();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await step('community-editor-does-not-leak-optional-fields-into-new-role', async () => {
    await nav('/roles');
    const card = page.getByRole('article').filter({
      has: page.getByRole('button', { name: afterRole.name, exact: true }),
    });
    await card.getByRole('button', { name: '编辑', exact: true }).click();
    const optionalFields = ['性格', '场景', '角色历史后指令', '作者备注'];
    for (const label of optionalFields) {
      await page.getByLabel(label, { exact: true }).fill(`不得继承的虚构社区字段：${label}`);
    }
    await discard();
    // Stay on the same mounted Roles page so this reuses its Form instance.
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    for (const label of optionalFields) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    }
    await shot('new-role-has-no-inherited-fields');
    await page.getByRole('button', { name: '取消返回', exact: true }).click();
    await waitSaved();
    assert.deepEqual((await state()).config.roles.find((item) => item.id === role.id), afterRole);
  });
  await step('create-role-through-ui', async () => {
    await nav('/roles');
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await page.getByLabel('角色名称', { exact: true }).fill('新建的虚构测试角色');
    await page.getByLabel('开场白', { exact: true }).fill('你好，这是无模型调用的验收。');
    await confirmSave();
    await waitSaved();
    assert((await state()).config.roles.some((item) => item.name === '新建的虚构测试角色'));
  });
  await step('create-book-through-ui', async () => {
    await nav('/books');
    await page.getByRole('button', { name: '新建世界书', exact: true }).click();
    await page.getByLabel('世界书名称', { exact: true }).fill('虚构新增世界书');
    await page.getByLabel('条目内容', { exact: true }).fill('新增的完整设定。');
    await confirmSave();
    await waitSaved();
    assert((await state()).config.books.some((item) => item.name === '虚构新增世界书'));
  });
  await step('remove-book-unbinds-all-roles', async () => {
    const config = (await state()).config;
    const disposable = config.books.find((item) => item.name === '虚构新增世界书');
    config.roles[0].bookIds.push(disposable.id);
    config.roles[1].bookIds.push(disposable.id);
    await save(config);
    await nav('/books');
    const row = page.getByRole('article').filter({ has: page.getByRole('button', { name: '虚构新增世界书', exact: true }) });
    await row.getByRole('button', { name: '移除', exact: true }).click();
    await page.getByRole('button', { name: '移除世界书', exact: true }).click();
    await row.waitFor({ state: 'hidden' });
    const saved = (await state()).config;
    assert(!saved.books.some((item) => item.id === disposable.id));
    assert(saved.roles.every((item) => !item.bookIds.includes(disposable.id)));
  });
  await step('search-lists-no-results-and-reset', async () => {
    for (const [route, label, text] of [
      ['/roles', '搜索角色', '没有匹配的角色'],
      ['/books', '搜索世界书', '没有匹配的世界书'],
      ['/sessions', '搜索会话', '没有匹配的会话'],
    ]) {
      await nav(route);
      await page.getByLabel(label, { exact: true }).fill('不存在的虚构搜索词zzzz');
      await page.getByText(text, { exact: true }).waitFor();
      await shot(`${route.slice(1)}-search-empty`);
      await page.getByLabel(label, { exact: true }).fill('');
    }
  });
  await step('preset-save-preserves-unknown-fields', async () => {
    await nav('/models');
    const before = (await state()).config.preset;
    await page.getByRole('button', { name: '编辑预设', exact: true }).click();
    await page.getByLabel('全局历史后指令', { exact: true }).fill('仅用于合成验收的新会话提示。');
    await confirmSave();
    await waitSaved();
    assert.deepEqual((await state()).config.preset, { ...before, postHistory: '仅用于合成验收的新会话提示。' });
  });

  await step('empty-model-connection-keeps-draft-after-save-error', async () => {
    const before = (await state()).config;
    assert.equal(before.model, null);
    const stateHandler = async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.model = {
        ...data.model, mode: 'unconfigured', connection: 'unconfigured',
        description: '虚构连接配置状态，仅用于失败草稿验收。',
      };
      await route.fulfill({ response, json: data });
    };
    let attempted;
    const modelHandler = async (route) => {
      attempted = route.request().postDataJSON();
      await route.fulfill({ status: 400, json: { error: '虚构模型配置未接受，请调整后重试' } });
    };
    await page.route('**/api/admin/state', stateHandler);
    await page.route('**/api/admin/model', modelHandler);
    try {
      await nav('/models');
      await page.getByRole('button', { name: '编辑连接', exact: true }).click();
      await page.getByLabel('兼容服务根地址', { exact: true }).fill('https://example.invalid/fictional/v1');
      await page.getByLabel('模型名称', { exact: true }).fill('synthetic-draft-model');
      await confirmSave();
      await editor().getByText('虚构模型配置未接受，请调整后重试', { exact: true }).waitFor();
      await expect(page.getByLabel('兼容服务根地址', { exact: true })).toHaveValue('https://example.invalid/fictional/v1');
      await expect(page.getByLabel('模型名称', { exact: true })).toHaveValue('synthetic-draft-model');
      assert.deepEqual(attempted, { url: 'https://example.invalid/fictional/v1', name: 'synthetic-draft-model', confirm: true });
      assert.deepEqual((await state()).config, before);
      assert.equal(planProvider.calls.generate, 0);
      await shot('model-save-error-retains-draft');
      await discard();
    } finally {
      await page.unroute('**/api/admin/state', stateHandler);
      await page.unroute('**/api/admin/model', modelHandler);
    }
  });

  for (const [value, label] of [['high', '高 · high'], ['medium', '中等 · medium']]) {
    await step(`model-reasoning-save-${value}-without-generation`, async () => {
      await nav('/models');
      const before = (await state()).config;
      await page.getByRole('button', { name: '编辑套餐', exact: true }).click();
      // Ant exposes virtual options through a zero-size accessibility mirror;
      // use the real combobox keyboard interaction instead of clicking that mirror.
      const effort = page.getByLabel('思考档位', { exact: true });
      assert.notEqual(before.planBackend.reasoningEffort, value);
      await effort.click();
      await recordVisualMetrics(`focused-reasoning-select-${value}`);
      await effort.press(value === 'high' ? 'ArrowDown' : 'ArrowUp');
      await effort.press('Enter');
      await confirmSave();
      await waitSaved();
      const saved = (await state()).config;
      assert.deepEqual(saved.planBackend, { ...before.planBackend, reasoningEffort: value });
      assert.equal(saved.version, before.version + 1);
      assert.equal(planProvider.calls.generate, 0);
      assert.deepEqual(planMutations.at(-1), { ...before.planBackend, reasoningEffort: value, expectedVersion: before.version, confirm: true });
      await page.reload();
      await ready();
      await page.getByText(label, { exact: true }).waitFor();
      await shot(`model-reasoning-${value}`);
    });
  }

  await step('global-pause-confirm-and-cancel', async () => {
    await nav('/users');
    const toggle = page.getByRole('switch', { name: '暂停新生成请求', exact: true });
    await toggle.click();
    await page.getByRole('button', { name: /^取\s*消$/ }).click();
    assert.equal((await state()).config.paused, false);
    await toggle.click();
    await page.getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    assert.equal((await state()).config.paused, true);
    await toggle.click();
    await page.getByRole('button', { name: '确认更改', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  // These API clients only create fictional identities and an empty conversation;
  // they never issue /turn or otherwise invoke a model.
  const userA = await browser.newContext(), userB = await browser.newContext();
  const userCall = async (client, route, method = 'GET', data, csrf) => {
    assert(route.startsWith('/api/') && !route.includes('/turn') && !route.includes('://'));
    const response = await client.request.fetch(`${app.url}${route}`, {
      method, headers: { Origin: app.url, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(data === undefined ? {} : { data }),
    });
    return { status: response.status(), data: await response.json() };
  };
  const a = (await userCall(userA, '/api/session', 'POST', {})).data;
  await userCall(userB, '/api/session', 'POST', {});
  let created;
  await step('admin-user-and-cross-user-isolation', async () => {
    assert.equal((await userCall(userA, '/api/admin/state')).status, 401);
    created = await userCall(userA, '/api/conversations', 'POST', { role: fixture.roles[0].id }, a.csrf);
    assert.equal(created.status, 201);
    assert.equal((await userCall(userB, `/api/conversations/${created.data.id}`)).status, 404);
  });
  await step('user-disable-restore-through-ui', async () => {
    await nav('/users');
    const userId = (await state()).users.find((user) => user.conversations.some((item) => item.id === created.data.id)).id;
    const row = page.getByRole('row').filter({ hasText: userId });
    await row.getByRole('button', { name: '停用', exact: true }).click();
    await page.getByRole('button', { name: '停用用户', exact: true }).click();
    await row.getByRole('button', { name: '恢复', exact: true }).waitFor();
    assert.equal((await userCall(userA, `/api/conversations/${created.data.id}`)).status, 403);
    await shot('user-disabled');
    await row.getByRole('button', { name: '恢复', exact: true }).click();
    await page.getByRole('button', { name: '恢复用户', exact: true }).click();
    await row.getByRole('button', { name: '停用', exact: true }).waitFor();
    assert.equal((await userCall(userA, `/api/conversations/${created.data.id}`)).status, 200);
  });
  await step('confirmed-session-delete-through-ui', async () => {
    await nav('/sessions');
    const row = page.getByRole('row').filter({ hasText: created.data.id });
    await row.getByRole('button', { name: '删除会话', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^取\s*消$/ }).click();
    assert.equal((await userCall(userA, `/api/conversations/${created.data.id}`)).status, 200);
    await row.getByRole('button', { name: '删除会话', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除会话', exact: true }).click();
    await row.waitFor({ state: 'hidden' });
    assert.equal((await userCall(userA, `/api/conversations/${created.data.id}`)).status, 404);
  });
  await userA.close();
  await userB.close();

  await step('server-restart-full-config-persistence', async () => {
    const before = (await state()).config;
    await app.close();
    app = await startApp();
    await login();
    assert.deepEqual((await state()).config, before);
  });
  await step('loading-visible-until-state-response', async () => {
    let release, intercepted;
    const gate = new Promise((resolve) => { release = resolve; });
    const requested = new Promise((resolve) => { intercepted = resolve; });
    const inFlight = new Set();
    let routeError;
    const handler = async (route) => {
      intercepted();
      const handled = (async () => {
        await gate;
        try { await route.continue(); }
        catch (error) { routeError = error; }
      })();
      inFlight.add(handled);
      try { await handled; }
      finally { inFlight.delete(handled); }
    };
    await page.route('**/api/admin/state', handler);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      let timer;
      try {
        await Promise.race([
          requested,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('The page did not request admin state during loading acceptance')), 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      await page.getByTestId('admin-loading').waitFor();
      await shot('loading');
    } finally {
      release();
      // A pending handler must finish before unroute can pass its request to the
      // context handler; otherwise both handlers may try to continue one request.
      while (inFlight.size) await Promise.all([...inFlight]);
      await page.unroute('**/api/admin/state', handler);
    }
    if (routeError) throw routeError;
    await ready();
  });
  await step('network-error-retry-through-ui', async () => {
    await page.route('**/api/admin/state', (route) => route.fulfill({ status: 503, json: { error: '合成服务暂时不可用' } }));
    await page.reload();
    await page.getByText('暂时无法读取控制台', { exact: true }).waitFor();
    await shot('network-failure');
    await page.unroute('**/api/admin/state');
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await ready();
  });
  await step('expired-admin-save-returns-to-login', async () => {
    await nav(`/roles/${fixture.roles[0].id}`);
    const before = (await state()).config;
    await page.getByRole('button', { name: /编辑\s*角色/ }).click();
    await page.getByLabel('角色名称', { exact: true }).fill('登录失效时不得写入的虚构草稿');
    await page.route('**/api/admin/config', (route) => route.fulfill({
      status: 401, json: { error: '管理员登录已过期（合成验收）' },
    }), { times: 1 });
    await confirmSave();
    await page.getByLabel('管理员口令').waitFor();
    assert.equal(new URL(page.url()).hash, '#/login');
    await shot('expired-admin-session');
    await page.getByLabel('管理员口令').fill(syntheticPassword);
    await page.getByRole('button', { name: '登录控制台', exact: true }).click();
    await ready();
    assert.deepEqual((await state()).config, before);
  });
  await step('empty-book-library-recoverable', async () => {
    const original = (await state()).config;
    const empty = structuredClone(original);
    empty.books = [];
    empty.roles.forEach((item) => { item.bookIds = []; });
    await save(empty);
    await nav('/books');
    await page.getByText('还没有世界书，创建第一份世界设定', { exact: true }).waitFor();
    await expect(page.getByRole('button', { name: '新建世界书', exact: true })).toBeEnabled();
    await shot('books-empty');
    const current = (await state()).config;
    await save({ ...original, version: current.version });
  });
  await step('logout-requires-login', async () => {
    await page.getByRole('button', { name: /退\s*出$/ }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.getByLabel('管理员口令').waitFor();
    assert.equal((await api('/state')).status, 401);
    await shot('logout');
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(csp, []);
  assert.deepEqual(blockedRequests, [], 'Unexpected external, old-service, or generation request');
  assert.equal(planProvider.calls.generate, 0);
  pass('zero-page-errors-csp-violations-and-model-generation');
  await fs.writeFile(path.join(evidence, 'browser-result.json'), JSON.stringify({
    status: 'PASS', startedAt, completedAt: new Date().toISOString(),
    browser: await browser.version(), sandbox: true, checks, errors, csp,
    blockedRequests, planProviderCalls: planProvider.calls, planMutations, screenshots, visualMetrics,
    data: 'Isolated fictional fixtures and licensed bundled fictional cards. No real credentials, model requests, or existing local services.',
  }, null, 2));
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify({
    status: 'PASS', checksPassed: checks.length, screenshots: screenshots.length,
    browser: await browser.version(), chromiumSandbox: true,
    safety: {
      fictionalDataOnly: true, realModelRequests: 0,
      attemptedPlanGenerations: planProvider.calls.generate,
      unexpectedBrowserRequests: blockedRequests.length,
      oldServicesAccessed: false, credentialsRead: false,
    },
    browserErrors: errors, cspViolations: csp, visualMetrics,
    scope: 'Browser workflows and isolated local persistence. Task stop and 400/401/network states use explicit route mocks; no real model or authorization validation.',
    detailedResults: 'browser-result.json', gallery: 'index.html',
  }, null, 2));
  await writeGallery();
  console.log(`ALL BROWSER PASS ${checks.length}\nEvidence: ${evidence}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: false, animations: 'disabled' }).catch(() => {});
    await fs.writeFile(path.join(evidence, 'failure-dom.html'), await page.content()).catch(() => {});
  }
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({
    status: 'FAIL', stage, error: String(error), stack: error.stack,
    startedAt, failedAt: new Date().toISOString(), checks, errors, csp,
    blockedRequests, planProviderCalls: planProvider.calls, screenshots, visualMetrics,
  }, null, 2));
  await writeGallery();
  console.error(`Browser acceptance failed at ${stage}. Evidence: ${evidence}`);
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
