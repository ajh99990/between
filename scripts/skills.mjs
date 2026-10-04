#!/usr/bin/env node
/** Standalone, dependency-free content release tool. It never executes asset code. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const LIMITS = Object.freeze({ files: 128, fileBytes: 512 * 1024, totalBytes: 2 * 1024 * 1024, archiveBytes: 3 * 1024 * 1024, pathBytes: 180, manifestBytes: 64 * 1024 });
const DESCRIPTOR_KEYS = ['schema_version', 'id', 'name', 'version', 'entrypoint', 'product', 'product_schema', 'product_schema_versions', 'required_capabilities', 'optional_capabilities', 'files'];
const MANIFEST_KEYS = [...DESCRIPTOR_KEYS.filter(key => key !== 'files'), 'archive_format', 'content_sha256', 'files'];
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.png', '.jpg', '.jpeg', '.webp']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Skill validation: ${message}`); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const plainKeys = (value, keys, label) => {
  if (!isObject(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown properties`);
};
const unique = values => new Set(values).size === values.length;
const utf8 = (bytes, label) => { try { return decoder.decode(bytes); } catch { fail(`${label} is not valid UTF-8`); } };
const json = (bytes, label) => { try { return JSON.parse(utf8(bytes, label)); } catch { fail(`${label} is not valid JSON`); } };
function stringList(value, label, { nonempty = false } = {}) {
  if (!Array.isArray(value) || value.length > LIMITS.files || (nonempty && !value.length) || value.some(item => typeof item !== 'string') || !unique(value)) fail(`${label} must be a unique string list`);
}
export function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > LIMITS.pathBytes || !/^[A-Za-z0-9_./-]+$/.test(value)) fail(`unsafe path: ${String(value)}`);
  const pieces = value.split('/');
  if (pieces.some(piece => !piece || piece === '.' || piece === '..' || piece.startsWith('.') || piece.endsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(piece))) fail(`unsafe path: ${value}`);
  return value;
}
function checkMetadata(value, manifest = false) {
  plainKeys(value, manifest ? MANIFEST_KEYS : DESCRIPTOR_KEYS, manifest ? 'manifest' : 'descriptor');
  if (value.schema_version !== 1 || value.product !== 'between' || value.product_schema !== 'between.host-context' || value.entrypoint !== 'SKILL.md') fail('unsupported metadata schema, product, or entrypoint');
  for (const field of ['id', 'name']) if (typeof value[field] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value[field]) || value[field].length > 64) fail(`invalid ${field}`);
  if (typeof value.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)) fail('version must be an exact stable semver');
  if (!Array.isArray(value.product_schema_versions) || !value.product_schema_versions.length || value.product_schema_versions.length > 16 || !unique(value.product_schema_versions) || value.product_schema_versions.some(item => !Number.isSafeInteger(item) || item < 1)) fail('invalid product schema versions');
  for (const field of ['required_capabilities', 'optional_capabilities']) {
    stringList(value[field], field, { nonempty: field === 'required_capabilities' });
    if (value[field].some(item => !/^relationship\.(read_context|remember_user_report)$/.test(item))) fail('unknown capability');
  }
  if (!value.required_capabilities.includes('relationship.read_context') || !unique([...value.required_capabilities, ...value.optional_capabilities])) fail('invalid capability contract');
  if (manifest && (value.archive_format !== 'ustar-v1' || !/^[a-f0-9]{64}$/.test(value.content_sha256))) fail('invalid archive format or content hash');
}
/** The deliberately small YAML subset has only two single-line scalar fields. */
export function parseFrontmatter(content) {
  const text = typeof content === 'string' ? content : utf8(content, 'SKILL.md');
  if (text.includes('\r') || text.includes('\0') || !text.startsWith('---\n')) fail('SKILL.md must start with LF-delimited YAML frontmatter');
  const end = text.indexOf('\n---\n', 4);
  if (end < 0 || end > 4096) fail('missing or oversized frontmatter');
  const result = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = /^(name|description): (\S(?:.*\S)?)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1])) fail('frontmatter requires unique name and description scalar fields');
    const value = match[2];
    if (/^[\[\]{}&*!|>"'`%@#?:-]/.test(value) || /:\s|\s#|[\t\x00-\x1f]/.test(value)) fail('frontmatter scalar uses unsupported YAML syntax');
    if (/^(?:null|true|false|yes|no|on|off|~)$/i.test(value) || /^[+\-]?(?:[0-9]|\.[0-9])/.test(value)) fail('frontmatter scalar must be an unambiguous string');
    result[match[1]] = value;
  }
  plainKeys(result, ['name', 'description'], 'frontmatter');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.name) || result.name.length > 64 || result.description.length > 1024) fail('invalid frontmatter name or description');
  if (!text.slice(end + 5).trim()) fail('SKILL.md body is empty');
  return result;
}
function headingIds(text) {
  const seen = new Map(), ids = new Set();
  for (const line of text.split('\n')) {
    const match = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!match) continue;
    const base = match[1].toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) ?? 0; seen.set(base, n + 1); ids.add(n ? `${base}-${n}` : base);
  }
  return ids;
}
function withoutCode(text) {
  return text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');
}
/** Explicit links, images, and reference-style links are resolved without disk/cwd access. */
export function validateReferences(files) {
  for (const [file, bytes] of files) {
    if (!file.endsWith('.md')) continue;
    const text = withoutCode(utf8(bytes, file));
    if (/<[a-z][a-z0-9-]*(?:\s|\/?[>])/i.test(text)) fail(`HTML links/assets are unsupported in ${file}`);
    const definitions = new Map();
    const links = [];
    const definePattern = /^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|(\S+))(?:\s+["'(].*["')])?\s*$/gm;
    for (const match of text.matchAll(definePattern)) {
      const label = match[1].trim().toLowerCase();
      if (definitions.has(label)) fail(`duplicate reference label in ${file}`);
      definitions.set(label, match[2] ?? match[3]); links.push(match[2] ?? match[3]);
    }
    const body = text.replace(definePattern, '');
    const inlinePattern = /!?\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^\s()]+))(?:\s+["'][^\n]*?["'])?\s*\)/g;
    for (const match of body.matchAll(inlinePattern)) links.push(match[2] ?? match[3]);
    let remainder = body.replace(inlinePattern, '');
    for (const match of remainder.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
      const label = (match[2] || match[1]).trim().toLowerCase();
      if (!definitions.has(label)) fail(`missing reference definition ${label} in ${file}`);
      links.push(definitions.get(label));
    }
    remainder = remainder.replace(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g, '');
    // Reject unparsed link syntax rather than silently overlooking unsupported Markdown.
    if (/!?\[[^\]\n]*\]\s*\(/.test(remainder)) fail(`unsupported Markdown link syntax in ${file}`);
    for (const match of remainder.matchAll(/!?\[([^\]\n]+)\]/g)) {
      const label = match[1].trim().toLowerCase();
      if (definitions.has(label)) links.push(definitions.get(label));
    }
    for (const original of links) {
      if (/^https?:\/\//i.test(original)) {
        const url = new URL(original); if (url.username || url.password) fail(`URL credentials prohibited in ${file}`); continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(original) || original.startsWith('//') || original.includes('?')) fail(`unsupported link target in ${file}: ${original}`);
      let target; try { target = decodeURIComponent(original); } catch { fail(`invalid encoded link in ${file}`); }
      if (target.includes('\\') || /[\x00-\x20\x7f]/.test(target) || target.startsWith('/')) fail(`unsafe link target in ${file}`);
      const [relative, fragment, ...extra] = target.split('#');
      if (extra.length) fail(`invalid fragment in ${file}`);
      const resolved = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative)) : file;
      validateRelativePath(resolved);
      if (!files.has(resolved)) fail(`missing relative reference ${original} in ${file}`);
      if (fragment && resolved.endsWith('.md') && !headingIds(utf8(files.get(resolved), resolved)).has(fragment)) fail(`missing heading ${fragment} in ${resolved}`);
    }
  }
}
function validateContent(metadata, files) {
  if (!files.has(metadata.entrypoint)) fail('missing SKILL.md');
  const frontmatter = parseFrontmatter(files.get(metadata.entrypoint));
  if (frontmatter.name !== metadata.name) fail('frontmatter name differs from manifest');
  let total = 0;
  if (!files.size || files.size > LIMITS.files) fail('content file count exceeds limit');
  const caseNames = new Set();
  for (const [name, data] of files) {
    validateRelativePath(name);
    if (name === 'manifest.json' || name === 'skill.json') fail(`reserved content path: ${name}`);
    if (!ALLOWED_EXTENSIONS.has(path.posix.extname(name).toLowerCase())) fail(`unsupported content file extension: ${name}`);
    if (caseNames.has(name.toLowerCase())) fail('case-insensitive path collision');
    caseNames.add(name.toLowerCase());
    if (data.length > LIMITS.fileBytes) fail(`file exceeds size limit: ${name}`);
    total += data.length;
  }
  if (total > LIMITS.totalBytes) fail('content exceeds total size limit');
  for (const name of files.keys()) {
    const pieces = name.split('/');
    for (let i = 1; i < pieces.length; i++) if (caseNames.has(pieces.slice(0, i).join('/').toLowerCase())) fail('content file/directory path collision');
  }
  validateReferences(files);
}
/** Fail closed on symlinks in any supplied directory component. */
async function assertRealDirectory(directory) {
  const absolute = path.resolve(directory), root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`directory contains a symlink or non-directory: ${current}`);
  }
  return absolute;
}
async function readBounded(file, max) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max) fail(`not a regular file or exceeds size limit: ${file}`);
    // A bounded read also guards against a file growing after fstat.
    const bytes = Buffer.alloc(Math.min(stat.size + 1, max + 1));
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break; offset += read.bytesRead;
    }
    if (offset !== stat.size) fail(`file changed while reading: ${file}`);
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
export async function validateSkillSource(sourceDir) {
  const root = await assertRealDirectory(sourceDir);
  const descriptorPath = path.join(root, 'skill.json');
  const descriptorStat = await fs.lstat(descriptorPath);
  if (descriptorStat.isSymbolicLink() || !descriptorStat.isFile() || descriptorStat.nlink !== 1) fail('descriptor must be a non-linked regular file');
  const metadata = json(await readBounded(descriptorPath, LIMITS.manifestBytes), 'skill.json');
  checkMetadata(metadata); stringList(metadata.files, 'files', { nonempty: true });
  metadata.files.forEach(validateRelativePath);
  const found = new Map();
  let directoryCount = 0, sourceBytes = 0;
  async function walk(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      validateRelativePath(relative);
      const absolute = path.join(directory, entry.name), stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) fail(`symlink prohibited: ${relative}`);
      if (stat.isDirectory()) {
        if (++directoryCount > LIMITS.files) fail('too many source directories');
        await walk(absolute, relative);
      } else {
        if (!stat.isFile() || stat.nlink !== 1) fail(`linked or special file prohibited: ${relative}`);
        if (relative === 'skill.json') continue;
        if (!metadata.files.includes(relative)) fail(`file is not explicitly allowlisted: ${relative}`);
        if (found.size >= LIMITS.files) fail('too many source files');
        sourceBytes += stat.size; if (sourceBytes > LIMITS.totalBytes) fail('source exceeds total size limit');
        found.set(relative, await readBounded(absolute, LIMITS.fileBytes));
      }
    }
  }
  await walk(root);
  if (metadata.files.length !== found.size || metadata.files.some(file => !found.has(file))) fail('declared content file is missing');
  validateContent(metadata, found);
  return { metadata, files: new Map([...found].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}
function contentHash(files) {
  const digest = createHash('sha256');
  for (const entry of files) digest.update(`${entry.path}\0${entry.size}\0${entry.sha256}\n`);
  return digest.digest('hex');
}
function createManifest(metadata, files) {
  const inventory = [...files].map(([name, data]) => ({ path: name, size: data.length, sha256: hash(data) }));
  return { ...metadata, archive_format: 'ustar-v1', content_sha256: contentHash(inventory), files: inventory };
}
function writeOctal(buffer, start, length, number) { buffer.write(number.toString(8).padStart(length - 1, '0') + '\0', start, length, 'ascii'); }
function encodeTar(entries) {
  const chunks = [];
  for (const [name, data] of entries) {
    const header = Buffer.alloc(512), full = Buffer.from(name);
    let leaf = name, prefix = '';
    if (full.length > 100) {
      const split = name.lastIndexOf('/'); prefix = name.slice(0, split); leaf = name.slice(split + 1);
      if (Buffer.byteLength(prefix) > 155 || Buffer.byteLength(leaf) > 100) fail('archive path exceeds USTAR fields');
    }
    header.write(leaf, 0, 100, 'ascii'); writeOctal(header, 100, 8, 0o600); writeOctal(header, 108, 8, 0); writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, data.length); writeOctal(header, 136, 12, 0); header.fill(0x20, 148, 156); header[156] = 0x30;
    header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii'); header.write(prefix, 345, 155, 'ascii');
    const sum = header.reduce((total, byte) => total + byte, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024)); const archive = Buffer.concat(chunks);
  if (archive.length > LIMITS.archiveBytes) fail('archive exceeds size limit');
  return archive;
}
function tarString(header, start, size) {
  const field = header.subarray(start, start + size), nul = field.indexOf(0), end = nul < 0 ? field.length : nul;
  if (nul >= 0 && field.subarray(nul).some(byte => byte !== 0)) fail('nonzero bytes after TAR field terminator');
  if (field.subarray(0, end).some(byte => byte < 0x20 || byte > 0x7e)) fail('non-ASCII TAR header');
  return field.subarray(0, end).toString('ascii');
}
function tarNumber(header, start, size) {
  const field = header.subarray(start, start + size).toString('ascii');
  if (!/^[0-7]+[\0 ]*$/.test(field)) fail('invalid TAR numeric field');
  const value = Number.parseInt(field, 8); if (!Number.isSafeInteger(value)) fail('oversized TAR numeric field'); return value;
}
/** This is a strict USTAR subset, not a general-purpose archive extractor. */
export function decodeSkillTar(archive) {
  if (!Buffer.isBuffer(archive) || archive.length > LIMITS.archiveBytes || archive.length < 1024 || archive.length % 512 !== 0) fail('invalid archive size');
  const entries = new Map(), folded = new Set(); let offset = 0, total = 0, terminated = false;
  while (offset < archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (archive.length - offset < 1024 || archive.subarray(offset).some(byte => byte !== 0)) fail('invalid TAR end marker');
      terminated = true; break;
    }
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 0x20 : header[i];
    if (checksum !== tarNumber(header, 148, 8)) fail('TAR checksum mismatch');
    if (header.subarray(257, 263).toString('ascii') !== 'ustar\0' || header.subarray(263, 265).toString('ascii') !== '00') fail('only USTAR archives are supported');
    if (header[156] !== 0x30) fail('only regular TAR files are allowed; links, directories, and extensions are prohibited');
    if (header.subarray(157, 257).some(byte => byte !== 0)) fail('TAR link target is prohibited');
    if (header.subarray(500).some(byte => byte !== 0)) fail('unsupported TAR header data');
    const prefix = tarString(header, 345, 155), leaf = tarString(header, 0, 100), name = prefix ? `${prefix}/${leaf}` : leaf;
    validateRelativePath(name);
    if (folded.has(name.toLowerCase())) fail('duplicate or case-colliding archive path');
    folded.add(name.toLowerCase());
    const size = tarNumber(header, 124, 12), max = name === 'manifest.json' ? LIMITS.manifestBytes : LIMITS.fileBytes;
    if (size > max) fail('archive entry exceeds size limit');
    total += size; if (total > LIMITS.totalBytes + LIMITS.manifestBytes || entries.size >= LIMITS.files + 1) fail('archive contents exceed limit');
    const end = offset + 512 + size, paddedEnd = offset + 512 + Math.ceil(size / 512) * 512;
    if (paddedEnd > archive.length || archive.subarray(end, paddedEnd).some(byte => byte !== 0)) fail('truncated archive or invalid padding');
    entries.set(name, archive.subarray(offset + 512, end)); offset = paddedEnd;
  }
  if (!terminated) fail('missing TAR end marker');
  return entries;
}
export function inspectSkillBytes(archive, { expectedSha256 } = {}) {
  const archiveSha256 = hash(archive);
  if (expectedSha256 !== undefined) {
    if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256) || !timingSafeEqual(Buffer.from(expectedSha256, 'hex'), Buffer.from(archiveSha256, 'hex'))) fail('archive SHA256 mismatch');
  }
  const entries = decodeSkillTar(archive);
  if (!entries.has('manifest.json')) fail('missing manifest.json');
  const manifest = json(entries.get('manifest.json'), 'manifest.json'); checkMetadata(manifest, true);
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > LIMITS.files) fail('invalid manifest inventory');
  const files = new Map();
  for (const entry of manifest.files) {
    plainKeys(entry, ['path', 'size', 'sha256'], 'inventory entry'); validateRelativePath(entry.path);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > LIMITS.fileBytes || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || files.has(entry.path)) fail('invalid inventory size, hash, or duplicate path');
    const bytes = entries.get(`content/${entry.path}`);
    if (!bytes || bytes.length !== entry.size || hash(bytes) !== entry.sha256) fail(`content hash or size mismatch: ${entry.path}`);
    files.set(entry.path, bytes);
  }
  if (entries.size !== files.size + 1) fail('archive contains unlisted files');
  if (contentHash(manifest.files) !== manifest.content_sha256) fail('manifest content hash mismatch');
  validateContent(manifest, files);
  return { manifest, files, archiveSha256 };
}
export async function inspectSkillArtifact(artifactPath, options) {
  const stat = await fs.lstat(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('artifact must be a regular file');
  return inspectSkillBytes(await readBounded(artifactPath, LIMITS.archiveBytes), options);
}
export async function packSkill({ sourceDir, outDir }) {
  const { metadata, files } = await validateSkillSource(sourceDir), manifest = createManifest(metadata, files);
  const bytes = encodeTar(new Map([['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')], ...[...files].map(([name, data]) => [`content/${name}`, data])]));
  inspectSkillBytes(bytes);
  await fs.mkdir(outDir, { recursive: true }); const output = await assertRealDirectory(outDir);
  const artifactPath = path.join(output, `between-skill-${metadata.id}-${metadata.version}.tar`), archiveSha256 = hash(bytes);
  await fs.writeFile(artifactPath, bytes, { flag: 'wx', mode: 0o600 });
  await fs.writeFile(`${artifactPath}.sha256`, `${archiveSha256}  ${path.basename(artifactPath)}\n`, { flag: 'wx', mode: 0o600 });
  return { artifactPath, archiveSha256, manifest };
}
export async function installSkillArtifact({ artifactPath, targetDir, expectedSha256, schemaVersion, capabilities }) {
  if (typeof expectedSha256 !== 'string') fail('installation requires an expected SHA256 from a trusted release channel');
  const result = await inspectSkillArtifact(artifactPath, { expectedSha256 });
  if (!Number.isSafeInteger(schemaVersion) || !result.manifest.product_schema_versions.includes(schemaVersion)) fail('unsupported target product schema version');
  stringList(capabilities, 'target capabilities');
  if (result.manifest.required_capabilities.some(item => !capabilities.includes(item))) fail('target is missing a required capability');
  const destination = path.resolve(targetDir), parent = await assertRealDirectory(path.dirname(destination));
  validateRelativePath(path.basename(destination));
  // Exclusive creation intentionally refuses upgrades/overwrites and pre-existing symlinks.
  // Verify the entire archive before touching the chosen destination.
  await fs.mkdir(destination, { mode: 0o700 });
  try {
    for (const [relative, bytes] of result.files) {
      const file = path.join(destination, ...relative.split('/'));
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await assertRealDirectory(path.dirname(file));
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    }
    await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // Verify the installed bytes; no development source or process.cwd() lookup.
    for (const [relative, bytes] of result.files) if (hash(await readBounded(path.join(destination, relative), LIMITS.fileBytes)) !== hash(bytes)) fail(`installed file mismatch: ${relative}`);
  } catch (error) { await fs.rm(destination, { recursive: true, force: true }); throw error; }
  return { installedDir: path.join(parent, path.basename(destination)), archiveSha256: result.archiveSha256, manifest: result.manifest };
}
const USAGE = `Usage:
  node skills.mjs validate --source <skill-directory>
  node skills.mjs pack --source <skill-directory> --out <artifact-directory>
  node skills.mjs inspect --artifact <archive.tar> [--sha256 <trusted-sha256>]
  node skills.mjs install --artifact <archive.tar> --to <new-directory> --sha256 <trusted-sha256> --schema-version 1 --capability relationship.read_context [--capability relationship.remember_user_report]
The target parent must already exist and contain no symlink components. No global install location is selected.`;
export async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') { process.stdout.write(USAGE + '\n'); return; }
  const allowed = { validate: ['source'], pack: ['source', 'out'], inspect: ['artifact', 'sha256'], install: ['artifact', 'to', 'sha256', 'schema-version', 'capability'] }[command];
  if (!allowed) fail('unknown command');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !allowed.includes(key) || !value || value.startsWith('--') || (key !== 'capability' && Object.hasOwn(options, key))) fail('unknown, duplicate, or missing CLI argument');
    if (key === 'capability') (options[key] ??= []).push(value); else options[key] = value;
  }
  const required = { validate: ['source'], pack: ['source', 'out'], inspect: ['artifact'], install: ['artifact', 'to', 'sha256', 'schema-version', 'capability'] }[command];
  for (const field of required) if (!options[field]) fail(`missing --${field}`);
  let result;
  if (command === 'validate') { const parsed = await validateSkillSource(options.source); result = { valid: true, id: parsed.metadata.id, version: parsed.metadata.version, files: [...parsed.files.keys()] }; }
  if (command === 'pack') result = await packSkill({ sourceDir: options.source, outDir: options.out });
  if (command === 'inspect') { const inspected = await inspectSkillArtifact(options.artifact, { expectedSha256: options.sha256 }); result = { archiveSha256: inspected.archiveSha256, manifest: inspected.manifest }; }
  if (command === 'install') result = await installSkillArtifact({ artifactPath: options.artifact, targetDir: options.to, expectedSha256: options.sha256, schemaVersion: Number(options['schema-version']), capabilities: options.capability });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
