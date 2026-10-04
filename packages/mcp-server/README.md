# @between/mcp-server 0.1.0

Between's two scoped relationship tools, packaged for Node 24 without Electron or Qwen Code. This is a **trusted-hook integration**, not an automatic memory plug-in for every static MCP host configuration. No provider credentials, model calls, HTTP endpoints, sockets, or network listeners are needed.

## Trust boundary and actual support

MCP model tool requests do not authenticate the original user who supplied text, age confirmation, or memory consent. Consequently this package has no `start`, `consent`, `control`, `begin_turn`, or `end_turn` MCP tool. The only tools are `read_context` and `remember_user_report`. Inputs cannot select a database, scope, character, token, or controls. Source evidence and all business decisions come from `@between/core` (inlined into the distribution).

An integrating host must have a separate trusted user-input / turn-completion hook, present the required consent UI, invoke initialization only after the adult and virtual-identity confirmations, and supply the actual current-user text to `beginTurn`. The hook must be inaccessible to model tool calls. Do not give a model shell/file-edit access to these trusted commands or the private data directory and then claim this boundary isolates it. An arbitrary local process running as the same OS user can alter that user's files; this package is not an OS sandbox.

A host supporting only a static MCP `command` and model-visible protocol, with no trusted turn hook, can use discovery mode but **cannot safely use automatic relationship memory**. Compatibility with other hosts' lifecycle hooks is not implied by protocol compatibility.

## Independent installation and explicit consent

The released artifact is `between-mcp-server-0.1.0.tgz`, produced by this package's pack script from its generated `publish/` directory. Its manifest has no workspace or private first-party dependencies. It installs the native `better-sqlite3` module for the target Node runtime; platforms without a matching prebuild require that dependency's supported compiler toolchain. The Node Linux installation and ABI are tested separately from Electron; this does not attest a macOS Electron ABI.

```sh
mkdir isolated-client && cd isolated-client
npm init -y
npm install /absolute/path/between-mcp-server-0.1.0.tgz
# Use a NEW, empty directory whose parent already exists.
./node_modules/.bin/between-mcp trusted-init \
  --data-dir /absolute/private/between-data \
  --scope my-relationship \
  --character /absolute/path/approved-character.json \
  --adult-confirmed --accept-virtual --memory off
```

Only the trusted operator supplies these flags. Both confirmations and an explicit `on`/`off` memory choice are required. Initialization never overwrites an existing installation or re-enables earlier consent. Configuration and the validated character snapshot are private files; the exact snapshot hash is checked before a Store opens. Data paths are explicit and absolute, with no development-working-directory assumptions. The character must be an approved `online-character/1` JSON record with a fictional adult identity, core, premise, greetings, examples and topics; this is not a raw third-party character-card importer.

Private directory/configuration permissions and canonical paths are checked on POSIX. Directory permission enforcement is not a Windows ACL audit. An interrupted initialization is left fail-closed for operator review and is not silently retried or discarded.

## Executable per-turn trusted hook

After collecting the actual current-user input through its own authenticated UI, a host writes a bounded UTF-8 file (maximum 8,000 characters; protect and delete that file according to the host's privacy policy). It launches a new stdio connection with:

```sh
./node_modules/.bin/between-mcp trusted-turn \
  --data-dir /absolute/private/between-data \
  --input-file /absolute/private/current-user-text.txt \
  --event-id 10000000-0000-4000-8000-000000000001
```

Use a new UUID for each new user event. This trusted CLI calls core `receive`, keeps its generated grant private, and serves the normal MCP initialize / tools/list / tools/call lifecycle. The host sends `read_context` before any `remember_user_report`; only an exact quote from that current input can be saved, with an operation ID for idempotency. Memory remains disabled when the user chose `off`.

The host must keep stdin open while awaiting responses. On turn completion/cancellation, close stdin or send SIGTERM/SIGINT and await process exit. The process revokes its grant with core `end` and closes Store. Replayed event IDs are rejected, a new turn has no old capability, and grants expire after core's ten-minute TTL. Restart recovery revokes grants left by a killed process. The host must not infer that opening the next connection proves a previous operation was delivered to the user.

This mode performs one trusted user turn per subprocess. It does not record an arbitrary host's final assistant response as confirmed relationship history; external response validation/delivery is not part of these two MCP tools.

## Long-lived, host-neutral trusted lifecycle API

A host with trusted lifecycle callbacks can keep one Store and one MCP connection for many turns. This uses the same package and does not depend on Electron, Qwen, private workspace imports, or a second network service:

```js
import { createRelationshipMcpServer } from '@between/mcp-server';
import { openTrustedSession } from '@between/mcp-server/trusted-host';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const session = openTrustedSession({ dataDir: '/absolute/private/between-data' });
const server = createRelationshipMcpServer(session.binding);
await server.connect(new StdioServerTransport());

// Wire these functions to YOUR HOST'S trusted UI/lifecycle hook channel only.
// Do not register them as MCP tools or deserialize them from MCP requests.
export function onTrustedUserTurn(eventId, actualUserText) {
  return session.beginTurn({ eventId, text: actualUserText });
}
export function onTrustedTurnSettled() { session.endTurn(); }
export async function onTrustedHostShutdown() {
  try { session.close(); } finally { await server.close(); }
}
```

Call `endTurn` after completion, cancellation, and host errors before the next `beginTurn`. Overlapping begins are rejected. Calls before a begin or after an end are unauthorized, including during the gap between two turns on the same connection. The fixed binding observes only the currently active grant; tokens are never returned by the public API. `initializeTrustedData` is also exported for a trusted consent UI, with the same fresh-directory restriction as the CLI. The host integration owns its callback authentication and shutdown wiring. The included SDK test exercises two trusted turns on one live protocol connection, including the unauthorized gap.

## Discovery-only host configuration

```json
{"mcpServers":{"between":{"command":"/absolute/client/node_modules/.bin/between-mcp","args":["serve"]}}}
```

This mode successfully initializes and lists both tools. Every business call returns `NOT_AUTHORIZED`. `--data-dir` or inherited `REL_*` variables do not upgrade discovery to trusted mode. No database is opened by this mode.

## Existing desktop attachment

The internal `dist/trusted-stdio.js` entry preserves the fixed per-turn `REL_DB`, `REL_SCOPE`, `REL_GRANT`, `REL_CHARACTER_JSON`, `REL_CHARACTER_SHA256` environment contract and optional ephemeral turn snapshot. It opens `recover=false` under the existing core owner. It cannot initialize or mint consent/grants. It is not the independent-install workflow above.

## Ownership, output and failure behavior

A core `recover=true` Store is the sole authoritative owner across every scope in the same database. An independent MCP session refuses a concurrently open desktop/standalone owner, even under a different scope. Attached internal grant handles are the only `recover=false` path; the independent public API never creates one. Recovery remains in core rather than a copied SQL implementation.

MCP CLI stdout is reserved exclusively for JSON-RPC protocol. Help, initialization status and redacted diagnostics go to stderr. No user text, capabilities or database paths are printed in diagnostics. Normal EOF/signals close and revoke gracefully; SIGKILL cannot run cleanup, so the next authoritative core open performs recovery.

## Repository validation and packaging

```sh
pnpm --filter @between/mcp-server typecheck
pnpm --filter @between/mcp-server build
pnpm --filter @between/mcp-server test
pnpm --filter @between/mcp-server run pack -- /absolute/artifact-directory
pnpm --filter @between/mcp-server test:pack
```

Build upstream contracts/core first (the root workspace build does this). The packaging test installs the tarball in a new directory outside the repository, checks its dependency graph, and exercises the actual installed CLI with an official MCP client. It performs no model or provider calls. Do not publish or install the source-workspace manifest directly; use the generated distribution and pack command above.
