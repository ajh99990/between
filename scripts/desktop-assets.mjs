import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve('../..');
cpSync('src/renderer','dist/renderer',{recursive:true});
await (await import('esbuild')).build({entryPoints:['src/preload/preload.ts'],outfile:'dist/preload/preload.cjs',bundle:true,platform:'browser',format:'cjs',external:['electron']});
rmSync('resources',{recursive:true,force:true});mkdirSync('resources',{recursive:true});
for(const name of ['characters','skills'])cpSync(path.join(root,name),path.join('resources',name),{recursive:true});
cpSync(path.join(root,'packages/mcp-server/dist'),'resources/mcp',{recursive:true});
