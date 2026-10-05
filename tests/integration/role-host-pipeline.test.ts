import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {Store} from '@between/core/store';
import {
  APP_ROOT, ASSISTANT_MARKER, CHARACTER, GENERIC_PROMPT, OUTPUT_MARKER, PipelineFixture,
  SKILL_BYTES, sha256, value, type QueryRecord,
} from './role-host-fixtures.js';

// These assertions evaluate host wiring and deterministic safety mechanisms only.
// Scripted content is never a naturalness/persona/model-quality sample.
const records: QueryRecord[] = [];
function checkRequest(record: QueryRecord, expectedInput: string) {
  assert.equal(record.prompt, GENERIC_PROMPT);
  assert.ok(!record.prompt.includes(expectedInput), 'user plaintext must not become unscoped prompt');
  assert.deepEqual(Buffer.from(record.system_prompt), SKILL_BYTES);
  assert.equal(record.system_prompt_sha256, sha256(SKILL_BYTES));
  assert.ok(!record.system_prompt.includes(expectedInput));
  assert.equal(record.context?.current_input.text, expectedInput);
  assert.deepEqual(record.context.character.core, CHARACTER.core);
  assert.equal(record.context.character.premise, CHARACTER.premise);
  assert.equal(record.context.character.identity.name, '阿岚');
  assert.ok(!JSON.stringify(record.context.character).includes('deeper'));
  assert.equal(record.context.capabilities.proactive, false);
  assert.equal(record.context.capabilities.real_world_actions, false);
  assert.match(record.context.rules, /Never deny AI identity/);
}
function count(store: Store, table: string): number {
  assert.ok(['memories', 'operations', 'render_receipts', 'tool_audit', 'model_attempts'].includes(table));
  return (store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n: number}).n;
}

const inputs = [
  'SYNTHETIC_TURN_01 今天只想随便说说',
  'SYNTHETIC_TURN_02 我喜欢灰蓝色',
  'SYNTHETIC_TURN_03 我不太喜欢大团圆结尾',
  'SYNTHETIC_TURN_04 今天有点累',
  'SYNTHETIC_TURN_05 我想换个话题',
  'SYNTHETIC_TURN_06 你怎么看直白的表达',
  'SYNTHETIC_TURN_07 一个未完成的句子',
  'SYNTHETIC_TURN_08 只聊这里的文字',
  'SYNTHETIC_TURN_09 给我留一点空间',
  'SYNTHETIC_TURN_10 今天不用提问',
  'SYNTHETIC_TURN_11 这是重新打开之后的输入',
  'SYNTHETIC_TURN_12 我想听具体的看法',
  'SYNTHETIC_TURN_13 不必同意我',
  'SYNTHETIC_TURN_14 我比较偏爱细节',
  'SYNTHETIC_TURN_15 今天说到这里也可以',
  'SYNTHETIC_TURN_16 我又回来了',
  'SYNTHETIC_TURN_17 我还记得刚才的句子',
  'SYNTHETIC_TURN_18 雨后的窗上有蓝色',
  'SYNTHETIC_TURN_19 关于留白我还有个想法',
  'SYNTHETIC_TURN_20 这轮仍然使用当前边界',
];

test('SYNTHETIC provider: 20 real coordinator/adapter/MCP turns, ACKs, current core and boundaries, restart history', {timeout: 120000}, async () => {
  let fixture = new PipelineFixture();
  const firstHalf: QueryRecord[] = [];
  try {
    fixture.coordinator.control(fixture.store.scope, {direction: 'friends', nickname: 'SYNTHETIC_NICK', nicknameState: 'suspended'});
    for (let i = 0; i < inputs.length; i++) {
      if (i === 10) {
        const directory = fixture.directory;
        firstHalf.push(...fixture.records);
        await fixture.close(false);
        fixture = new PipelineFixture(true, () => ({}), directory);
        assert.equal(count(fixture.store, 'render_receipts'), 10);
        assert.ok(fixture.store.history().some(message => message.text === inputs[9]));
      }
      if (i === 15) fixture.coordinator.control(fixture.store.scope, {nicknameState: 'allowed'});
      const row = await fixture.send(inputs[i], `SYNTHETIC_MULTITURN_${i + 1}`);
      assert.equal(row.status, 'completed', row.error_code ?? 'unexpected failure');
      const record = fixture.records.at(-1)!;
      checkRequest(record, inputs[i]);
      assert.equal(record.context!.controls.memory, 'on');
      assert.equal(record.context!.controls.role, 'active');
      assert.equal(record.context!.controls.direction, 'friends');
      assert.equal(record.context!.controls.nicknameState, i < 15 ? 'suspended' : 'allowed');
      assert.deepEqual(record.context!.controls, fixture.store.controls());
      assert.ok(record.context!.history.every(message => message.status === 'confirmed'));
      assert.equal(record.context!.history.at(-1)?.text, inputs[i]);
      assert.ok(record.context!.history.length <= 10);
      if (i > 0) {
        assert.ok(record.context!.history.some(message => message.text === inputs[i - 1]));
        assert.ok(record.context!.history.some(message => message.role === 'character' && message.text.startsWith(OUTPUT_MARKER)));
      }
      for (const future of inputs.slice(i + 1)) assert.ok(!JSON.stringify(record.context).includes(future));
      assert.equal(fixture.store.history().find(message => message.id === row.message_id)?.status, 'confirmed');
    }
    assert.equal(count(fixture.store, 'render_receipts'), 20);
    assert.equal(count(fixture.store, 'model_attempts'), 20, 'these persisted attempts are synthetic fixture events');
    assert.equal(count(fixture.store, 'tool_audit'), 20);
    assert.equal(count(fixture.store, 'memories'), 0);
    const tools = fixture.store.db.prepare('SELECT tool,status FROM tool_observations').all() as {tool: string; status: string}[];
    assert.equal(tools.length, 20);
    assert.ok(tools.every(tool => tool.tool === 'mcp__relationship__read_context' && tool.status === 'succeeded'));
  } finally {await fixture.close(); records.push(...firstHalf, ...fixture.records);}
});

test('SYNTHETIC mechanism probe: read_context permits assistant-like scripted text; skipping it fails CONTEXT_REQUIRED', {timeout: 30000}, async () => {
  for (const readContext of [true, false]) {
    const fixture = new PipelineFixture(true, () => ({readContext, output: ASSISTANT_MARKER}));
    try {
      const row = await fixture.send('SYNTHETIC_PERSONA_MECHANISM_INPUT', undefined, false);
      if (readContext) {
        assert.equal(row.status, 'completed');
        assert.equal(fixture.store.history().find(message => message.id === row.message_id)?.text, ASSISTANT_MARKER);
        assert.equal(fixture.coordinator.ack(fixture.store.scope, row.turn_id, row.message_id!), true);
      } else {
        assert.equal(row.status, 'failed');
        assert.equal(row.error_code, 'CONTEXT_REQUIRED');
        assert.equal(fixture.store.history().filter(message => message.role === 'character').length, 0);
      }
      assert.equal(count(fixture.store, 'tool_audit'), readContext ? 1 : 0);
    } finally {await fixture.close(); records.push(...fixture.records);}
  }
});

test('SYNTHETIC same input: exact current quote commits on; actual MCP denies off without durable plaintext', {timeout: 30000}, async () => {
  const input = 'SYNTHETIC_MEMORY_MATCH 我长期喜欢灰蓝色', quote = '我长期喜欢灰蓝色';
  for (const memory of [true, false]) {
    const fixture = new PipelineFixture(memory, () => ({afterContext: async api => {
      const args = {quote, operation_id: 'SYNTHETIC_EXACT_QUOTE_OPERATION'};
      // Off negative probe reaches the real MCP boundary directly, not an allowed host call.
      const result = memory ? await api.call('remember_user_report', args) : await api.directNegativeProbe('remember_user_report', args);
      assert.ok(result);
      if (memory) {
        assert.ok(!result.isError);
        assert.equal(value(result).committed, true);
        const repeated = await api.call('remember_user_report', args);
        assert.deepEqual(repeated, result);
      } else {
        assert.equal(result.isError, true);
        assert.equal(value(result).error_code, 'MEMORY_DISABLED');
      }
    }}));
    try {
      const row = await fixture.send(input);
      assert.equal(row.status, 'completed', row.error_code ?? 'unexpected failure');
      checkRequest(fixture.records[0], input);
      assert.equal(fixture.records[0].context!.controls.memory, memory ? 'on' : 'off');
      assert.equal(count(fixture.store, 'memories'), memory ? 1 : 0);
      assert.equal(count(fixture.store, 'operations'), memory ? 1 : 0);
      if (memory) {
        const saved = fixture.store.db.prepare('SELECT text,source,scope FROM memories').get() as {text: string; source: string; scope: string};
        assert.equal(saved.text, quote);
        assert.equal(saved.source, fixture.records[0].context!.current_input.source_id);
        assert.equal(saved.scope, fixture.store.scope);
      } else {
        assert.equal((fixture.store.db.prepare('SELECT body FROM runtime_turns').get() as {body: string | null}).body, null);
        assert.equal((fixture.store.db.prepare('SELECT count(*) n FROM sources').get() as {n: number}).n, 0);
        for (const base of [fixture.store.file, path.join(fixture.directory, 'spool.db')]) {
          for (const suffix of ['', '-wal', '-shm']) {
            if (existsSync(base + suffix)) assert.ok(!readFileSync(base + suffix).includes(Buffer.from(input)), 'memory-off input must not be durable plaintext');
          }
        }
      }
    } finally {await fixture.close(); records.push(...fixture.records);}
  }
});

test('SYNTHETIC off: real adapter permission gate rejects memory tool before MCP invocation', {timeout: 15000}, async () => {
  const fixture = new PipelineFixture(false, () => ({afterContext: async api => {
    assert.equal(await api.call('remember_user_report', {quote: 'SYNTHETIC_OFF_QUOTE', operation_id: 'off-block'}), undefined);
  }}));
  try {
    const row = await fixture.send('SYNTHETIC_OFF_QUOTE');
    assert.equal(row.status, 'failed');
    assert.equal(row.error_code, 'HOST_TOOL_BOUNDARY_FAILED');
    assert.equal(fixture.records[0].tool_results.filter(tool => tool.name === 'remember_user_report').length, 0);
    assert.equal(count(fixture.store, 'memories'), 0);
  } finally {await fixture.close(); records.push(...fixture.records);}
});

test('SYNTHETIC real MCP: prior/foreign/source override cannot become a current scoped self-report', {timeout: 30000}, async () => {
  const foreignText = 'SYNTHETIC_FOREIGN_SCOPE_PRIVATE_QUOTE', prior = 'SYNTHETIC_PRIOR_INPUT_ONLY_QUOTE';
  const fixture = new PipelineFixture(true, index => index === 1 ? {afterContext: async api => {
    for (const quote of [foreignText, prior, 'SYNTHETIC_INFERRED_NOT_IN_INPUT']) {
      const result = await api.call('remember_user_report', {quote, operation_id: `reject-${quote}`});
      assert.equal(result?.isError, true);
      assert.equal(value(result!).error_code, 'INVALID_SOURCE');
    }
    const override = await api.call('remember_user_report', {quote: 'SYNTHETIC_CURRENT', operation_id: 'override', source_id: 'foreign-source'});
    assert.equal(override?.isError, true);
    const scope = await api.call('read_context', {relationship_id: 'synthetic_foreign_scope'});
    assert.equal(scope?.isError, true);
    assert.ok(!JSON.stringify(api.record.context).includes(foreignText));
  }} : {});
  let foreign: Store | undefined;
  try {
    foreign = new Store(fixture.store.file, () => Date.now(), false, 'synthetic_foreign_scope');
    foreign.start(true, true, true);
    const turn = foreign.receive('SYNTHETIC_FOREIGN_TURN', foreignText)!;
    foreign.end(turn, turn.id, 'synthetic_fixture_only');
    assert.equal((await fixture.send(prior)).status, 'completed');
    const row = await fixture.send('SYNTHETIC_CURRENT this turn does not contain earlier or foreign quotes');
    assert.equal(row.status, 'completed', row.error_code ?? 'unexpected failure');
    assert.equal(count(fixture.store, 'memories'), 0);
    assert.equal(count(fixture.store, 'operations'), 0);
  } finally {foreign?.close(); await fixture.close(); records.push(...fixture.records);}
});

test('SYNTHETIC real MCP: queued future input and unACKed output stay out in both memory modes', {timeout: 60000}, async () => {
  for (const memory of [true, false]) {
    let ready!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => {ready = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    const fixture = new PipelineFixture(memory, index => index === 1 ? {beforeContext: async () => {ready(); await gate;}} : {});
    try {
      const first = await fixture.send('SYNTHETIC_EARLIER_INPUT', 'SYNTHETIC_ORDER_A', false);
      assert.equal(first.status, 'completed');
      const pendingOutput = fixture.records[0].output;
      fixture.coordinator.accept(fixture.store.scope, 'SYNTHETIC_ORDER_B', 'SYNTHETIC_CURRENT_INPUT');
      await Promise.race([reached, fixture.coordinator.idle().then(() => {throw new Error('Synthetic context gate was never reached');})]);
      fixture.coordinator.accept(fixture.store.scope, 'SYNTHETIC_ORDER_C', 'SYNTHETIC_FUTURE_INPUT');
      release(); await fixture.coordinator.idle();
      if (fixture.scriptErrors.length) throw fixture.scriptErrors[0];
      assert.ok(fixture.coordinator.snapshot().turns.every(row => row.status === 'completed'));
      const current = fixture.records[1].context!;
      assert.equal(current.current_input.text, 'SYNTHETIC_CURRENT_INPUT');
      assert.deepEqual(current.history.map(message => message.text), ['SYNTHETIC_EARLIER_INPUT', 'SYNTHETIC_CURRENT_INPUT']);
      assert.ok(!JSON.stringify(current).includes(pendingOutput));
      assert.ok(!JSON.stringify(current).includes('SYNTHETIC_FUTURE_INPUT'));
      // A real late renderer ACK becomes visible at the next actual MCP read.
      assert.equal(fixture.coordinator.ack(fixture.store.scope, first.turn_id, first.message_id!), true);
      assert.equal((await fixture.send('SYNTHETIC_AFTER_LATE_ACK')).status, 'completed');
      assert.ok(fixture.records[3].context!.history.some(message => message.text === pendingOutput));
      assert.ok(!fixture.records[3].context!.history.some(message => message.text === fixture.records[1].output));
    } finally {release(); await fixture.close(); records.push(...fixture.records);}
  }
});

test.after(() => {
  const destination = process.env.ROLE_HOST_EVIDENCE_DIR;
  if (!destination) return;
  assert.ok(path.isAbsolute(destination));
  mkdirSync(destination, {recursive: true});
  writeFileSync(path.join(destination, 'synthetic-pipeline-requests.json'), JSON.stringify({
    evidence_kind: 'SYNTHETIC_SDK_PROVIDER_REAL_PRODUCT_AND_MCP',
    real_model_calls: 0, real_qwen_sdk_or_cli_runs: 0, naturalness_scored: false,
    actual_provider_request_composition: 'NOT_TESTED', native_skill_lifecycle: 'NOT_TESTED',
    app_root: APP_ROOT, skill_sha256: sha256(SKILL_BYTES), skill_bytes: SKILL_BYTES.length,
    records,
  }, null, 2) + '\n');
});

test('SYNTHETIC real MCP read_context survives an overlapping owner SQLite writer', {timeout:15000}, async()=>{
 let releaseTimer:ReturnType<typeof setTimeout>|undefined;
 const fixture=new PipelineFixture(true,()=>({beforeContext:async()=>{
  fixture.store.db.exec('BEGIN IMMEDIATE');
  fixture.store.db.prepare('UPDATE grants SET read_context=read_context').run();
  // Keep the real owner writer active while the separate MCP process starts
  // reading. Its context transaction must wait before taking its read snapshot.
  releaseTimer=setTimeout(()=>{fixture.store.db.exec('COMMIT');},200);
 }}));
 try{
  const row=await fixture.send('SYNTHETIC_OVERLAPPING_OWNER_WRITER');
  assert.equal(row.status,'completed',row.error_code??'unexpected failure');
  checkRequest(fixture.records[0],'SYNTHETIC_OVERLAPPING_OWNER_WRITER');
  assert.equal(count(fixture.store,'tool_audit'),1);
 }finally{
  if(releaseTimer)clearTimeout(releaseTimer);
  if(fixture.store.db.inTransaction)fixture.store.db.exec('ROLLBACK');
  await fixture.close();records.push(...fixture.records);
 }
});
