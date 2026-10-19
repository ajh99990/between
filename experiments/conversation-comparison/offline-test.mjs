import assert from 'node:assert/strict';
import { snapshot } from '../../apps/server/roles.mjs';
import { createCore } from '../../packages/role-engine/core.mjs';
import { profiles, compileRequest, verifySources } from './profiles.mjs';
import { toResponses } from '../../apps/server/chatgpt-plan.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../../apps/server/server.mjs';

await verifySources();
for (const profile of profiles) {
  const role = { ...profile.role, detail: 'PRIVATE_HOST_DETAIL_CANARY',
    personality: 'PRIVATE_HOST_PERSONALITY_CANARY', postHistory: 'PRIVATE_HOST_PHI_CANARY' };
  const state = snapshot(role, { userName: '用户' });
  const history = [];
  for (let i = 1; i <= 14; i++) {
    history.push({ role: 'user', content: `第${i}轮原始用户短句` },
      { role: 'assistant', content: `第${i}轮原始角色回答` });
  }
  for (const message of history) state.chat.push({ name: message.role === 'user' ? '用户' : role.name,
    is_user: message.role === 'user', mes: message.content, extra: {} });
  state.chat.push({ name: '用户', is_user: true, mes: '行，三个鸡蛋。', extra: {} });
  const raw = await createCore(state).run();
  const compiled = compileRequest(raw, '2026-10-19T16:00:00+08:00');
  assert.equal(compiled.id, profile.id);
  const body = JSON.stringify(compiled.messages);
  assert(!body.includes('BETWEEN_LOCAL_COMPARISON_PROFILE_'));
  if (profile.id !== 'between') {
    assert(!body.includes('PRIVATE_HOST_'), 'host prompt must never pollute an upstream variant');
    assert(!body.includes('Write the next reply'));
    assert.equal(compiled.messages.filter(m => m.role === 'assistant').length, 14);
    for (const item of history) assert(body.includes(item.content), `lost history: ${item.content}`);
    assert(body.includes('行，三个鸡蛋。'));
  } else {
    assert(body.includes('PRIVATE_HOST_'), 'baseline must retain its actual host assembly');
  }
  const wire = toResponses(compiled.messages, 'gpt-6.1-sol', 'medium');
  assert.equal(wire.store, false);
  // The current host compiler returns VM-realm arrays. Compare serialized text,
  // not array prototypes, to verify actual transport bytes across realms.
  assert.equal(JSON.stringify(wire.input.map(m => m.content)), JSON.stringify(compiled.messages.map(m => m.name ? `[${m.name}]\n${m.content}` : m.content)));
  assert(!Object.hasOwn(wire, 'temperature'));
  console.log(`PASS ${profile.id}: original assets, full history, host separation, exact transport content`);
}
assert.throws(() => compileRequest({ messages: [
  { role: 'system', content: profiles[1].marker },
  { role: 'system', content: profiles[2].marker },
  { role: 'user', content: 'test' },
] }), /Ambiguous/);
assert.throws(() => compileRequest({ messages: [{ role: 'system', content: profiles[1].marker }] }), /latest user/);
console.log('PASS invalid/ambiguous routing rejects before model transport; zero model calls');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'between-comparison-readonly-'));
const password = crypto.randomBytes(24).toString('hex');
let app;
try {
  app = await createApp({ root, port: 0, readOnly: true, adminPassword: password });
  const call = (route, method = 'GET', body, headers = {}) => fetch(app.url + route, { method,
    headers: { Origin: app.url, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = await call('/api/admin/login', 'POST', { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { csrf } = await login.json();
  assert.equal((await call('/api/admin/state', 'GET', undefined, { Cookie: cookie })).status, 200);
  for (const [route, method, body] of [
    ['/api/session', 'POST', {}],
    ['/api/conversations', 'POST', { role: 'mira' }],
    ['/api/conversations/test/turn', 'POST', { input: 'must not generate' }],
    ['/api/admin/model', 'PUT', { url: 'https://example.com', name: 'blocked', confirm: true }],
    ['/api/admin/plan', 'PUT', { enabled: false, confirm: true }],
    ['/api/admin/conversation', 'DELETE', { userId: 'test', conversation: 'test', confirm: true }],
  ]) {
    const response = await call(route, method, body, { Cookie: cookie, 'X-CSRF-Token': csrf });
    assert.equal(response.status, 403, route);
    await response.body?.cancel();
  }
  assert.equal((await call('/api/admin/logout', 'POST', {}, { Cookie: cookie, 'X-CSRF-Token': csrf })).status, 200);
  console.log('PASS review instance: login/read/logout allowed; all business writes and model fallback blocked');
} finally {
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
}
