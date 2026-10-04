import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

/** Trusted host callbacks only. No model-facing initialization or control tools. */
export interface RelationshipToolBinding {
  readContext(): unknown;
  rememberUserReport(quote: string, operationId: string): unknown;
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
  server.registerTool('remember_user_report', {
    description: 'Save one exact quotation from the CURRENT user input as a scoped self report. No inference, instructions or role/consent changes.',
    inputSchema: z.object({ quote: z.string().min(1).max(500), operation_id: z.string().min(1).max(128) }).strict(),
  }, ({ quote, operation_id }) => invoke(trusted => trusted.rememberUserReport(quote, operation_id)));
  return server;
}
