import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,statSync,chmodSync,writeFileSync} from 'node:fs';
import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';import os from 'node:os';
import {Store} from '@between/core/store';
import {OffCache,SPOOL_SCHEMA} from '@between/core/runtime/off-cache';
import {PrivacyAuthority} from '@between/core/privacy/authority';
import {OfflineRecovery} from '@between/core/privacy/offline-recovery';
const now=()=>100000,key=Buffer.alloc(32,71);
const fixture=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'spool-identity-')),a=new Store(path.join(dir,'a.sqlite'),now,true,'same-scope'),b=new Store(path.join(dir,'b.sqlite'),now,true,'same-scope');return {dir,a,b,spool:path.join(dir,'shared.sqlite')};};
const spoolHandles=(authority:PrivacyAuthority)=>(authority.db.prepare("SELECT count(*) n FROM handles WHERE kind='spool'").get() as {n:number}).n;

test('same scope, key and spool path cannot cross installations or evade owner maintenance fencing',async()=>{
 const f=fixture(),off=new OffCache(f.spool,key,f.a.authority,now),recovery=new OfflineRecovery(f.a.file,path.join(f.dir,'sealed-a'),key,now);
 try{off.put(f.a.scope,'receipt','SYNTHETIC_INSTALLATION_A_ONLY');off.db.pragma('wal_checkpoint(TRUNCATE)');chmodSync(f.spool,0o640);const bytes=readFileSync(f.spool),mode=statSync(f.spool).mode;
  assert.throws(()=>new OffCache(f.spool,key,f.b.authority,now),/SPOOL_IDENTITY_MISMATCH/);assert.deepEqual(readFileSync(f.spool),bytes);assert.equal(statSync(f.spool).mode,mode);assert.equal(spoolHandles(f.b.authority),0);assert.equal(spoolHandles(f.a.authority),1);assert.equal(off.get(f.a.scope,'receipt'),'SYNTHETIC_INSTALLATION_A_ONLY');
  f.a.close();await assert.rejects(()=>recovery.createSealedCheckpoint(),/INSTALLATION_HANDLES_OPEN/);off.close();const seal=await recovery.createSealedCheckpoint();assert.equal(recovery.inspectRestore(seal.id).eligible,true);
 }finally{off.close();f.a.close();f.b.close();recovery.close();}
});

test('new spool schema persists exact installation identity and reopens without migration',()=>{
 const f=fixture(),off=new OffCache(f.spool,key,f.a.authority,now);off.put(f.a.scope,'receipt','SYNTHETIC_RESTART');assert.equal(off.db.pragma('user_version',{simple:true}),SPOOL_SCHEMA);assert.deepEqual(off.db.prepare('SELECT * FROM spool_identity').all(),[{singleton:1,installation:f.a.identity}]);off.close();const file=f.a.file,identity=f.a.identity;f.a.close();const next=new Store(file,now,true,'same-scope'),reopened=new OffCache(f.spool,key,next.authority,now);
 try{assert.equal(next.identity,identity);assert.equal(reopened.get(next.scope,'receipt'),'SYNTHETIC_RESTART');}finally{reopened.close();next.close();f.b.close();}
});

test('legacy, empty, unbound and altered spool schemas fail read-only preflight without mutation',()=>{
 for(const kind of ['legacy','empty','claimed-uninitialized','unbound','altered']){
  const f=fixture();try{if(kind==='claimed-uninitialized')writeFileSync(f.spool,Buffer.alloc(0));else if(kind==='unbound'||kind==='altered'){const valid=new OffCache(f.spool,key,f.a.authority,now);if(kind==='unbound')valid.db.prepare('DELETE FROM spool_identity').run();else valid.db.exec('CREATE TABLE unrecognized_private_data(body TEXT)');valid.close();}else{const db=new Database(f.spool);if(kind==='legacy')db.exec('CREATE TABLE receipts(id TEXT PRIMARY KEY,body BLOB)');db.close();}
   chmodSync(f.spool,0o640);const bytes=readFileSync(f.spool),mode=statSync(f.spool).mode;assert.throws(()=>new OffCache(f.spool,key,f.a.authority,now),/SPOOL_UNSUPPORTED_SCHEMA|SPOOL_IDENTITY_MISMATCH/);assert.deepEqual(readFileSync(f.spool),bytes,kind);assert.equal(statSync(f.spool).mode,mode,kind);assert.equal(spoolHandles(f.a.authority),0,kind);
  }finally{f.a.close();f.b.close();}
 }
});

test('receipt AAD binds installation identity even when ciphertext is copied into an owned spool',()=>{
 const f=fixture(),a=new OffCache(f.spool,key,f.a.authority,now),b=new OffCache(path.join(f.dir,'owned-b.sqlite'),key,f.b.authority,now);
 try{a.put('same-scope','same-id','SYNTHETIC_AAD_A_ONLY');const row=a.db.prepare('SELECT * FROM receipts').get() as {id:string;scope:string;nonce:Buffer;tag:Buffer;body:Buffer;expires:number};b.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?)').run(row.id,row.scope,row.nonce,row.tag,row.body,row.expires);assert.throws(()=>b.get('same-scope','same-id'),/OFF_INPUT_UNAVAILABLE/);assert.equal(a.get('same-scope','same-id'),'SYNTHETIC_AAD_A_ONLY');
  // Delimiter collisions from the legacy scope + ':' + id encoding are distinct.
  a.put('scope:part','id','SYNTHETIC_AAD_TUPLE');const colliding=a.db.prepare('SELECT * FROM receipts WHERE scope=?').get('scope:part') as typeof row;a.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?)').run('part:id','scope',colliding.nonce,colliding.tag,colliding.body,colliding.expires);assert.throws(()=>a.get('scope','part:id'),/OFF_INPUT_UNAVAILABLE/);
 }finally{a.close();b.close();f.a.close();f.b.close();}
});

test('changed spool installation metadata fences an already-open handle',()=>{
 const f=fixture(),off=new OffCache(f.spool,key,f.a.authority,now);try{off.put('same-scope','id','SYNTHETIC');off.db.prepare('UPDATE spool_identity SET installation=?').run(f.b.identity);for(const operation of [()=>off.get('same-scope','id'),()=>off.put('same-scope','next','SYNTHETIC'),()=>off.remove('same-scope','id'),()=>off.expire(),()=>off.removeScope('same-scope')])assert.throws(operation,/SPOOL_IDENTITY_MISMATCH/);}finally{off.close();f.a.close();f.b.close();}
});

type Result={type:string;ok?:boolean;identity?:string;error?:string};
async function bounded<T>(promise:Promise<T>,label:string){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('SYNTHETIC_TIMEOUT '+label)),10000);})]);}finally{clearTimeout(timer);}}
function contender(file:string,spool:string){const child=fork(fileURLToPath(new URL('./spool-identity-process-fixture.js',import.meta.url)),[file,spool],{execArgv:[],stdio:['ignore','ignore','pipe','ipc']}),messages:Result[]=[],listeners=new Set<()=>void>();let errors='';child.stderr!.on('data',chunk=>errors+=String(chunk));const exit=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});void exit.catch(()=>{});child.on('message',value=>{messages.push(value as Result);for(const listener of listeners)listener();});
 async function receive(type:string){let notify=()=>{};const reply=new Promise<Result>(resolve=>{notify=()=>{const at=messages.findIndex(message=>message.type===type);if(at>=0)resolve(messages.splice(at,1)[0]);};listeners.add(notify);notify();});try{return await bounded(Promise.race([reply,exit.then(value=>{throw Error('SYNTHETIC_EARLY_EXIT '+JSON.stringify(value)+errors);})]),type);}finally{listeners.delete(notify);}}
 return {child,receive,exit,errors:()=>errors,start:()=>child.send({command:'start'}),release:async()=>{const released=receive('released');child.send({command:'release'});await released;const result=await bounded(exit,'release exit');assert.equal(result.code,0,errors);assert.equal(result.signal,null);}};
}
async function stop(child:ChildProcess,exit:ReturnType<typeof contender>['exit']){if(child.exitCode===null&&child.signalCode===null){assert.equal(child.kill('SIGKILL'),true);assert.equal((await bounded(exit,'cleanup')).signal,'SIGKILL');}else await bounded(exit,'exit');}

test('two independent installations racing a new spool path cannot both initialize or hold it',async()=>{
 for(let round=0;round<3;round++){
  const f=fixture(),a=contender(f.a.authority.file,f.spool),b=contender(f.b.authority.file,f.spool);
  try{await Promise.all([a.receive('ready'),b.receive('ready')]);if(round%2){b.start();a.start();}else{a.start();b.start();}const results=await Promise.all([a.receive('result'),b.receive('result')]);assert.equal(results.filter(result=>result.ok).length,1,JSON.stringify(results));assert.match(results.find(result=>!result.ok)!.error!,/SPOOL_IDENTITY_MISMATCH|SPOOL_UNSUPPORTED_SCHEMA|SPOOL_CREATION_CONFLICT/);assert.equal(spoolHandles(f.a.authority)+spoolHandles(f.b.authority),1);const owner=results[0].ok?f.a:f.b,other=results[0].ok?f.b:f.a;assert.equal(spoolHandles(owner.authority),1);assert.equal(spoolHandles(other.authority),0);assert.throws(()=>new OffCache(f.spool,key,other.authority,now),/SPOOL_IDENTITY_MISMATCH/);const own=new OffCache(f.spool,key,owner.authority,now);try{assert.equal(own.get('same-scope','same-id'),'SYNTHETIC_'+owner.identity);}finally{own.close();}await Promise.all([a.release(),b.release()]);assert.equal(spoolHandles(f.a.authority)+spoolHandles(f.b.authority),0);
  }finally{await Promise.all([stop(a.child,a.exit),stop(b.child,b.exit)]);f.a.close();f.b.close();}
 }
});
