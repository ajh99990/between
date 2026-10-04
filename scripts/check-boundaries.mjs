import {readFileSync,readdirSync,existsSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
const allowed={contracts:[],core:['contracts'],'host-qwen':['contracts'],'mcp-server':['contracts','core'],desktop:['contracts','core','host-qwen','mcp-server']};
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const name of Object.keys(allowed)){
 const dir=name==='desktop'?'apps/desktop':'packages/'+name,manifest=JSON.parse(readFileSync(dir+'/package.json','utf8'));
 for(const [dep,range]of Object.entries(manifest.dependencies??{}))if(dep.startsWith('@between/')){assert.ok(allowed[name].includes(dep.slice(9)),`${name} forbidden dependency ${dep}`);assert.equal(range,'workspace:*');}
 for(const file of walk(dir+'/src').filter(x=>/\.[cm]?[tj]s$/.test(x))){const text=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);const imports=[];const visit=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);if(ts.isCallExpression(node)&&((node.expression.kind===ts.SyntaxKind.ImportKeyword)||node.expression.getText(ast)==='require')&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))imports.push(node.arguments[0].text);ts.forEachChild(node,visit);};visit(ast);
 for(const spec of imports){if(spec.startsWith('.')){const resolved=path.resolve(path.dirname(file),spec);assert.ok(resolved.startsWith(path.resolve(dir)+'/'),`${file} cross-package relative import ${spec}`);}else if(spec.startsWith('@between/')){const other=spec.split('/')[1];assert.ok(allowed[name].includes(other),`${file} forbidden ${spec}`);const target=JSON.parse(readFileSync('packages/'+other+'/package.json','utf8')),sub=spec.slice(('@between/'+other).length);assert.ok(target.exports?.[sub?'.'+sub:'.'],`${file} private/deep import ${spec}`);}else{if(name==='contracts')assert.ok(spec==='zod',`contracts platform import ${spec}`);if(file.includes('/renderer/'))assert.ok(!spec.startsWith('node:')&&!['electron','better-sqlite3'].includes(spec),'renderer Node dependency');}}
 }
}
for(const old of ['src','electron','renderer','dist','package-lock.json','scripts/clean-build.mjs','scripts/copy-assets.mjs'])assert.ok(!existsSync(old),'legacy authoritative path remains: '+old);
console.log('workspace dependency boundaries and removed legacy paths passed');
const product=JSON.parse(readFileSync('package.json','utf8'));
for(const name of Object.keys(allowed)){const dir=name==='desktop'?'apps/desktop':'packages/'+name;assert.equal(JSON.parse(readFileSync(dir+'/package.json','utf8')).version,product.version,`${name} coordinated product version`);}
const skill=JSON.parse(readFileSync('skills/relationship/skill.json','utf8'));assert.equal(skill.version,product.version,'Skill coordinated version');
if(process.env.GITHUB_REF?.startsWith('refs/tags/'))assert.equal(process.env.GITHUB_REF,'refs/tags/v'+product.version,'release tag must equal coordinated version');
console.log('coordinated version '+product.version+'; required release tag v'+product.version+' (tag creation not implied)');
const workspace=readFileSync('pnpm-workspace.yaml','utf8');
assert.ok(!/onlyBuiltDependencies|neverBuiltDependencies|ignoredBuiltDependencies|ignoreScripts|ignoreDepScripts/.test(workspace),'removed/blanket build policy setting');
assert.match(workspace,/^strictDepBuilds: true$/m);assert.match(workspace,/^allowBuilds:$/m);
const buildMap=Object.fromEntries([...workspace.matchAll(/^  ([^\s:]+@\d+\.\d+\.\d+): (true|false)$/gm)].map(m=>[m[1],m[2]]));
assert.deepEqual(buildMap,{'better-sqlite3@13.0.3':'false','electron@44.5.1':'true','esbuild@0.25.12':'true'},'only exact reviewed native/build dependency scripts');
console.log('pnpm11 exact-version build policy checked');
