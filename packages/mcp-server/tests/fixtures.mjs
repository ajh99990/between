import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'between-mcp-test-'));
  const characterFile = path.join(root, 'approved.json');
  const character = { format: 'online-character/1', id: 'synthetic-adult', version: '1.0.0', identity: { name: 'Synthetic', age_years: 29, fictional: true }, core: { voice: 'Short' }, premise: 'Fictional', greetings: ['Hello'], examples: [{ kind: 'everyday', text: 'Example' }, { kind: 'deeper', secret: 'UNSUPPORTED_DEEPER_CANARY' }], topics: [{ id: 'S1', title: 'Surface', surface: 'Known' }, { id: 'F1', title: 'Private', deeper: 'UNSUPPORTED_DEEPER_CANARY' }] };
  writeFileSync(characterFile, JSON.stringify(character), { mode: 0o600 });
  return { root, dataDir: path.join(root, 'data'), characterFile, character };
}
export const initialization = f => ({ dataDir: f.dataDir, scope: 'synthetic-scope', characterFile: f.characterFile, adultConfirmed: true, virtualIdentityAccepted: true, memory: 'on' });
