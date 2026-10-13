import assert from 'node:assert/strict';
import { readUtf8Body } from '../read-body.mjs';
const value = { creatorNotes: '暗处的灯塔，保留完整中文与🌌。', content: '虚构长正文。'.repeat(12000), extension: { preserve: [false, 0, null, ''] } };
const bytes = Buffer.from(JSON.stringify(value));
async function* chunks(size) { for (let offset = 0; offset < bytes.length; offset += size) yield bytes.subarray(offset, offset + size); }
for (const size of [1, 2, 3, 7, 65535, 65536]) assert.deepEqual(JSON.parse(await readUtf8Body(chunks(size), bytes.length)), value);
await assert.rejects(readUtf8Body(chunks(7), bytes.length - 1), error => error.status === 413);
async function* empty() {}
assert.equal(await readUtf8Body(empty(), 0), '');
// Exact raw-byte boundary: 3 UTF-8 bytes, never counted as one JS character.
async function* chinese() { yield Buffer.from('暗'); }
assert.equal(await readUtf8Body(chinese(), 3), '暗');
await assert.rejects(readUtf8Body(chinese(), 2), error => error.status === 413);
console.log(JSON.stringify({ status: 'PASS', checks: 10, scope: 'UTF-8 across arbitrary stream chunks, lossless nested JSON, exact byte limits; no network' }));
