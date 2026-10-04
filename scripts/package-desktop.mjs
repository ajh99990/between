import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const pinned = version => typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);

// Never use stale workspace dist. Resolve private exports to their TypeScript sources.
function workspaceSources(root) {
  return { name: 'between-workspace-sources', setup(build) {
    build.onResolve({ filter: /^@between\// }, async ({ path: specifier }) => {
      const [, name, ...parts] = specifier.split('/');
      if (!['contracts', 'core', 'host-qwen'].includes(name)) throw Error(`Unsupported private dependency: ${specifier}`);
      const packageRoot = path.join(root, 'packages', name), manifest = await json(path.join(packageRoot, 'package.json'));
      const exported = manifest.exports[parts.length ? './' + parts.join('/') : '.'];
      const target = typeof exported === 'string' ? exported : exported?.import;
      if (!target?.startsWith('./dist/') || !target.endsWith('.js')) throw Error(`Unsupported workspace export: ${specifier}`);
      return { path: path.join(packageRoot, target.replace('./dist/', 'src/').replace(/\.js$/, '.ts')) };
    });
  } };
}

async function filesBelow(root, relative = '') {
  const result = [];
  for (const entry of (await readdir(path.join(root, relative))).sort()) {
    const name = path.posix.join(relative, entry), full = path.join(root, name), stat = await lstat(full);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw Error(`Linked or special artifact input: ${name}`);
    if (stat.isDirectory()) result.push(...await filesBelow(root, name));
    else result.push(name);
  }
  return result;
}

async function copyTree(source, target) {
  if ((await lstat(source)).isSymbolicLink()) throw Error(`Symlink input: ${source}`);
  await filesBelow(source); // Fail closed instead of following input symlinks.
  await cp(source, target, { recursive: true, errorOnExist: true, force: false });
}

function assertExternals(meta, allowed) {
  for (const output of Object.values(meta.outputs)) for (const item of output.imports) {
    if (item.external && !item.path.startsWith('node:') && !allowed.includes(item.path)) throw Error(`Unpackaged dependency: ${item.path}`);
  }
}

/** Prune an existing official npm lock to this artifact's public dependency graph.
 * The root remains pnpm-only; this lock is a deployment artifact, never a workspace lock.
 */
export function distributionLock(manifest, sourceLock) {
  if (sourceLock.lockfileVersion !== 3 || !sourceLock.packages) throw Error('Expected npm v3 public dependency lock');
  const packages = { '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies, engines: manifest.engines } };
  const find = (from, name) => {
    for (let base = from; ; ) {
      const key = [base, 'node_modules', name].filter(Boolean).join('/');
      if (sourceLock.packages[key]) return key;
      if (!base) return undefined;
      base = base.replace(/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/, '');
    }
  };
  const visit = key => {
    if (packages[key]) return;
    const original = sourceLock.packages[key];
    if (!original || original.link || !pinned(original.version) || !original.resolved?.startsWith('https://registry.npmjs.org/') || !/^sha(?:256|384|512|1)-/.test(original.integrity ?? '')) throw Error(`Unverified public lock entry: ${key}`);
    const { dev, devOptional, optional, ...entry } = original;
    packages[key] = entry;
    for (const [name, version] of Object.entries({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })) {
      if (name.startsWith('@between/') || /^(?:workspace|file|link|git):/.test(version)) throw Error(`Private public-lock dependency: ${name}`);
      const dependency = find(key, name);
      if (!dependency) {
        if (entry.optionalDependencies?.[name] || entry.peerDependenciesMeta?.[name]?.optional) continue;
        throw Error(`Missing public lock dependency: ${key} -> ${name}`);
      }
      visit(dependency);
    }
  };
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const key = find('', name);
    if (!key || sourceLock.packages[key].version !== version) throw Error(`Distribution dependency lock mismatch: ${name}@${version}`);
    visit(key);
  }
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) };
}

const versionGuard = `if (Number(process.versions.node.split('.')[0]) !== 24 || process.versions.electron) throw Error('Between broker requires external Node.js 24; do not run it in Electron or rebuild its SQLite for Electron');\n`;
const brokerLauncher = `import path from 'node:path';
import { fileURLToPath } from 'node:url';
${versionGuard}const root = path.dirname(fileURLToPath(import.meta.url));
process.env.REL_ROOT = path.join(root, 'resources');
process.env.REL_CONFIG_ROOT = root;
process.env.REL_DB ||= path.join(root, '.runtime/data-v5/relationship.db');
await import('./dist/runtime-entry.js');
`;
const desktopLauncher = `import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
${versionGuard}const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Native SQLite belongs to this Node ABI, never the Electron main process.
const Database = require('better-sqlite3'); const probe = new Database(':memory:'); probe.prepare('SELECT 1').get(); probe.close();
const env = { ...process.env, REL_NODE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], { cwd: root, env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
`;

/** Produces immutable unpacked app + deterministic tarball; dependencies install separately. */
export async function packageDesktop({ sourceRoot = repo, outDir = path.join(repo, 'artifacts/desktop'), dependencyLock } = {}) {
  sourceRoot = await realpath(sourceRoot); outDir = path.resolve(outDir);
  dependencyLock ??= path.join(sourceRoot, 'config/desktop-install-lock.json');
  const app = await json(path.join(sourceRoot, 'apps/desktop/package.json'));
  const core = await json(path.join(sourceRoot, 'packages/core/package.json'));
  const mcp = await json(path.join(sourceRoot, 'packages/mcp-server/publish/package.json'));
  const dependencies = { ...mcp.dependencies, 'better-sqlite3': core.dependencies['better-sqlite3'], electron: app.devDependencies.electron };
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith('@between/') || !pinned(version)) throw Error(`Non-public or unpinned distribution dependency: ${name}@${version}`);
  }
  if (mcp.dependencies['better-sqlite3'] !== dependencies['better-sqlite3']) throw Error('MCP/desktop SQLite version mismatch');
  const name = `between-desktop-${app.version}`, artifactDir = path.join(outDir, name);
  await mkdir(outDir, { recursive: true });
  await mkdir(artifactDir); // Never overwrite a release or user data.
  const manifest = {
    name: 'between-desktop', version: app.version, private: true, type: 'module',
    description: 'Between portable Electron application with a separate Node 24 broker',
    main: 'dist/main/main.js', engines: { node: '>=24.0.0 <25' },
    scripts: { start: 'node launch.mjs', 'start:broker': 'node broker.mjs' }, dependencies,
  };
  const result = await build({
    absWorkingDir: sourceRoot,
    entryPoints: { 'main/main': 'apps/desktop/src/main/main.ts', 'runtime-entry': 'apps/desktop/src/runtime-entry.ts' },
    outdir: path.join(artifactDir, 'dist'), bundle: true, platform: 'node', format: 'esm', target: 'node24',
    splitting: false, sourcemap: false, metafile: true, legalComments: 'external',
    external: ['electron', 'better-sqlite3'], plugins: [workspaceSources(sourceRoot)],
    banner: { js: "import { createRequire as __betweenCreateRequire } from 'node:module'; const require = __betweenCreateRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  assertExternals(result.metafile, ['electron', 'better-sqlite3']);
  const preload = await build({
    absWorkingDir: sourceRoot, entryPoints: ['apps/desktop/src/preload/preload.ts'], outfile: path.join(artifactDir, 'dist/preload/preload.cjs'),
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'], metafile: true, legalComments: 'external', logLevel: 'warning',
  });
  assertExternals(preload.metafile, ['electron']);
  const rendererTarget = path.join(artifactDir, 'dist/renderer');
  await mkdir(rendererTarget, { recursive: true });
  // Historical screenshot crops are private references, never product assets.
  for (const name of ['index.html', 'style.css', 'app.js', 'visual-fixture.js']) {
    const source = path.join(sourceRoot, 'apps/desktop/src/renderer', name), stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error(`Invalid renderer source: ${name}`);
    const bytes = await readFile(source);
    if (/fixtures[\\/]/i.test(bytes.toString('utf8'))) throw Error(`Private screenshot fixture reference: ${name}`);
    await writeFile(path.join(rendererTarget, name), bytes, { flag: 'wx' });
  }
  await copyTree(path.join(sourceRoot, 'packages/mcp-server/publish/dist'), path.join(artifactDir, 'resources/mcp'));
  for (const asset of ['skills', 'characters']) await copyTree(path.join(sourceRoot, asset), path.join(artifactDir, 'resources', asset));
  await copyTree(path.join(sourceRoot, 'licenses'), path.join(artifactDir, 'licenses'));
  await writeFile(path.join(artifactDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (dependencyLock) await writeFile(path.join(artifactDir, 'package-lock.json'), JSON.stringify(distributionLock(manifest, await json(dependencyLock)), null, 2) + '\n');
  await writeFile(path.join(artifactDir, 'broker.mjs'), brokerLauncher);
  await writeFile(path.join(artifactDir, 'launch.mjs'), desktopLauncher);
  await cp(path.join(sourceRoot, 'docs/desktop-distribution.md'), path.join(artifactDir, 'README.md'));
  await cp(path.join(sourceRoot, 'runtime-config.example.json'), path.join(artifactDir, 'runtime-config.example.json'));
  const inventory = [];
  for (const file of await filesBelow(artifactDir)) {
    const bytes = await readFile(path.join(artifactDir, file));
    inventory.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const buildManifest = {
    schema_version: 1, version: app.version, target: 'portable-linux-directory',
    runtime: { broker: 'external Node.js 24', electron: dependencies.electron, sqlite: dependencies['better-sqlite3'] },
    qwen_runtime_included: false, provider_credentials_included: false,
    dependencies, public_dependency_lock: !!dependencyLock, files: inventory,
    source_inputs: Object.keys(result.metafile.inputs).sort(),
    external_imports: [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path)))].sort(),
  };
  await writeFile(path.join(artifactDir, 'distribution-manifest.json'), JSON.stringify(buildManifest, null, 2) + '\n');
  const archivePath = path.join(outDir, name + '.tar.gz');
  // GNU tar creates a stable archive; -n removes gzip timestamps.
  const tarBytes = execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--format=ustar', '-cf', '-', '-C', outDir, name], { maxBuffer: 32 * 1024 * 1024 });
  const archive = execFileSync('gzip', ['-n', '-9'], { input: tarBytes, maxBuffer: 32 * 1024 * 1024 });
  await writeFile(archivePath, archive, { flag: 'wx' });
  const archiveSha256 = sha256(archive);
  await writeFile(archivePath + '.sha256', `${archiveSha256}  ${path.basename(archivePath)}\n`, { flag: 'wx' });
  return { artifactDir, archivePath, archiveSha256, files: inventory.length, dependencies };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      const name = { '--out': 'outDir', '--dependency-lock': 'dependencyLock' }[args[i]];
      if (!name || options[name] || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Usage: node scripts/package-desktop.mjs [--out DIRECTORY] [--dependency-lock PUBLIC_NPM_V3_LOCK]');
      options[name] = args[i + 1];
    }
    console.log(JSON.stringify(await packageDesktop(options), null, 2));
  } catch (error) { console.error(`Desktop packaging failed: ${error.message}`); process.exitCode = 1; }
}
