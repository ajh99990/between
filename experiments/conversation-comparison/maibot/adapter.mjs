import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const renderer = fileURLToPath(new URL('./render.py', import.meta.url));
export function createRequest(options) {
  const result = spawnSync('python3', [renderer], { input: JSON.stringify(options), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Original MaiBot Replyer renderer failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
export function createMessages(options) { return createRequest(options).messages; }
export default { createMessages, createRequest };
