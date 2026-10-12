import fs from 'node:fs/promises';
// ProComponents 3.1.14-2 forwards CSP to component styles, but not its token sheet.
// Keep the policy strict by forwarding the same existing nonce. Fail on upstream drift.
const base = new URL('../node_modules/@ant-design/pro-components/', import.meta.url);
const pkg = JSON.parse(await fs.readFile(new URL('package.json', base)));
if (pkg.version !== '3.1.14-2') throw new Error('Review Pro CSP patch for the installed version');
for (const file of ['es/provider/index.js', 'lib/provider/index.js']) {
  const url = new URL(file, base); const source = await fs.readFile(url, 'utf8');
  const before = '    salt,\n    override: finalToken,';
  const after = '    salt,\n    nonce: restConfig.csp?.nonce,\n    override: finalToken,';
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error(`Pro CSP patch target changed: ${file}`);
  await fs.writeFile(url, source.replace(before, after));
}
// rc portal scroll locking / scrollbar measurement call updateCSS without options.
// Scope the fallback to this dependency's trusted style injection, never patch DOM APIs.
const utilBase = new URL('../node_modules/@rc-component/util/', import.meta.url);
const utilPackage = JSON.parse(await fs.readFile(new URL('package.json', utilBase)));
if (utilPackage.version !== '1.12.0') throw new Error('Review rc util CSP patch for the installed version');
for (const file of ['es/Dom/dynamicCSS.js', 'lib/Dom/dynamicCSS.js']) {
  const url = new URL(file, utilBase); const source = await fs.readFile(url, 'utf8');
  const before = "  const styleNode = document.createElement('style');";
  const after = before + '\n  const betweenNonce = document.querySelector(\'meta[name="csp-nonce"]\')?.content;\n  if (betweenNonce) styleNode.nonce = betweenNonce;';
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error(`rc CSP patch target changed: ${file}`);
  await fs.writeFile(url, source.replace(before, after));
}
