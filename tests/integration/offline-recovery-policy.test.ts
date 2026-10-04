// Multi-scope fixtures use attached trusted views (recover=false) under one authoritative owner. Independent runtime owners are tested as denied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,readdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '@between/core/store';
import {OfflineRecovery} from '@between/core/privacy/offline-recovery';
import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import {OffCache} from '@between/core/runtime/off-cache';
import type {HostAdapter,HostTurn,HostEvent} from '@between/contracts/host';

// Synthetic, provider-free integration fixtures. The actual sealed checkpoint,
// encrypted archive, file replacement and normal application reopen are used.
class SyntheticHost implements HostAdapter {
  calls=0;cancels=0;
  async *startTurn(_input:HostTurn):AsyncIterable<HostEvent>{this.calls++;}
  resumeExecution(input:HostTurn){return this.startTurn(input);}
  async cancelTurn(){this.cancels++;}
  async close(){}
}
function fixture(memory=true,scope='synthetic-a'){
  const dir=mkdtempSync(path.join(os.tmpdir(),'offline-recovery-policy-')),file=path.join(dir,'main.sqlite'),directory=path.join(dir,'sealed'),spool=path.join(dir,'spool.sqlite'),key=Buffer.alloc(32,73),now=()=>100000;
  const store=new Store(file,now,true,scope);store.start(true,true,memory);
  const host=new SyntheticHost(),coordinator=new TurnCoordinator(store,host,undefined,key,now);
  return {dir,file,directory,spool,key,now,store,host,coordinator};
}
function seedTurn(store:Store,key:Buffer,now:()=>number,id:string,status:string,options:{memory?:boolean;message_id?:string;error_code?:string;body?:string}={}){
  const memory=options.memory??(store.controls().memory==='on'),text=options.body??'SYNTHETIC '+id;
  store.db.prepare('INSERT INTO runtime_turns(conversation_id,turn_id,input_digest,body,memory,epoch,status,sequence,message_id,error_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(store.scope,id,createHmac('sha256',key).update(text).digest('hex'),memory?text:null,+memory,store.controls().epoch,status,(store.db.prepare('SELECT count(*) n FROM runtime_turns').get() as {n:number}).n+1,options.message_id??null,options.error_code??null,now(),now());
}
function row(store:Store,id:string){return store.db.prepare('SELECT * FROM runtime_turns WHERE conversation_id=? AND turn_id=?').get(store.scope,id) as {status:string;error_code:string|null;cancelled:number;input_lost:number};}
function barrier(store:Store){return (store.db.prepare('SELECT control_uncertain FROM scope_safety WHERE scope=?').get(store.scope) as {control_uncertain:number}).control_uncertain;}
function count(store:Store,table:string){return (store.db.prepare(`SELECT count(*) n FROM ${table}`).get() as {n:number}).n;}
function assertCleanWork(dir:string){assert.equal(readdirSync(dir).some(name=>name.startsWith('.recovery-')),false);}

test('actual corrupt-main restore preserves deleted A tombstone alongside active new B without A content or execution',async()=>{
  const f=fixture();let b:Store|undefined,reopened:Store|undefined,recovery:OfflineRecovery|undefined,c:TurnCoordinator|undefined;
  try{
    const old=f.store.receive('deleted-input','SYNTHETIC_DELETED_A_BODY')!;f.store.context(old.token,{});f.store.remember(old.token,'SYNTHETIC_DELETED_A_BODY','deleted-operation');
    seedTurn(f.store,f.key,f.now,old.id,'failed');
    const plan=f.coordinator.planDeletion(f.store.scope);
    assert.equal(f.coordinator.confirmDeletion(f.store.scope,plan.plan_id,plan.digest,plan.confirmation_token).state,'deleted');
    b=new Store(f.file,f.now,false,'synthetic-b');b.start(true,true,true);
    const fresh=b.receive('new-input','SYNTHETIC_ACTIVE_B_BODY')!;b.context(fresh.token,{});b.remember(fresh.token,'SYNTHETIC_ACTIVE_B_BODY','new-operation');b.end(fresh,fresh.id,'completed');
    const authority=b.authority.all(),identity=b.identity,controls=b.controls(),operations=b.db.prepare('SELECT * FROM operations').all();
    await f.coordinator.close();b.close();b=undefined;f.store.close();
    recovery=new OfflineRecovery(f.file,f.directory,f.key,f.now);const seal=await recovery.createSealedCheckpoint();
    assert.deepEqual(recovery.authority.all(),authority);assert.equal(recovery.inspectRestore(seal.id).scope_count,2);
    writeFileSync(f.file,'SYNTHETIC_CORRUPT_MAIN');
    const result=recovery.activateRestore({id:seal.id,seal_id:seal.seal_id,confirmation:'activate_sealed_checkpoint'});
    assert.equal(result.restoration_performed,true);assert.equal(result.execution_started,false);assert.equal(result.unresolved_off_inputs,0);
    assert.deepEqual(recovery.authority.all(),authority);assert.equal(recovery.authority.identity,identity);
    reopened=new Store(f.file,f.now,true,'synthetic-b');
    assert.deepEqual(reopened.controls(),controls);assert.deepEqual(reopened.db.prepare('SELECT * FROM operations').all(),operations);
    assert.deepEqual(reopened.db.prepare('SELECT scope,version FROM privacy_versions ORDER BY scope').all(),authority.map(({scope,version})=>({scope,version})));
    for(const table of ['scope_controls','scope_safety','business_versions','events','messages','sources','memories','memory_fts','grants','tool_audit','pending','operations'])assert.equal((reopened.db.prepare(`SELECT count(*) n FROM ${table} WHERE scope=?`).get('synthetic-a') as {n:number}).n,0,table);
    for(const table of ['runtime_turns','executions','render_receipts'])assert.equal((reopened.db.prepare(`SELECT count(*) n FROM ${table} WHERE conversation_id=?`).get('synthetic-a') as {n:number}).n,0,table);
    assert.equal(reopened.history()[0].text,'SYNTHETIC_ACTIVE_B_BODY');assert.equal(reopened.search('ACTIVE').length,1);
    assert.equal(readFileSync(f.file).includes(Buffer.from('SYNTHETIC_DELETED_A_BODY')),false);
    c=new TurnCoordinator(reopened,f.host,undefined,f.key,f.now);c.start();await c.idle();assert.equal(f.host.calls,0);assert.equal(f.host.cancels,0);
    assertCleanWork(f.dir);
  }finally{await c?.close();reopened?.close();b?.close();await f.coordinator.close();f.store.close();recovery?.close();}
});

test('actual missing-main restore keeps two off-input barriers even with the original spool until individual trusted cancellations',async()=>{
  const f=fixture(false);let off:OffCache|undefined,reopened:Store|undefined,recovery:OfflineRecovery|undefined,c:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();off=new OffCache(f.spool,f.key,f.store.authority,f.now);
    for(const [id,status] of [['off-one','accepted'],['off-two','unknown_outcome']]){
      const text='SYNTHETIC '+id;off.put(f.store.scope,id,text);const input=f.store.receive(id,text)!;f.store.end(input,id,status);seedTurn(f.store,f.key,f.now,id,status);
    }
    // This is an execution abort caused by a system control, not an explicit
    // trusted resolution of off-one. The other unresolved input must not hide it.
    f.store.db.prepare("UPDATE runtime_turns SET status='cancel_requested',cancelled=1,input_lost=1 WHERE turn_id='off-one'").run();
    f.store.db.prepare('UPDATE scope_safety SET control_uncertain=1 WHERE scope=?').run(f.store.scope);
    f.store.operation('off-committed-operation',{synthetic:true},()=>({saved:'SYNTHETIC_COMMITTED_RESULT'}),'off-two');
    const operations=f.store.db.prepare('SELECT * FROM operations').all(),authority=f.store.authority.all();
    off.close();off=undefined;f.store.close();
    recovery=new OfflineRecovery(f.file,f.directory,f.key,f.now);const seal=await recovery.createSealedCheckpoint();
    unlinkSync(f.file);
    const result=recovery.activateRestore({id:seal.id,seal_id:seal.seal_id,confirmation:'activate_sealed_checkpoint'});
    assert.equal(result.unresolved_off_inputs,2);assert.equal(result.execution_started,false);assert.deepEqual(recovery.authority.all(),authority);
    reopened=new Store(f.file,f.now,true,'synthetic-a');off=new OffCache(f.spool,f.key,reopened.authority,f.now);
    assert.equal(off.get(reopened.scope,'off-one'),'SYNTHETIC off-one');assert.equal(off.get(reopened.scope,'off-two'),'SYNTHETIC off-two');
    c=new TurnCoordinator(reopened,f.host,off,f.key,f.now);c.start();await c.idle();
    assert.equal(count(reopened,'executions'),0);assert.equal(f.host.calls,0);assert.equal(f.host.cancels,0);
    assert.equal(row(reopened,'off-one').status,'failed');assert.equal(row(reopened,'off-two').status,'unknown_outcome');
    for(const id of ['off-one','off-two']){assert.equal(row(reopened,id).error_code,'RESTORE_INPUT_UNAVAILABLE');assert.equal(row(reopened,id).input_lost,1);assert.equal(row(reopened,id).cancelled,0);assert.throws(()=>c!.retryTurn(reopened!.scope,id),/RECOVERY_NOT_ALLOWED/);}
    assert.equal(c.accept(reopened.scope,'off-one','SYNTHETIC off-one').duplicate,true);assert.equal(barrier(reopened),1);
    assert.throws(()=>c!.accept(reopened!.scope,'resubmitted','SYNTHETIC new input'),/RECOVERY_REQUIRES_USER/);
    await c.cancelTurn(reopened.scope,'off-one');assert.equal(barrier(reopened),1);
    assert.throws(()=>c!.accept(reopened!.scope,'resubmitted','SYNTHETIC new input'),/RECOVERY_REQUIRES_USER/);
    c.start();await c.idle();assert.equal(f.host.calls,0);assert.equal(count(reopened,'executions'),0);
    await c.cancelTurn(reopened.scope,'off-two');assert.equal(barrier(reopened),0);
    assert.deepEqual(reopened.db.prepare('SELECT * FROM operations').all(),operations);
    c.accept(reopened.scope,'fresh-after-cancel','SYNTHETIC actually new input');await c.idle();assert.equal(f.host.calls,1);
    assert.deepEqual(reopened.db.prepare('SELECT * FROM operations').all(),operations);assertCleanWork(f.dir);
  }finally{await c?.close();off?.close();reopened?.close();await f.coordinator.close();f.store.close();recovery?.close();}
});

test('actual activation preserves latest off/paused/nickname controls and unknown operation evidence while revoking grants, ACK and retries',async()=>{
  const f=fixture();let reopened:Store|undefined,recovery:OfflineRecovery|undefined,c:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();
    const t=f.store.receive('committed-unknown','SYNTHETIC favorite blue')!;f.store.context(t.token,{});f.store.remember(t.token,'favorite blue','committed-memory');
    seedTurn(f.store,f.key,f.now,t.id,'unknown_outcome',{error_code:'UNKNOWN_OUTCOME'});
    f.store.set({memory:'off',role:'paused',nickname:'SYNTHETIC_NICKNAME',nicknameState:'suspended',direction:'friends'});
    // Model the archive boundary directly. No host runs to manufacture this
    // unconfirmed result or pre-restoration retry candidate.
    seedTurn(f.store,f.key,f.now,'pending-output','completed',{memory:true,message_id:'old-pending'});
    f.store.db.prepare("INSERT INTO messages(id,role,text,status,at,scope) VALUES(?,'character',?,'pending',?,?)").run('old-pending','SYNTHETIC_UNACKNOWLEDGED_BODY',f.now(),f.store.scope);
    f.store.db.prepare('INSERT INTO pending VALUES(?,?,?,?,?,?)').run('old-pending','pending-output',f.store.controls().revision,f.store.controls().epoch,f.now()+600000,f.store.scope);
    seedTurn(f.store,f.key,f.now,'old-failed','failed',{memory:true,error_code:'HOST_DISCONNECTED'});
    seedTurn(f.store,f.key,f.now,'unknown-no-operation','unknown_outcome',{memory:true,error_code:'UNKNOWN_OUTCOME'});
    const controls=f.store.controls(),operations=f.store.db.prepare('SELECT * FROM operations').all(),authority=f.store.authority.all();
    f.store.close();recovery=new OfflineRecovery(f.file,f.directory,f.key,f.now);const seal=await recovery.createSealedCheckpoint();writeFileSync(f.file,'SYNTHETIC_CORRUPT_MAIN');
    const result=recovery.activateRestore({id:seal.id,seal_id:seal.seal_id,confirmation:'activate_sealed_checkpoint'});assert.equal(result.unresolved_off_inputs,0);assert.equal(result.execution_started,false);
    reopened=new Store(f.file,f.now,true,'synthetic-a');assert.deepEqual(reopened.controls(),controls);assert.deepEqual(reopened.authority.all(),authority);
    assert.deepEqual(reopened.db.prepare('SELECT * FROM operations').all(),operations);assert.equal(count(reopened,'grants'),0);assert.equal(count(reopened,'pending'),0);
    assert.equal(reopened.db.prepare('SELECT 1 FROM messages WHERE id=?').get('old-pending'),undefined);
    assert.equal(row(reopened,t.id).status,'unknown_outcome');assert.equal(row(reopened,'unknown-no-operation').status,'unknown_outcome');
    c=new TurnCoordinator(reopened,f.host,undefined,f.key,f.now);c.start();await c.idle();assert.equal(f.host.calls,0);assert.equal(f.host.cancels,0);assert.equal(count(reopened,'executions'),0);
    assert.throws(()=>reopened!.remember(t.token,'favorite blue','committed-memory'),/NOT_AUTHORIZED/);
    assert.throws(()=>reopened!.authorize(t.token),/NOT_AUTHORIZED/);
    assert.throws(()=>c!.ack(reopened!.scope,'pending-output','old-pending'),/NOT_AUTHORIZED/);
    for(const id of [t.id,'old-failed','pending-output','unknown-no-operation'])assert.throws(()=>c!.retryTurn(reopened!.scope,id),/RECOVERY_NOT_ALLOWED/);
    assert.deepEqual(reopened.controls(),controls);assert.deepEqual(reopened.db.prepare('SELECT * FROM operations').all(),operations);assertCleanWork(f.dir);
  }finally{await c?.close();reopened?.close();await f.coordinator.close();f.store.close();recovery?.close();}
});
