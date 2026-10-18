import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { verifyAssets } from '../../../packages/ui/scripts/verify-assets.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('design-assets.json', root), 'utf8'));
assert.equal(manifest.source, '@between/ui', 'The admin must consume the shared UI package');
assert.equal(manifest.manifest, '../../packages/ui/design-assets.json', 'Unexpected shared asset manifest');
try {
  await fs.lstat(new URL('public/design', root));
  throw new Error('Duplicate admin design resources must not be published');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const result = await verifyAssets();
console.log(`PASS: admin uses ${result.files} verified shared design assets; no duplicate public design directory`);
