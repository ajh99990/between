// Disposable transcript fixtures only: no runtime credentials or model requests.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RoleEngine } from '@between/role-engine';
import { roles, snapshot } from '../roles.mjs';
import { createApp } from '../server.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'between-admin-transcript-'));
const password = 'synthetic-transcript-admin';
const cookieValue = 'synthetic-browser-a';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ids = ['saved-transcript', 'empty-transcript', 'missing-transcript'];
const user = { id: 'transcript-user-a', csrf: 'synthetic-csrf-a', createdAt: new Date().toISOString(), disabled: true,
  conversations: ids.map(id => ({ id, role: roles[0].id, name: roles[0].name, title: id, createdAt: new Date().toISOString(), configVersion: 1 })) };
const other = { ...user, id: 'transcript-user-b', conversations: [{ ...user.conversations[0], id: 'other-transcript' }] };
const first = '今天刚到家。\n\n' + '这是保留换行的长聊天内容。'.repeat(1500) + '\n原文末尾';
const reply = '<script>不应执行</script>\n普通回复 & 保留字符。';
let app;
const checks = [];
const ok = (value, name) => { assert.ok(value, name); checks.push(name); };
async function call(cookie, route, method = 'GET', body) {
  const response = await fetch(app.url + route, { method, headers: { Origin: app.url, Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const route = (userId, id) => '/api/admin/conversation?' + new URLSearchParams({ userId, conversation: id });
try {
  await fs.mkdir(path.join(root, 'users'), { mode: 0o700 });
  await fs.writeFile(path.join(root, 'users', hash(cookieValue) + '.json'), JSON.stringify(user), { mode: 0o600 });
  await fs.writeFile(path.join(root, 'users', hash('synthetic-browser-b') + '.json'), JSON.stringify(other), { mode: 0o600 });
  const engine = await RoleEngine.open({ root: path.join(root, 'engine') });
  try {
    const value = snapshot(roles[0]);
    value.character.data.system_prompt = 'PRIVATE_PROMPT_SENTINEL';
    value.metadata = { internal: 'PRIVATE_METADATA_SENTINEL' };
    value.chat = [{ name: '用户甲', is_user: true, mes: first, extra: { private: 'PRIVATE_EXTRA_SENTINEL' } }, { name: '朋友', is_user: false, mes: reply, extra: {} }];
    await engine.forPrincipal({ tenant: 'local', user: user.id }).create(ids[0], value);
    await engine.forPrincipal({ tenant: 'local', user: user.id }).create(ids[1], { ...snapshot(roles[0]), chat: [] });
    await engine.forPrincipal({ tenant: 'local', user: other.id }).create('other-transcript', { ...snapshot(roles[0]), chat: [{ name: '乙', is_user: false, mes: 'B_ONLY_SENTINEL', extra: {} }] });
  } finally { await engine.close(); }
  // Deliberately hostile historical storage is added before startup, never to a
  // live user file. The admin projection must still exclude hidden messages.
  const stored = path.join(root, 'engine', hash(JSON.stringify(['local', user.id, ids[0]])) + '.json');
  const value = JSON.parse(await fs.readFile(stored, 'utf8'));
  value.chat.push({ name: 'hidden', is_system: true, is_user: false, mes: 'PRIVATE_HIDDEN_SENTINEL', extra: { reasoning: 'PRIVATE_REASONING_SENTINEL' } });
  await fs.writeFile(stored, JSON.stringify(value), { mode: 0o600 });
  app = await createApp({ root, port: 0, demo: true, adminPassword: password });
  ok((await call('', route(user.id, ids[0]))).status === 401, 'anonymous cannot read transcripts');
  ok((await call('between_user=' + cookieValue, route(user.id, ids[0]))).status === 401, 'ordinary user cannot use admin read endpoint');
  const login = await call('', '/api/admin/login', 'POST', { password });
  ok(login.status === 200, 'administrator login');
  const admin = login.cookie;
  const result = await call(admin, route(user.id, ids[0]));
  ok(result.status === 200 && result.data.messages.length === 2, 'administrator can inspect disabled user and hidden messages are excluded');
  assert.deepEqual(Object.keys(result.data).sort(), ['active', 'character', 'configVersion', 'createdAt', 'id', 'messages', 'revision', 'title', 'userId']);
  assert.deepEqual(Object.keys(result.data.messages[0]).sort(), ['images', 'index', 'name', 'role', 'text']);
  ok(result.data.messages[0].text === first && result.data.messages[1].text === reply, 'long text and original newlines are not truncated or rewritten');
  ok(!JSON.stringify(result.data).includes('PRIVATE_') && !JSON.stringify(result.data).includes('B_ONLY_SENTINEL'), 'no internal prompt, metadata, hidden extra or other user text');
  ok((await call(admin, route(user.id, 'other-transcript'))).status === 404, 'user and conversation ownership mismatch rejected');
  ok((await call(admin, route(other.id, ids[0]))).status === 404, 'reverse ownership mismatch rejected');
  ok((await call(admin, route('not-a-user', ids[0]))).status === 404, 'unknown user gets controlled not found');
  ok((await call(admin, route(user.id, ids[2]))).status === 404, 'missing backing snapshot gets controlled not found');
  ok((await call(admin, route(user.id, ids[1]))).data.messages.length === 0, 'empty transcript remains empty');
  for (const malformed of ['/api/admin/conversation', route('../escape', ids[0]), route(user.id, '../escape'), route(user.id, ids[0]) + '&userId=other']) {
    ok((await call(admin, malformed)).status === 400, 'malformed or ambiguous identity rejected');
  }
  await fs.unlink(stored);
  ok((await call(admin, route(user.id, ids[0]))).status === 404, 'deleted backing transcript cannot be read');
  await app.close();
  app = await createApp({ root, port: 0, demo: true, adminPassword: password });
  ok((await call(admin, route(user.id, ids[1]))).status === 401, 'expired administrator session cannot read transcripts after restart');
  console.log(JSON.stringify({ status: 'PASS', checks, scope: 'isolated synthetic saved transcripts and authenticated local HTTP only; zero model requests' }, null, 2));
} finally { await app?.close(); await fs.rm(root, { recursive: true, force: true }); }
