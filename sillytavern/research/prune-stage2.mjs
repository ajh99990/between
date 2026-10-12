// Structural deletion only: retained statements are slices of pinned upstream source.
import fs from 'node:fs';import path from 'node:path';import {parse} from '../baseline/node_modules/acorn/dist/acorn.mjs';
const root=process.argv[2]||'/workspace/st-research/minimal';
const parseJS=s=>parse(s,{ecmaVersion:'latest',sourceType:'module'});
const walk=(n,f)=>{if(!n||typeof n!=='object')return;f(n);for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(x=>walk(x,f));else if(v&&typeof v==='object')walk(v,f);}};
const apply=(s,edits)=>edits.sort((a,b)=>b[0]-a[0]).reduce((v,[a,b,t])=>v.slice(0,a)+t+v.slice(b),s);
const ccPath=root+'/src/endpoints/backends/chat-completions.js';let source=fs.readFileSync(ccPath,'utf8');let ast=parseJS(source);
const imports=ast.body.filter(n=>n.type==='ImportDeclaration');
let kept=ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.object?.name==='router'&&['/generate','/status'].includes(n.expression.arguments[0]?.value));
let chunks=kept.map(n=>{let s=source.slice(n.start,n.end);let edits=[];walk(parseJS(s),x=>{
if(x.type==='SwitchStatement'&&s.slice(x.discriminant.start,x.discriminant.end)==='request.body.chat_completion_source')edits.push([x.start,x.end,'']);
if(x.type==='IfStatement'&&s.slice(x.test.start,x.test.end)==='request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.OPENAI'){
let branch=x;while(branch&&s.slice(branch.test.start,branch.test.end)!=='request.body.chat_completion_source === CHAT_COMPLETION_SOURCES.CUSTOM')branch=branch.alternate;
if(branch)edits.push([x.start,x.end,s.slice(branch.consequent.start,branch.consequent.end)]);
}});return apply(s,edits);});
let body=`export const router = express.Router();
// Research slice: fail explicitly before any provider or tokenizer fallback.
router.use((req,res,next)=>{
 if(req.body?.chat_completion_source!=='custom')return res.status(422).json({error:{message:'Research slice supports only custom chat-completions'}});
 if(req.path==='/generate' && (req.body.stream || !Array.isArray(req.body.messages) || req.body.messages.some(m=>typeof m.content!=='string') || req.body.tools?.length || req.body.json_schema || req.body.logit_bias && Object.keys(req.body.logit_bias).length || !/^gpt-/.test(req.body.model||'')))return res.status(422).json({error:{message:'Research slice requires non-streaming text messages, GPT tokenizer, no tools/schema/logit bias'}});
 next();
});\n`+chunks.join('\n\n')+`\nrouter.use((_req,res)=>res.status(501).json({error:{message:'Endpoint removed from research slice'}}));\n`;
const used=new Set();walk(parseJS(body),n=>{if(n.type==='Identifier')used.add(n.name);});
let newImports=imports.flatMap(n=>{const specs=n.specifiers.filter(s=>used.has(s.local.name));if(!specs.length)return[];const def=specs.filter(s=>s.type==='ImportDefaultSpecifier').map(s=>s.local.name);const named=specs.filter(s=>s.type==='ImportSpecifier').map(s=>s.imported.name===s.local.name?s.local.name:`${s.imported.name} as ${s.local.name}`);return `import ${[...def,...(named.length?['{ '+named.join(', ')+' }']:[])].join(', ')} from ${JSON.stringify(n.source.value)};`;});
fs.writeFileSync(ccPath,'// Modified research slice of SillyTavern 06bde939f; AGPL-3.0. See LICENSE and research/SOURCE.md.\n'+newImports.join('\n')+'\n\n'+body);
// Tokenizers: keep original tiktoken routines and original OpenAI routes, delete unreachable foreign tokenizer dispatch.
const tp=root+'/src/endpoints/tokenizers.js';source=fs.readFileSync(tp,'utf8');ast=parseJS(source);
const names=new Set(['tokenizersCache','TEXT_COMPLETION_MODELS','BYTES_PER_TOKEN','guesstimate','getTiktokenChunks','getTokenizerModel','getTiktokenTokenizer','createTiktokenEncodingHandler','createTiktokenDecodingHandler','router']);
let nodes=ast.body.filter(n=>{const d=n.declaration||n;return names.has(d.id?.name)||d.declarations?.some(x=>names.has(x.id.name))||n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.object?.name==='router'&&['/openai/encode','/openai/decode','/openai/count'].includes(n.expression.arguments[0]?.value);});
chunks=nodes.map(n=>{let s=source.slice(n.start,n.end);if(!s.startsWith('router.post'))return s;const edits=[];walk(parseJS(s),x=>{if(x.type==='IfStatement'){const condition=s.slice(x.test.start,x.test.end);if((condition.startsWith('queryModel.includes')&&!condition.includes('gpt-'))||condition.startsWith('model ==='))edits.push([x.start,x.end,'']);}});return apply(s,edits);});
let text="// Retained upstream tiktoken implementation; research slice, AGPL-3.0.\nimport express from 'express';\nimport tiktoken from 'tiktoken';\nimport { Buffer } from 'node:buffer';\n"+chunks.join('\n\n');
text=text.replace('export const router = express.Router();',`export const router = express.Router();
router.use((req,res,next)=>{const model=String(req.query.model||'');if(!req.path.startsWith('/openai/') || model && !/^(gpt-|o[134])/.test(model))return res.status(422).json({error:'Only OpenAI tiktoken tokenization is retained'});next();});`);
fs.writeFileSync(tp,text);
// Cut whole optional server endpoints and their registrations. Keep original auth, CSRF, persistence, character and WI APIs.
const remove=new Set(['images','google','anthropic','novelai','assets','sprites','stable-diffusion','horde','vectors','translate','classify','caption','search','openrouter','nanogpt','backends/kobold','backends/text-completions','speech','azure','minimax','volcengine','image-metadata']);
const sp=root+'/src/server-startup.js';let ss=fs.readFileSync(sp,'utf8');const symbols=[];
ss=ss.replace(/^import \{ router as (\w+) \} from '\.\/endpoints\/(.+)\.js';\n/gm,(line,sym,file)=>{if(remove.has(file)){symbols.push(sym);return '';}return line;});
ss=ss.split('\n').filter(line=>!symbols.some(sym=>line.includes(', '+sym+')'))).join('\n');
// Requests for removed routes must fail explicitly rather than pretending success.
ss=ss.replace('export function setupPrivateEndpoints(app) {',`export function setupPrivateEndpoints(app) {
    app.use(['/api/images','/api/google','/api/anthropic','/api/novelai','/api/assets','/api/sprites','/api/sd','/api/horde','/api/vector','/api/translate','/api/extra','/api/search','/api/openrouter','/api/nanogpt','/api/backends/kobold','/api/backends/text-completions','/api/speech','/api/azure','/api/minimax','/api/volcengine','/api/image-metadata'], (_req,res)=>res.status(501).json({error:'Feature removed from research slice'}));
    app.use('/api/extensions', (req,res,next)=> req.path==='/discover' ? res.json([]) : res.status(501).json({error:'Extensions removed from research slice'}));`);
fs.writeFileSync(sp,ss);
for(const p of remove)if(!['image-metadata','sprites','assets'].includes(p))fs.rmSync(root+'/src/endpoints/'+p+'.js');
fs.rmSync(root+'/src/tokenizers',{recursive:true});fs.rmSync(root+'/src/vectors',{recursive:true});fs.rmSync(root+'/src/transformers.js');fs.rmSync(root+'/src/electron',{recursive:true});
// Guard the original front-end orchestration; its algorithms remain untouched.
const fp=root+'/public/script.js';let front=fs.readFileSync(fp,'utf8');front=front.replace("    console.log('Generate entered');",`    // Explicit support envelope for this research slice (upstream algorithms below).
    if (selected_group || main_api !== 'openai' || oai_settings.chat_completion_source !== 'custom' || !['normal','regenerate',undefined].includes(type) || oai_settings.stream_openai) {
        throw new Error('Research slice supports single-character, non-streaming custom chat-completions: normal/regenerate only');
    }
    console.log('Generate entered');`);fs.writeFileSync(fp,front);
// Defaults match the slice; retained UI still exposes some disabled controls, with server-side rejection.
const dp=root+'/default/content/settings.json';let settings=JSON.parse(fs.readFileSync(dp));settings.main_api='openai';settings.oai_settings??={};Object.assign(settings.oai_settings,{chat_completion_source:'custom',stream_openai:false});fs.writeFileSync(dp,JSON.stringify(settings,null,4)+'\n');
// Remove development/distribution scaffolding only; upstream tests stay intact.
for(const p of ['colab','docker','Dockerfile','Remote-Link.cmd','Start.bat','Update-Instructions.txt','UpdateAndStart.bat','UpdateForkAndStart.bat','replit.nix'])fs.rmSync(root+'/'+p,{recursive:true,force:true});
const pkgPath=root+'/package.json',pkg=JSON.parse(fs.readFileSync(pkgPath));for(const p of ['@agnai/sentencepiece-js','@agnai/web-tokenizers','@zeldafan0225/ai_horde','bing-translate-api','google-translate-api-x','sillytavern-transformers','vectra','wavefile'])delete pkg.dependencies[p];delete pkg.overrides.vectra;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,4)+'\n');
console.log('Stage 2 structural pruning complete');
