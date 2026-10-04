import {testTempRoot} from '../../scripts/test-temp-root.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageDesktop } from '../../scripts/package-desktop.mjs';

const exec = promisify(execFile);
function cleanEnvironment(root) {
  return { PATH: process.env.PATH, HOME: path.join(root, 'home'), TMPDIR: root, LANG: 'C.UTF-8',
    npm_config_cache: process.env.BETWEEN_DESKTOP_NPM_CACHE || path.join(root, 'npm-cache'), npm_config_devdir: path.join(root, 'node-gyp'),
    npm_config_userconfig: '/dev/null', npm_config_registry: 'https://registry.npmjs.org' };
}
async function noParentModules(directory) {
  for (let current = path.dirname(directory); ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules');
    await assert.rejects(fs.lstat(candidate), { code: 'ENOENT' }, `Ambient dependency directory exists: ${candidate}`);
    if (current === path.dirname(current)) break;
  }
}
function broker(artifact, cwd, env) {
  const child = spawn(process.execPath, [path.join(artifact, 'broker.mjs')], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line), request = pending.get(message.id);
    if (request) { clearTimeout(request.timer); pending.delete(message.id); request.resolve(message); }
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(Error(`Broker exited ${code}/${signal}: ${stderr}`)); }
      pending.clear(); resolve({ code, signal, stderr });
    });
  });
  return { child, exited,
    request(payload) { return new Promise((resolve, reject) => {
      const id = randomUUID(), timer = setTimeout(() => { pending.delete(id); reject(Error(`Broker timeout: ${stderr}`)); }, 15000);
      pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ schema_version: 1, ...payload, id }) + '\n');
    }); },
    async close() { child.stdin.end(); return await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => { child.kill('SIGTERM'); reject(Error('Broker shutdown timeout')); }, 10000); timer.unref(); })]); },
  };
}

export async function smokeInstalledDesktop({ artifact, root }) {
  assert.equal(Number(process.versions.node.split('.')[0]), 24);
  artifact = await fs.realpath(artifact); root = await fs.realpath(root);
  await noParentModules(artifact);
  const unrelated = path.join(root, 'unrelated'), home = path.join(root, 'home');
  await fs.mkdir(unrelated, { recursive: true }); await fs.mkdir(home, { recursive: true });
  const env = cleanEnvironment(root), manifest = JSON.parse(await fs.readFile(path.join(artifact, 'package.json')));
  for (const name of Object.keys(manifest.dependencies)) {
    const installed = path.join(artifact, 'node_modules', name);
    assert.equal(await fs.realpath(installed), installed, `Workspace/dependency symlink: ${name}`);
  }
  const nativeCode = `const { createRequire } = require('node:module'); const r = createRequire(${JSON.stringify(path.join(artifact, 'package.json'))}); const D = r('better-sqlite3'); const db = new D(':memory:'); db.exec('CREATE TABLE smoke(value TEXT)'); db.prepare('INSERT INTO smoke VALUES (?)').run('independent'); if (db.prepare('SELECT value FROM smoke').get().value !== 'independent') throw Error('Native SQLite failed'); const version = db.prepare('SELECT sqlite_version() version').get().version; db.close(); console.log(JSON.stringify({node:process.versions.node,abi:process.versions.modules,sqlite:version,nativeFiles:Object.keys(require.cache).filter(name=>name.endsWith('.node')),electronBinary:r('electron')}));`;
  const native = JSON.parse((await exec(process.execPath, ['-e', nativeCode], { cwd: unrelated, env })).stdout);
  assert.ok(native.nativeFiles.length > 0);
  assert.ok(native.nativeFiles.every(file => file.startsWith(path.join(artifact, 'node_modules') + path.sep)));
  assert.ok(native.electronBinary.startsWith(path.join(artifact, 'node_modules/electron') + path.sep));
  const electron = (await exec(native.electronBinary, ['--version'], { cwd: unrelated, env })).stdout.trim();
  assert.equal(electron, 'v' + manifest.dependencies.electron);
  const help = await exec(process.execPath, [path.join(artifact, 'resources/mcp/cli.js'), '--help'], { cwd: unrelated, env });
  assert.equal(help.stdout, ''); assert.match(help.stderr, /Between MCP/);
  const character = JSON.parse(await fs.readFile(path.join(artifact, 'resources/characters/alan.json')));
  assert.ok(character && typeof character === 'object');
  assert.match(await fs.readFile(path.join(artifact, 'resources/skills/relationship/SKILL.md'), 'utf8'), /^---/);
  const db = path.join(root, 'synthetic-data/relationship.db'), brokerEnv = { ...env, REL_DB: db, REL_ROOT: '/intentionally-ignored-source-path', REL_CONFIG_ROOT: '/intentionally-ignored-config-path' };
  let running, hostChildren = 'not inspected';
  try {
    running = broker(artifact, unrelated, brokerEnv);
    const first = await running.request({ action: 'snapshot' });
    assert.equal(first.error, undefined); assert.equal(first.value.schema_version, 1);
    assert.equal(first.value.controls.memory, 'off'); assert.deepEqual(first.value.messages, []);
    assert.equal(first.schema_version, 1);
    for (const payload of [{ action: 'snapshot', arbitrary: 'rejected' }, { action: 'snapshot', schema_version: undefined }, { action: 'snapshot', schema_version: 2 }]) {
      const invalid = await running.request(payload); assert.equal(invalid.error, 'INVALID_INPUT'); assert.equal(invalid.schema_version, 1);
    }
    const started = await running.request({ action: 'start', eligible: true, accepted: true, memory: false }); assert.equal(started.error, undefined);
    const changed = await running.request({ action: 'control', conversation_id: first.value.conversation_id, changes: { direction: 'friends' } });
    assert.equal(changed.error, undefined); assert.equal(changed.value.controls.direction, 'friends');
    // Node may implement stdio pipes as Unix socketpairs (fd 0-2); no other sockets or host children are allowed.
    if (process.platform === 'linux') {
      const sockets = [];
      for (const fd of await fs.readdir(`/proc/${running.child.pid}/fd`)) {
        try { if (Number(fd) > 2 && (await fs.readlink(`/proc/${running.child.pid}/fd/${fd}`)).startsWith('socket:')) sockets.push(fd); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      assert.deepEqual(sockets, []);
      try {
        const children = (await fs.readFile(`/proc/${running.child.pid}/task/${running.child.pid}/children`, 'utf8')).trim();
        assert.equal(children, ''); hostChildren = 'none observed';
      } catch (error) { if (error.code !== 'ENOENT') throw error; hostChildren = 'proc children file unavailable'; }
    }
    assert.deepEqual(await running.close(), { code: 0, signal: null, stderr: '' });
    running = broker(artifact, unrelated, brokerEnv);
    const reopened = await running.request({ action: 'snapshot' });
    assert.equal(reopened.error, undefined); assert.equal(reopened.value.conversation_id, first.value.conversation_id);
    assert.equal(reopened.value.controls.memory, 'off'); assert.equal(reopened.value.controls.direction, 'friends');
    assert.deepEqual(await running.close(), { code: 0, signal: null, stderr: '' });
    assert.equal((await fs.stat(db)).mode & 0o777, 0o600);
    return { artifact, node: native.node, nodeAbi: native.abi, sqlite: native.sqlite, nativeFiles: native.nativeFiles, electron, ipc: 'snapshot, validation, start, controls, clean EOF, persistence/restart', listeners: 'no non-stdio sockets observed', hostChildren, assets: 'installed renderer, Skills, character and MCP', providerRequests: 0, interactiveElectronUi: 'not tested' };
  } finally { if (running && running.child.exitCode === null) { running.child.kill('SIGTERM'); await running.exited; } }
}

test('clean external installation runs native Node broker with installed assets and separate official Electron', { skip: process.env.BETWEEN_DESKTOP_INSTALL_TEST !== '1', timeout: 600000 }, async t => {
  const root = await fs.mkdtemp(path.join(testTempRoot(), 'between-desktop-installed-'));
  if (process.env.BETWEEN_DESKTOP_KEEP_INSTALL !== '1') t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'home')); const release = await packageDesktop({ outDir: path.join(root, 'release'), dependencyLock: process.env.BETWEEN_DESKTOP_PUBLIC_LOCK });
  const install = path.join(root, 'install'); await fs.mkdir(install);
  await exec('tar', ['-xzf', release.archivePath, '-C', install]);
  const artifact = path.join(install, path.basename(release.artifactDir)); await noParentModules(artifact);
  const offline = process.env.BETWEEN_DESKTOP_OFFLINE_INSTALL === '1';
  const installEnv = cleanEnvironment(root);
  await exec('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', ...(offline ? ['--offline', '--ignore-scripts'] : [])], { cwd: artifact, env: installEnv, timeout: 480000, maxBuffer: 8 * 1024 * 1024 });
  if (offline) assert.ok(process.env.BETWEEN_DESKTOP_ELECTRON_CACHE, 'Offline Electron installation requires the verified official binary cache');
  // Explicit for both modes: a first require('electron') must not mix downloader
  // diagnostics with the subsequent machine-readable native ABI result.
  await exec(process.execPath, [path.join(artifact, 'node_modules/electron/install.js')], { cwd: artifact, env: { ...installEnv, ...(offline ? { electron_config_cache: process.env.BETWEEN_DESKTOP_ELECTRON_CACHE } : {}) }, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  const report = { installMode: offline ? 'npm ci --offline --ignore-scripts, cached official Electron installer' : 'npm official registry', archiveSha256: release.archiveSha256, ...await smokeInstalledDesktop({ artifact, root }) };
  await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  t.diagnostic(JSON.stringify(report));
});
