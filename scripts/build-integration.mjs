import {build} from 'esbuild';import {readdirSync,rmSync} from 'node:fs';
rmSync('tests/integration/dist',{recursive:true,force:true});
await build({entryPoints:readdirSync('tests/integration').filter(n=>n.endsWith('.ts')).map(n=>'tests/integration/'+n),outdir:'tests/integration/dist',platform:'node',format:'esm',target:'node24',bundle:false});
