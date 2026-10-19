// Explicit local experiment. Never imported by production or regular test commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../apps/server/server.mjs';
import { openPlanCredentials } from '../../apps/server/plan-credentials.mjs';
import { startCompatibilityServer, createCompatibilityPlanProvider } from '../../apps/server/plan-service.mjs';
import { toResponses } from '../../apps/server/chatgpt-plan.mjs';
import { DEFAULT_PLAN_MODEL, DEFAULT_PLAN_REASONING } from '../../apps/server/plan-config.mjs';

process.umask(0o077);
const args = process.argv.slice(2);
const live = args.includes('--live');
const review = args.includes('--review');
const rootArg = args[args.indexOf('--root') + 1];
if (live === review || !args.includes('--root') || !rootArg || !path.isAbsolute(rootArg)) {
  throw new Error('Use --live --root /new/private/directory or --review --root /existing/private/directory; optional --suite negative-examples');
}
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24');
const suiteName = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'core-prompts';
if (!['core-prompts', 'negative-examples'].includes(suiteName)) throw new Error('Unknown comparison suite');
const suiteDefinition = await import(suiteName === 'negative-examples' ? './negative-examples.mjs' : './profiles.mjs');
const { profiles, inputs, compileRequest, verifySources } = suiteDefinition;
const expectedCount = inputs.length * profiles.length;
const root = path.resolve(rootArg);
const repository = fileURLToPath(new URL('../../', import.meta.url));
const contained = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
await fs.mkdir(path.dirname(root), { recursive: true, mode: 0o700 });
const canonicalParent = await fs.realpath(path.dirname(root));
if (canonicalParent !== path.dirname(root) || contained(repository, root)) throw new Error('Use a canonical data directory outside the repository');
if (live) await fs.mkdir(root, { mode: 0o700 }); // refuses overwrite/replay of an earlier paid suite
const stat = await fs.lstat(root);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077) throw new Error('Owner-only data directory required');
const evidence = path.join(root, 'evidence');
await fs.mkdir(evidence, { recursive: true, mode: 0o700 });
const write = (file, value) => fs.writeFile(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let owner, service, app, closed, activeRequests = 0;
const controller = new AbortController();
const close = () => closed ??= (async () => {
  controller.abort();
  await app?.close();
  await service?.close();
  await owner?.close();
})();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void close().then(() => process.exit(0), () => process.exit(1)); });

try {
  await verifySources();
  let password, planProvider;
  if (live) {
    password = crypto.randomBytes(24).toString('hex');
    await write('admin-password.txt', password + '\n');
    const baseline = profiles[0].role;
    await write('settings.json', { version: 1, roles: profiles.map(p => p.role),
      books: suiteName === 'core-prompts' ? [{ id: 'mira-world', name: '米拉的世界', keys: baseline.keys, content: baseline.world }] : [],
      preset: suiteDefinition.preset ?? { context: 8192, maxTokens: 512, temperature: 0.7, pinExamples: false,
        postHistory: '用中文自然回应，避免重复上一条回复。' },
      acceptNew: true, paused: false, model: null,
      planBackend: { enabled: true, model: DEFAULT_PLAN_MODEL, reasoningEffort: DEFAULT_PLAN_REASONING } });
    // The official credential owner is the only reader; no token is copied or logged.
    owner = await openPlanCredentials(path.join(os.homedir(), 'Library/Application Support/Between/siwc/between.json'));
    const inspectGrant = async () => {
      const r = await owner.credentials.load();
      return r ? { grantStatus: r.grant_status, subject: r.subject, workspace: r.workspace,
        clientId: r.client_id, scopes: String(r.scope || '').split(' '), expiresAt: r.expires_at,
        validated: r.validated === true, renewable: !!r.refresh_token } : null;
    };
    const localKey = crypto.randomBytes(32).toString('hex');
    service = await startCompatibilityServer({ localKey, getAccessToken: () => owner.credentials.getAccessToken(), inspectGrant, port: 0 });
    const originalProvider = await createCompatibilityPlanProvider({ baseUrl: service.baseUrl, localKey });
    planProvider = { ...originalProvider, async generate(request) {
      if (activeRequests >= expectedCount) throw new Error('The authorized automated comparison request limit has been reached');
      const compiled = compileRequest(request);
      const sequence = ++activeRequests;
      const file = `evidence/${String(sequence).padStart(3, '0')}-${compiled.id}.json`;
      const wire = toResponses(compiled.messages, request.model, request.reasoningEffort);
      const record = { sequence, profile: compiled.id, startedAt: new Date().toISOString(),
        model: request.model, reasoningEffort: request.reasoningEffort,
        input: compiled.messages, inputSha256: digest(compiled.messages), wire, wireSha256: digest(wire),
        metadata: compiled.metadata, status: 'started' };
      await write(file, record);
      try {
        const text = await originalProvider.generate({ ...request, messages: compiled.messages,
          signal: AbortSignal.any([request.signal, controller.signal].filter(Boolean)) });
        Object.assign(record, { status: 'completed', finishedAt: new Date().toISOString(), output: text, outputSha256: digest(text) });
        await write(file, record);
        return text;
      } catch (error) {
        Object.assign(record, { status: 'failed', finishedAt: new Date().toISOString(), code: error.code || 'failed' });
        await write(file, record);
        throw error;
      }
    } };
  } else {
    password = (await fs.readFile(path.join(root, 'admin-password.txt'), 'utf8')).trim();
    // Review performs no inference and does not load credentials. The trusted
    // readOnly host option also blocks configuration writes and fallback /turn.
    planProvider = { status: async () => ({ mode: 'chatgpt-plan', model: DEFAULT_PLAN_MODEL,
      connection: 'disconnected', canGenerate: false, description: '聊天记录查看', capabilities: {} }),
      generate: async () => { throw new Error('此入口仅用于查看聊天记录'); }, disconnect() {}, resume() {} };
  }
  app = await createApp({ root, port: 0, adminPassword: password, planProvider, readOnly: review });
  await write('runtime.json', { pid: process.pid, root, url: app.url, adminUrl: `${app.url}/admin/#/sessions`,
    startedAt: new Date().toISOString(), mode: live ? 'live-comparison' : 'no-inference-review' });
  console.log(`隔离聊天对比：${app.url}/admin/#/sessions`);
  if (live) {
    const call = async (route, body, identity = {}) => {
      const r = await fetch(app.url + route, { method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: app.url, 'Content-Type': 'application/json', Cookie: identity.cookie || '', 'X-CSRF-Token': identity.csrf || '' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]) });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(`HTTP ${r.status} ${route}: ${payload.error || '请求未完成'}`);
      }
      return r;
    };
    const r = await call('/api/session', {});
    const identity = { cookie: r.headers.get('set-cookie').split(';')[0], csrf: (await r.json()).csrf };
    const conversations = [];
    for (const profile of profiles) {
      const created = await (await call('/api/conversations', { role: profile.role.id,
        ...(profile.id === 'between' ? {} : { userName: '用户' }) }, identity)).json();
      conversations.push({ profile: profile.id, label: profile.label, id: created.id });
    }
    const result = { suite: suiteDefinition.suiteId ?? 'core-prompts',
      scope: suiteDefinition.scope ?? 'fixed-scenario 15-turn core-prompt comparison, not complete upstream products',
      model: DEFAULT_PLAN_MODEL, reasoningEffort: DEFAULT_PLAN_REASONING, startedAt: new Date().toISOString(),
      automatedInputs: [...inputs], conversations, expectedCount, completed: 0, status: 'running',
      sampling: 'The existing plan transport omits temperature/top_p/output caps; upstream sampling is recorded but not applied.' };
    await write('suite.json', result);
    try {
      for (const [turn, input] of inputs.entries()) {
        for (const conversation of conversations) {
          const response = await call(`/api/conversations/${conversation.id}/turn`,
            { input, id: crypto.randomUUID(), mode: 'normal' }, identity);
          const stream = await response.text();
          if (stream.includes('event: error')) throw new Error(`Generation failed: ${conversation.profile}; inspect private evidence`);
          const saved = await (await call(`/api/conversations/${conversation.id}`, undefined, identity)).json();
          if (saved.chat.filter(m => m.is_user).length !== turn + 1 || saved.chat.at(-1)?.is_user) {
            throw new Error('The turn did not persist completely');
          }
          result.completed += 1;
          await write('suite.json', result);
          console.log(`已保存 ${result.completed}/${inputs.length * profiles.length}：${conversation.profile} 第${turn + 1}轮`);
        }
      }
      result.status = 'completed';
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      console.log(`试验已停止：${error.message}`);
    }
    result.finishedAt = new Date().toISOString();
    await write('suite.json', result);
    const transcripts = [];
    for (const conversation of conversations) {
      const saved = await (await call(`/api/conversations/${conversation.id}`, undefined, identity)).json();
      transcripts.push({ ...conversation, chat: saved.chat });
    }
    await write('transcripts.json', { ...result, transcripts });
    let md = `# ${suiteDefinition.title ?? '核心提示词多轮聊天对比记录'}\n\n用户消息为预设场景；回复为实际模型输出。提示词、每轮请求、哈希与未接入范围另存于私有 evidence 目录。\n\n`;
    md += `模型：${result.model}；思考档位：${result.reasoningEffort}；完成请求：${result.completed}/${expectedCount}。\n\n`;
    for (const c of transcripts) {
      md += `## ${c.label}\n\n`;
      for (const m of c.chat) if (m.mes) md += `**${m.is_user ? '用户' : '回复'}**\n\n${m.mes}\n\n`;
    }
    await write('聊天记录.md', md);
    console.log(`状态：${result.status}；聊天记录已保存。后台继续供本机查看。`);
    // Automated suite ends here. No background model calls or automatic retries.
  }
} catch (error) {
  await close();
  console.error(`本机对比未能启动：${error.code || error.message}`);
  process.exitCode = 1;
}
