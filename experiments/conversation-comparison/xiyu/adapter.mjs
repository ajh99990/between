/** Local transport/inspection glue. Upstream source and prompt strings are unchanged. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as vm from 'node:vm';
import { buildSystemPrompt, buildFirstTurnHint } from './upstream/src/companion.mjs';

const base = new URL('./', import.meta.url);
const sha256 = text => createHash('sha256').update(text).digest('hex');
export const defaultCompanion = JSON.parse(await readFile(new URL('default-companion.json', base), 'utf8'));
export const provenance = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));

export async function verifyOriginals() {
  const checks = [];
  for (const [file, expected] of Object.entries(provenance.files)) {
    const actual = sha256(await readFile(new URL(`upstream/${file}`, base)));
    if (actual !== expected) throw new Error(`Upstream source mismatch: ${file}`);
    checks.push({ file, sha256: actual });
  }
  return checks;
}

/** Pure prompt snapshot scope; NOT the complete bot runtime. No authored prompt glue. */
export function buildOriginalSystemSnapshot({ companion = defaultCompanion, extras = {}, firstTurn = false } = {}) {
  const core = buildSystemPrompt(structuredClone(companion), structuredClone(extras));
  const firstTurnHint = firstTurn ? buildFirstTurnHint(companion) : '';
  const system = core + firstTurnHint;
  return {
    system,
    sha256: sha256(system),
    source: provenance.commit,
    scope: firstTurn ? 'original-buildSystemPrompt-plus-original-first-turn' : 'original-buildSystemPrompt-only',
    blocks: [{ source: 'src/companion.mjs:185', chars: core.length, sha256: sha256(core) },
      ...(firstTurn ? [{ source: 'src/companion.mjs:164', chars: firstTurnHint.length, sha256: sha256(firstTurnHint) }] : [])],
    gluePrompt: '',
  };
}

/** Load an entire upstream module byte-for-byte in a restricted linker. No application boot. */
async function loadExactModule(relativePath, imports, env = {}) {
  if (typeof vm.SourceTextModule !== 'function') {
    throw new Error('Load original dynamic helpers with node --experimental-vm-modules.');
  }
  const source = await readFile(new URL(`upstream/${relativePath}`, base), 'utf8');
  const context = vm.createContext({ process: { env: { ...env } }, Date, Math, console });
  const mod = new vm.SourceTextModule(source, { context, identifier: `xiyu-original:${relativePath}` });
  await mod.link(async specifier => {
    if (!Object.hasOwn(imports, specifier)) throw new Error(`Unsupported upstream dependency: ${specifier}`);
    const values = imports[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: `comparison-transport:${specifier}` });
  });
  await mod.evaluate();
  return mod.namespace;
}

/** generateReply callback is explicitly supplied by host; never auto-loads credentials. */
export async function loadOriginalInnerOs({ generateReply, log = () => {}, env = {} } = {}) {
  if (typeof generateReply !== 'function') throw new TypeError('An explicit generateReply transport callback is required.');
  return loadExactModule('src/inner_os.mjs', {
    './ai.mjs': { generateReply }, './logger.mjs': { log },
  }, env);
}

export async function loadOriginalPersonaGuard({ log = () => {}, env = {} } = {}) {
  return loadExactModule('src/persona_guard.mjs', { './logger.mjs': { log } }, env);
}

/** Exact contiguous original output-processing code; export statement is separate harness glue. */
export async function loadOriginalSegmentation() {
  const source = await readFile(new URL('upstream/src/bot.mjs', base), 'utf8');
  const start = source.indexOf('const MAX_SEGMENTS = 4;');
  const end = source.indexOf('// 同一用户已有"生成回复中"', start);
  if (start < 0 || end < start) throw new Error('Original segmentation source boundary missing.');
  const originalSlice = source.slice(start, end);
  const sourceLines = source.slice(0, start).split('\n').length;
  const moduleBody = originalSlice + '\nexport { postProcessReply, splitReplySegments };\n';
  const mod = await import(`data:text/javascript;base64,${Buffer.from(moduleBody).toString('base64')}`);
  return { ...mod, source: { file: 'src/bot.mjs', startLine: sourceLines, sha256: sha256(originalSlice) } };
}

/** First comparison scope: raw original builder only; no inner OS, first-turn hint, guards or rewritten output. */
export function createMessages({ history = [], input, companion = defaultCompanion, extras = {}, glue = [] } = {}) {
  if (typeof input !== 'string' || !input.trim()) throw new TypeError('input must be non-empty text');
  for (const message of history) {
    if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      throw new TypeError('history supports user/assistant text messages only');
    }
  }
  if (!Array.isArray(glue) || glue.some(text => typeof text !== 'string')) {
    throw new TypeError('glue must be an explicit array of independent system prompt blocks');
  }
  const snapshot = buildOriginalSystemSnapshot({
    companion, extras: { recentTurns: history, ...extras }, firstTurn: false,
  });
  return {
    messages: [{ role: 'system', content: snapshot.system },
      ...glue.map(content => ({ role: 'system', content })),
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: input }],
    parameters: { temperature: companion.temperature ?? 0.8, max_tokens: companion.max_tokens ?? 3000, top_p: companion.top_p ?? 0.95 },
    metadata: { ...snapshot, system: undefined, glue: [...glue], generatedAt: new Date().toISOString(),
      sourceFile: 'src/companion.mjs', sourceFileSha256: provenance.files['src/companion.mjs'],
      companion: structuredClone(companion), extras: structuredClone({ recentTurns: history, ...extras }),
      outputProcessing: 'none', auxiliaryModelCalls: 0 },
  };
}
