import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LIMITS, decodeSkillTar, inspectSkillBytes, installSkillArtifact, packSkill, parseFrontmatter, validateReferences, validateRelativePath, validateSkillSource } from '../../scripts/skills.mjs';
const exec = promisify(execFile), repo = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const defaultSkill = '---\nname: synthetic-skill\ndescription: Synthetic fixture for archive tests.\n---\n\n# Synthetic skill\n\nRead [reference](references/guide.md#synthetic-guide).\n';
const descriptor = { schema_version: 1, id: 'synthetic', name: 'synthetic-skill', version: '0.1.0', entrypoint: 'SKILL.md', product: 'between', product_schema: 'between.host-context', product_schema_versions: [1], required_capabilities: ['relationship.read_context'], optional_capabilities: ['relationship.remember_user_report'], files: ['SKILL.md', 'references/guide.md'] };
async function fixture(t, change = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'between-skill-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  await fs.mkdir(path.join(sourceDir, 'references'), { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'skill.json'), JSON.stringify({ ...descriptor, ...change }));
  await fs.writeFile(path.join(sourceDir, 'SKILL.md'), defaultSkill);
  await fs.writeFile(path.join(sourceDir, 'references', 'guide.md'), '# Synthetic guide\n\n[Back](../SKILL.md#synthetic-skill)\n');
  return { root, sourceDir, outDir: path.join(root, 'release') };
}
function rawTar(entries, overrides = {}) {
  const chunks = [];
  for (const [name, data] of entries) {
    const h = Buffer.alloc(512), octal = (at, length, value) => h.write(value.toString(8).padStart(length - 1, '0') + '\0', at, length);
    h.write(name, 0, 100); octal(100, 8, 0o644); octal(108, 8, 0); octal(116, 8, 0); octal(124, 12, overrides.declaredSize ?? data.length); octal(136, 12, 0);
    h.fill(32, 148, 156); h[156] = (overrides.type ?? '0').charCodeAt(0); h.write(overrides.linkname ?? '', 157, 100);
    h.write('ustar\0', 257, 6); h.write('00', 263, 2);
    const sum = h.reduce((total, value) => total + value, 0); h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    chunks.push(h, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
const install = (packed, targetDir, extra = {}) => installSkillArtifact({ artifactPath: packed.artifactPath, targetDir, expectedSha256: packed.archiveSha256, schemaVersion: 1, capabilities: ['relationship.read_context'], ...extra });

test('the real skill packages as content, with deterministic version/hash/schema/capability manifest', async t => {
  const f = await fixture(t), sourceDir = path.join(repo, 'skills', 'relationship');
  const first = await packSkill({ sourceDir, outDir: f.outDir });
  const second = await packSkill({ sourceDir, outDir: path.join(f.root, 'second') });
  assert.match(first.artifactPath, /between-skill-relationship-0\.1\.0\.tar$/);
  assert.equal(first.archiveSha256, second.archiveSha256);
  const result = inspectSkillBytes(await fs.readFile(first.artifactPath), { expectedSha256: first.archiveSha256 });
  assert.equal(result.manifest.schema_version, 1);
  assert.equal(result.manifest.product_schema, 'between.host-context');
  assert.deepEqual(result.manifest.product_schema_versions, [1]);
  assert.deepEqual(result.manifest.required_capabilities, ['relationship.read_context']);
  assert.equal(result.manifest.files.length, 2);
  assert.ok(result.manifest.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.deepEqual([...result.files.keys()], ['SKILL.md', 'references/compatibility.md']);
  assert.equal(result.files.has('package.json'), false);
});

test('standalone copied CLI installs actual packaged content outside the repo from an unrelated cwd', async t => {
  const f = await fixture(t), packed = await packSkill(f), cli = path.join(f.root, 'trusted-skills.mjs');
  await fs.copyFile(path.join(repo, 'scripts', 'skills.mjs'), cli);
  await fs.rm(f.sourceDir, { recursive: true }); // No source can rescue a bad install.
  const cwd = path.join(f.root, 'unrelated'); await fs.mkdir(cwd);
  const target = path.join(f.root, 'selected-host-skill');
  const { stdout, stderr } = await exec(process.execPath, [cli, 'install', '--artifact', packed.artifactPath, '--to', target, '--sha256', packed.archiveSha256, '--schema-version', '1', '--capability', 'relationship.read_context'], { cwd });
  assert.equal(stderr, ''); assert.equal(JSON.parse(stdout).installedDir, target);
  assert.equal(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8'), defaultSkill);
  assert.match(await fs.readFile(path.join(target, 'references', 'guide.md'), 'utf8'), /Synthetic guide/);
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'manifest.json'), 'utf8'));
  const installed = new Map(await Promise.all(manifest.files.map(async item => [item.path, await fs.readFile(path.join(target, item.path))])));
  validateReferences(installed);
  assert.equal(await fs.stat(path.join(target, 'SKILL.md')).then(s => s.mode & 0o777), 0o600);
});

test('real relationship artifact installs with all references and hashes intact after cwd isolation', async t => {
  const f = await fixture(t), packed = await packSkill({ sourceDir: path.join(repo, 'skills/relationship'), outDir: f.outDir });
  const target = path.join(f.root, 'relationship'); await install(packed, target);
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'manifest.json'), 'utf8'));
  const files = new Map(await Promise.all(manifest.files.map(async item => {
    const bytes = await fs.readFile(path.join(target, item.path)); assert.equal(sha256(bytes), item.sha256); assert.equal(bytes.length, item.size); return [item.path, bytes];
  })));
  validateReferences(files);
  assert.equal(parseFrontmatter(files.get('SKILL.md')).name, 'online-relationship');
});

test('frontmatter is strict about keys, duplicate fields, YAML features, and body', () => {
  for (const invalid of [defaultSkill.replace('name: synthetic-skill', 'title: synthetic-skill'), defaultSkill.replace('description:', 'name: another\ndescription:'), defaultSkill.replace('description: Synthetic fixture for archive tests.', 'description: |\n  nested'), defaultSkill.replace('description: Synthetic fixture for archive tests.', 'description: &alias bad'), defaultSkill.replace('---\n', '\uFEFF---\n'), defaultSkill.replaceAll('\n', '\r\n'), ...['null', 'true', '42', '2026-10-04'].map(value => defaultSkill.replace('description: Synthetic fixture for archive tests.', `description: ${value}`)), '---\nname: ok\ndescription: Fine\n---\n']) assert.throws(() => parseFrontmatter(invalid), /Skill validation/);
});

test('relative links, reference-style links, images, and fragments are checked without filesystem access', () => {
  const files = new Map([['SKILL.md', Buffer.from('# Skill\n\n[Guide][ref]\n\n![image](image.png)\n\n[ref]: refs/guide.md#guide\n')], ['refs/guide.md', Buffer.from('# Guide\n[Back](../SKILL.md#skill)\n')], ['image.png', Buffer.from('synthetic-bytes')]]);
  validateReferences(files);
  for (const link of ['missing.md', 'refs/guide.md#missing', '../outside.md', '%2e%2e/outside.md', '/etc/passwd', 'C:/secret', 'file:///etc/passwd', 'refs\\guide.md', 'refs/%00guide.md']) {
    const modified = new Map(files); modified.set('SKILL.md', Buffer.from(`# Skill\n[Bad](${link})\n`)); assert.throws(() => validateReferences(modified), /Skill validation/);
  }
  assert.throws(() => validateReferences(new Map([['SKILL.md', Buffer.from('[missing][unknown]')]])), /missing reference definition/);
  assert.throws(() => validateReferences(new Map([['SKILL.md', Buffer.from('[complex](a(b).md)')]])), /unsupported Markdown/);
});

test('source rejects undeclared resources and declared missing resources', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.sourceDir, 'accidental-secret.json'), '{}');
  await assert.rejects(validateSkillSource(f.sourceDir), /not explicitly allowlisted/);
  await fs.rm(path.join(f.sourceDir, 'accidental-secret.json'));
  await fs.rm(path.join(f.sourceDir, 'references/guide.md'));
  await assert.rejects(validateSkillSource(f.sourceDir), /declared content file is missing/);
});

test('source rejects symlinks, hardlinks, and symlink directory roots', async t => {
  const f = await fixture(t), guide = path.join(f.sourceDir, 'references/guide.md'), outside = path.join(f.root, 'outside.md');
  await fs.writeFile(outside, '# Synthetic guide\n'); await fs.rm(guide); await fs.symlink(outside, guide);
  await assert.rejects(validateSkillSource(f.sourceDir), /symlink/);
  await fs.rm(guide); await fs.link(outside, guide); await assert.rejects(validateSkillSource(f.sourceDir), /linked or special/);
  const linked = path.join(f.root, 'linked-source'); await fs.symlink(f.sourceDir, linked);
  await assert.rejects(validateSkillSource(linked), /symlink/);
});

test('source rejects oversized files, total content and malformed capability/schema metadata', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.sourceDir, 'references/guide.md'), Buffer.alloc(LIMITS.fileBytes + 1));
  await assert.rejects(validateSkillSource(f.sourceDir), /size limit/);
  const g = await fixture(t, { product_schema_versions: [0] }); await assert.rejects(validateSkillSource(g.sourceDir), /schema versions/);
  const h = await fixture(t, { required_capabilities: ['shell.execute'] }); await assert.rejects(validateSkillSource(h.sourceDir), /unknown capability/);
  const many = ['SKILL.md', ...Array.from({ length: 5 }, (_, i) => `large-${i}.txt`)];
  const j = await fixture(t, { files: many }); await fs.rm(path.join(j.sourceDir, 'references'), { recursive: true });
  for (const file of many.slice(1)) await fs.writeFile(path.join(j.sourceDir, file), Buffer.alloc(LIMITS.fileBytes));
  await assert.rejects(validateSkillSource(j.sourceDir), /total size limit/);
});

test('source rejects casing collisions and unsafe release paths', async t => {
  for (const bad of ['../escape', '/absolute', 'C:/drive', 'a\\b', 'a//b', 'a/./b', 'a/../b', '.env', 'a/NUL.txt', 'file.', 'a%2fb']) assert.throws(() => validateRelativePath(bad), /unsafe path/);
  const f = await fixture(t, { files: [...descriptor.files, 'skill.md'] }); await fs.writeFile(path.join(f.sourceDir, 'skill.md'), '# Case collision');
  await assert.rejects(validateSkillSource(f.sourceDir), /case-insensitive/);
});

test('archive rejects traversal, absolute paths, Windows drive paths, duplicate names, and backslashes', () => {
  for (const name of ['../escaped', '/escaped', 'content/../../escaped', 'C:/escaped', 'content\\escaped', 'content/./SKILL.md']) assert.throws(() => decodeSkillTar(rawTar([[name, Buffer.from('bad')]])), /unsafe path/);
  assert.throws(() => decodeSkillTar(rawTar([['manifest.json', Buffer.from('{}')], ['manifest.json', Buffer.from('{}')]])), /duplicate/);
  assert.throws(() => decodeSkillTar(rawTar([['content/a.md', Buffer.from('a')], ['content/A.md', Buffer.from('a')]])), /case-colliding/);
});

test('archive rejects symlinks, hardlinks, devices, directories, PAX, GNU long paths, and sparse extensions', () => {
  for (const type of ['1', '2', '3', '4', '5', '6', 'x', 'g', 'L', 'K', 'S']) assert.throws(() => decodeSkillTar(rawTar([['content/link', Buffer.from('')]], { type, linkname: '../outside' })), /only regular TAR files/);
  assert.throws(() => decodeSkillTar(rawTar([['content/a.md', Buffer.from('')]], { linkname: '../outside' })), /link target/);
});

test('archive bounds declared file size, archive size, total file count, padding, checksum, and end markers', () => {
  assert.throws(() => decodeSkillTar(rawTar([['content/huge.txt', Buffer.alloc(0)]], { declaredSize: LIMITS.fileBytes + 1 })), /size limit/);
  assert.throws(() => decodeSkillTar(Buffer.alloc(LIMITS.archiveBytes + 512)), /archive size/);
  const count = Array.from({ length: LIMITS.files + 2 }, (_, i) => [`content/file-${i}.txt`, Buffer.from('')]); assert.throws(() => decodeSkillTar(rawTar(count)), /contents exceed limit/);
  const valid = rawTar([['content/a.txt', Buffer.from('data')]]), tampered = Buffer.from(valid); tampered[0] ^= 1;
  assert.throws(() => decodeSkillTar(tampered), /checksum/);
  const padding = Buffer.from(valid); padding[520] = 1; assert.throws(() => decodeSkillTar(padding), /padding/);
  assert.throws(() => decodeSkillTar(valid.subarray(0, valid.length - 1024)), /missing TAR end marker/);
  assert.throws(() => decodeSkillTar(valid.subarray(0, valid.length - 512)), /end marker/);
});

test('manifest hashes, inventory, content, metadata, and external archive checksum are all verified', async t => {
  const f = await fixture(t), packed = await packSkill(f), valid = await fs.readFile(packed.artifactPath);
  assert.throws(() => inspectSkillBytes(valid, { expectedSha256: '0'.repeat(64) }), /SHA256 mismatch/);
  const entries = decodeSkillTar(valid), changed = new Map(entries); changed.set('content/SKILL.md', Buffer.from('tampered'));
  assert.throws(() => inspectSkillBytes(rawTar(changed)), /content hash or size/);
  const extra = new Map(entries); extra.set('content/extra.txt', Buffer.from('unexpected')); assert.throws(() => inspectSkillBytes(rawTar(extra)), /unlisted/);
  const unknown = new Map(entries), badManifest = JSON.parse(entries.get('manifest.json')); badManifest.extra = true;
  unknown.set('manifest.json', Buffer.from(JSON.stringify(badManifest))); assert.throws(() => inspectSkillBytes(rawTar(unknown)), /unknown properties/);
  const missing = new Map(entries); missing.delete('manifest.json'); assert.throws(() => inspectSkillBytes(rawTar(missing)), /missing manifest/);
});

test('installer rejects missing trusted checksum, incompatible schemas/capabilities, and unsafe archives before writes', async t => {
  const f = await fixture(t), packed = await packSkill(f), target = path.join(f.root, 'install');
  await assert.rejects(install(packed, target, { expectedSha256: undefined }), /expected SHA256/);
  await assert.rejects(install(packed, target, { schemaVersion: 2 }), /schema version/);
  await assert.rejects(install(packed, target, { capabilities: [] }), /missing a required capability/);
  const bad = rawTar([['../escape.txt', Buffer.from('bad')]]), artifactPath = path.join(f.root, 'malicious.tar'); await fs.writeFile(artifactPath, bad);
  await assert.rejects(install({ artifactPath, archiveSha256: sha256(bad) }, target), /unsafe path/);
  await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.root, 'escape.txt')), { code: 'ENOENT' });
});

test('installer refuses existing destinations, target symlinks, and symlink ancestors without overwriting', async t => {
  const f = await fixture(t), packed = await packSkill(f), target = path.join(f.root, 'installed'); await install(packed, target);
  await assert.rejects(install(packed, target), { code: 'EEXIST' });
  const original = await fs.readFile(path.join(target, 'SKILL.md'), 'utf8'); assert.equal(original, defaultSkill);
  const link = path.join(f.root, 'symlink'); await fs.symlink(target, link);
  await assert.rejects(install(packed, link), { code: 'EEXIST' });
  await assert.rejects(install(packed, path.join(link, 'nested')), /symlink/);
  await assert.rejects(fs.stat(path.join(target, 'nested')), { code: 'ENOENT' });
});

test('release outputs are immutable and CLI rejects undocumented or ambiguous arguments', async t => {
  const f = await fixture(t); await packSkill(f); await assert.rejects(packSkill(f), { code: 'EEXIST' });
  for (const args of [['validate', '--source'], ['validate', '--source', f.sourceDir, '--source', f.sourceDir], ['install', '--artifact', '/none'], ['validate', '--source', f.sourceDir, '--unknown', 'value']]) {
    await assert.rejects(exec(process.execPath, [path.join(repo, 'scripts/skills.mjs'), ...args]), error => error.code !== 0 && /Skill validation/.test(error.stderr));
  }
});
