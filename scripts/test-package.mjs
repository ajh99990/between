import {readFileSync,readdirSync} from 'node:fs';import {execFileSync} from 'node:child_process';import path from 'node:path';
const root=path.resolve('../..'),name=JSON.parse(readFileSync('package.json','utf8')).name.split('/')[1];
if(name==='contracts'){execFileSync(process.execPath,['scripts/test-contracts.mjs'],{cwd:root,stdio:'inherit'});process.exit(0);}
const group={desktop:['broker','renderer-protocol','trusted-page'], 'host-qwen':['qwen-adapter','runtime-config','verified-read']};
const files=readdirSync(path.join(root,'tests/integration/dist')).filter(n=>n.endsWith('.test.js')).filter(n=>name==='core'?![...group.desktop,...group['host-qwen'],'mcp'].includes(n.slice(0,-8)):group[name].includes(n.slice(0,-8)));
if(!files.length)throw Error('NO_PACKAGE_TESTS');execFileSync(process.execPath,['--test','--test-timeout=60000',...files.map(n=>'tests/integration/dist/'+n)],{cwd:root,stdio:'inherit'});
