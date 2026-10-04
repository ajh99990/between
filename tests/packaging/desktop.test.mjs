import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { distributionLock, packageDesktop } from '../../scripts/package-desktop.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function temporary(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'between-desktop-unit-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
async function walk(root, relative = '') {
  const names = [];
  for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
    const entry = path.posix.join(relative, name), stat = await fs.lstat(path.join(root, entry));
    assert.equal(stat.isSymbolicLink(), false, entry);
    if (stat.isDirectory()) names.push(...await walk(root, entry)); else names.push(entry);
  }
  return names;
}

test('desktop artifact contains bundled current sources, public pinned dependencies and exact isolated assets', async t => {
  const root = await temporary(t), result = await packageDesktop({ outDir: root });
  const manifest = JSON.parse(await fs.readFile(path.join(result.artifactDir, 'package.json'), 'utf8'));
  assert.equal(manifest.main, 'dist/main/main.js');
  assert.equal(manifest.engines.node, '>=24.0.0 <25');
  assert.equal(manifest.workspaces, undefined); assert.equal(manifest.devDependencies, undefined);
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    assert.equal(name.startsWith('@between/'), false); assert.match(version, /^\d+\.\d+\.\d+$/);
  }
  assert.equal(manifest.dependencies.electron, JSON.parse(await fs.readFile(path.join(repo, 'apps/desktop/package.json'))).devDependencies.electron);
  const files = await walk(result.artifactDir);
  assert.ok(files.includes('resources/mcp/trusted-stdio.js')); assert.ok(files.includes('resources/characters/alan.json'));
  assert.ok(files.includes('resources/skills/relationship/SKILL.md'));
  assert.ok(files.every(name => !/(?:^|\/)(?:node_modules|\.runtime|fixtures|inputs|historical|evidence)(?:\/|$)/.test(name)));
  assert.equal(files.some(name => name.endsWith('.png') || name === 'runtime-config.json'), false);
  const inventory = JSON.parse(await fs.readFile(path.join(result.artifactDir, 'distribution-manifest.json')));
  assert.deepEqual(files, [...inventory.files.map(item => item.path), 'distribution-manifest.json'].sort());
  for (const file of inventory.files) {
    const bytes = await fs.readFile(path.join(result.artifactDir, file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
  }
  assert.equal(inventory.qwen_runtime_included, false);
  assert.equal(inventory.public_dependency_lock, true);
  const lock = JSON.parse(await fs.readFile(path.join(result.artifactDir, 'package-lock.json')));
  assert.equal(lock.name, manifest.name); assert.equal(lock.version, manifest.version);
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.ok(Object.entries(lock.packages).filter(([key]) => key).every(([, value]) => value.resolved.startsWith('https://registry.npmjs.org/') && value.integrity));
  assert.ok(inventory.source_inputs.includes('apps/desktop/src/runtime-entry.ts'));
  assert.ok(inventory.source_inputs.includes('packages/core/src/store.ts'));
  assert.ok(inventory.source_inputs.includes('packages/contracts/src/commands.ts'));
  assert.ok(inventory.source_inputs.includes('packages/host-qwen/src/qwen-adapter.ts'));
  assert.ok(inventory.source_inputs.every(name => !/^(?:apps|packages)\/[^/]+\/dist\//.test(name)));
  assert.ok(inventory.external_imports.every(name => name.startsWith('node:') || ['electron', 'better-sqlite3'].includes(name)));
  for (const name of ['index.html', 'style.css', 'app.js', 'visual-fixture.js']) assert.deepEqual(await fs.readFile(path.join(result.artifactDir, 'dist/renderer', name)), await fs.readFile(path.join(repo, 'apps/desktop/src/renderer', name)));
  for (const name of ['skills/relationship/SKILL.md', 'skills/relationship/references/compatibility.md', 'characters/alan.json']) assert.deepEqual(await fs.readFile(path.join(result.artifactDir, 'resources', name)), await fs.readFile(path.join(repo, name)));
  for (const name of files.filter(name => /^resources\/mcp\//.test(name))) assert.deepEqual(await fs.readFile(path.join(result.artifactDir, name)), await fs.readFile(path.join(repo, 'packages/mcp-server/publish/dist', name.slice('resources/mcp/'.length))));
  for (const name of ['dist/main/main.js', 'dist/runtime-entry.js', 'dist/preload/preload.cjs']) {
    const code = await fs.readFile(path.join(result.artifactDir, name), 'utf8');
    assert.equal(code.includes(repo), false); assert.doesNotMatch(code, /(?:from\s*|import\s*\(|require\s*\()\s*["']@between\//);
  }
  const preload = await fs.readFile(path.join(result.artifactDir, 'dist/preload/preload.cjs'), 'utf8');
  assert.deepEqual([...preload.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]), ['electron']);
  assert.match(await fs.readFile(path.join(result.artifactDir, 'launch.mjs'), 'utf8'), /REL_NODE: process.execPath/);
  assert.match(await fs.readFile(path.join(result.artifactDir, 'broker.mjs'), 'utf8'), /process\.versions\.electron/);
});

test('desktop tarball is reproducible and extracts without source/workspace symlinks', async t => {
  const root = await temporary(t);
  const first = await packageDesktop({ outDir: path.join(root, 'first') }), second = await packageDesktop({ outDir: path.join(root, 'second') });
  assert.equal(first.archiveSha256, second.archiveSha256);
  assert.equal(sha(await fs.readFile(first.archivePath)), first.archiveSha256);
  const extracted = path.join(root, 'extracted'); await fs.mkdir(extracted);
  execFileSync('tar', ['-xzf', first.archivePath, '-C', extracted]);
  assert.deepEqual(await walk(path.join(extracted, path.basename(first.artifactDir))), await walk(first.artifactDir));
  const main = path.join(extracted, path.basename(first.artifactDir), 'dist/main/main.js');
  assert.ok((await fs.stat(main)).size > 0);
});

test('desktop pack refuses to overwrite a release and rejects invalid CLI arguments', async t => {
  const root = await temporary(t), first = await packageDesktop({ outDir: root });
  await assert.rejects(packageDesktop({ outDir: root }), { code: 'EEXIST' });
  assert.equal(sha(await fs.readFile(first.archivePath)), first.archiveSha256);
  for (const args of [['--out'], ['--unknown', 'value'], ['--out', root, '--out', root]]) {
    assert.throws(() => execFileSync(process.execPath, [path.join(repo, 'scripts/package-desktop.mjs'), ...args], { stdio: 'pipe' }), error => error.status !== 0 && /Usage:/.test(error.stderr.toString()));
  }
});


test('deployment lock rejects private paths, wrong versions and missing transitive integrity', async () => {
  const source = JSON.parse(await fs.readFile(path.join(repo, 'config/desktop-install-lock.json')));
  const manifest = { name: source.name, version: source.version, dependencies: source.packages[''].dependencies, engines: source.packages[''].engines };
  const clean = distributionLock(manifest, source);
  assert.deepEqual(clean, source);
  const wrong = structuredClone(source); wrong.packages['node_modules/electron'].version = '0.0.0';
  assert.throws(() => distributionLock(manifest, wrong), /mismatch/);
  const privatePath = structuredClone(source); privatePath.packages['node_modules/electron'].resolved = 'file:/private/workspace';
  assert.throws(() => distributionLock(manifest, privatePath), /Unverified public lock/);
  const noIntegrity = structuredClone(source); delete noIntegrity.packages['node_modules/electron'].integrity;
  assert.throws(() => distributionLock(manifest, noIntegrity), /Unverified public lock/);
  const privateDependency = structuredClone(source); privateDependency.packages['node_modules/electron'].dependencies['@between/core'] = 'workspace:*';
  assert.throws(() => distributionLock(manifest, privateDependency), /Private public-lock dependency/);
});
