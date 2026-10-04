import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createRelationshipMcpServer, type RelationshipToolBinding } from './index.js';

/** Every path to process shutdown closes the shared core handle exactly once. */
export async function runStdio(binding?: RelationshipToolBinding, release: () => void = () => {}): Promise<void> {
  const server = createRelationshipMcpServer(binding);
  let closed = false;
  let resolveClosed!: () => void;
  const finished = new Promise<void>(resolve => { resolveClosed = resolve; });
  const cleanup = () => {
    if (closed) return;
    closed = true;
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('exit', emergencyClose);
    try { release(); } catch { process.stderr.write('MCP_SHUTDOWN_FAILED\n'); process.exitCode = 1; }
    resolveClosed();
  };
  const emergencyClose = () => cleanup();
  const stop = () => { cleanup(); void server.close(); process.stdin.pause(); };
  server.server.onclose = cleanup;
  // Never print payload-bearing SDK errors, input or capability tokens.
  server.server.onerror = () => { process.stderr.write('MCP_PROTOCOL_ERROR\n'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', emergencyClose);
  try {
    await server.connect(new StdioServerTransport());
    await finished;
  } catch (error) { cleanup(); throw error; }
}
