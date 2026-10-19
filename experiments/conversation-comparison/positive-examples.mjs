import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import * as previous from './negative-examples.mjs';

export const suiteId = 'positive-examples-v02';
export const scope = '18-turn same-persona comparison: exact negative-example v0.1 versus v0.1 plus authored concrete response examples; one run per group';
export const title = '普通中文聊天具体回应示例对照记录';
export const { preset, basePrompt, inputs } = previous;
export const stopLiveWhenComplete = true;
const promptUrl = new URL('./prompts/普通中文聊天具体回应示例-v0.2.md', import.meta.url);
const promptBytes = readFileSync(promptUrl);
export const positivePrompt = promptBytes.toString('utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const promptSha256 = hash(promptBytes);
const marker = id => `BETWEEN_LOCAL_POSITIVE_CASE_PROFILE_${id}`;
export const profiles = [
  ['negative-v01', '周宁 · 反例 v0.1'],
  ['examples-v02', '周宁 · 反例＋正例 v0.2'],
].map(([id, label]) => ({ id, label, marker: marker(id),
  role: { ...previous.profiles[1].role, id, name: label, tag: label, description: label, system: marker(id) } }));

export async function verifySources() {
  await previous.verifySources();
  if (!(await fs.readFile(promptUrl)).equals(promptBytes)) throw new Error('The concrete response examples changed after this suite was loaded');
  if (!positivePrompt.startsWith('# 普通中文聊天：具体回应示例\n') || !positivePrompt.includes('## P07：')) {
    throw new Error('Expected the complete concrete response example supplement');
  }
}

export function compileRequest(request) {
  const selected = profiles.filter(p => request.messages.some(m => m.role === 'system'
    && typeof m.content === 'string' && m.content.includes(p.marker)));
  if (selected.length !== 1) throw new Error('Missing or ambiguous positive-example profile');
  const profile = selected[0];
  const history = request.messages.filter(m => ['user', 'assistant'].includes(m.role));
  // Reuse the exact preceding module and its history/host-separation contract.
  const common = previous.compileRequest({ messages: [
    { role: 'system', content: previous.profiles[1].marker }, ...history,
  ] });
  const supplemented = profile.id === 'examples-v02';
  return {
    id: profile.id,
    messages: supplemented ? [...common.messages.slice(0, 2),
      { role: 'system', content: positivePrompt }, ...common.messages.slice(2)] : common.messages,
    metadata: { ...common.metadata, suite: suiteId,
      authoredPromptBlocks: [...common.metadata.authoredPromptBlocks,
        ...(supplemented ? [{ file: 'prompts/普通中文聊天具体回应示例-v0.2.md', sha256: promptSha256 }] : [])],
      scope: 'Same authored persona and exact v0.1 module; only the v0.2 supplement differs; no upstream or hidden prompt text',
    },
  };
}
