import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Message, Turn } from '@between/contracts/records';
import { readVerifiedContent } from './verified-read.js';
import { SESSION_TOOLS, type CapturedField, type ExecutionContext, type HostEvent, type HostTurn, type NativeProviderAttempt, type HostAdapter } from '@between/contracts/host';

/** Deliberately structural: only the verified patched SDK may supply this API. */
export type SDKFunctionHook = {
  event: 'PreToolUse'|'PostToolUse'|'PostToolUseFailure'|'InstructionsLoaded';
  matcher?: string;
  timeoutMs: number;
  callback(input: Record<string, unknown>, context: {signal:AbortSignal;toolUseId:string|null}): boolean|void|Promise<boolean|void>;
};
export type ManagedQueryOptions = {
  sessionToolAllowlist: readonly string[];
  pathToQwenExecutable: string;
  env: Record<string,string>;
  cwd: string;
  sessionId: string;
  abortController: AbortController;
  hooks: SDKFunctionHook[];
  mcpServers: {relationship:{command:string;args:string[];env:Record<string,string>;cwd:string;includeTools:string[];trust:boolean}};
  captureProviderContent: boolean;
  providerCaptureMaxBytes: number;
  systemPrompt: string;
  chatRecording: false;
  allowedTools: string[];
  permissionMode: 'default';
  authType: 'openai'|'anthropic'|'gemini';
  allowedMcpServerNames: string[];
  includePartialMessages: false;
  canUseTool(toolName:string,input:Record<string,unknown>,context:{signal:AbortSignal}):Promise<{behavior:'allow';updatedInput:Record<string,unknown>}|{behavior:'deny';message:string;interrupt:true}>;
};
export interface SDKQuery extends AsyncIterable<unknown> { close():Promise<void> }
export type SDKQueryFactory = (request:{prompt:string;options:ManagedQueryOptions})=>SDKQuery;
export type ManagedQwenAdapterOptions = {
  root: string;
  databasePath: string;
  characterPath?: string;
  sdkModulePath?: string;
  cliPath?: string;
  sdkSha256?: string;
  cliSha256?: string;
  /** Frozen runtime tree and integrity manifest; separate from writable runtimeRoot. */
  runtimeRootPath?: string;
  runtimeManifestPath?: string;
  runtimeManifestSha256?: string;
  nodePath?: string;
  runtimeRoot?: string;
  /** Explicitly authorized provider configuration only. Never defaults to process.env. */
  providerEnv?: Readonly<Record<string,string>>;
  provider?: 'openai'|'openai-responses'|'anthropic'|'gemini';
  getEphemeral?: (input:HostTurn)=>{turn:Turn|undefined;messages:Message[]};
  /** Test seam. No synthetic success fallback exists in the production loader. */
  query?: SDKQueryFactory;
  captureSyntheticContent?: boolean;
  timeoutMs?: number;
};

type RecordValue = Record<string,unknown>;
type EventDetail = HostEvent extends infer E ? E extends HostEvent ? Omit<E,keyof ExecutionContext|'event_id'|'sequence'|'occurred_at'> : never : never;
type Active = {abort:AbortController;query?:SDKQuery;closing?:Promise<void>};
const HOOK_EVENTS = ['PreToolUse','PostToolUse','PostToolUseFailure','InstructionsLoaded'] as const;
const TOOL_MATCHER = '^mcp__relationship__(read_context|remember_user_report)$';
const PROVIDER_ENV = new Set(['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_MODEL','QWEN_MODEL','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','GEMINI_API_KEY','GOOGLE_API_KEY']);
const captureStatuses = new Set(['present','disabled','redacted','oversize','unavailable']);
const disabled = ():CapturedField=>({capture_status:'disabled'});
const object = (v:unknown):v is RecordValue => !!v&&typeof v==='object'&&!Array.isArray(v);
const string = (v:unknown):v is string => typeof v==='string'&&v.length>0;
const integer = (v:unknown):v is number => Number.isSafeInteger(v)&&Number(v)>=0;
const sameTools = (v:unknown):v is string[] => Array.isArray(v)&&v.length===SESSION_TOOLS.length&&new Set(v).size===v.length&&SESSION_TOOLS.every(t=>v.includes(t));
class AdapterError extends Error {constructor(public code:string){super(code)}}
const fail = (code:string):never=>{throw new AdapterError(code)};

function contextOf(input:HostTurn):ExecutionContext {
  return {schema_version:1,conversation_id:input.conversation_id,turn_id:input.turn_id,execution_id:input.execution_id,trace_id:input.trace_id,traceparent:input.traceparent,...(input.resumes_execution_id?{resumes_execution_id:input.resumes_execution_id}:{})};
}
function captured(value:unknown):value is CapturedField {
  if(!object(value)||!captureStatuses.has(String(value.capture_status)))return false;
  if(value.bytes!==undefined&&!integer(value.bytes))return false;
  if(value.capture_status==='present'&&!Object.hasOwn(value,'value'))return false;
  if(['disabled','unavailable','oversize'].includes(String(value.capture_status))&&Object.hasOwn(value,'value'))return false;
  if(value.content_ref!==undefined&&(!object(value.content_ref)||!string(value.content_ref.id)||!string(value.content_ref.expires_at)))return false;
  return true;
}
function parseAttempt(value:unknown,contentEnabled:boolean):NativeProviderAttempt {
  if(!object(value)||value.schema_version!==1||!integer(value.sequence)||!string(value.event_id)||!string(value.attempt_id)||!string(value.exchange_id)||!integer(value.attempt_index)||!integer(value.retry_index)||!['initial','retry','fallback'].includes(String(value.attempt_reason))||!['openai','anthropic','gemini'].includes(String(value.provider))||!['started','finished'].includes(String(value.phase))||!['matched','unmatched'].includes(String(value.correlation_status))||typeof value.trace_id!=='string'||typeof value.span_id!=='string'||typeof value.parent_span_id!=='string'||!string(value.started_at)||!Number.isFinite(Date.parse(value.started_at))||typeof value.response_complete!=='boolean'||!['running','success','error','cancelled','incomplete'].includes(String(value.status)))return fail('HOST_PROTOCOL_ERROR');
  for(const field of ['request','input','system','tools','output','usage'])if(!captured(value[field]))return fail('HOST_PROTOCOL_ERROR');
  if(value.phase==='started'&&(value.status!=='running'||value.response_complete))return fail('HOST_PROTOCOL_ERROR');
  if(value.phase==='finished'&&(!string(value.ended_at)||!Number.isFinite(Date.parse(value.ended_at))||value.status==='running'))return fail('HOST_PROTOCOL_ERROR');
  if(value.response_complete&&value.status!=='success')return fail('HOST_PROTOCOL_ERROR');
  if(value.model!==undefined&&typeof value.model!=='string')return fail('HOST_PROTOCOL_ERROR');
  if(value.response_id!==undefined&&!string(value.response_id))return fail('HOST_PROTOCOL_ERROR');
  // Preserve native statuses truthfully; never replace real readback with requested settings.
  if(!contentEnabled)for(const key of ['request','input','system','tools','output']){
    const field=value[key] as CapturedField;
    if(Object.hasOwn(field,'value')||field.content_ref!==undefined)return fail('HOST_CAPTURE_POLICY_VIOLATION');
  }
  const knownKeys=['schema_version','sequence','event_id','phase','attempt_id','attempt_index','retry_index','exchange_id','attempt_reason','provider','model','response_id','correlation_status','trace_id','span_id','parent_span_id','started_at','ended_at','status','response_complete','request','input','system','tools','output','usage','error'];
  const native=Object.fromEntries(knownKeys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,structuredClone(value[key])])) as NativeProviderAttempt;
  return native;
}
function normalizedUsage(field:CapturedField):{input_tokens?:number;output_tokens?:number}|undefined {
  if(!object(field.value))return undefined;
  const value=field.value;
  const input=value.input_tokens??value.prompt_tokens??value.promptTokenCount;
  const output=value.output_tokens??value.completion_tokens??value.candidatesTokenCount;
  const result={...(integer(input)?{input_tokens:input}:{}),...(integer(output)?{output_tokens:output}:{})};
  return Object.keys(result).length?result:undefined;
}

export type ManagedRuntimeVerification = {file_count:number;total_bytes:number;runtimeRootPath:string;sdkModulePath:string;cliPath:string;runtimeManifestSha256:string};
const runtimeGroups=['dist','packages/sdk-typescript/dist'] as const;
const hexSha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const canonicalAbsolute=(v:unknown):v is string=>typeof v==='string'&&path.isAbsolute(v)&&path.normalize(v)===v&&!v.includes('\\')&&!v.includes('\0');
const safeRelative=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.includes('\\')&&!/[\0-\x1f:]/.test(v)&&!path.posix.isAbsolute(v)&&path.posix.normalize(v)===v&&v.split('/').every(part=>part!=='.'&&part!=='..'&&part.length>0);

/** Pure integrity check: reads bytes only, never imports the SDK, spawns, or opens a listener.
 * Every file in both runtime trees must be listed. Entry hashes alone are insufficient.
 * The installation must remain immutable between verification and use (no OS lock is claimed).
 */
export async function verifyManagedRuntime(options:Pick<ManagedQwenAdapterOptions,'runtimeRootPath'|'runtimeManifestPath'|'runtimeManifestSha256'|'sdkModulePath'|'cliPath'|'sdkSha256'|'cliSha256'>):Promise<ManagedRuntimeVerification>{
  const {runtimeRootPath,runtimeManifestPath,runtimeManifestSha256,sdkModulePath,cliPath,sdkSha256,cliSha256}=options;
  if(!runtimeRootPath||!runtimeManifestPath||!runtimeManifestSha256||!sdkModulePath||!cliPath||!sdkSha256||!cliSha256)return fail('HOST_UNAVAILABLE');
  if(![runtimeRootPath,runtimeManifestPath,sdkModulePath,cliPath].every(canonicalAbsolute)||![runtimeManifestSha256,sdkSha256,cliSha256].every(hexSha))return fail('HOST_BUILD_UNVERIFIED');
  try{
    for(const file of [runtimeRootPath,runtimeManifestPath,sdkModulePath,cliPath]){
      if(await realpath(file)!==file||(await lstat(file)).isSymbolicLink())return fail('HOST_BUILD_UNVERIFIED');
    }
    if(!(await lstat(runtimeRootPath)).isDirectory()||!(await lstat(runtimeManifestPath)).isFile())return fail('HOST_BUILD_UNVERIFIED');
    if((await lstat(runtimeManifestPath)).size>8*1024*1024)return fail('HOST_BUILD_UNVERIFIED');
    const manifestBytes=await readFile(runtimeManifestPath);
    if(createHash('sha256').update(manifestBytes).digest('hex')!==runtimeManifestSha256.toLowerCase())return fail('HOST_BUILD_UNVERIFIED');
    const manifest:unknown=JSON.parse(manifestBytes.toString('utf8'));
    if(!object(manifest)||Object.keys(manifest).length!==runtimeGroups.length||!runtimeGroups.every(group=>Array.isArray(manifest[group])&&manifest[group].length>0))return fail('HOST_BUILD_UNVERIFIED');
    const entries=new Map<string,{bytes:number;sha256:string}>();
    let total=0;
    for(const group of runtimeGroups){
      for(const item of manifest[group] as unknown[]){
        if(!object(item)||!safeRelative(item.path)||!item.path.startsWith(group+'/')||!integer(item.bytes)||!hexSha(item.sha256)||entries.has(item.path))return fail('HOST_BUILD_UNVERIFIED');
        entries.set(item.path,{bytes:item.bytes,sha256:item.sha256.toLowerCase()});
      }
    }
    if(entries.size>100000)return fail('HOST_BUILD_UNVERIFIED');
    for(const [entry,expected] of [[sdkModulePath,sdkSha256],[cliPath,cliSha256]]){
      const relative=path.relative(runtimeRootPath,entry).split(path.sep).join('/');
      if(!safeRelative(relative)||entries.get(relative)?.sha256!==expected.toLowerCase())return fail('HOST_BUILD_UNVERIFIED');
    }
    // Walk actual directories too: an omitted vendor/chunk or unexpected extra file is rejected.
    const actual=new Set<string>();
    async function walk(relative:string):Promise<void>{
      const absolute=path.join(runtimeRootPath!,relative),stat=await lstat(absolute);
      if(stat.isSymbolicLink()||await realpath(absolute)!==absolute)return fail('HOST_BUILD_UNVERIFIED');
      if(stat.isDirectory()){
        for(const name of await readdir(absolute))await walk(relative+'/'+name);
      }else if(stat.isFile()){
        const entry=entries.get(relative);
        if(!entry||stat.size!==entry.bytes)return fail('HOST_BUILD_UNVERIFIED');
        const bytes=await readFile(absolute);
        if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)return fail('HOST_BUILD_UNVERIFIED');
        actual.add(relative);total+=bytes.length;
      }else return fail('HOST_BUILD_UNVERIFIED');
    }
    for(const group of runtimeGroups)await walk(group);
    if(actual.size!==entries.size||[...entries.keys()].some(file=>!actual.has(file)))return fail('HOST_BUILD_UNVERIFIED');
    return {file_count:actual.size,total_bytes:total,runtimeRootPath,sdkModulePath,cliPath,runtimeManifestSha256:runtimeManifestSha256.toLowerCase()};
  }catch(error){if(error instanceof AdapterError)throw error;return fail('HOST_BUILD_UNVERIFIED');}
}

/** Application assets are fixed below a canonical application root. These checks
 * reject existing symlinks; they do not claim an OS sandbox or race-proof file locking.
 */
async function verifyAppAssets(root:string,characterPath:string):Promise<{skillPath:string;mcpPath:string;characterPath:string}>{
  try{
    if(!canonicalAbsolute(root)||!canonicalAbsolute(characterPath))return fail('HOST_APP_ASSET_UNVERIFIED');
    const rootParts=root.slice(path.parse(root).root.length).split(path.sep).filter(Boolean);
    let parent=path.parse(root).root;
    for(const part of rootParts){parent=path.join(parent,part);const stat=await lstat(parent);if(stat.isSymbolicLink()||!stat.isDirectory())return fail('HOST_APP_ASSET_UNVERIFIED');}
    if(await realpath(root)!==root)return fail('HOST_APP_ASSET_UNVERIFIED');
    const skillPath=path.join(root,'skills','relationship','SKILL.md'),mcpPath=path.join(root,'mcp','trusted-stdio.js');
    for(const file of [skillPath,mcpPath,characterPath]){
      const relative=path.relative(root,file).split(path.sep).join('/');
      if(!safeRelative(relative))return fail('HOST_APP_ASSET_UNVERIFIED');
      let current=root;const parts=relative.split('/');
      for(let i=0;i<parts.length;i++){
        current=path.join(current,parts[i]);const stat=await lstat(current);
        if(stat.isSymbolicLink()||(i===parts.length-1?!stat.isFile():!stat.isDirectory()))return fail('HOST_APP_ASSET_UNVERIFIED');
      }
      if(await realpath(file)!==file)return fail('HOST_APP_ASSET_UNVERIFIED');
    }
    return {skillPath,mcpPath,characterPath};
  }catch(error){if(error instanceof AdapterError)throw error;return fail('HOST_APP_ASSET_UNVERIFIED');}
}

/** One SDK query/CLI process per business execution, with no global credential inheritance. */
export class ManagedQwenAdapter implements HostAdapter {
  private active=new Map<string,Active>();
  private usedExecutions=new Set<string>();
  private closed=false;
  constructor(private options:ManagedQwenAdapterOptions){}

  startTurn(input:HostTurn):AsyncIterable<HostEvent>{return this.execute(input)}
  /** Safe re-entry from current authoritative MCP state, NOT saved CLI checkpoint resume. */
  resumeExecution(input:HostTurn):AsyncIterable<HostEvent>{return this.execute(input)}

  async cancelTurn(executionId:string):Promise<void>{
    const active=this.active.get(executionId);if(!active)return;
    active.abort.abort();await this.closeQuery(active);
  }
  async close():Promise<void>{
    this.closed=true;
    await Promise.all([...this.active.keys()].map(id=>this.cancelTurn(id)));
  }
  private closeQuery(active:Active):Promise<void>{
    if(!active.query)return Promise.resolve();
    return active.closing??=(async()=>{await active.query!.close()})();
  }
  private authType():'openai'|'anthropic'|'gemini'{
    const provider=this.options.provider??(this.options.query?'openai':undefined);
    if(provider==='openai-responses')return fail('HOST_PROVIDER_UNSUPPORTED');
    if(provider!=='openai'&&provider!=='anthropic'&&provider!=='gemini')return fail('HOST_AUTH_OR_API_ERROR');
    if(!this.options.query){
      const keys=provider==='openai'?['OPENAI_API_KEY']:provider==='anthropic'?['ANTHROPIC_API_KEY']:['GEMINI_API_KEY','GOOGLE_API_KEY'];
      if(!keys.some(key=>typeof this.options.providerEnv?.[key]==='string'&&this.options.providerEnv[key].trim().length>0&&!this.options.providerEnv[key].includes('\0')))return fail('HOST_AUTH_OR_API_ERROR');
    }
    return provider;
  }
  private async loadQuery():Promise<SDKQueryFactory>{
    if(this.options.query)return this.options.query;
    const required=[this.options.runtimeRootPath,this.options.runtimeManifestPath,this.options.runtimeManifestSha256,this.options.sdkModulePath,this.options.cliPath,this.options.sdkSha256,this.options.cliSha256];
    if(required.some(value=>!value))return fail('HOST_UNAVAILABLE');
    // Never let absent explicit credentials fall through to Qwen OAuth or an interactive auth flow.
    this.authType();
    const verified=await verifyManagedRuntime(this.options);
    const sdk=await import(pathToFileURL(verified.sdkModulePath).href) as {query?:SDKQueryFactory;SDK_VERSION?:string;MANAGED_HOST_CONTRACT_VERSION?:number};
    if(typeof sdk.query!=='function'||sdk.SDK_VERSION!=='0.1.16'||sdk.MANAGED_HOST_CONTRACT_VERSION!==1)return fail('HOST_BUILD_UNVERIFIED');
    return sdk.query;
  }

  private async *execute(input:HostTurn):AsyncGenerator<HostEvent>{
    let sequence=0,runDir:string|undefined,policy=false,policyData:RecordValue|undefined,init:RecordValue|undefined,terminal=false;
    let active:Active|undefined;
    const make=(event:EventDetail,event_id:string=randomUUID()):HostEvent=>({...contextOf(input),event_id,sequence:sequence++,occurred_at:Date.now(),...event} as HostEvent);
    const pending:EventDetail[]=[];
    const attempts=new Map<string,NativeProviderAttempt>();
    const seen=new Map<string,string>();
    let hookFailure:string|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let timedOut=false;
    const contentEnabled=!!this.options.query&&this.options.captureSyntheticContent===true;
    try{
      if(this.closed)return fail('HOST_CLOSED');
      if(!sameTools(input.sessionToolAllowlist))return fail('HOST_TOOL_BOUNDARY_FAILED');
      if(!string(input.execution_id)||!string(input.conversation_id)||!string(input.turn_id)||!string(input.grant)||input.schema_version!==1)return fail('HOST_CONTEXT_MISMATCH');
      if(this.usedExecutions.has(input.execution_id))return fail('HOST_EXECUTION_REUSED');
      this.usedExecutions.add(input.execution_id);
      active={abort:new AbortController()};this.active.set(input.execution_id,active);
      const query=await this.loadQuery();
      const authType=this.authType();
      if(active.abort.signal.aborted)return fail('TURN_CANCELLED');
      const root=path.resolve(this.options.root),runtimeRoot=path.resolve(this.options.runtimeRoot??path.join(root,'.runtime','qwen'));
      const assets=await verifyAppAssets(root,path.resolve(this.options.characterPath??path.join(root,'characters','alan.json')));
      let skillBytes:Buffer,characterBytes:Buffer;
      try{
        skillBytes=await readVerifiedContent(root,assets.skillPath);
        characterBytes=await readVerifiedContent(root,assets.characterPath);
      }catch(error){return fail(error instanceof Error&&error.message==='HOST_CONTENT_BOUNDARY_UNAVAILABLE'?'HOST_CONTENT_BOUNDARY_UNAVAILABLE':'HOST_APP_ASSET_UNVERIFIED');}
      let skill:string,characterSnapshot:string;
      try{
        const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
        skill=decoder.decode(skillBytes);characterSnapshot=decoder.decode(characterBytes);
      }catch{return fail('HOST_APP_ASSET_UNVERIFIED');}
      if(characterBytes.length>96*1024)return fail('HOST_CHARACTER_SNAPSHOT_TOO_LARGE');
      const skillHash=createHash('sha256').update(skillBytes).digest('hex');
      const characterHash=createHash('sha256').update(characterBytes).digest('hex');
      await mkdir(runtimeRoot,{recursive:true,mode:0o700});
      runDir=await mkdtemp(path.join(runtimeRoot,'execution-'));
      const home=path.join(runDir,'home'),qwenHome=path.join(runDir,'qwen'),qwenRuntime=path.join(runDir,'runtime');
      await Promise.all([home,qwenHome,qwenRuntime].map(dir=>mkdir(dir,{mode:0o700})));
      const nodePath=this.options.nodePath??process.execPath;
      if(!path.isAbsolute(nodePath))return fail('HOST_UNAVAILABLE');
      const env:Record<string,string>={HOME:home,QWEN_HOME:qwenHome,QWEN_RUNTIME_DIR:qwenRuntime,TMPDIR:qwenRuntime,PATH:path.dirname(nodePath),LANG:'C.UTF-8',NO_COLOR:'1',TRACEPARENT:input.traceparent};
      for(const [key,value] of Object.entries(this.options.providerEnv??{})){
        if(!PROVIDER_ENV.has(key)||typeof value!=='string'||value.includes('\0'))return fail('HOST_ENV_REJECTED');
        env[key]=value;
      }
      // Electron's executable is used as a Node child, never as a second app instance.
      if(process.versions.electron&&nodePath===process.execPath)env.ELECTRON_RUN_AS_NODE='1';
      const mcpEnv:Record<string,string>={REL_DB:path.resolve(this.options.databasePath),REL_GRANT:input.grant,REL_CHARACTER_JSON:characterSnapshot,REL_CHARACTER_SHA256:characterHash,REL_SCOPE:input.conversation_id};
      // Qwen's MCP spawn inherits its env; override every provider field to avoid credential propagation.
      for(const key of PROVIDER_ENV)mcpEnv[key]='';
      if(!input.memory){
        const e=this.options.getEphemeral?.(input);
        if(!e?.turn||e.turn.id!==input.turn_id||e.turn.token!==input.grant||e.turn.memory!==false||e.turn.text!==input.input)return fail('OFF_INPUT_UNAVAILABLE');
        // The factory owns source ordering; this boundary additionally rejects pending role text.
        mcpEnv.REL_EPHEMERAL=JSON.stringify({turn:e.turn,messages:e.messages.filter(m=>m.status==='confirmed')});
        if(Buffer.byteLength(mcpEnv.REL_EPHEMERAL)>96*1024)return fail('OFF_INPUT_TOO_LARGE');
      }
      const queue=(detail:EventDetail)=>pending.push(detail);
      const permitted=(tool:unknown)=>typeof tool==='string'&&SESSION_TOOLS.includes(tool)&&(input.memory||tool!=='mcp__relationship__remember_user_report');
      const hooks:SDKFunctionHook[]=HOOK_EVENTS.map(event=>({event,...(event==='InstructionsLoaded'?{}:{matcher:TOOL_MATCHER}),timeoutMs:5000,callback:(hook,callbackContext)=>{
        if(active!.abort.signal.aborted||callbackContext.signal.aborted)return false;
        if(hook.session_id!==input.execution_id){hookFailure='HOST_CONTEXT_MISMATCH';return false;}
        if(event==='InstructionsLoaded'){
          if(string(hook.file_path))queue({type:'skill',phase:'read',resource_id:hook.file_path,capture:disabled()});
          return;
        }
        if(!policy||!permitted(hook.tool_name)){hookFailure='HOST_TOOL_BOUNDARY_FAILED';return false;}
        const toolId=hook.tool_call_id??hook.tool_use_id??callbackContext.toolUseId;
        if(!string(toolId)){hookFailure='HOST_PROTOCOL_ERROR';return false;}
        const toolInput=object(hook.tool_input)?hook.tool_input:{};
        const operation=typeof toolInput.operation_id==='string'&&toolInput.operation_id.length<=128?toolInput.operation_id:undefined;
        queue({type:'tool',tool_call_id:toolId,...(operation?{operation_id:operation}:{}),tool:hook.tool_name as string,status:event==='PreToolUse'?'started':event==='PostToolUse'?'succeeded':'failed',input:disabled(),...(event==='PreToolUse'?{}:{output:disabled()})});
        return true;
      }}));
      const queryOptions:ManagedQueryOptions={
        sessionToolAllowlist:[...SESSION_TOOLS],pathToQwenExecutable:this.options.cliPath??path.join(root,'__unavailable_cli__.js'),env,cwd:runDir,sessionId:input.execution_id,abortController:active.abort,hooks,
        mcpServers:{relationship:{command:nodePath,args:[assets.mcpPath],env:mcpEnv,cwd:runDir,includeTools:['read_context','remember_user_report'],trust:false}},
        captureProviderContent:contentEnabled,providerCaptureMaxBytes:16384,systemPrompt:skill,chatRecording:false,allowedTools:[...SESSION_TOOLS],permissionMode:'default',authType,allowedMcpServerNames:['relationship'],includePartialMessages:false,
        canUseTool:async(toolName,toolInput,callbackContext)=>{
          if(policy&&permitted(toolName)&&!callbackContext.signal.aborted&&!active!.abort.signal.aborted)return {behavior:'allow',updatedInput:toolInput};
          hookFailure='HOST_TOOL_BOUNDARY_FAILED';return {behavior:'deny',message:'Tool not authorized by this execution',interrupt:true};
        },
      };
      if(active.abort.signal.aborted)return fail('TURN_CANCELLED');
      active.query=query({prompt:'Read this turn through relationship.read_context and reply according to the current boundaries.',options:queryOptions});
      timer=setTimeout(()=>{timedOut=true;active!.abort.abort();void this.closeQuery(active!).catch(()=>{});},this.options.timeoutMs??60000);
      const iterator=active.query[Symbol.asyncIterator]();
      let rejectAbort!:(error:Error)=>void;
      const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject});
      const onAbort=()=>rejectAbort(new AdapterError(timedOut?'HOST_TIMEOUT':'TURN_CANCELLED'));
      active.abort.signal.addEventListener('abort',onAbort,{once:true});
      if(active.abort.signal.aborted)onAbort();
      try{
        while(true){
          const next=await Promise.race([iterator.next(),aborted]);
          if(hookFailure)return fail(hookFailure);
          // Hooks may complete while the SDK's next item is in flight.
          while(policy&&pending.length)yield make(pending.shift()!);
          if(next.done)break;
          const msg=next.value;
          if(!object(msg)||!string(msg.type)||Buffer.byteLength(JSON.stringify(msg))>2*1024*1024)return fail('HOST_PROTOCOL_ERROR');
          if(msg.session_id!==input.execution_id)return fail('HOST_CONTEXT_MISMATCH');
          if(msg.type==='system'&&(msg.subtype==='host_policy'||msg.subtype==='init')){
            if(policy)return fail('HOST_POLICY_CHANGED');
            if(msg.subtype==='host_policy'){
              const p=msg.data;
              if(!object(p)||p.schema_version!==1||p.managed_host_contract_version!==1||p.source!=='runtime_config'||p.session_id!==input.execution_id||!sameTools(p.effective_session_tool_allowlist)||!sameTools(p.registered_tools)||p.hooks_status!=='present'||p.unmanaged_hooks_blocked!==true||!Array.isArray(p.sdk_hooks))return fail('HOST_POLICY_UNVERIFIED');
              if(p.sdk_hooks.length!==HOOK_EVENTS.length||!HOOK_EVENTS.every(event=>p.sdk_hooks instanceof Array&&p.sdk_hooks.filter(h=>object(h)&&h.event===event&&typeof h.name==='string'&&h.name.startsWith('sdk:')&&(event==='InstructionsLoaded'?h.matcher===undefined||h.matcher==='*':h.matcher===TOOL_MATCHER)&&typeof h.timeout_ms==='number'&&h.timeout_ms>0).length===1))return fail('HOST_POLICY_UNVERIFIED');
              policyData=p;
            }else{
              if(msg.qwen_code_version!=='0.24.7'||!sameTools(msg.tools))return fail('HOST_POLICY_UNVERIFIED');
              init=msg;
            }
            if(policyData&&init){
              policy=true;
              yield make({type:'policy',sessionToolAllowlist:[...(policyData.effective_session_tool_allowlist as string[])],registeredTools:[...(policyData.registered_tools as string[])],managed_host_contract_version:1,hooks:'sdk_functions',cli_version:init.qwen_code_version as string,sdk_version:'0.1.16',policy_source:'runtime_readback'});
              yield make({type:'skill',phase:'read',resource_id:'relationship/SKILL.md',hash:skillHash,capture:disabled()});
            }
            continue;
          }
          if(!policy)return fail('HOST_POLICY_UNVERIFIED');
          if(msg.type==='system'&&msg.subtype==='provider_attempt'){
            const attempt=parseAttempt(msg.data,contentEnabled);
            if(msg.uuid!==attempt.event_id)return fail('HOST_PROTOCOL_ERROR');
            const serialized=JSON.stringify(attempt),previous=seen.get(attempt.event_id);
            if(previous!==undefined){if(previous!==serialized)return fail('HOST_EVENT_CONFLICT');continue;}
            seen.set(attempt.event_id,serialized);
            const started=attempts.get(attempt.attempt_id);
            if(attempt.phase==='started'){
              if(started)return fail('HOST_ATTEMPT_CONFLICT');
              attempts.set(attempt.attempt_id,attempt);
              yield make({type:'attempt_started',attempt_id:attempt.attempt_id,attempt_index:attempt.attempt_index,reason:attempt.attempt_reason,provider:attempt.provider,model:attempt.model??'unavailable',input:attempt.input,native_attempt:attempt},attempt.event_id);
            }else{
              if(!started||started.phase!=='started'||started.exchange_id!==attempt.exchange_id||started.attempt_index!==attempt.attempt_index||started.provider!==attempt.provider)return fail('ATTEMPT_EVIDENCE_MISSING');
              attempts.set(attempt.attempt_id,attempt);
              yield make({type:'attempt_finished',attempt_id:attempt.attempt_id,response_complete:attempt.response_complete,output:attempt.output,status:attempt.status==='success'&&attempt.response_complete?'succeeded':attempt.status==='cancelled'?'cancelled':'failed',usage:normalizedUsage(attempt.usage),native_attempt:attempt},attempt.event_id);
            }
            continue;
          }
          if(msg.type==='assistant'||msg.type==='stream_event'||msg.type==='user')continue;
          if(msg.type==='result'){
            if(msg.subtype!=='success'||msg.is_error!==false)return fail('HOST_AUTH_OR_API_ERROR');
            if(Array.isArray(msg.permission_denials)&&msg.permission_denials.length)return fail('APPROVAL_DENIED');
            if(!string(msg.result)||msg.result.length>50000)return fail('HOST_RESULT_MISSING');
            // Only the CLI's explicit semantic response association may link a final result.
            const attemptId=msg.provider_attempt_id;
            const attempt=typeof attemptId==='string'?attempts.get(attemptId):undefined;
            if(!attempt||attempt.phase!=='finished'||attempt.status!=='success'||!attempt.response_complete)return fail('ATTEMPT_EVIDENCE_MISSING');
            if(msg.response_id!==undefined&&msg.response_id!==attempt.response_id)return fail('ATTEMPT_EVIDENCE_MISSING');
            const contributors=msg.provider_attempt_ids;
            if(contributors!==undefined&&(!Array.isArray(contributors)||contributors.length>1000||contributors.some(id=>!string(id))||new Set(contributors).size!==contributors.length))return fail('HOST_PROTOCOL_ERROR');
            // Contributors may legitimately be partial continuation attempts or unobserved.
            // Retain their explicit IDs; never invent completion or substitute for terminal proof.
            terminal=true;
            yield make({type:'result',text:msg.result,attempt_id:attempt.attempt_id,...(contributors?{contributing_attempt_ids:contributors as string[]}:{}),response_complete:true});
            break;
          }
          if(msg.type==='system'&&['error','auth_error','permission_denied'].includes(String(msg.subtype)))return fail('HOST_AUTH_OR_API_ERROR');
          // Unknown system lifecycle messages are metadata, never role output.
          if(msg.type!=='system')return fail('HOST_PROTOCOL_ERROR');
        }
      }finally{active.abort.signal.removeEventListener('abort',onAbort);}
      if(!terminal)return fail(policy?'HOST_DISCONNECTED':'HOST_POLICY_UNVERIFIED');
    }catch(error){
      const code=error instanceof AdapterError?error.code:active?.abort.signal.aborted?(timedOut?'HOST_TIMEOUT':'TURN_CANCELLED'):'HOST_UNAVAILABLE';
      yield make({type:'failure',code,retryable:['HOST_DISCONNECTED','HOST_TIMEOUT'].includes(code),outcome:'definite_failure'});
    }finally{
      if(timer)clearTimeout(timer);
      if(active){active.abort.abort();try{await this.closeQuery(active)}catch{/* No exception text or credentials enter role output. */}this.active.delete(input.execution_id);}
      if(runDir)await rm(runDir,{recursive:true,force:true});
    }
  }
}
