import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { Store } from '@between/core/store';
import { createRelationshipMcpServer } from '../dist/index.js';
import { initializeTrustedData, openTrustedSession } from '../dist/trusted-host.js';
import { fixture, initialization } from './fixtures.mjs';

// A pair of test-only transports exercises the actual SDK client/server without
// extra listening endpoints. Stdio itself is covered by the installed test.
function pair() {
  const endpoints = [0, 1].map(() => ({ async start() {}, async close() { this.onclose?.(); }, async send(message) { const peer = endpoints[1 - endpoints.indexOf(this)]; queueMicrotask(() => peer.onmessage?.(structuredClone(message))); } }));
  return endpoints;
}
const value = result => JSON.parse(result.content[0].text);

test('trusted API supports two turns on one live MCP connection with unauthorized gaps', async () => {
  const f = fixture(); initializeTrustedData(initialization(f));
  const session = openTrustedSession({ dataDir: f.dataDir });
  const server = createRelationshipMcpServer(session.binding), client = new Client({ name: 'trusted-hook-test', version: '1' });
  const [left, right] = pair(); await server.connect(left); await client.connect(right);
  try {
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['read_context', 'remember_user_report']);
    assert.equal(value(await client.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
    const firstId = randomUUID(); assert.deepEqual(session.beginTurn({ eventId: firstId, text: 'SYNTHETIC I like rain' }), { turnId: firstId });
    assert.throws(() => session.beginTurn({ eventId: randomUUID(), text: 'overlap' }), /TURN_ALREADY_ACTIVE/);
    assert.equal(value(await client.callTool({ name: 'remember_user_report', arguments: { quote: 'I like rain', operation_id: 'first' } })).error_code, 'CONTEXT_REQUIRED');
    const context = await client.callTool({ name: 'read_context', arguments: {} });
    assert.equal(value(context).current_input.text, 'SYNTHETIC I like rain'); assert.ok(!JSON.stringify(context).includes('UNSUPPORTED_DEEPER_CANARY'));
    const saved = await client.callTool({ name: 'remember_user_report', arguments: { quote: 'I like rain', operation_id: 'first' } });
    assert.equal(saved.isError, undefined); assert.equal(value(saved).committed, true);
    assert.deepEqual(value(await client.callTool({ name: 'remember_user_report', arguments: { quote: 'I like rain', operation_id: 'first' } })), value(saved));
    assert.equal((await client.callTool({ name: 'read_context', arguments: { scope: 'other' } })).isError, true);
    assert.equal(value(await client.callTool({ name: 'remember_user_report', arguments: { quote: 'invented quote', operation_id: 'bad' } })).error_code, 'INVALID_SOURCE');
    session.endTurn(); assert.equal(value(await client.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
    session.beginTurn({ eventId: randomUUID(), text: 'SYNTHETIC I like mornings' });
    assert.equal(value(await client.callTool({ name: 'read_context', arguments: {} })).current_input.text, 'SYNTHETIC I like mornings');
    assert.equal(value(await client.callTool({ name: 'remember_user_report', arguments: { quote: 'I like rain', operation_id: 'first' } })).error_code, 'OPERATION_CONFLICT');
    session.endTurn();
    assert.throws(() => session.beginTurn({ eventId: firstId, text: 'replay' }), /DUPLICATE_EVENT/);
    session.close(); assert.equal(value(await client.callTool({ name: 'read_context', arguments: {} })).error_code, 'NOT_AUTHORIZED');
  } finally { session.close(); await client.close(); await server.close(); }
});

test('memory-off consent is respected and no trusted user text enters business DB', () => {
  const f = fixture(); initializeTrustedData({ ...initialization(f), memory: 'off' });
  const session = openTrustedSession({ dataDir: f.dataDir });
  session.beginTurn({ eventId: randomUUID(), text: 'MEMORY_OFF_CANARY_4d429' });
  assert.equal(session.binding.readContext().current_input.text, 'MEMORY_OFF_CANARY_4d429');
  assert.throws(() => session.binding.rememberUserReport('MEMORY_OFF_CANARY_4d429', 'off'), /MEMORY_DISABLED/);
  session.close();
  assert.ok(!readFileSync(path.join(f.dataDir, 'state.db')).includes(Buffer.from('MEMORY_OFF_CANARY_4d429')));
});

test('init refuses absent consent, reuse, symlinks, unsafe directories and altered character snapshot', () => {
  const f = fixture();
  assert.throws(() => initializeTrustedData({ ...initialization(f), adultConfirmed: false }), /CONSENT_REQUIRED/);
  assert.equal(existsSync(f.dataDir), false);
  initializeTrustedData(initialization(f));
  const before = createHash('sha256').update(readFileSync(path.join(f.dataDir, 'state.db'))).digest('hex');
  assert.throws(() => initializeTrustedData({ ...initialization(f), memory: 'off' }), /INITIALIZATION_ALREADY_EXISTS/);
  assert.equal(createHash('sha256').update(readFileSync(path.join(f.dataDir, 'state.db'))).digest('hex'), before);
  writeFileSync(path.join(f.dataDir, 'character.json'), JSON.stringify({ ...f.character, premise: 'tampered' }));
  assert.throws(() => openTrustedSession({ dataDir: f.dataDir }), /CHARACTER_SNAPSHOT_INVALID/);
  const other = fixture(), link = path.join(other.root, 'link.json'); symlinkSync(other.characterFile, link);
  assert.throws(() => initializeTrustedData({ ...initialization(other), characterFile: link }), /CONFIGURATION_UNTRUSTED/);
});

test('one authoritative core owner blocks standalone and desktop-like owners across scopes', () => {
  const f = fixture(); initializeTrustedData(initialization(f));
  const session = openTrustedSession({ dataDir: f.dataDir });
  try {
    assert.throws(() => openTrustedSession({ dataDir: f.dataDir }), /DATABASE_ALREADY_OPEN/);
    assert.throws(() => new Store(path.join(f.dataDir, 'state.db'), () => Date.now(), true, 'different-desktop-scope'), /DATABASE_ALREADY_OPEN/);
  } finally { session.close(); }
  const desktop = new Store(path.join(f.dataDir, 'state.db'), () => Date.now(), true, 'desktop-scope');
  try { assert.throws(() => openTrustedSession({ dataDir: f.dataDir }), /DATABASE_ALREADY_OPEN/); }
  finally { desktop.close(); }
  openTrustedSession({ dataDir: f.dataDir }).close();
});

test('trusted character read remains bounded when the file grows after fstat', async () => {
  const fs = await import('node:fs'), { syncBuiltinESMExports } = await import('node:module');
  const f = fixture(), originalFstat = fs.default.fstatSync, originalRead = fs.default.readSync;
  let injected = false, maximumRequested = 0;
  fs.default.fstatSync = (...args) => {
    const original = originalFstat(...args);
    if (!injected) {
      injected = true;
      writeFileSync(f.characterFile, Buffer.alloc(2 * 1024 * 1024, 65));
    }
    return original;
  };
  fs.default.readSync = (...args) => { maximumRequested = Math.max(maximumRequested, args[3]); return originalRead(...args); };
  syncBuiltinESMExports();
  try {
    assert.throws(() => initializeTrustedData(initialization(f)), /CONFIGURATION_UNTRUSTED/);
    assert.equal(injected, true);
    assert.ok(maximumRequested <= 1024 * 1024 + 1);
    assert.equal(existsSync(f.dataDir), false);
  } finally {
    fs.default.fstatSync = originalFstat; fs.default.readSync = originalRead; syncBuiltinESMExports();
  }
});
