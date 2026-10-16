// 本机常驻启动器：只沿用独立 Between 授权，不登录、不发现模型、不推理。
import fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {createApp} from './server.mjs';
import {openPlanCredentials} from './plan-credentials.mjs';
import {startCompatibilityServer,createCompatibilityPlanProvider} from './plan-service.mjs';
import {DEFAULT_PLAN_MODEL,DEFAULT_PLAN_REASONING} from './plan-config.mjs';

const script=fileURLToPath(import.meta.url);
const defaultRoot=path.join(homedir(),'Library/Application Support/Between');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function privateDirectory(dir){
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const s=await fs.lstat(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('private_directory_required');
}
async function passwordAt(file){
  try{await fs.writeFile(file,randomBytes(24).toString('hex')+'\n',{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  const s=await fs.lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o077))throw Error('private_password_file_required');
  const value=(await fs.readFile(file,'utf8')).trim();
  if(value.length<12)throw Error('invalid_admin_password');
  return value;
}

export async function startLocalServices({root=defaultRoot,credentialFile=path.join(defaultRoot,'siwc/between.json'),appPort=8787,servicePort=8766,openCredentials=openPlanCredentials,fetchImpl=fetch}={}){
  root=path.resolve(root);
  const runtime=path.join(root,'runtime'),data=path.join(root,'app-data');
  await privateDirectory(runtime);
  const lockFile=path.join(runtime,'supervisor.owner'),statusFile=path.join(runtime,'status.json');
  // 独占所有权；不抢占现存进程或自动删除崩溃后的锁。
  const lock=await fs.open(lockFile,'wx',0o600);
  let app,service,owner,closing;
  const state={pid:process.pid,state:'starting',startedAt:new Date().toISOString(),adminPasswordFile:path.join(runtime,'admin-password.txt'),modelCallsAtStartup:0};
  const save=()=>fs.writeFile(statusFile,JSON.stringify(state,null,2),{mode:0o600});
  const close=(reason='stopped',failed=false)=>closing??=(async()=>{
    const results=await Promise.allSettled([app?.close(),service?.close()]);
    try{await owner?.close();}catch(e){results.push({status:'rejected',reason:e});}
    state.state=failed?'failed':'stopped';state.reason=reason;state.finishedAt=new Date().toISOString();
    try{await save();}finally{await lock.close();await fs.unlink(lockFile);}
    if(results.some(r=>r.status==='rejected'))throw Error('service_cleanup_failed');
  })();
  try{
    await lock.writeFile(String(process.pid));await save();
    // 仅应用凭据模块读取原文件；不复制、打印或保存任何 OAuth token。
    owner=await openCredentials(credentialFile);
    const inspectGrant=async()=>{
      const r=await owner.credentials.load();
      return r?{grantStatus:r.grant_status,subject:r.subject,workspace:r.workspace,clientId:r.client_id,scopes:String(r.scope||'').split(' '),expiresAt:r.expires_at,validated:r.validated===true,renewable:!!r.refresh_token}:null;
    };
    const grant=await inspectGrant();
    if(!grant?.validated||!['ready','temporarily_unavailable'].includes(grant.grantStatus)||!['resource.invoke','chatgpt.tokens.use.direct'].every(s=>grant.scopes.includes(s))||!grant.renewable&&!(grant.expiresAt>Date.now()))throw Error('authorization_not_ready');
    const localKey=randomBytes(32).toString('hex');
    service=await startCompatibilityServer({localKey,port:servicePort,getAccessToken:()=>owner.credentials.getAccessToken(),inspectGrant,fetchImpl});
    await privateDirectory(data);
    let firstRun=false;
    try{await fs.lstat(path.join(data,'settings.json'));}catch(e){if(e.code!=='ENOENT')throw e;firstRun=true;}
    const password=await passwordAt(state.adminPasswordFile);
    const planProvider=await createCompatibilityPlanProvider({baseUrl:service.baseUrl,localKey});
    app=await createApp({root:data,port:appPort,adminPassword:password,planProvider});
    const call=async(p,{method='GET',body,cookie='',csrf=''}={})=>{
      const r=await fetch(app.url+p,{method,headers:{Origin:app.url,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
      if(!r.ok){await r.body?.cancel();throw Error('application_health_failed');}
      return r;
    };
    const login=await call('/api/admin/login',{method:'POST',body:{password}}),cookie=login.headers.get('set-cookie')?.split(';')[0],{csrf}=await login.json();
    let admin=await (await call('/api/admin/state',{cookie})).json();
    if(firstRun){
      // 由应用自身生成初始角色、世界书与预设，经正式管理接口保存。
      await (await call('/api/admin/plan',{method:'PUT',cookie,csrf,body:{enabled:true,model:DEFAULT_PLAN_MODEL,reasoningEffort:DEFAULT_PLAN_REASONING,confirm:true,expectedVersion:admin.config.version}})).body?.cancel();
      admin=await (await call('/api/admin/state',{cookie})).json();
    }
    const chat=await call('/'),adminPage=await call('/admin');
    state.http={chat:chat.status,admin:adminPage.status,adminAuthenticated:200};
    await chat.body?.cancel();await adminPage.body?.cancel();
    await (await call('/api/admin/logout',{method:'POST',cookie,csrf,body:{}})).body?.cancel();
    Object.assign(state,{state:'running',appUrl:app.url,adminUrl:app.url+'/admin',compatibilityUrl:service.baseUrl,model:admin.config.planBackend.model,reasoningEffort:admin.config.planBackend.reasoningEffort,backendEnabled:admin.config.planBackend.enabled,connection:admin.plan.connection,canGenerate:admin.plan.canGenerate});
    await save();
    return {state,close};
  }catch(e){await close(typeof e.code==='string'?e.code:'startup_failed',true);throw e;}
}

async function main(){
  process.umask(0o077);
  const root=path.resolve(process.env.BETWEEN_LOCAL_ROOT||defaultRoot),runtime=path.join(root,'runtime'),statusFile=path.join(runtime,'status.json');
  if(process.argv[2]==='serve'){
    const running=await startLocalServices({root,credentialFile:process.env.BETWEEN_PLAN_CREDENTIALS||path.join(defaultRoot,'siwc/between.json')});
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>running.close(signal).then(()=>process.exit(0),()=>process.exit(1)));
    return;
  }
  if(process.argv.length>2)throw Error('usage: node apps/server/local-start.mjs [serve]');
  await privateDirectory(runtime);
  try{await fs.lstat(path.join(runtime,'supervisor.owner'));throw Error('existing_supervisor_owner');}catch(e){if(e.code!=='ENOENT')throw e;}
  const log=openSync(path.join(runtime,'supervisor.log'),'a',0o600);
  const child=spawn(process.execPath,[script,'serve'],{cwd:path.dirname(script),detached:true,stdio:['ignore',log,log]});child.unref();closeSync(log);
  let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  for(let i=0;i<150;i++){
    await pause(200);
    let s;try{s=JSON.parse(await fs.readFile(statusFile,'utf8'));}catch{}
    if(s?.pid===child.pid&&['running','failed','stopped'].includes(s.state)){console.log(JSON.stringify(s,null,2));if(s.state!=='running')process.exitCode=1;return;}
    if(exited)throw Error('supervisor_exited_before_ready');
  }
  child.kill('SIGTERM');throw Error('startup_health_timeout');
}
if(process.argv[1]===script)main().catch(e=>{console.error('Between 本机启动失败：'+(typeof e.code==='string'?e.code:'startup_failed'));process.exitCode=1;});
