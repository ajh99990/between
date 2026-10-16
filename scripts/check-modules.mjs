// Parse the executable application and verify static imports without executing it.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire, isBuiltin} from 'node:module';
import {parse} from 'acorn';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[];
async function collect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(['node_modules','dist','evidence','artifacts','.umi','.umi-production'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await collect(file);else if(/\.(?:mjs|js)$/.test(entry.name))files.push(file);}}
for(const dir of ['apps/server','packages/role-engine','scripts','tests','apps/admin/scripts','apps/admin/tests'])await collect(path.join(root,dir));
let imports=0;
for(const file of files){const ast=parse(await fs.readFile(file,'utf8'),{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});const require=createRequire(file);
 for(const node of ast.body){const source=node.source?.value;if(typeof source!=='string'||isBuiltin(source)||source.startsWith('data:'))continue;require.resolve(source);imports++;}
}
console.log(`PASS: ${files.length} executable modules parsed; ${imports} static imports resolved without running application code`);
