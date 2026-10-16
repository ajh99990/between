import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/server.mjs';
import { importCommunity } from '../../server/community.mjs';
import { forbiddenServicePorts, syntheticPassword } from './browser-fixtures.mjs';
import { previewConfig, previewPlanProvider } from './preview-fixtures.mjs';

// Explicitly started, disposable local preview. No model or credential access.
assert(Number(process.versions.node.split('.')[0]) >= 24, 'Node.js 24 or newer is required');
const portText = process.env.BETWEEN_ADMIN_PREVIEW_PORT ?? '0';
assert(/^\d+$/.test(portText), 'BETWEEN_ADMIN_PREVIEW_PORT must be an integer');
const port = Number(portText);
assert(port === 0 || (port >= 1024 && port <= 65535), 'Use port 0 or an unprivileged port');
assert(!forbiddenServicePorts.has(String(port)), 'Existing application ports are forbidden');
await fs.access(new URL('../dist/index.html', import.meta.url)).catch(() => { throw new Error('Build apps/admin before starting its isolated preview'); });
if (port) await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); });
let root, app, stopping;
const shutdown = () => stopping ??= (async () => { try { await app?.close(); } finally { if (root) await fs.rm(root, { recursive: true, force: true }); } })();
const stop = code => { void shutdown().finally(() => process.exit(code)); };
process.once('SIGINT', () => stop(0)); process.once('SIGTERM', () => stop(0));
process.once('uncaughtException', error => { console.error(error.message); stop(1); });
process.once('unhandledRejection', error => { console.error(error instanceof Error ? error.message : String(error)); stop(1); });
try {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'between-admin-new-preview-')));
  const config = previewConfig();
  for (const id of ['peiyu', 'tangtuantuan', 'wangushi', 'huoyushen']) { const imported = await importCommunity(id); config.roles.push(imported.role); if (imported.book) config.books.push(imported.book); }
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(config), { mode: 0o600 });
  app = await createApp({ root, port, demo: true, adminPassword: syntheticPassword, planProvider: previewPlanProvider() });
  assert(!forbiddenServicePorts.has(new URL(app.url).port));
  // Rich temporary records go through actual public endpoints. No /turn calls.
  for (let index = 0; index < 12; index += 1) {
    const session = await fetch(`${app.url}/api/session`, {
      method: 'POST', headers: { Origin: app.url, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(session.status, 200);
    const { csrf } = await session.json();
    const cookie = session.headers.get('set-cookie').split(';')[0];
    for (const role of config.roles.slice(index % 2, index % 2 + 2)) {
      const conversation = await fetch(`${app.url}/api/conversations`, {
        method: 'POST', headers: { Origin: app.url, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ role: role.id }),
      });
      assert.equal(conversation.status, 201);
    }
  }

  console.log(`Between 隔离预览：${app.url}/admin/`);
  console.log('内容：原创虚构角色、世界书与随包社区素材。用户和会话为临时示例；聊天使用合成回复，不连接真实模型。');
  console.log('修改仅写入本次临时目录，退出后删除；不会读取或改动日常使用的数据。');
  console.log(`示例管理员口令：${syntheticPassword}`);
} catch (error) { await shutdown(); throw error; }
