import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Store, ProductError } from '@between/core/store';
import type { Turn } from '@between/contracts/records';
import type { RelationshipToolBinding,MemoryDetails } from './index.js';
import { characterDigest, characterFromSnapshot } from './character.js';
import { canonicalRoot, readBoundedFile, verifyPrivateDirectory } from './files.js';

const scopeSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const configurationSchema = z.object({ schema_version: z.literal(1), scope: scopeSchema,
  character_sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const inputSchema = z.object({ eventId: z.string().uuid(), text: z.string().min(1).max(8000) }).strict();

export interface TrustedInitialization {
  dataDir: string;
  scope: string;
  characterFile: string;
  adultConfirmed: boolean;
  virtualIdentityAccepted: boolean;
  memory: 'on' | 'off';
}
export interface TrustedTurnInput { eventId: string; text: string }
export interface TrustedSession {
  /** Attach only this restricted binding to the MCP server. */
  readonly binding: RelationshipToolBinding;
  /** Call only from authenticated host user-input hooks, never from model tools. */
  beginTurn(input: TrustedTurnInput): { turnId: string };
  endTurn(): void;
  close(): void;
}

/** Trusted UI/CLI action, deliberately separate from every MCP tool. */
export function initializeTrustedData(options: TrustedInitialization): void {
  if (options.adultConfirmed !== true || options.virtualIdentityAccepted !== true) throw new ProductError('CONSENT_REQUIRED');
  if (!['on', 'off'].includes(options.memory)) throw new ProductError('MEMORY_CHOICE_REQUIRED');
  const scope = scopeSchema.parse(options.scope), root = canonicalRoot(options.dataDir);
  if (!path.isAbsolute(options.characterFile)) throw new ProductError('CHARACTER_PATH_INVALID');
  const content = readBoundedFile(options.characterFile, 1024 * 1024);
  characterFromSnapshot(content);
  if (existsSync(root)) {
    verifyPrivateDirectory(root);
    if (readdirSync(root).length !== 0) throw new ProductError('INITIALIZATION_ALREADY_EXISTS');
  } else mkdirSync(root, { mode: 0o700 });
  verifyPrivateDirectory(root);
  // This exclusive marker makes concurrent init fail before either Store opens.
  // A crash leaves an incomplete installation that requires explicit review;
  // no subsequent invocation silently re-consents or erases it.
  writeFileSync(path.join(root, 'initialization.lock'), 'between-mcp/1\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(path.join(root, 'character.json'), content, { flag: 'wx', mode: 0o600 });
  let store: Store | undefined;
  try {
    store = new Store(path.join(root, 'state.db'), () => Date.now(), true, scope);
    store.start(true, true, options.memory === 'on');
    writeFileSync(path.join(root, 'between-mcp.json'), JSON.stringify({ schema_version: 1, scope, character_sha256: characterDigest(content) }) + '\n', { flag: 'wx', mode: 0o600 });
  } finally { store?.close(); }
}

/**
 * Long-lived host-neutral owner. Call begin/end via a host's separate trusted
 * lifecycle hooks. The MCP connection never has access to these methods.
 * A static MCP configuration alone cannot prove who supplied the user text.
 */
export function openTrustedSession(options: { dataDir: string }): TrustedSession {
  const root = canonicalRoot(options.dataDir);
  verifyPrivateDirectory(root);
  const config = configurationSchema.parse(JSON.parse(readBoundedFile(path.join(root, 'between-mcp.json'), 8192, true)));
  const character = characterFromSnapshot(readBoundedFile(path.join(root, 'character.json'), 1024 * 1024, true), config.character_sha256);
  // Store is the sole business/owner authority, including cross-scope collision.
  const store = new Store(path.join(root, 'state.db'), () => Date.now(), true, config.scope);
  let active: Turn | undefined;
  let closed = false;
  const requireActive = () => {
    if (closed || !active) throw new ProductError('NOT_AUTHORIZED');
    return active;
  };
  const binding: RelationshipToolBinding = Object.freeze({
    readContext: () => store.context(requireActive().token, character),
    rememberUserReport: (quote:string,operationId:string,details?:MemoryDetails) => {const token=requireActive().token;return details?.mode==='standing'?store.rememberStanding(token,{quote,operation_id:operationId,expected_version:details.expected_version}):details?.mode==='propose'?store.rememberProposed(token,{quote,operation_id:operationId,proposed_kind:details.proposed_kind,expected_version:details.expected_version}):details?.mode==='revise'?store.reviseMemory(token,{quote,operation_id:operationId,target_id:details.target_id,target_revision:details.target_revision,mode:details.revision_mode,replacement_quote:details.replacement_quote,expected_version:details.expected_version}):store.remember(token,quote,operationId);},
  });
  const endTurn = () => {
    if (!active) return;
    const ended = active;
    // Clear the model-facing capability before attempting persistent revocation.
    active = undefined;
    store.end(ended, ended.id, 'completed');
  };
  return Object.freeze({
    binding,
    beginTurn(input: TrustedTurnInput) {
      if (closed) throw new ProductError('INSTALLATION_HANDLE_STALE');
      if (active) throw new ProductError('TURN_ALREADY_ACTIVE');
      const trusted = inputSchema.parse(input);
      const turn = store.receive(trusted.eventId, trusted.text);
      if (!turn) throw new ProductError('DUPLICATE_EVENT');
      active = turn;
      return { turnId: turn.id };
    },
    endTurn,
    close() {
      if (closed) return;
      closed = true;
      try { endTurn(); } finally { store.close(); }
    },
  });
}
