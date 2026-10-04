import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ProductError } from '@between/core/store';

const characterSchema = z.object({
  format: z.literal('online-character/1'), id: z.string().min(1).max(128), version: z.string().min(1).max(128),
  identity: z.object({ name: z.string().min(1).max(128), age_years: z.number().int().min(18), fictional: z.literal(true) }).passthrough(),
  core: z.record(z.string(), z.unknown()), premise: z.string(), greetings: z.array(z.string()),
  examples: z.array(z.object({ kind: z.string() }).passthrough()),
  topics: z.array(z.object({ id: z.string(), title: z.string(), surface: z.unknown().optional() }).passthrough()),
}).passthrough();

export const characterDigest = (content: string) => createHash('sha256').update(content).digest('hex');
export function characterFromSnapshot(content: string, expectedHash?: string): unknown {
  if (Buffer.byteLength(content) > 1024 * 1024 || (expectedHash !== undefined && characterDigest(content) !== expectedHash)) {
    throw new ProductError('CHARACTER_SNAPSHOT_INVALID');
  }
  let raw: z.infer<typeof characterSchema>;
  try { raw = characterSchema.parse(JSON.parse(content)); }
  catch { throw new ProductError('CHARACTER_SNAPSHOT_INVALID'); }
  // Protocol projection preserves the existing intentional shallow slice.
  return { id: raw.id, version: raw.version, identity: raw.identity, core: raw.core, premise: raw.premise,
    greetings: raw.greetings, examples: raw.examples.filter(x => ['everyday', 'boundary'].includes(x.kind)).slice(0, 2),
    material: raw.topics.filter(x => x.id.startsWith('S')).map(x => ({ id: x.id, title: x.title, surface: x.surface })) };
}
