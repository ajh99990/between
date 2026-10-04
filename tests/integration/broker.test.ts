import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
test('real Node broker stdio → SQLite → coordinator, missing Qwen configuration stays system failure',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'broker-stdio-'));const entry=fileURLToPath(new URL('../../../apps/desktop/dist/runtime-entry.js',import.meta.url));
 const child=spawn(process.execPath,[entry],{env:{REL_ROOT:dir,REL_DB:path.join(dir,'state.db')},stdio:['pipe','pipe','pipe']});
 const pending=new Map<string,{resolve:(value:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
 createInterface({input:child.stdout}).on('line',line=>{const data=JSON.parse(line),wait=pending.get(data.id);if(wait){clearTimeout(wait.timer);pending.delete(data.id);data.error?wait.reject(Error(data.error)):wait.resolve(data.value);}});
 const call=(value:object)=>new Promise<any>((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('BROKER_TIMEOUT'));},5000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({schema_version:1,id,...value})+'\n');});
 try{
  await assert.rejects(()=>call({schema_version:2,action:'snapshot'}),/INVALID_INPUT/);
 const fresh=await call({action:'snapshot'});assert.equal(fresh.schema_version,1);assert.equal(fresh.controls.memory,'off');assert.equal(fresh.controls.started,false);
  await assert.rejects(()=>call({action:'start',eligible:false,accepted:true,memory:true}),/CONSENT_REQUIRED/);
  await call({action:'start',eligible:true,accepted:true,memory:true});const turn_id=randomUUID();
  await call({action:'send',conversation_id:fresh.conversation_id,turn_id,text:'SYNTHETIC safe no model'});
  let snapshot;for(let i=0;i<30;i++){snapshot=await call({action:'snapshot'});if(snapshot.turns[0].status==='failed')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(snapshot.turns[0].error_code,'HOST_UNAVAILABLE');assert.equal(snapshot.messages.filter((m:any)=>m.role==='character').length,0);
  const paused=await call({action:'control',conversation_id:fresh.conversation_id,changes:{role:'paused',memory:'off'}});assert.equal(paused.controls.role,'paused');
  await assert.rejects(()=>call({action:'send',conversation_id:fresh.conversation_id,turn_id:randomUUID(),text:'SYNTHETIC encrypted key absent'}),/OFF_CACHE_UNAVAILABLE/);
  await assert.rejects(()=>call({action:'snapshot',execute:'forbidden'}),/INVALID_INPUT/);
 }finally{const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.stdin.end();await ended;for(const p of pending.values())clearTimeout(p.timer);}
});
