import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repository = await fs.realpath(new URL('../../../', import.meta.url));
const isWithin = (parent, target) => {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

// npm workspaces may hoist dependencies to the repository root. Resolve the
// dependency used by this package, and refuse to modify an external installation.
async function dependency(name, version) {
  let packageFile;
  try {
    packageFile = require.resolve(`${name}/package.json`);
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
    let directory = path.dirname(require.resolve(name));
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, 'package.json');
      const pkg = await fs.readFile(candidate, 'utf8').then(JSON.parse).catch((readError) => {
        if (readError.code === 'ENOENT') return undefined;
        throw readError;
      });
      if (pkg?.name === name) {
        packageFile = candidate;
        break;
      }
      directory = path.dirname(directory);
    }
    if (!packageFile) throw new Error(`Cannot locate the installed package metadata: ${name}`);
  }
  packageFile = await fs.realpath(packageFile);
  const base = path.dirname(packageFile);
  if (!isWithin(repository, base) || !path.relative(repository, base).split(path.sep).includes('node_modules')) {
    throw new Error(`Refusing to patch a dependency outside this checkout's node_modules: ${name}`);
  }
  const pkg = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  if (pkg.name !== name || pkg.version !== version) {
    throw new Error(`Review ${name} CSP patch for the installed version (expected ${version})`);
  }
  return base;
}

const patches = [];
async function patch(base, file, before, after) {
  const target = await fs.realpath(path.join(base, file));
  if (!isWithin(base, target)) throw new Error(`Refusing a CSP patch target outside its dependency: ${file}`);
  const source = await fs.readFile(target, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`CSP patch target changed: ${file}`);
  patches.push({ target, source: source.replace(before, after) });
}

// ProComponents 3.1.14-2 forwards CSP to component styles, but not its token sheet.
// Keep the policy strict by forwarding the same existing nonce. Fail on upstream drift.
const base = await dependency('@ant-design/pro-components', '3.1.14-2');
for (const file of ['es/provider/index.js', 'lib/provider/index.js']) {
  const before = '    salt,\n    override: finalToken,';
  const after = '    salt,\n    nonce: restConfig.csp?.nonce,\n    override: finalToken,';
  await patch(base, file, before, after);
}
// rc portal scroll locking / scrollbar measurement call updateCSS without options.
// Scope the fallback to this dependency's trusted style injection, never patch DOM APIs.
const utilBase = await dependency('@rc-component/util', '1.12.0');
for (const file of ['es/Dom/dynamicCSS.js', 'lib/Dom/dynamicCSS.js']) {
  const before = "  const styleNode = document.createElement('style');";
  const after = before + '\n  const betweenNonce = document.querySelector(\'meta[name="csp-nonce"]\')?.content;\n  if (betweenNonce) styleNode.nonce = betweenNonce;';
  await patch(utilBase, file, before, after);
}

// Validate every target before writing so upstream drift never applies half a patch.
for (const { target, source } of patches) await fs.writeFile(target, source);
