import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,fork,type ChildProcess} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';import os from 'node:os';
import {Store} from '@between/core/store';
import {PrivacyAuthority,classifyProcessIdentity} from '@between/core/privacy/authority';
import {OfflineRecovery} from '@between/core/privacy/offline-recovery';

type Exit={code:number|null;signal:NodeJS.Signals|null};
type Message={type:string;mode?:string;ok?:boolean;error?:string};
/** Every deadline is cleared after resolution; there are no polling timers. */
async function bounded<T>(work:Promise<T>,label:string):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_TIMEOUT: '+label)),10000);})]);}finally{clearTimeout(timer);}}
function track(child:ChildProcess){let stderr='';child.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-12000);});const exit=new Promise<Exit>((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});void exit.catch(()=>{});return {child,exit,errors:()=>stderr};}
async function killIfRunning(record:ReturnType<typeof track>){if(record.child.exitCode===null&&record.child.signalCode===null){assert.equal(record.child.kill('SIGKILL'),true);const result=await bounded(record.exit,'cleanup SIGKILL');assert.equal(result.signal,'SIGKILL');}else await bounded(record.exit,'already-exited cleanup');}
function raceChild(file:string,mode:'register'|'maintenance'){
 const record=track(fork(fileURLToPath(new URL('./installation-process-fixture.js',import.meta.url)),[file,mode],{execArgv:[],stdio:['ignore','ignore','pipe','ipc']})),messages:Message[]=[];
 const listeners=new Set<()=>void>();record.child.on('message',message=>{messages.push(message as Message);for(const notify of listeners)notify();});
 async function receive(type:string){
  let notify:()=>void=()=>{};const result=new Promise<Message>(resolve=>{notify=()=>{const i=messages.findIndex(message=>message.type===type);if(i>=0){const [message]=messages.splice(i,1);resolve(message);}};listeners.add(notify);notify();});
  try{return await bounded(Promise.race([result,record.exit.then(value=>{throw Error(`SYNTHETIC_EARLY_EXIT ${mode}: ${JSON.stringify(value)} ${record.errors()}`);})]),mode+':'+type);}finally{listeners.delete(notify);}
 }
 return {...record,receive,start:()=>record.child.send({command:'start'}),release:async()=>{const message=receive('released');record.child.send({command:'release'});await message;const result=await bounded(record.exit,mode+':release exit');assert.equal(result.code,0,record.errors());assert.equal(result.signal,null);}};
}
const fixture=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'installation-process-')),file=path.join(dir,'main.sqlite'),store=new Store(file);store.start(true,true,true);return {dir,file,store};};

test('real process registration races maintenance: exactly one holds the installation',async()=>{
 for(let round=0;round<4;round++){
  const f=fixture();f.store.close();const authority=PrivacyAuthority.openExisting(f.file+'.authority.sqlite'),registration=raceChild(authority.file,'register'),maintenance=raceChild(authority.file,'maintenance');
  try{
   await Promise.all([registration.receive('ready'),maintenance.receive('ready')]);
   // Both have independently opened the authority and are blocked at the barrier.
   // Alternate send order, but infer the outcome only from committed result messages.
   if(round%2){maintenance.start();registration.start();}else{registration.start();maintenance.start();}
   const [registered,maintained]=await Promise.all([registration.receive('result'),maintenance.receive('result')]);
   assert.equal(Number(registered.ok)+Number(maintained.ok),1,JSON.stringify({registered,maintained}));
   const state=authority.maintenanceState(),handles=authority.db.prepare('SELECT owner FROM handles').all() as {owner:string}[];
   if(registered.ok){assert.equal(maintained.error,'INSTALLATION_HANDLES_OPEN');assert.equal(state.mode,'ready');assert.equal(handles.length,1);assert.equal(JSON.parse(handles[0].owner).pid,registration.child.pid);assert.equal(classifyProcessIdentity(JSON.parse(handles[0].owner)),'live');assert.throws(()=>authority.beginMaintenance(),/INSTALLATION_HANDLES_OPEN/);}
   else{assert.equal(registered.error,'INSTALLATION_MAINTENANCE');assert.equal(state.mode,'maintenance');assert.equal(handles.length,0);assert.equal(JSON.parse(state.owner!).pid,maintenance.child.pid);assert.throws(()=>authority.registerHandle('store'),/INSTALLATION_MAINTENANCE/);}
   // Neither result releases the winning lease/fence. Both remain live until this.
   assert.equal(registration.child.exitCode,null);assert.equal(maintenance.child.exitCode,null);
   await Promise.all([registration.release(),maintenance.release()]);assert.equal(authority.maintenanceState().mode,'ready');assert.equal((authority.db.prepare('SELECT count(*) n FROM handles').get() as {n:number}).n,0);
  }finally{await Promise.all([killIfRunning(registration),killIfRunning(maintenance)]);authority.close();}
 }
});

function mcpProcess(file:string,scope:string,token:string){
 const character=readFileSync('characters/alan.json','utf8'),record=track(spawn(process.execPath,[fileURLToPath(new URL('../../../packages/mcp-server/dist/trusted-stdio.js',import.meta.url))],{env:{PATH:process.env.PATH??'',REL_DB:file,REL_SCOPE:scope,REL_GRANT:token,REL_CHARACTER_JSON:character,REL_CHARACTER_SHA256:createHash('sha256').update(character).digest('hex')},stdio:['pipe','pipe','pipe']}));
 const lines=createInterface({input:record.child.stdout!}),responses=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();let next=0;
 lines.on('line',line=>{let response:any;try{response=JSON.parse(line);}catch{for(const pending of responses.values())pending.reject(Error('SYNTHETIC_MCP_BAD_JSON'));return;}if(typeof response.id==='number')responses.get(response.id)?.resolve(response);});
 async function request(method:string,params:unknown={}){const id=++next,reply=new Promise<any>((resolve,reject)=>responses.set(id,{resolve,reject}));record.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');try{const response=await bounded(Promise.race([reply,record.exit.then(value=>{throw Error(`SYNTHETIC_MCP_EXIT: ${JSON.stringify(value)} ${record.errors()}`);})]),'MCP '+method);assert.equal(response.error,undefined,JSON.stringify(response));return response.result;}finally{responses.delete(id);}}
 return {...record,request,notify:(method:string)=>record.child.stdin!.write(JSON.stringify({jsonrpc:'2.0',method})+'\n'),closeLines:()=>lines.close()};
}

test('actual live MCP recover=false handle blocks checkpoint; SIGKILL permits dead-owner reaping',async()=>{
 const f=fixture(),turn=f.store.receive('synthetic-mcp','SYNTHETIC_MCP_INPUT')!,scope=f.store.scope;f.store.close();const mcp=mcpProcess(f.file,scope,turn.token),recovery=new OfflineRecovery(f.file,path.join(f.dir,'sealed'),Buffer.alloc(32,23));
 try{
  const initialized=await mcp.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'synthetic-installation-test',version:'1'}});assert.equal(typeof initialized.protocolVersion,'string');mcp.notify('notifications/initialized');const list=await mcp.request('tools/list');assert.deepEqual(list.tools.map((tool:{name:string})=>tool.name).sort(),['read_context','remember_user_report']);const context=await mcp.request('tools/call',{name:'read_context',arguments:{}});assert.equal(context.isError,undefined);assert.equal(JSON.parse(context.content[0].text).current_input.text,'SYNTHETIC_MCP_INPUT');
  const handles=recovery.authority.db.prepare('SELECT kind,owner FROM handles').all() as {kind:string;owner:string}[];assert.equal(handles.length,1);assert.equal(handles[0].kind,'store');assert.equal(JSON.parse(handles[0].owner).pid,mcp.child.pid);assert.equal(classifyProcessIdentity(JSON.parse(handles[0].owner)),'live');
  await assert.rejects(()=>recovery.createSealedCheckpoint(),/INSTALLATION_HANDLES_OPEN/);assert.equal(recovery.authority.maintenanceState().mode,'ready');assert.equal((recovery.authority.db.prepare('SELECT count(*) n FROM restore_journal').get() as {n:number}).n,0);
  assert.equal(mcp.child.kill('SIGKILL'),true);const exit=await bounded(mcp.exit,'actual MCP SIGKILL');assert.equal(exit.code,null);assert.equal(exit.signal,'SIGKILL');assert.equal(classifyProcessIdentity(JSON.parse(handles[0].owner)),'dead');
  // SIGKILL cannot unregister gracefully. The checkpoint must reap its durable row.
  assert.equal((recovery.authority.db.prepare('SELECT count(*) n FROM handles').get() as {n:number}).n,1);const checkpoint=await recovery.createSealedCheckpoint();assert.equal(recovery.inspectRestore(checkpoint.id).eligible,true);assert.equal((recovery.authority.db.prepare('SELECT count(*) n FROM handles').get() as {n:number}).n,0);
 }finally{await killIfRunning(mcp);mcp.closeLines();recovery.close();}
});

test('actual MCP process cannot initialize or open a main DB during maintenance',async()=>{
 const f=fixture(),turn=f.store.receive('synthetic-denied','SYNTHETIC_DENIED')!,scope=f.store.scope;f.store.close();const authority=PrivacyAuthority.openExisting(f.file+'.authority.sqlite');authority.beginMaintenance();const bytes=readFileSync(f.file),mcp=mcpProcess(f.file,scope,turn.token);
 try{const exit=await bounded(mcp.exit,'MCP maintenance rejection');assert.equal(exit.code,1);assert.equal(exit.signal,null);assert.match(mcp.errors(),/INSTALLATION_MAINTENANCE/);assert.deepEqual(readFileSync(f.file),bytes);assert.equal((authority.db.prepare('SELECT count(*) n FROM handles').get() as {n:number}).n,0);}finally{await killIfRunning(mcp);mcp.closeLines();authority.finishMaintenance();authority.close();}
});
