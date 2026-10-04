// Copied to and executed INSIDE the clean installation; all imports resolve there.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createRelationshipMcpServer } from '@between/mcp-server';
import { openTrustedSession } from '@between/mcp-server/trusted-host';

const root = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(root, 'node_modules/@between/mcp-server/dist/cli.js');
const cleanEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const value = result => JSON.parse(result.content[0].text);
const dataDir = path.join(root, 'data'), characterFile = path.join(root, 'character.json'), inputFile = path.join(root, 'current-input.txt');
const character = { format: 'online-character/1', id: 'external-synthetic', version: '1', identity: { name: 'External synthetic', age_years: 29, fictional: true }, core: { voice: 'short' }, premise: 'fictional', greetings: ['Hello'], examples: [{ kind: 'everyday', text: 'sample' }], topics: [{ id: 'S1', title: 'surface', surface: 'synthetic' }] };
writeFileSync(characterFile, JSON.stringify(character), { mode: 0o600 });
const initArgs = ['trusted-init', '--data-dir', dataDir, '--scope', 'external-user', '--character', characterFile, '--adult-confirmed', '--accept-virtual', '--memory', 'on'];
const init = spawnSync(process.execPath, [cli, ...initArgs], { cwd: root, env: cleanEnv, encoding: 'utf8' });
assert.equal(init.status, 0, init.stderr); assert.equal(init.stdout, ''); assert.equal(init.stderr.trim(), 'INITIALIZED');
const repeated = spawnSync(process.execPath, [cli, ...initArgs], { cwd: root, env: cleanEnv, encoding: 'utf8' });
assert.equal(repeated.status, 1); assert.equal(repeated.stdout, ''); assert.match(repeated.stderr, /INITIALIZATION_ALREADY_EXISTS/);

async function connect(args, extraEnv = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, ...args], cwd: root, env: { ...cleanEnv, ...extraEnv }, stderr: 'pipe' });
  let errors = '', protocolErrors = [];
  transport.stderr?.on('data', bytes => { errors += bytes; });
  const client = new Client({ name: 'independent-installed-host', version: '1' });
  client.onerror = error => { protocolErrors.push(String(error)); };
  await client.connect(transport);
  return { client, transport, stderr: () => errors, protocolErrors };
}
const discovery = await connect(['serve', '--data-dir', dataDir], { REL_GRANT: 'fake', REL_DB: path.join(dataDir, 'state.db'), REL_SCOPE: 'external-user' });
assert.deepEqual((await discovery.client.listTools()).tools.map(t => t.name).sort(), ['read_context', 'remember_user_report']);
assert.equal(value(await discovery.client.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
assert.equal(value(await discovery.client.callTool({ name: 'remember_user_report', arguments: { quote: 'fake', operation_id: 'fake' } })).error_code, 'NOT_AUTHORIZED');
await discovery.client.close(); assert.equal(discovery.stderr(), ''); assert.deepEqual(discovery.protocolErrors, []);

const firstId = randomUUID(); writeFileSync(inputFile, 'SYNTHETIC independent installation input', { mode: 0o600 });
const args = id => ['trusted-turn', '--data-dir', dataDir, '--input-file', inputFile, '--event-id', id];
const first = await connect(args(firstId));
assert.equal(value(await first.client.callTool({ name: 'remember_user_report', arguments: { quote: 'independent installation', operation_id: 'save1' } })).error_code, 'CONTEXT_REQUIRED');
assert.equal(value(await first.client.callTool({ name: 'read_context', arguments: {} })).current_input.text, 'SYNTHETIC independent installation input');
assert.equal((await first.client.callTool({ name: 'read_context', arguments: { scope: 'attacker' } })).isError, true);
assert.equal((await first.client.callTool({ name: 'remember_user_report', arguments: { quote: 'independent installation', operation_id: 'save1', consent: true } })).isError, true);
assert.equal(value(await first.client.callTool({ name: 'remember_user_report', arguments: { quote: 'independent installation', operation_id: 'save1' } })).committed, true);
assert.equal(value(await first.client.callTool({ name: 'remember_user_report', arguments: { quote: 'not in source', operation_id: 'denied' } })).error_code, 'INVALID_SOURCE');
const collision = spawnSync(process.execPath, [cli, ...args(randomUUID())], { cwd: root, env: cleanEnv, encoding: 'utf8' });
assert.equal(collision.status, 1); assert.equal(collision.stdout, ''); assert.match(collision.stderr, /DATABASE_ALREADY_OPEN/);
await first.client.close(); assert.equal(first.stderr(), ''); assert.deepEqual(first.protocolErrors, []);
let db = new Database(path.join(dataDir, 'state.db'), { readonly: true });
assert.equal(db.prepare('SELECT COUNT(*) n FROM grants WHERE active=1').get().n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM business_owners').get().n, 0); db.close();
const replay = spawnSync(process.execPath, [cli, ...args(firstId)], { cwd: root, env: cleanEnv, encoding: 'utf8' });
assert.equal(replay.status, 1); assert.match(replay.stderr, /DUPLICATE_EVENT/);
writeFileSync(inputFile, 'SYNTHETIC second distinct input');
const second = await connect(args(randomUUID()));
assert.equal(value(await second.client.callTool({ name: 'read_context', arguments: {} })).current_input.text, 'SYNTHETIC second distinct input');
assert.equal(value(await second.client.callTool({ name: 'remember_user_report', arguments: { quote: 'independent installation', operation_id: 'save2' } })).error_code, 'INVALID_SOURCE');
await second.client.close(); assert.equal(second.stderr(), '');

// Long-lived public trusted host API, two turns on the SAME actual SDK connection.
const session = openTrustedSession({ dataDir }), server = createRelationshipMcpServer(session.binding);
const endpoints = [0, 1].map(() => ({ async start() {}, async close() { this.onclose?.(); }, async send(message) { const peer = endpoints[1 - endpoints.indexOf(this)]; queueMicrotask(() => peer.onmessage?.(structuredClone(message))); } }));
const persistent = new Client({ name: 'persistent-trusted-host', version: '1' });
await server.connect(endpoints[0]); await persistent.connect(endpoints[1]);
for (const text of ['SYNTHETIC persistent one', 'SYNTHETIC persistent two']) {
  assert.equal(value(await persistent.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
  session.beginTurn({ eventId: randomUUID(), text });
  assert.equal(value(await persistent.callTool({ name: 'read_context', arguments: {} })).current_input.text, text);
  assert.equal(value(await persistent.callTool({ name: 'remember_user_report', arguments: { quote: text, operation_id: randomUUID() } })).committed, true);
  session.endTurn();
}
assert.equal(value(await persistent.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
session.close(); await persistent.close(); await server.close();

// Raw stdio verification: stdout must consist only of JSON-RPC messages; signals
// and EOF must promptly release owner + grant without client-specific cleanup.
async function rawShutdown(mode) {
  const child = spawn(process.execPath, [cli, ...args(randomUUID())], { cwd: root, env: cleanEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; });
  const lines = createInterface({ input: child.stdout });
  const messages = [];
  const initialized = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('initialize timeout')), 5000);
    lines.on('line', line => {
      try { const message = JSON.parse(line); assert.equal(message.jsonrpc, '2.0'); messages.push(message); if (message.id === 1) { clearTimeout(timeout); resolve(); } }
      catch (error) { clearTimeout(timeout); reject(error); }
    });
    child.once('error', reject);
  });
  const exited = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(Error('shutdown timeout')); }, 10000);
    child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-installation-test', version: '1' } } }) + '\n');
  await initialized;
  if (mode === 'EOF') child.stdin.end(); else child.kill(mode);
  const result = await exited;
  assert.deepEqual(result, mode === 'SIGKILL' ? { code: null, signal: 'SIGKILL' } : { code: 0, signal: null }); assert.equal(stderr, ''); assert.equal(messages.length, 1);
  if (mode === 'SIGKILL') {
    const abandoned = new Database(path.join(dataDir, 'state.db'), { readonly: true });
    assert.equal(abandoned.prepare('SELECT COUNT(*) n FROM grants WHERE active=1').get().n, 1);
    abandoned.close();
    // The next recover=true authoritative core owner invalidates the dead turn.
    openTrustedSession({ dataDir }).close();
  }
  const read = new Database(path.join(dataDir, 'state.db'), { readonly: true });
  assert.equal(read.prepare('SELECT COUNT(*) n FROM business_owners').get().n, 0);
  assert.equal(read.prepare('SELECT COUNT(*) n FROM grants WHERE active=1').get().n, 0); read.close();
}
await rawShutdown('EOF'); await rawShutdown('SIGTERM'); await rawShutdown('SIGINT'); await rawShutdown('SIGKILL');

const packageRoot = path.join(root, 'node_modules/@between/mcp-server');
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json')));
assert.ok(!JSON.stringify(manifest).includes('workspace:')); assert.ok(!manifest.private);
assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['@modelcontextprotocol/server', 'better-sqlite3', 'xstate', 'zod']);
const forbidden = /^(?:electron(?:-|$)|@qwen-code\/|@between\/(?:core|contracts|host-qwen|desktop)$)/i;
function checkModules(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) { for (const child of readdirSync(file)) assert.ok(!forbidden.test(entry.name + '/' + child), entry.name + '/' + child); }
    else assert.ok(!forbidden.test(entry.name), entry.name);
    if (entry.isSymbolicLink()) assert.ok(realpathSync(file).startsWith(root + path.sep), 'outside install symlink');
  }
}
checkModules(path.join(root, 'node_modules'));
assert.ok(!lstatSync(packageRoot).isSymbolicLink());
console.log(JSON.stringify({ status: 'passed', installed_directory: root, node: process.version, model_calls: 0,
  checks: ['clean npm tarball install', 'no first-party workspace/private runtime imports', 'no Electron/Qwen', 'native SQLite ABI', 'SDK initialize and tools/list', 'discovery denies despite REL variables', 'trusted CLI grant', 'source/schema/idempotency gates', 'same DB owner collision', 'duplicate event rejection', 'second user turn', 'persistent trusted-hook two-turn SDK connection', 'EOF/SIGTERM/SIGINT grant and owner release', 'SIGKILL restart recovery revokes old grant', 'stdout JSON-RPC only'] }, null, 2));
