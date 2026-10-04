import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const external = Object.keys(manifest.dependencies).filter(name => !name.startsWith('@between/'));
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
rmSync(path.join(root, 'publish'), { recursive: true, force: true });
const result = await build({
  absWorkingDir: root, entryPoints: ['src/index.ts', 'src/cli.ts', 'src/trusted-host.ts', 'src/trusted-stdio.ts'],
  outdir: 'dist', bundle: true, platform: 'node', target: 'node24', format: 'esm',
  splitting: true, sourcemap: false, metafile: true, external, logLevel: 'warning',
});
for (const output of Object.values(result.metafile.outputs)) for (const imported of output.imports) {
  if (imported.external && (/^@between\//.test(imported.path) || /electron|qwen/i.test(imported.path))) throw Error(`Invalid distribution import: ${imported.path}`);
}
execFileSync('tsc', ['-p', path.join(root, 'tsconfig.json'), '--declaration', '--emitDeclarationOnly', '--outDir', path.join(root, 'dist/types')], { cwd: root, stdio: 'inherit' });
for (const name of ['index', 'trusted-host']) {
  const declaration = readFileSync(path.join(root, 'dist/types', name + '.d.ts'), 'utf8');
  if (declaration.includes('@between/')) throw Error('Private type escaped public API');
  writeFileSync(path.join(root, 'dist', name + '.d.ts'), declaration);
}
rmSync(path.join(root, 'dist/types'), { recursive: true, force: true });
chmodSync(path.join(root, 'dist/cli.js'), 0o755);
const { devDependencies, scripts, publishConfig, ...publishManifest } = manifest;
publishManifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).filter(([name]) => !name.startsWith('@between/')));
mkdirSync(path.join(root, 'publish'), { recursive: true });
cpSync(path.join(root, 'dist'), path.join(root, 'publish/dist'), { recursive: true });
cpSync(path.join(root, 'README.md'), path.join(root, 'publish/README.md'));
writeFileSync(path.join(root, 'publish/package.json'), JSON.stringify(publishManifest, null, 2) + '\n');
// Kept outside publish files, usable by repository boundary and provenance checks.
writeFileSync(path.join(root, 'build-meta.json'), JSON.stringify(result.metafile, null, 2) + '\n');
