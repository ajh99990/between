import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function collect(directory, root, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Runtime assets cannot be symbolic links: ${path.relative(root, file)}`);
    if (entry.isDirectory()) await collect(file, root, files);
    else {
      assert(entry.isFile(), `Unsupported runtime asset: ${path.relative(root, file)}`);
      files.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function references(file, source) {
  const result = new Set();
  if (file.endsWith('.css')) {
    for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g)) result.add(match[1]);
    for (const match of source.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) result.add(match[1]);
  } else if (file.endsWith('.js') || file.endsWith('.ts')) {
    for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      result.add(match[1] || match[2] || match[3]);
    }
  }
  return [...result].filter(value => !value.startsWith('#') && !value.startsWith('data:'));
}

/** Check bytes and local dependency closure without executing any runtime module. */
export async function verifyAssets({ packageRoot = defaultRoot } = {}) {
  const root = path.resolve(packageRoot);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'design-assets.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'Unsupported design asset manifest');
  assert.equal(manifest.root, 'src/materials/runtime', 'Unexpected runtime asset root');
  assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Runtime manifest must list its assets');
  const runtime = path.join(root, manifest.root);
  const stat = await fs.lstat(runtime);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Runtime root must be a real directory');
  const actual = await collect(runtime, runtime);
  const paths = new Set();
  const content = new Map();
  for (const item of manifest.files) {
    assert(typeof item.path === 'string' && item.path && !item.path.includes('\\'), 'Invalid asset path');
    const file = path.resolve(runtime, item.path);
    assert(!path.isAbsolute(item.path) && within(runtime, file), `Asset path escapes runtime: ${item.path}`);
    assert(!paths.has(item.path), `Duplicate runtime asset: ${item.path}`);
    assert(/^[a-f\d]{64}$/.test(item.sha256), `Invalid asset hash: ${item.path}`);
    if (item.upstreamSha256) assert(/^[a-f\d]{64}$/.test(item.upstreamSha256), `Invalid upstream hash: ${item.path}`);
    paths.add(item.path);
    assert(actual.includes(item.path), `Missing runtime asset: ${item.path}`);
    const bytes = await fs.readFile(file);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, item.sha256, `Design asset mismatch: ${item.path}`);
    content.set(item.path, bytes);
  }
  assert.deepEqual(actual, [...paths].sort(), 'Runtime tree contains assets missing from the manifest');
  let referenceCount = 0;
  for (const [file, bytes] of content) {
    for (const reference of references(file, bytes.toString('utf8'))) {
      assert(!/^(?:https?:)?\/\//.test(reference), `External runtime dependency: ${file}: ${reference}`);
      if (!reference.startsWith('.') && !file.endsWith('.css')) continue;
      assert(!reference.startsWith('/'), `Runtime reference must be relative: ${file}: ${reference}`);
      const target = path.resolve(runtime, path.dirname(file), reference.split(/[?#]/)[0]);
      assert(within(runtime, target), `Runtime reference escapes assets: ${file}: ${reference}`);
      assert(paths.has(path.relative(runtime, target).split(path.sep).join('/')), `Missing runtime reference: ${file}: ${reference}`);
      referenceCount++;
    }
  }
  return { files: actual.length, references: referenceCount, scope: 'SHA-256, complete runtime inventory and local imports; no visual acceptance claim' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await verifyAssets();
  console.log(`PASS: ${result.files} shared design assets and ${result.references} local references verified`);
}
