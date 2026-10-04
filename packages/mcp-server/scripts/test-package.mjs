import {testTempRoot} from '../../../scripts/test-temp-root.mjs';
process.env.TMPDIR=testTempRoot();
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(testTempRoot(), 'between-mcp-installed-'));
const packed = JSON.parse(execFileSync(process.execPath, [path.join(packageRoot, 'scripts/pack.mjs'), temporary], { encoding: 'utf8' }));
const archive = path.join(temporary, packed[0].filename);
writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ name: 'between-mcp-isolated-acceptance', private: true, version: '1.0.0', type: 'module' }));
const args = ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, '@modelcontextprotocol/client@2.3.0'];
if (process.env.BETWEEN_NPM_CACHE) args.push('--cache', process.env.BETWEEN_NPM_CACHE);
if (process.env.BETWEEN_OFFLINE === '1') args.push('--offline');
execFileSync('npm', args, { cwd: temporary, stdio: 'inherit', timeout: 180000 });
// Official better-sqlite3 13 ships prebuilds in its archive. No native binary or
// node_modules is copied from the repository; the installed ABI is exercised.
cpSync(path.join(packageRoot, 'tests/installed-protocol.mjs'), path.join(temporary, 'installed-protocol.mjs'));
const output = execFileSync(process.execPath, ['installed-protocol.mjs'], { cwd: temporary, encoding: 'utf8', timeout: 60000 });
process.stdout.write(output);
writeFileSync(path.join(packageRoot, 'package-test-result.json'), JSON.stringify({ archive, artifact_sha512: packed[0].integrity, ...JSON.parse(output) }, null, 2) + '\n');
