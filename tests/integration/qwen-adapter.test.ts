import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync,writeFileSync,mkdirSync,readFileSync,symlinkSync,realpathSync,linkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ManagedQwenAdapter,verifyManagedRuntime,type ManagedQwenAdapterOptions,type ManagedQueryOptions,type SDKQueryFactory} from '@between/host-qwen/qwen-adapter';
import {SESSION_TOOLS,type HostTurn,type HostEvent,type NativeProviderAttempt} from '@between/contracts/host';

const root=path.resolve('apps/desktop/resources');
const off=()=>({capture_status:'disabled' as const});
const turn=(changes:Partial<HostTurn>={}):HostTurn=>({schema_version:1,conversation_id:'SYNTHETIC_SCOPE',turn_id:randomUUID(),execution_id:randomUUID(),trace_id:'a'.repeat(32),traceparent:'00-'+'a'.repeat(32)+'-'+'b'.repeat(16)+'-01',grant:'SYNTHETIC_GRANT',input:'SYNTHETIC current input',memory:true,sessionToolAllowlist:SESSION_TOOLS,...changes});
function provider(phase:'started'|'finished',overrides:Partial<NativeProviderAttempt>={}):NativeProviderAttempt{
  return {schema_version:1,sequence:phase==='started'?0:1,event_id:randomUUID(),phase,attempt_id:'SYNTHETIC_ATTEMPT',attempt_index:0,retry_index:0,exchange_id:'SYNTHETIC_EXCHANGE',attempt_reason:'initial',provider:'openai',model:'SYNTHETIC_MODEL',correlation_status:'unmatched',trace_id:'0'.repeat(32),span_id:'0'.repeat(16),parent_span_id:'0'.repeat(16),started_at:'2026-10-04T00:00:00Z',...(phase==='finished'?{ended_at:'2026-10-04T00:00:01Z'}:{}),status:phase==='started'?'running':'success',response_complete:phase==='finished',request:off(),input:off(),system:off(),tools:off(),output:off(),usage:phase==='finished'?{capture_status:'present',value:{prompt_tokens:7,completion_tokens:3}}:off(),...overrides};
}
const wire=(options:ManagedQueryOptions,data:NativeProviderAttempt)=>({type:'system',subtype:'provider_attempt',uuid:data.event_id,session_id:options.sessionId,data});
const init=(o:ManagedQueryOptions)=>({type:'system',subtype:'init',uuid:randomUUID(),session_id:o.sessionId,qwen_code_version:'0.24.7',tools:[...SESSION_TOOLS]});
const policy=(o:ManagedQueryOptions,changes:Record<string,unknown>={})=>({type:'system',subtype:'host_policy',uuid:randomUUID(),session_id:o.sessionId,data:{schema_version:1,managed_host_contract_version:1,source:'runtime_config',session_id:o.sessionId,effective_session_tool_allowlist:[...SESSION_TOOLS],registered_tools:[...SESSION_TOOLS],hooks_status:'present',unmanaged_hooks_blocked:true,sdk_hooks:o.hooks.map(h=>({event:h.event,matcher:h.matcher,name:'sdk:'+randomUUID(),timeout_ms:h.timeoutMs+1000})),...changes}});
const success=(o:ManagedQueryOptions,changes:Record<string,unknown>={})=>({type:'result',subtype:'success',is_error:false,uuid:randomUUID(),session_id:o.sessionId,result:'SYNTHETIC character reply',provider_attempt_id:'SYNTHETIC_ATTEMPT',provider_attempt_ids:['SYNTHETIC_ATTEMPT'],permission_denials:[],...changes});
type Scenario=(o:ManagedQueryOptions)=>AsyncGenerator<unknown>;
function setup(scenario:Scenario,options:Partial<ManagedQwenAdapterOptions>={}){
  const dir=mkdtempSync(path.join(os.tmpdir(),'qwen-adapter-synthetic-'));
  const calls:{prompt:string;options:ManagedQueryOptions}[]=[],closed:string[]=[];
  const query:SDKQueryFactory=request=>{calls.push(request);return {[Symbol.asyncIterator]:()=>scenario(request.options),close:async()=>{closed.push(request.options.sessionId)}}};
  const adapter=new ManagedQwenAdapter({root,databasePath:path.join(dir,'synthetic.db'),runtimeRoot:path.join(dir,'runtime'),query,...options});
  return {adapter,calls,closed,dir,cleanup:async()=>{await adapter.close();rmSync(dir,{recursive:true,force:true})}};
}
async function* happy(o:ManagedQueryOptions){yield policy(o);yield init(o);yield wire(o,provider('started'));yield wire(o,provider('finished'));yield success(o)}
async function collect(host:ManagedQwenAdapter,input=turn()){const result:HostEvent[]=[];for await(const event of host.startTurn(input))result.push(event);return result}
const failure=(events:HostEvent[])=>events.find((event):event is Extract<HostEvent,{type:'failure'}>=>event.type==='failure');

test('fresh SDK query binds exact policy, isolated env, relationship MCP, hooks and disables recording',async()=>{
  const s=setup(happy);const input=turn();process.env.ADAPTER_GLOBAL_SECRET_CANARY='NEVER_INHERIT';
  try{
    const events=await collect(s.adapter,input),o=s.calls[0].options;
    assert.equal(events.at(-1)?.type,'result');assert.equal(events[0].type,'policy');
    assert.deepEqual(o.sessionToolAllowlist,SESSION_TOOLS);assert.deepEqual(o.allowedTools,SESSION_TOOLS);
    assert.equal(o.chatRecording,false);assert.equal(o.captureProviderContent,false);assert.equal(o.authType,'openai');
    assert.equal(o.env.ADAPTER_GLOBAL_SECRET_CANARY,undefined);assert.equal(o.env.REL_GRANT,undefined);
    assert.notEqual(o.env.HOME,process.env.HOME);assert.ok(path.isAbsolute(o.env.QWEN_RUNTIME_DIR));
    assert.deepEqual(Object.keys(o.mcpServers),['relationship']);
    assert.equal(o.mcpServers.relationship.env.REL_SCOPE,input.conversation_id);
    assert.equal(o.mcpServers.relationship.env.REL_GRANT,input.grant);
    assert.equal(o.mcpServers.relationship.env.REL_CHARACTER,undefined);assert.equal(o.mcpServers.relationship.env.REL_CHARACTER_SHA256,createHash('sha256').update(o.mcpServers.relationship.env.REL_CHARACTER_JSON).digest('hex'));assert.equal(JSON.parse(o.mcpServers.relationship.env.REL_CHARACTER_JSON).id,JSON.parse(readFileSync(path.join(root,'characters/alan.json'),'utf8')).id);
    assert.equal(o.mcpServers.relationship.args[0],path.join(root,'mcp/trusted-stdio.js'));
    assert.equal(o.mcpServers.relationship.env.REL_EPHEMERAL,undefined);
    assert.ok(o.hooks.every(h=>typeof h.callback==='function'));assert.deepEqual(s.closed,[input.execution_id]);
    assert.ok(!existsSync(o.cwd));assert.ok(!JSON.stringify(events).includes(input.grant));
    assert.ok(!s.calls[0].prompt.includes(input.input));
    events.forEach((event,index)=>{assert.equal(event.sequence,index);assert.equal(event.execution_id,input.execution_id);assert.equal(event.trace_id,input.trace_id)});
  }finally{delete process.env.ADAPTER_GLOBAL_SECRET_CANARY;await s.cleanup()}
});

test('native provider IDs, unmatched status, semantic usage and event dedupe survive separately from product trace',async()=>{
  const start=provider('started'),finish=provider('finished');
  const s=setup(async function*(o){yield init(o);yield policy(o);yield wire(o,start);yield wire(o,start);yield wire(o,finish);yield wire(o,finish);yield success(o)});
  try{const events=await collect(s.adapter),attempts=events.filter(e=>e.type==='attempt_started'||e.type==='attempt_finished');assert.equal(attempts.length,2);assert.equal(attempts[0].event_id,start.event_id);assert.equal(attempts[0].native_attempt?.correlation_status,'unmatched');assert.equal(attempts[0].native_attempt?.trace_id,'0'.repeat(32));assert.equal(attempts[0].trace_id,'a'.repeat(32));assert.equal(attempts[1].native_attempt?.exchange_id,'SYNTHETIC_EXCHANGE');assert.deepEqual((attempts[1] as Extract<HostEvent,{type:'attempt_finished'}>).usage,{input_tokens:7,output_tokens:3})}finally{await s.cleanup()}
});

test('runtime readback missing or wider tools never becomes a requested-options policy success',async()=>{
  for(const mode of ['missing','wider','hooks','version','registered'] as const){
    const s=setup(async function*(o){yield init(o);if(mode!=='missing')yield policy(o,mode==='wider'?{effective_session_tool_allowlist:[...SESSION_TOOLS,'shell']}:mode==='hooks'?{sdk_hooks:[]}:mode==='version'?{managed_host_contract_version:2}:{registered_tools:[...SESSION_TOOLS,'shell']});yield success(o)});
    try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_POLICY_UNVERIFIED');assert.ok(!events.some(e=>e.type==='result'||e.type==='policy'))}finally{await s.cleanup()}
  }
});

test('structured SDK errors and assistant error-shaped text never become role output',async()=>{
  const s=setup(async function*(o){yield policy(o);yield init(o);yield wire(o,provider('started'));yield {type:'assistant',session_id:o.sessionId,message:{content:[{type:'text',text:'[API Error: SYNTHETIC_AUTH_SECRET]'}]}};yield wire(o,provider('finished',{status:'error',response_complete:false,error:{type:'AuthenticationError',status:401}}));yield success(o,{subtype:'error_during_execution',is_error:true,error:{message:'SYNTHETIC_AUTH_SECRET'}})});
  try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_AUTH_OR_API_ERROR');assert.ok(!events.some(e=>e.type==='result'));assert.ok(!JSON.stringify(events).includes('SYNTHETIC_AUTH_SECRET'))}finally{await s.cleanup()}
});

test('explicit final attempt association required; complete partial/error attempts cannot be claimed as a reply',async()=>{
  for(const mode of ['missing','wrong','partial','failed'] as const){const s=setup(async function*(o){yield init(o);yield policy(o);yield wire(o,provider('started'));yield wire(o,provider('finished',mode==='partial'?{status:'incomplete',response_complete:false}:mode==='failed'?{status:'error',response_complete:false}:{}));yield success(o,mode==='missing'?{provider_attempt_id:undefined}:mode==='wrong'?{provider_attempt_id:'foreign'}:{})});
    try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'ATTEMPT_EVIDENCE_MISSING');assert.ok(!events.some(e=>e.type==='result'))}finally{await s.cleanup()}
  }
});

test('function hooks record bound tool IDs and operations; block memory writes when memory is off',async()=>{
  let permitted:boolean|void|undefined,denied:boolean|void|undefined;
  const input=turn({memory:false});
  const s=setup(async function*(o){yield policy(o);yield init(o);const before=o.hooks.find(h=>h.event==='PreToolUse')!,after=o.hooks.find(h=>h.event==='PostToolUse')!;const hook={session_id:o.sessionId,tool_name:SESSION_TOOLS[0],tool_use_id:'internal-tool',tool_call_id:'native-tool',tool_input:{}};const context={signal:o.abortController.signal,toolUseId:'internal-tool'};permitted=await before.callback(hook,context);await after.callback({...hook,tool_response:{}},context);yield wire(o,provider('started'));denied=await before.callback({...hook,tool_name:SESSION_TOOLS[1],tool_input:{quote:'SYNTHETIC',operation_id:'operation-1'}},context);yield wire(o,provider('finished'))},{getEphemeral:i=>({turn:{id:i.turn_id,token:i.grant,text:i.input,memory:false,source:'SYNTHETIC',revision:0,epoch:0},messages:[]})});
  try{const events=await collect(s.adapter,input);assert.equal(permitted,true);assert.equal(denied,false);const tools=events.filter(e=>e.type==='tool');assert.equal(tools.length,2);assert.equal(tools[0].tool_call_id,'native-tool');assert.equal(failure(events)?.code,'HOST_TOOL_BOUNDARY_FAILED');assert.ok(!events.some(e=>e.type==='result'))}finally{await s.cleanup()}
});

test('off-mode transient input must match grant and excludes pending character history',async()=>{
  const input=turn({memory:false});
  const s=setup(happy,{getEphemeral:i=>({turn:{id:i.turn_id,token:i.grant,text:i.input,memory:false,source:'SYNTHETIC',revision:0,epoch:0},messages:[{id:'old',role:'character',text:'CONFIRMED',status:'confirmed',at:1},{id:'pending',role:'character',text:'PENDING_MUST_NOT_LEAK',status:'pending',at:2}]})});
  try{assert.equal((await collect(s.adapter,input)).at(-1)?.type,'result');const raw=s.calls[0].options.mcpServers.relationship.env.REL_EPHEMERAL;assert.equal(JSON.parse(raw).turn.token,input.grant);assert.equal(JSON.parse(raw).messages.length,1);assert.ok(!raw.includes('PENDING_MUST_NOT_LEAK'))}finally{await s.cleanup()}
  const denied=setup(happy);try{const events=await collect(denied.adapter,turn({memory:false}));assert.equal(failure(events)?.code,'OFF_INPUT_UNAVAILABLE');assert.equal(denied.calls.length,0)}finally{await denied.cleanup()}
});

test('cancel interrupts pending SDK iterator, closes once and cleans isolated files',async()=>{
  let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
  const s=setup(async function*(o){yield policy(o);yield init(o);started();await new Promise(()=>{});});
  try{const input=turn(),eventsPromise=collect(s.adapter,input);await ready;await s.adapter.cancelTurn(input.execution_id);const events=await eventsPromise;assert.equal(failure(events)?.code,'TURN_CANCELLED');assert.deepEqual(s.closed,[input.execution_id]);assert.ok(!existsSync(s.calls[0].options.cwd))}finally{await s.cleanup()}
});

test('close cancels all running processes and new execution fails closed',async()=>{
  let count=0,started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const s=setup(async function*(o){yield policy(o);yield init(o);if(++count===2)started();await new Promise(()=>{});});
  try{const a=collect(s.adapter),b=collect(s.adapter);await ready;await s.adapter.close();assert.equal(failure(await a)?.code,'TURN_CANCELLED');assert.equal(failure(await b)?.code,'TURN_CANCELLED');assert.equal(s.closed.length,2);assert.equal(failure(await collect(s.adapter))?.code,'HOST_CLOSED')}finally{await s.cleanup()}
});

test('resume is fresh authoritative re-entry with explicit lineage, never CLI checkpoint reuse',async()=>{
  const s=setup(happy);try{const first=turn();await collect(s.adapter,first);const second=turn({resumes_execution_id:first.execution_id});const events:HostEvent[]=[];for await(const e of s.adapter.resumeExecution(second))events.push(e);assert.equal(events.at(-1)?.type,'result');assert.equal(s.calls.length,2);assert.notEqual(s.calls[0].options.cwd,s.calls[1].options.cwd);assert.equal((s.calls[1].options as unknown as Record<string,unknown>).resume,undefined);assert.ok(events.every(e=>e.resumes_execution_id===first.execution_id));assert.equal(failure(await collect(s.adapter,first))?.code,'HOST_EXECUTION_REUSED')}finally{await s.cleanup()}
});

test('production unavailable paths/hash never fallback to unpatched SDK or simulated reply',async()=>{
  const adapter=new ManagedQwenAdapter({root,databasePath:'/synthetic/state.db'});try{const events=await collect(adapter);assert.equal(failure(events)?.code,'HOST_UNAVAILABLE');assert.equal(events.length,1)}finally{await adapter.close()}
  const dir=mkdtempSync(path.join(os.tmpdir(),'qwen-invalid-build-'));const module=path.join(dir,'sdk.mjs');writeFileSync(module,'throw new Error("MUST NOT IMPORT");');
  const invalid=new ManagedQwenAdapter({root,databasePath:path.join(dir,'state.db'),sdkModulePath:module,cliPath:module,sdkSha256:'0'.repeat(64),cliSha256:'0'.repeat(64)});
  try{assert.equal(failure(await collect(invalid))?.code,'HOST_UNAVAILABLE')}finally{await invalid.close();rmSync(dir,{recursive:true,force:true})}
});

test('unexpected global-env keys and incoming session mismatch are rejected',async()=>{
  const env=setup(happy,{providerEnv:{NODE_OPTIONS:'--require untrusted'}});try{assert.equal(failure(await collect(env.adapter))?.code,'HOST_ENV_REJECTED');assert.equal(env.calls.length,0)}finally{await env.cleanup()}
  const session=setup(async function*(o){yield {...init(o),session_id:'FOREIGN'};yield policy(o)});try{assert.equal(failure(await collect(session.adapter))?.code,'HOST_CONTEXT_MISMATCH')}finally{await session.cleanup()}
});

test('unapproved native content fails closed; synthetic opt-in alone preserves explicit captures',async()=>{
  const scenario:Scenario=async function*(o){yield policy(o);yield init(o);yield wire(o,provider('started',{input:{capture_status:'present',value:'SYNTHETIC_PAYLOAD'}}));yield wire(o,provider('finished',{output:{capture_status:'present',value:'SYNTHETIC_OUTPUT'}}));yield success(o)};
  const s=setup(scenario);try{const events=await collect(s.adapter);assert.ok(!JSON.stringify(events).includes('SYNTHETIC_PAYLOAD'));assert.ok(!JSON.stringify(events).includes('SYNTHETIC_OUTPUT'));assert.equal(failure(events)?.code,'HOST_CAPTURE_POLICY_VIOLATION')}finally{await s.cleanup()}
  const enabled=setup(scenario,{captureSyntheticContent:true});try{const events=await collect(enabled.adapter);assert.ok(JSON.stringify(events).includes('SYNTHETIC_PAYLOAD'));assert.equal(enabled.calls[0].options.captureProviderContent,true)}finally{await enabled.cleanup()}
});

test('continuation contributor IDs are retained without fabricating completion or terminal attribution',async()=>{
  const s=setup(async function*(o){yield init(o);yield policy(o);yield wire(o,provider('started',{attempt_id:'partial'}));yield wire(o,provider('finished',{attempt_id:'partial',status:'incomplete',response_complete:false}));yield wire(o,provider('started'));yield wire(o,provider('finished'));yield success(o,{provider_attempt_ids:['partial','unobserved','SYNTHETIC_ATTEMPT']})});
  try{const events=await collect(s.adapter);const result=events.find((e):e is Extract<HostEvent,{type:'result'}>=>e.type==='result');assert.deepEqual(result?.contributing_attempt_ids,['partial','unobserved','SYNTHETIC_ATTEMPT']);assert.equal(result?.attempt_id,'SYNTHETIC_ATTEMPT');assert.equal(events.filter(e=>e.type==='attempt_finished'&&e.attempt_id==='partial')[0].type,'attempt_finished')}finally{await s.cleanup()}
});

test('relationship MCP receives no provider secrets even when host receives explicit provider env',async()=>{
  const s=setup(happy,{providerEnv:{OPENAI_API_KEY:'SYNTHETIC_NOT_REAL_KEY',OPENAI_BASE_URL:'https://synthetic.invalid'}});
  try{const events=await collect(s.adapter);assert.equal(s.calls[0].options.env.OPENAI_API_KEY,'SYNTHETIC_NOT_REAL_KEY');assert.equal(s.calls[0].options.mcpServers.relationship.env.OPENAI_API_KEY,'');assert.equal(s.calls[0].options.mcpServers.relationship.env.OPENAI_BASE_URL,'');assert.ok(!JSON.stringify(events).includes('SYNTHETIC_NOT_REAL_KEY'))}finally{await s.cleanup()}
});

test('timeout terminates a hung injected query and failure never includes thrown secret text',async()=>{
  const s=setup(async function*(o){yield policy(o);yield init(o);await new Promise(()=>{})},{timeoutMs:20});
  try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_TIMEOUT');assert.equal(s.closed.length,1)}finally{await s.cleanup()}
  const error=setup(async function*(){throw new Error('SYNTHETIC_SECRET_EXCEPTION')});
  try{const events=await collect(error.adapter);assert.equal(failure(events)?.code,'HOST_UNAVAILABLE');assert.ok(!JSON.stringify(events).includes('SYNTHETIC_SECRET_EXCEPTION'))}finally{await error.cleanup()}
});

test('duplicate provider event conflicts, finished-without-start, and changed response IDs fail closed',async()=>{
  for(const mode of ['conflict','missing-start','response-id'] as const){const start=provider('started');const s=setup(async function*(o){yield policy(o);yield init(o);if(mode!=='missing-start')yield wire(o,start);if(mode==='conflict')yield wire(o,{...start,model:'CHANGED'});yield wire(o,provider('finished',{response_id:'actual-response'}));yield success(o,{response_id:'different-response'})});
    try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,mode==='conflict'?'HOST_EVENT_CONFLICT':'ATTEMPT_EVIDENCE_MISSING');assert.ok(!events.some(e=>e.type==='result'))}finally{await s.cleanup()}
  }
});

function runtimeFixture(){
  const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'qwen-runtime-manifest-'))),runtime=path.join(dir,'runtime');
  const files:Record<string,string>={'dist/cli.js':'throw new Error("SYNTHETIC_CLI_MUST_NOT_RUN");','dist/chunks/chunk.js':'export const frozen=1;','packages/sdk-typescript/dist/index.mjs':'throw new Error("SYNTHETIC_SDK_MUST_NOT_IMPORT");','packages/sdk-typescript/dist/vendor/dep.js':'export const dependency=1;'};
  for(const [file,content] of Object.entries(files)){mkdirSync(path.dirname(path.join(runtime,file)),{recursive:true});writeFileSync(path.join(runtime,file),content)}
  const hash=(content:string|Buffer)=>createHash('sha256').update(content).digest('hex');
  const manifest:Record<string,{path:string;bytes:number;sha256:string}[]>={'dist':[],'packages/sdk-typescript/dist':[]};
  for(const [file,content] of Object.entries(files))manifest[file.startsWith('dist/')?'dist':'packages/sdk-typescript/dist'].push({path:file,bytes:Buffer.byteLength(content),sha256:hash(content)});
  const manifestPath=path.join(dir,'runtime-manifest.json');writeFileSync(manifestPath,JSON.stringify(manifest));
  const options:ManagedQwenAdapterOptions={root,databasePath:path.join(dir,'unused.db'),provider:'openai',providerEnv:{OPENAI_API_KEY:'SYNTHETIC_NOT_REAL_KEY'},runtimeRootPath:runtime,runtimeManifestPath:manifestPath,runtimeManifestSha256:hash(readFileSync(manifestPath)),sdkModulePath:path.join(runtime,'packages/sdk-typescript/dist/index.mjs'),cliPath:path.join(runtime,'dist/cli.js'),sdkSha256:hash(files['packages/sdk-typescript/dist/index.mjs']),cliSha256:hash(files['dist/cli.js'])};
  return {dir,runtime,files,manifest,options,rewriteManifest(){writeFileSync(manifestPath,JSON.stringify(manifest));options.runtimeManifestSha256=hash(readFileSync(manifestPath))},cleanup(){rmSync(dir,{recursive:true,force:true})}};
}

test('full runtime manifest verifies every file without import; same-size chunk tampering prevents production SDK load',async()=>{
  const f=runtimeFixture();
  try{
    const verified=await verifyManagedRuntime(f.options);assert.equal(verified.file_count,4);assert.equal(verified.total_bytes,Object.values(f.files).reduce((sum,text)=>sum+Buffer.byteLength(text),0));
    const chunk=path.join(f.runtime,'dist/chunks/chunk.js');writeFileSync(chunk,f.files['dist/chunks/chunk.js'].replace('=1','=2'));
    await assert.rejects(verifyManagedRuntime(f.options),/HOST_BUILD_UNVERIFIED/);
    const host=new ManagedQwenAdapter(f.options);try{const events=await collect(host);assert.equal(failure(events)?.code,'HOST_BUILD_UNVERIFIED');assert.ok(!JSON.stringify(events).includes('MUST_NOT_IMPORT'))}finally{await host.close()}
  }finally{f.cleanup()}
});

test('manifest omissions, extra vendor files, bytes/hash mismatches and missing entry membership fail closed',async()=>{
  for(const mode of ['omitted-chunk','extra-vendor','wrong-bytes','entry-membership','manifest-hash','entry-hash'] as const){const f=runtimeFixture();
    try{
      if(mode==='omitted-chunk'){f.manifest.dist=f.manifest.dist.filter(e=>!e.path.includes('chunk'));f.rewriteManifest()}
      if(mode==='extra-vendor')writeFileSync(path.join(f.runtime,'packages/sdk-typescript/dist/vendor/extra.js'),'UNLISTED');
      if(mode==='wrong-bytes'){f.manifest.dist[0].bytes++;f.rewriteManifest()}
      if(mode==='entry-membership'){f.manifest.dist=f.manifest.dist.filter(e=>!e.path.endsWith('cli.js'));f.rewriteManifest()}
      if(mode==='manifest-hash')f.options.runtimeManifestSha256='0'.repeat(64);
      if(mode==='entry-hash')f.options.sdkSha256='0'.repeat(64);
      await assert.rejects(verifyManagedRuntime(f.options),/HOST_BUILD_UNVERIFIED/);
    }finally{f.cleanup()}
  }
});

test('manifest paths cannot traverse, alias, duplicate or escape the frozen runtime tree',async()=>{
  for(const bad of ['dist/../outside.js','/absolute.js','dist//chunk.js','dist/./chunk.js','dist\\chunk.js','dist/chunks/../../../outside.js']){const f=runtimeFixture();
    try{f.manifest.dist[0].path=bad;f.rewriteManifest();await assert.rejects(verifyManagedRuntime(f.options),/HOST_BUILD_UNVERIFIED/)}finally{f.cleanup()}
  }
  const duplicate=runtimeFixture();try{duplicate.manifest.dist.push({...duplicate.manifest.dist[0]});duplicate.rewriteManifest();await assert.rejects(verifyManagedRuntime(duplicate.options),/HOST_BUILD_UNVERIFIED/)}finally{duplicate.cleanup()}
  const outside=runtimeFixture();try{outside.options.sdkModulePath=path.join(outside.dir,'outside.mjs');writeFileSync(outside.options.sdkModulePath,'OUTSIDE');await assert.rejects(verifyManagedRuntime(outside.options),/HOST_BUILD_UNVERIFIED/)}finally{outside.cleanup()}
});

test('runtime and manifest symlinks are rejected even when target bytes match',async()=>{
  for(const mode of ['file','directory','manifest','runtime-root'] as const){const f=runtimeFixture();
    try{
      if(mode==='file'){const target=path.join(f.dir,'matching.js');writeFileSync(target,f.files['dist/chunks/chunk.js']);const file=path.join(f.runtime,'dist/chunks/chunk.js');rmSync(file);symlinkSync(target,file)}
      if(mode==='directory'){const target=path.join(f.dir,'matching-chunks');mkdirSync(target);writeFileSync(path.join(target,'chunk.js'),f.files['dist/chunks/chunk.js']);const dir=path.join(f.runtime,'dist/chunks');rmSync(dir,{recursive:true});symlinkSync(target,dir)}
      if(mode==='manifest'){const alias=path.join(f.dir,'manifest-link.json');symlinkSync(f.options.runtimeManifestPath!,alias);f.options.runtimeManifestPath=alias}
      if(mode==='runtime-root'){const alias=path.join(f.dir,'runtime-link');symlinkSync(f.runtime,alias);f.options.runtimeRootPath=alias}
      await assert.rejects(verifyManagedRuntime(f.options),/HOST_BUILD_UNVERIFIED/);
    }finally{f.cleanup()}
  }
});

test('production requires explicit supported provider and matching nonempty key before SDK import or authentication',async()=>{
  for(const mode of ['no-provider','no-env','empty-key','wrong-key','unsupported-responses'] as const){const f=runtimeFixture();
    try{
      if(mode==='no-provider')delete f.options.provider;
      if(mode==='no-env')delete f.options.providerEnv;
      if(mode==='empty-key')f.options.providerEnv={OPENAI_API_KEY:'   '};
      if(mode==='wrong-key'){f.options.provider='anthropic';f.options.providerEnv={OPENAI_API_KEY:'SYNTHETIC_NOT_REAL_KEY'}}
      if(mode==='unsupported-responses')f.options.provider='openai-responses';
      const host=new ManagedQwenAdapter(f.options);try{const events=await collect(host);assert.equal(failure(events)?.code,mode==='unsupported-responses'?'HOST_PROVIDER_UNSUPPORTED':'HOST_AUTH_OR_API_ERROR');assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes('SYNTHETIC_SDK_MUST_NOT_IMPORT'))}finally{await host.close()}
    }finally{f.cleanup()}
  }
});

test('injected synthetic query has explicit authType without credentials and never selects OAuth',async()=>{
  for(const provider of ['openai','anthropic','gemini'] as const){const s=setup(happy,{provider});try{assert.equal((await collect(s.adapter)).at(-1)?.type,'result');assert.equal(s.calls[0].options.authType,provider);assert.equal(s.calls[0].options.env.OPENAI_API_KEY,undefined);assert.equal(s.calls[0].options.env.ANTHROPIC_API_KEY,undefined);assert.equal(s.calls[0].options.env.GEMINI_API_KEY,undefined)}finally{await s.cleanup()}}
});

test('application skill, MCP and character assets reject symlink escapes and outside character paths before query',async()=>{
  for(const mode of ['skill-leaf','skill-parent','mcp-leaf','character-leaf','root-alias','outside-character'] as const){
    const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'qwen-app-assets-'))),app=path.join(dir,'app');
    const files={'skills/relationship/SKILL.md':'SYNTHETIC trusted instructions','mcp/trusted-stdio.js':'throw new Error("MUST_NOT_RUN");','characters/alan.json':'{"id":"SYNTHETIC"}'};
    for(const [file,content] of Object.entries(files)){mkdirSync(path.dirname(path.join(app,file)),{recursive:true});writeFileSync(path.join(app,file),content)}
    let appRoot=app,characterPath:string|undefined;
    try{
      if(mode==='skill-parent'){const outside=path.join(dir,'outside-skill');mkdirSync(outside);writeFileSync(path.join(outside,'SKILL.md'),files['skills/relationship/SKILL.md']);const parent=path.join(app,'skills/relationship');rmSync(parent,{recursive:true});symlinkSync(outside,parent)}
      if(mode==='skill-leaf'||mode==='mcp-leaf'||mode==='character-leaf'){
        const file=mode==='skill-leaf'?'skills/relationship/SKILL.md':mode==='mcp-leaf'?'mcp/trusted-stdio.js':'characters/alan.json';const outside=path.join(dir,'outside-file');writeFileSync(outside,files[file]);rmSync(path.join(app,file));symlinkSync(outside,path.join(app,file));
      }
      if(mode==='root-alias'){appRoot=path.join(dir,'app-link');symlinkSync(app,appRoot)}
      if(mode==='outside-character'){characterPath=path.join(dir,'outside-character.json');writeFileSync(characterPath,files['characters/alan.json'])}
      const s=setup(happy,{root:appRoot,characterPath});try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_APP_ASSET_UNVERIFIED');assert.equal(s.calls.length,0);assert.ok(!events.some(e=>e.type==='skill'||e.type==='result'))}finally{await s.cleanup()}
    }finally{rmSync(dir,{recursive:true,force:true})}
  }
});

test('verified skill and character snapshots survive source symlink replacement after query options are built',async()=>{
  const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'qwen-content-snapshot-'))),app=path.join(dir,'app');
  const originalSkill='SYNTHETIC_ORIGINAL_SKILL',originalCharacter='{"id":"SYNTHETIC_ORIGINAL_CHARACTER","text":"原始内容"}';
  const files={'skills/relationship/SKILL.md':originalSkill,'mcp/trusted-stdio.js':'throw new Error("MUST_NOT_RUN");','characters/alan.json':originalCharacter};
  for(const [file,content] of Object.entries(files)){mkdirSync(path.dirname(path.join(app,file)),{recursive:true});writeFileSync(path.join(app,file),content)}
  const externalSkill=path.join(dir,'external-skill'),externalCharacter=path.join(dir,'external-character.json');writeFileSync(externalSkill,'EXTERNAL_SKILL_CANARY');writeFileSync(externalCharacter,'{"id":"EXTERNAL_CHARACTER_CANARY"}');
  let observed=false;
  const s=setup(async function*(o){
    // This runs only after the adapter has assembled the SDK options from verified descriptors.
    for(const [source,target] of [[path.join(app,'skills/relationship/SKILL.md'),externalSkill],[path.join(app,'characters/alan.json'),externalCharacter]]){rmSync(source);symlinkSync(target,source)}
    const mcp=o.mcpServers.relationship.env;assert.equal(mcp.REL_CHARACTER,undefined);assert.equal(mcp.REL_CHARACTER_JSON,originalCharacter);assert.equal(mcp.REL_CHARACTER_SHA256,createHash('sha256').update(Buffer.from(originalCharacter)).digest('hex'));assert.equal(o.systemPrompt,originalSkill);observed=true;
    yield* happy(o);
  },{root:app});
  try{const events=await collect(s.adapter);assert.equal(observed,true);assert.equal(events.at(-1)?.type,'result');const skill=events.find((e):e is Extract<HostEvent,{type:'skill'}>=>e.type==='skill'&&e.resource_id==='relationship/SKILL.md');assert.equal(skill?.hash,createHash('sha256').update(originalSkill).digest('hex'));assert.ok(!JSON.stringify(events).includes('EXTERNAL_'));assert.ok(!JSON.stringify(s.calls).includes('EXTERNAL_'))}finally{await s.cleanup();rmSync(dir,{recursive:true,force:true})}
});

test('adapter rejects hard-linked content through descriptor reader before SDK query starts',async()=>{
  for(const source of ['skills/relationship/SKILL.md','characters/alan.json']){
    const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'qwen-content-hardlink-'))),app=path.join(dir,'app');
    const files={'skills/relationship/SKILL.md':'SYNTHETIC_SKILL','mcp/trusted-stdio.js':'throw new Error("MUST_NOT_RUN");','characters/alan.json':'{"id":"SYNTHETIC_CHARACTER"}'};
    for(const [file,content] of Object.entries(files)){mkdirSync(path.dirname(path.join(app,file)),{recursive:true});writeFileSync(path.join(app,file),content)}
    linkSync(path.join(app,source),path.join(dir,'outside-hardlink'));
    const s=setup(happy,{root:app});try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_APP_ASSET_UNVERIFIED');assert.equal(s.calls.length,0)}finally{await s.cleanup();rmSync(dir,{recursive:true,force:true})}
  }
});

test('invalid UTF-8 skill or character bytes are rejected before query without replacement characters',async()=>{
  for(const source of ['skills/relationship/SKILL.md','characters/alan.json']){
    const dir=realpathSync(mkdtempSync(path.join(os.tmpdir(),'qwen-content-utf8-'))),app=path.join(dir,'app');
    const files={'skills/relationship/SKILL.md':'SYNTHETIC_SKILL','mcp/trusted-stdio.js':'throw new Error("MUST_NOT_RUN");','characters/alan.json':'{"id":"SYNTHETIC_CHARACTER"}'};
    for(const [file,content] of Object.entries(files)){mkdirSync(path.dirname(path.join(app,file)),{recursive:true});writeFileSync(path.join(app,file),content)}
    writeFileSync(path.join(app,source),Buffer.from([0x53,0x59,0xff,0x4e]));
    const s=setup(happy,{root:app});try{const events=await collect(s.adapter);assert.equal(failure(events)?.code,'HOST_APP_ASSET_UNVERIFIED');assert.equal(s.calls.length,0)}finally{await s.cleanup();rmSync(dir,{recursive:true,force:true})}
  }
});
