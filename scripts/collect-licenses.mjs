import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NOTICE_FILE = /^(?:licen[cs]e|unlicense|copying|notice|copyright|authors)(?:$|[._ -])/i;
const NOTICE_DIRECTORY = /^(?:licen[cs]es?|notices?|copying|copyrights?)$/i;
const TEXT_EXTENSION = /\.(?:txt|md|markdown|rst|text)$/i;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|json|map|wasm|node|png|jpe?g|gif|svg|pdf|zip|gz)$/i;
const MAX_NOTICE_BYTES = 8 * 1024 * 1024;

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const slash = (value) => value.split(path.sep).join('/');
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

function packageName(lockPath) {
  return lockPath.split('/node_modules/').at(-1).replace(/^node_modules\//, '');
}

function validateLockPath(lockPath, workspacePaths) {
  if (lockPath.includes('\\') || path.posix.isAbsolute(lockPath)
    || lockPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe dependency path in package-lock.json: ${lockPath}`);
  }
  const firstModules = lockPath.indexOf('node_modules/');
  const prefix = lockPath.slice(0, firstModules).replace(/\/$/, '');
  if (firstModules < 0 || (prefix && !workspacePaths.has(prefix))) {
    throw new Error(`Dependency path is outside root/workspace node_modules: ${lockPath}`);
  }
  // Each node_modules segment must contain exactly a package (optionally scoped).
  for (const segment of lockPath.slice(firstModules).split('/node_modules/')) {
    const name = segment.replace(/^node_modules\//, '');
    if (!/^(?:@[^/@]+\/)?[^/@]+$/.test(name)) {
      throw new Error(`Invalid package path in package-lock.json: ${lockPath}`);
    }
  }
}

function safeSource(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    // Local paths and unrecognized locators are not copied into the inventory.
    return 'non-URL source (see package-lock.json)';
  }
}

function matchesTarget(value, constraints) {
  if (!constraints?.length) return true;
  if (constraints.includes(`!${value}`)) return false;
  const positive = constraints.filter((entry) => !entry.startsWith('!'));
  return !positive.length || positive.includes(value) || positive.includes('any') || positive.includes('*');
}

function licenseDeclaration(manifest, locked) {
  const value = manifest?.license ?? manifest?.licenses ?? locked.license ?? null;
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : entry.type ?? 'unspecified');
  if (value && typeof value === 'object') return value.type ?? 'unspecified';
  return value;
}

async function noticeCandidates(packageRoot) {
  const candidates = [];
  const issues = [];
  async function walk(directory, inNoticeDirectory, depth) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = slash(path.relative(packageRoot, absolute));
      if (entry.isSymbolicLink()) {
        if (inNoticeDirectory || NOTICE_FILE.test(entry.name) || NOTICE_DIRECTORY.test(entry.name)) {
          issues.push({ file: relative, reason: 'symlink not followed' });
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || (!inNoticeDirectory && !NOTICE_DIRECTORY.test(entry.name))) continue;
        if (depth >= 8) {
          issues.push({ file: relative, reason: 'notice directory exceeds traversal depth' });
          continue;
        }
        await walk(absolute, true, depth + 1);
      } else if (entry.isFile()) {
        const namedNotice = NOTICE_FILE.test(entry.name);
        const directoryText = inNoticeDirectory && (TEXT_EXTENSION.test(entry.name) || !path.extname(entry.name));
        if (!namedNotice && !directoryText) continue;
        if (SOURCE_EXTENSION.test(entry.name)) {
          if (namedNotice) issues.push({ file: relative, reason: 'non-text/source file not copied' });
          continue;
        }
        candidates.push({ absolute, relative });
      }
    }
  }
  await walk(packageRoot, false, 0);
  return { candidates, issues };
}

/** Collect only lockfile-listed packages and their legal text; never scan runtime data. */
export async function collectLicenses(rootDirectory) {
  const root = await realpath(rootDirectory);
  const lockBytes = await readFile(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  if (lock.lockfileVersion !== 3 || !lock.packages) {
    throw new Error('Expected an npm v3 package-lock.json with package locations');
  }
  const workspacePaths = new Set(Object.keys(lock.packages).filter((key) => key && !key.includes('node_modules/')));
  const packages = [];
  const contents = new Map();
  const problems = [];
  const locations = Object.entries(lock.packages)
    .filter(([key, value]) => key.includes('node_modules/') && !value.link)
    .sort(([a], [b]) => a.localeCompare(b, 'en'));

  for (const [lockPath, locked] of locations) {
    validateLockPath(lockPath, workspacePaths);
    const item = {
      path: lockPath,
      name: locked.name ?? packageName(lockPath),
      version: locked.version,
      source: safeSource(locked.resolved),
      integrity: locked.integrity ?? null,
      license: licenseDeclaration(null, locked),
      development: Boolean(locked.dev),
      optional: Boolean(locked.optional || locked.devOptional),
      target: { os: locked.os ?? null, cpu: locked.cpu ?? null, libc: locked.libc ?? null },
      status: 'installed',
      notices: [],
      noticeIssues: [],
    };
    packages.push(item);
    const absolute = path.join(root, lockPath);
    let packageRoot;
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('package directory must be a regular directory');
      packageRoot = await realpath(absolute);
      if (!inside(root, packageRoot) || !slash(path.relative(root, packageRoot)).includes('node_modules/')) {
        throw new Error('package directory resolves outside repository node_modules');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        const platformExcluded = !matchesTarget(process.platform, locked.os) || !matchesTarget(process.arch, locked.cpu);
        item.status = item.optional
          ? (platformExcluded ? 'not-installed-platform-optional' : 'not-installed-optional')
          : 'not-installed-required';
        if (!item.optional) problems.push(`${lockPath}: required package is not installed`);
      } else {
        item.status = 'unsafe-package-path';
        problems.push(`${lockPath}: ${error.message}`);
      }
      continue;
    }
    const manifestFile = path.join(packageRoot, 'package.json');
    const manifestPath = await realpath(manifestFile);
    if (!inside(packageRoot, manifestPath)) throw new Error(`${lockPath}: package.json resolves outside its package`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    item.name = manifest.name ?? item.name;
    item.license = licenseDeclaration(manifest, locked);
    if (manifest.version !== locked.version) {
      item.status = 'installed-version-mismatch';
      item.installedVersion = manifest.version;
      problems.push(`${lockPath}: installed version does not match lockfile`);
    }
    const { candidates, issues } = await noticeCandidates(packageRoot);
    item.noticeIssues.push(...issues);
    for (const { absolute: noticePath, relative } of candidates) {
      const resolved = await realpath(noticePath);
      if (!inside(packageRoot, resolved)) throw new Error(`${lockPath}: notice resolves outside its package`);
      const stat = await lstat(noticePath);
      if (!stat.isFile() || stat.size > MAX_NOTICE_BYTES) {
        item.noticeIssues.push({ file: relative, reason: 'not a regular file or exceeds 8 MiB limit' });
        continue;
      }
      const bytes = await readFile(noticePath);
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        item.noticeIssues.push({ file: relative, reason: 'not valid UTF-8; text not copied' });
        continue;
      }
      if (!bytes.length) {
        item.noticeIssues.push({ file: relative, reason: 'empty notice file' });
        continue;
      }
      const sha256 = hash(bytes);
      item.notices.push({ file: relative, sha256, bytes: bytes.length });
      const content = contents.get(sha256) ?? { bytes, references: [] };
      content.references.push(`${lockPath} (${item.name}@${item.version}) / ${relative}`);
      contents.set(sha256, content);
    }
  }

  const installed = packages.filter((item) => item.status.startsWith('installed'));
  const manifest = {
    schemaVersion: 1,
    generatedFrom: {
      lockfile: 'package-lock.json',
      lockfileVersion: lock.lockfileVersion,
      lockfileSha256: hash(lockBytes),
      platform: process.platform,
      architecture: process.arch,
      node: process.versions.node,
      scope: 'All installed third-party package locations in the root npm workspace lockfile, including development dependencies; workspace source licenses are separate.',
    },
    coverage: {
      lockedPackageLocations: packages.length,
      installedPackageLocations: installed.length,
      uniqueInstalledPackages: new Set(installed.map((item) => `${item.name}@${item.version}`)).size,
      noticeFiles: installed.reduce((count, item) => count + item.notices.length, 0),
      uniqueNoticeContents: contents.size,
      installedWithoutNoticeText: installed.filter((item) => !item.notices.length).map((item) => item.path),
      notInstalledOptional: packages.filter((item) => item.status.startsWith('not-installed') && item.optional).map((item) => item.path),
      noticeReadIssues: installed.filter((item) => item.noticeIssues.length).map((item) => item.path),
      problems,
      limitations: [
        'Non-installed optional/platform packages have metadata only; their distributed notice text must be collected on each release target.',
        'Packages without a standalone supported notice file retain the declared license only; no copyright or license text is invented.',
        'Only top-level legal files and legal-text directories are collected. Notices embedded in source, README files, archives, executables or externally downloaded binaries are outside this inventory.',
        'This inventory preserves available text and metadata; it is not a legal review or a claim that all target-platform distribution obligations are complete.',
      ],
    },
    packages,
  };
  const outputDirectory = path.join(root, 'licenses');
  await mkdir(outputDirectory, { recursive: true });
  const header = [
    'Between — third-party dependency notices',
    '',
    'Generated by scripts/collect-licenses.mjs from package-lock.json and installed packages.',
    'Exact notice-file bytes are grouped by SHA-256; headers identify all locked package locations sharing each text.',
    'See dependency-manifest.json and README.md for metadata, missing notices and platform limitations.',
    'Source/workspace licenses and content attribution are separate from this dependency inventory.',
    '',
  ].join('\n');
  const chunks = [Buffer.from(header)];
  for (const [sha256, content] of [...contents].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    chunks.push(Buffer.from(`\n${'='.repeat(80)}\nSHA-256: ${sha256}\n${content.references.join('\n')}\n${'-'.repeat(80)}\n`));
    chunks.push(content.bytes, Buffer.from('\n'));
  }
  await writeFile(path.join(outputDirectory, 'THIRD-PARTY-NOTICES.txt'), Buffer.concat(chunks));
  await writeFile(path.join(outputDirectory, 'dependency-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = await collectLicenses(root);
  const { coverage } = manifest;
  console.log(`License inventory: ${coverage.installedPackageLocations}/${coverage.lockedPackageLocations} package locations installed, ${coverage.uniqueNoticeContents} unique notice texts, ${coverage.installedWithoutNoticeText.length} installed locations without notice text, ${coverage.notInstalledOptional.length} optional locations not installed.`);
  if (coverage.problems.length) {
    for (const problem of coverage.problems) console.error(problem);
    process.exitCode = 1;
  }
}
