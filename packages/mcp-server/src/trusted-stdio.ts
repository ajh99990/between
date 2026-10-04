import { Store, ProductError } from '@between/core/store';
import type { Message, Turn } from '@between/contracts/records';
import { characterFromSnapshot } from './character.js';
import { runStdio } from './stdio.js';

// Internal attached MCP entry: the desktop/runtime remains recover=true owner.
// This entry never starts, grants, recovers, or changes consent itself.
const { REL_DB: file, REL_GRANT: token, REL_CHARACTER_JSON: content, REL_CHARACTER_SHA256: hash, REL_SCOPE: scope } = process.env;
let store: Store | undefined;
try {
  if (!file || !token || !content || !hash || !scope) throw new ProductError('TRUSTED_TURN_REQUIRED');
  const character = characterFromSnapshot(content, hash);
  store = new Store(file, () => Date.now(), false, scope);
  if (process.env.REL_EPHEMERAL) {
    const ephemeral = JSON.parse(process.env.REL_EPHEMERAL) as { turn: Turn; messages: Message[] };
    if (!ephemeral || ephemeral.turn?.token !== token || !Array.isArray(ephemeral.messages)) throw new ProductError('TRUSTED_TURN_INVALID');
    store.ephemeral.set(token, ephemeral.turn);
    for (const message of ephemeral.messages) store.transient.set(message.id, message);
  }
  const attached = store;
  await runStdio({ readContext: () => attached.context(token, character), rememberUserReport: (quote, id) => attached.remember(token, quote, id) }, () => attached.close());
} catch (error) {
  store?.close();
  process.stderr.write((error instanceof ProductError ? error.code : 'MCP_START_FAILED') + '\n');
  process.exitCode = 1;
}
