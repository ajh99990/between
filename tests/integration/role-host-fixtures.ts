/**
 * SYNTHETIC SDK/provider seam, REAL Store -> TurnCoordinator ->
 * ManagedQwenAdapter -> official MCP SDK stdio -> trusted relationship server.
 * No Qwen SDK/CLI/provider is loaded, no API key, network endpoint or listener.
 * Scripted output and native-looking lifecycle events are not model evidence.
 */
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {SESSION_TOOLS, type NativeProviderAttempt} from '@between/contracts/host';
import {Store, type Controls, type Message} from '@between/core/store';
import {OffCache} from '@between/core/runtime/off-cache';
import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import {ManagedQwenAdapter, type ManagedQueryOptions, type SDKQueryFactory} from '@between/host-qwen/qwen-adapter';

export const APP_ROOT = path.resolve('apps/desktop/resources');
export const SKILL_BYTES = readFileSync(path.join(APP_ROOT, 'skills/relationship/SKILL.md'));
export const CHARACTER = JSON.parse(readFileSync(path.join(APP_ROOT, 'characters/alan.json'), 'utf8'));
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const GENERIC_PROMPT = 'Read this turn through relationship.read_context and reply according to the current boundaries.';
export const OUTPUT_MARKER = 'SYNTHETIC_SCRIPTED_REPLY_NOT_MODEL_OUTPUT';
export const ASSISTANT_MARKER = '作为助手，我先列一个计划：SYNTHETIC_MECHANISM_PROBE_NOT_MODEL_OUTPUT';
export type Context = {
  schema_version: number;
  character: {id: string; identity: {name: string}; core: Record<string, unknown>; premise: string};
  controls: Controls;
  current_input: {source_id: string; text: string};
  history: Message[];
  memories: {id: string; source: string; text: string}[];
  rules: string;
  capabilities: {text: boolean; proactive: boolean; images: boolean; real_world_actions: boolean};
};
export type ToolResult = {isError?: boolean; content: {type: string; text?: string}[]};
export function value<T = Record<string, unknown>>(result: ToolResult): T {
  assert.equal(result.content[0]?.type, 'text');
  assert.equal(typeof result.content[0]?.text, 'string');
  return JSON.parse(result.content[0].text!) as T;
}
export type QueryRecord = {
  synthetic_sdk_provider: true;
  index: number;
  prompt: string;
  system_prompt: string;
  system_prompt_sha256: string;
  system_prompt_bytes: number;
  context?: Context;
  tool_results: {name: string; route: 'adapter_hooks' | 'direct_mcp_negative_probe'; arguments: Record<string, unknown>; result: ToolResult}[];
  tools: string[];
  output: string;
  sdk_query_closed: boolean;
  mcp_pid?: number;
  mcp_closed: boolean;
  run_directory_removed: boolean;
};
export type ScriptApi = {
  options: ManagedQueryOptions;
  record: QueryRecord;
  call(name: 'read_context' | 'remember_user_report', args?: Record<string, unknown>): Promise<ToolResult | undefined>;
  directNegativeProbe(name: 'read_context' | 'remember_user_report', args: Record<string, unknown>): Promise<ToolResult>;
};
export type Scenario = {
  readContext?: boolean;
  output?: string;
  beforeContext?: (api: ScriptApi) => Promise<void>;
  afterContext?: (api: ScriptApi) => Promise<void>;
};
const disabled = () => ({capture_status: 'disabled' as const});
function attempt(phase: 'started' | 'finished', id: string): NativeProviderAttempt {
  return {
    schema_version: 1, sequence: phase === 'started' ? 0 : 1, event_id: randomUUID(), phase,
    attempt_id: id, attempt_index: 0, retry_index: 0, exchange_id: `SYNTHETIC_EXCHANGE_${id}`,
    attempt_reason: 'initial', provider: 'openai', model: 'SYNTHETIC_SCRIPT_NO_MODEL',
    correlation_status: 'unmatched', trace_id: '0'.repeat(32), span_id: '0'.repeat(16), parent_span_id: '0'.repeat(16),
    started_at: '2026-10-04T00:00:00Z', ...(phase === 'finished' ? {ended_at: '2026-10-04T00:00:01Z'} : {}),
    status: phase === 'started' ? 'running' : 'success', response_complete: phase === 'finished',
    request: disabled(), input: disabled(), system: disabled(), tools: disabled(), output: disabled(), usage: disabled(),
  };
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

export class PipelineFixture {
  readonly directory: string;
  readonly store: Store;
  readonly off: OffCache;
  readonly adapter: ManagedQwenAdapter;
  readonly coordinator: TurnCoordinator;
  readonly records: QueryRecord[] = [];
  readonly scriptErrors: unknown[] = [];
  private closed = false;
  private runDirectories: string[] = [];
  constructor(memory = true, readonly scenario: (index: number) => Scenario = () => ({}), directory?: string) {
    // os.tmpdir honors the caller's workspace TMPDIR; never invent a system path.
    this.directory = directory ?? mkdtempSync(path.join(os.tmpdir(), 'role-host-synthetic-'));
    this.store = new Store(path.join(this.directory, 'business.db'));
    if (!this.store.controls().started) this.store.start(true, true, memory);
    const key = Buffer.alloc(32, 0x53); // Local synthetic spool key only, never a provider credential.
    this.off = new OffCache(path.join(this.directory, 'spool.db'), key, this.store.authority);
    const query: SDKQueryFactory = request => {
      const index = this.records.length, scenario = this.scenario(index), options = request.options;
      const record: QueryRecord = {
        synthetic_sdk_provider: true, index, prompt: request.prompt, system_prompt: options.systemPrompt,
        system_prompt_sha256: sha256(options.systemPrompt), system_prompt_bytes: Buffer.byteLength(options.systemPrompt),
        tool_results: [], tools: [], output: scenario.output ?? `${OUTPUT_MARKER}_${index + 1}`,
        sdk_query_closed: false, mcp_closed: false, run_directory_removed: false,
      };
      this.records.push(record); this.runDirectories.push(options.cwd);
      let client: Client | undefined, transport: StdioClientTransport | undefined, closing: Promise<void> | undefined;
      const close = () => closing ??= (async () => {
        record.sdk_query_closed = true;
        if (client) await client.close();
        if (transport) await transport.close();
        // Official transport closes stdin, then SIGTERM/SIGKILL if needed. Verify reaping.
        if (record.mcp_pid) {
          const until = Date.now() + 3000;
          while (alive(record.mcp_pid) && Date.now() < until) await delay(10);
          assert.equal(alive(record.mcp_pid), false, 'MCP child must not survive query close');
        }
        record.mcp_closed = true;
      })();
      const fixture = this;
      return {
        close,
        async *[Symbol.asyncIterator]() {
          try {
            // Both messages below are script fixtures, not real runtime readback.
            yield {type: 'system', subtype: 'host_policy', uuid: randomUUID(), session_id: options.sessionId, data: {
              schema_version: 1, managed_host_contract_version: 2, skip_startup_context: true, upstream_usage_statistics_enabled: false, upstream_telemetry_enabled: false, source: 'runtime_config', session_id: options.sessionId,
              effective_session_tool_allowlist: [...SESSION_TOOLS], registered_tools: [...SESSION_TOOLS],
              hooks_status: 'present', unmanaged_hooks_blocked: true,
              sdk_hooks: options.hooks.map(h => ({event: h.event, matcher: h.matcher, name: `sdk:SYNTHETIC_${h.event}`, timeout_ms: h.timeoutMs + 1000})),
            }};
            yield {type: 'system', subtype: 'init', uuid: randomUUID(), session_id: options.sessionId, qwen_code_version: '0.24.7', tools: [...SESSION_TOOLS]};
            const server = options.mcpServers.relationship;
            transport = new StdioClientTransport({
              command: server.command, args: server.args, cwd: server.cwd,
              env: {...options.env, ...server.env}, stderr: 'pipe',
            });
            // Consume stderr to avoid blocking without leaking payloads into the report.
            transport.stderr?.on('data', () => {});
            client = new Client({name: 'synthetic-role-host-pipeline', version: '1.0.0'});
            await client.connect(transport, {timeout: 5000});
            record.mcp_pid = transport.pid ?? undefined;
            assert.ok(record.mcp_pid);
            const listing = await client.listTools(undefined, {timeout: 5000});
            record.tools = listing.tools.map(tool => tool.name).sort();
            assert.deepEqual(record.tools, ['read_context', 'remember_user_report']);
            const raw = async (name: string, args: Record<string, unknown>, route: 'adapter_hooks' | 'direct_mcp_negative_probe') => {
              const result = await client!.callTool({name, arguments: args}, {timeout: 5000}) as ToolResult;
              record.tool_results.push({name, route, arguments: structuredClone(args), result});
              return result;
            };
            const api: ScriptApi = {
              options, record,
              directNegativeProbe: (name, args) => raw(name, args, 'direct_mcp_negative_probe'),
              call: async (name, args = {}) => {
                const toolName = `mcp__relationship__${name}`, id = `SYNTHETIC_TOOL_${randomUUID()}`;
                const context = {signal: options.abortController.signal, toolUseId: id};
                const permission = await options.canUseTool(toolName, args, context);
                if (permission.behavior !== 'allow') return undefined;
                const hook = {session_id: options.sessionId, tool_name: toolName, tool_use_id: id, tool_call_id: id, tool_input: args};
                const pre = options.hooks.find(h => h.event === 'PreToolUse')!;
                assert.equal(await pre.callback(hook, context), true);
                const result = await raw(name, args, 'adapter_hooks');
                const post = options.hooks.find(h => h.event === (result.isError ? 'PostToolUseFailure' : 'PostToolUse'))!;
                assert.equal(await post.callback({...hook, tool_response: result}, context), true);
                return result;
              },
            };
            await scenario.beforeContext?.(api);
            if (scenario.readContext !== false) {
              const result = await api.call('read_context');
              assert.ok(result && !result.isError, 'actual MCP read_context must succeed');
              record.context = value<Context>(result);
            }
            await scenario.afterContext?.(api);
            const id = `SYNTHETIC_ATTEMPT_${index + 1}`;
            for (const phase of ['started', 'finished'] as const) {
              const data = attempt(phase, id);
              yield {type: 'system', subtype: 'provider_attempt', uuid: data.event_id, session_id: options.sessionId, data};
            }
            yield {type: 'result', subtype: 'success', is_error: false, uuid: randomUUID(), session_id: options.sessionId,
              result: record.output, provider_attempt_id: id, provider_attempt_ids: [id], permission_denials: []};
          } catch (error) { fixture.scriptErrors.push(error); throw error; }
          finally { await close(); }
        },
      };
    };
    this.adapter = new ManagedQwenAdapter({
      root: APP_ROOT, databasePath: this.store.file, runtimeRoot: path.join(this.directory, 'runtime'),
      query, timeoutMs: 15000,
      getEphemeral: input => ({turn: this.store.ephemeral.get(input.grant), messages: this.store.history().filter(m => m.status === 'confirmed')}),
    });
    this.coordinator = new TurnCoordinator(this.store, this.adapter, this.off, key);
  }
  async send(text: string, id: string = randomUUID(), ack = true) {
    this.coordinator.accept(this.store.scope, id, text);
    await this.coordinator.idle();
    if (this.scriptErrors.length) throw this.scriptErrors[0];
    const row = this.coordinator.snapshot().turns.find(turn => turn.turn_id === id)!;
    if (ack && row.status === 'completed' && row.message_id) this.coordinator.ack(this.store.scope, id, row.message_id);
    this.records.forEach((record, i) => {record.run_directory_removed = !existsSync(this.runDirectories[i]);});
    return row;
  }
  async close(remove = true) {
    if (!this.closed) {
      await this.coordinator.close();
      this.off.close(); this.store.close(); this.closed = true;
    }
    this.records.forEach((record, i) => {record.run_directory_removed = !existsSync(this.runDirectories[i]);});
    assert.ok(this.records.every(record => record.sdk_query_closed && record.mcp_closed && record.run_directory_removed));
    if (remove) rmSync(this.directory, {recursive: true, force: true});
  }
}
