import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Store} from '@between/core/store';import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';import type {HostAdapter} from '@between/contracts/host';
for(const stage of ['model_stream','before_write','after_write','pending_output','cancel'])test(`real process SIGKILL/reopen ×10, synthetic host: ${stage}`,async()=>{
 for(let i=0;i<10;i++){
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'coordinator-kill-')),'state.db');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./process-coordinator-fixture.js',import.meta.url)),file,stage],{env:{},stdio:['ignore','pipe','pipe']});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('FIXTURE_TIMEOUT'));},5000);const reader=createInterface({input:child.stdout});reader.once('line',line=>{clearTimeout(timeout);assert.equal(JSON.parse(line).stage,stage);reader.close();resolve();});child.once('error',reject);});
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await exited;
  let calls=0;const host:HostAdapter={async *startTurn(){calls++;},async *resumeExecution(){calls++;},async cancelTurn(){},async close(){}};
  const store=new Store(file),coordinator=new TurnCoordinator(store,host);
  try{coordinator.start();await coordinator.idle();assert.equal(calls,0);const turn=coordinator.snapshot().turns[0];assert.equal(turn.status,stage==='after_write'?'unknown_outcome':stage==='cancel'?'cancelled':'failed');assert.equal((store.db.prepare('SELECT count(*) n FROM operations').get() as any).n,stage==='after_write'?1:0);assert.equal(store.history().filter(m=>m.role==='character').length,0);if(stage==='pending_output')assert.equal(turn.error_code,'UNCONFIRMED_OUTPUT_LOST');}finally{await coordinator.close();store.close();}
 }
});
