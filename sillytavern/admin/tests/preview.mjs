/**
 * Disposable offline preview for browser inspection. Run from any directory:
 *   node sillytavern/admin/tests/preview.mjs
 * Optional: BETWEEN_ADMIN_PREVIEW_PORT=8890 (0 chooses a random free port).
 * SIGINT / SIGTERM stop the service and remove every temporary fixture file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  fictionalPlanProvider, forbiddenServicePorts, initialConfig, syntheticPassword,
} from './browser-fixtures.mjs';

assert(Number(process.versions.node.split('.')[0]) >= 24, 'The isolated preview requires Node.js 24 or newer');
const portText = process.env.BETWEEN_ADMIN_PREVIEW_PORT ?? '8889';
assert(/^\d+$/.test(portText), 'BETWEEN_ADMIN_PREVIEW_PORT must be an integer');
const port = Number(portText);
assert(port === 0 || (port >= 1024 && port <= 65535), 'Use port 0 or an unprivileged port from 1024 to 65535');
assert(!forbiddenServicePorts.has(String(port)), 'The preview must not use an existing application service port');
await fs.access(new URL('../dist/index.html', import.meta.url)).catch(() => {
  throw new Error('Build the new admin frontend before starting the isolated preview');
});
// Detect an occupied fixed port without sending any request to its owner.
if (port !== 0) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

let app, root, stopping;
const planProvider = fictionalPlanProvider();
const shutdown = () => {
  stopping ??= (async () => {
    try { await app?.close(); }
    finally { if (root) await fs.rm(root, { recursive: true, force: true }); }
  })();
  return stopping;
};
const stop = (code) => { void shutdown().finally(() => process.exit(code)); };
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
process.once('uncaughtException', (error) => {
  console.error(`QA preview stopped: ${error.message}`);
  stop(1);
});
process.once('unhandledRejection', (error) => {
  console.error(`QA preview stopped: ${error instanceof Error ? error.message : String(error)}`);
  stop(1);
});

try {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'between-admin-preview-qa-')));
  const config = initialConfig();
  // These bundled characters are fictional, licensed, and read from this checkout.
  // Importing them does not use a network connection or any user storage.
  const { importCommunity } = await import('../../engine/app/community.mjs');
  for (const id of ['peiyu', 'tangtuantuan', 'wangushi', 'huoyushen']) {
    const imported = await importCommunity(id);
    config.roles.push(imported.role);
    if (imported.book) config.books.push(imported.book);
  }
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(config), { mode: 0o600 });
  const { createApp } = await import('../../engine/app/server.mjs');
  app = await createApp({
    root, port, demo: true, adminPassword: syntheticPassword,
    // Never use the default provider: this implementation has no credential access
    // and throws if anything attempts a plan generation.
    planProvider,
  });
  const previewURL = new URL(app.url);
  assert.equal(previewURL.hostname, '127.0.0.1');
  assert(!forbiddenServicePorts.has(previewURL.port));
  console.log(`QA 虚构离线预览（不连接真实模型）：${app.url}/admin/`);
  console.log(`QA 专用虚构口令：${syntheticPassword}`);
} catch (error) {
  await shutdown();
  throw error;
}
