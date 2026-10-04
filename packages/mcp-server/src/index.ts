import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export type MemoryDetails={mode:'standing';expected_version:number}|{mode:'propose';proposed_kind:'fact'|'preference'|'history';expected_version:number}|{mode:'revise';target_id:string;target_revision:number;revision_mode:'correction'|'change';replacement_quote:string;expected_version:number};

/** Trusted host callbacks only. No model-facing initialization or control tools. */
export interface RelationshipToolBinding {
  readContext(): unknown;
  rememberUserReport(quote: string, operationId: string, details?:MemoryDetails): unknown;
}

const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const safeCodes = /^[A-Z][A-Z0-9_]{1,80}$/;

/** No binding is deliberately a useful discovery-only, fail-closed MCP server. */
export function createRelationshipMcpServer(binding?: RelationshipToolBinding): McpServer {
  const server = new McpServer({ name: 'relationship', version: '0.1.0' });
  const invoke = (call: (trusted: RelationshipToolBinding) => unknown) => {
    if (!binding) return { ...result({ error_code: 'NOT_AUTHORIZED' }), isError: true };
    try { return result(call(binding)); }
    catch (error) {
      // Core ProductError codes are safe diagnostics; arbitrary errors may contain
      // input, paths, or SQLite details and never cross the model-facing boundary.
      const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && safeCodes.test(error.code)
        ? error.code : 'STORAGE_UNAVAILABLE';
      return { ...result({ error_code: code }), isError: true };
    }
  };
  server.registerTool('read_context', {
    description: 'Required before every reply. Returns current character, input, boundaries and limited source-backed memories. Scope fixed outside model.',
    inputSchema: z.object({}).strict(),
  }, () => invoke(trusted => trusted.readContext()));
  const common={quote:z.string().min(1).max(500),operation_id:z.string().min(1).max(128)};
  server.registerTool('remember_user_report', {
    description: 'Save exact CURRENT-input quoted self-report evidence, never externally verified facts. Quote mode stores complete-source history; incomplete fragments are four-hour review candidates. Standing mode accepts a full input beginning with an explicit save instruction. Propose mode keeps an unverified kind proposal for this four-hour window only. Revise requires target ID/revision, current state version, and a literal complete old/new memory instruction; no automatic latest-wins or consent changes.',
    inputSchema:z.union([z.object({...common,mode:z.literal('quote').optional()}).strict(),z.object({...common,mode:z.literal('standing'),expected_version:z.number().int().nonnegative()}).strict(),z.object({...common,mode:z.literal('propose'),proposed_kind:z.enum(['fact','preference','history']),expected_version:z.number().int().nonnegative()}).strict(),z.object({...common,mode:z.literal('revise'),target_id:z.string().min(1).max(128),target_revision:z.number().int().positive(),revision_mode:z.enum(['correction','change']),replacement_quote:z.string().min(1).max(500),expected_version:z.number().int().nonnegative()}).strict()]),
  }, (input) => invoke(trusted => {
    const {quote,operation_id,...details}=input;return trusted.rememberUserReport(quote,operation_id,details.mode==='standing'||details.mode==='propose'||details.mode==='revise'?details:undefined);
  }));
  return server;
}
