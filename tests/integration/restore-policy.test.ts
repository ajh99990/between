// Multi-scope fixtures use attached trusted views (recover=false) under one authoritative owner. Independent runtime owners are tested as denied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '@between/core/store';
import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import {OffCache} from '@between/core/runtime/off-cache';
import type {HostAdapter,HostTurn,HostEvent} from '@between/contracts/host';
import {verifyScopeVector,sanitizeRestoredImage} from '@between/core/privacy/restore-policy';
import {PrivacyAuthority} from '@between/core/privacy/authority';

// These tests use only fresh, synthetic SQLite databases and a host that cannot
// contact any provider. A nonzero call count would prove unintended replay.
class SyntheticHost implements HostAdapter {
  calls=0;cancels=0;
  gate?:Promise<void>;started?:()=>void;
  async *startTurn(_input:HostTurn):AsyncIterable<HostEvent>{this.calls++;this.started?.();if(this.gate)await this.gate;}
  resumeExecution(input:HostTurn){return this.startTurn(input);}
  async cancelTurn(){this.cancels++;}
  async close(){}
}
function fixture(memory=true,scope='synthetic-a'){
  let time=100000;const now=()=>time,dir=mkdtempSync(path.join(os.tmpdir(),'restore-policy-')),file=path.join(dir,'main.sqlite'),store=new Store(file,now,true,scope);
  store.start(true,true,memory);const key=Buffer.alloc(32,61),host=new SyntheticHost(),coordinator=new TurnCoordinator(store,host,undefined,key,now);
  return {dir,file,store,key,host,coordinator,now,advance:(ms:number)=>time+=ms};
}
async function close(f:ReturnType<typeof fixture>){await f.coordinator.close();f.store.close();}
function seedTurn(f:ReturnType<typeof fixture>,id:string,status:string,options:{memory?:boolean;cancelled?:number;input_lost?:number;input_resolved?:number;message_id?:string;error_code?:string;body?:string}={}){
  const memory=options.memory??(f.store.controls().memory==='on'),text=options.body??'SYNTHETIC '+id;
  f.store.db.prepare('INSERT INTO runtime_turns(conversation_id,turn_id,input_digest,body,memory,epoch,status,sequence,message_id,error_code,cancelled,input_lost,input_resolved,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(f.store.scope,id,createHmac('sha256',f.key).update(text).digest('hex'),memory?text:null,+memory,f.store.controls().epoch,status,(f.store.db.prepare('SELECT count(*) n FROM runtime_turns').get() as {n:number}).n+1,options.message_id??null,options.error_code??null,options.cancelled??0,options.input_lost??0,options.input_resolved??0,f.now(),f.now());
}
function row(f:ReturnType<typeof fixture>,id:string){return f.store.db.prepare('SELECT * FROM runtime_turns WHERE conversation_id=? AND turn_id=?').get(f.store.scope,id) as {status:string;cancelled:number;input_lost:number;input_resolved:number;error_code:string|null;body:string|null};}
function barrier(store:Store){return (store.db.prepare('SELECT control_uncertain FROM scope_safety WHERE scope=?').get(store.scope) as {control_uncertain:number}).control_uncertain;}

test('restore preserves every lost off-input identity and blocks until each is explicitly cancelled',async()=>{
  const f=fixture(false);let off:OffCache|undefined,restarted:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();
    const ids=['accepted','queued','running','failed','unknown'];
    for(const id of ids)seedTurn(f,id,id==='unknown'?'unknown_outcome':id,{error_code:id==='failed'?'HOST_DISCONNECTED':undefined});
    f.store.operation('committed-operation',{synthetic:true},()=>({saved:true}),'unknown');
    const receipts=f.store.db.prepare('SELECT * FROM operations').all(),controls=f.store.controls();
    const result=sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now());
    assert.deepEqual(result,{unresolved_off_inputs:5});
    for(const id of ids){assert.equal(row(f,id).input_lost,1);assert.equal(row(f,id).cancelled,0);assert.equal(row(f,id).error_code,'RESTORE_INPUT_UNAVAILABLE');}
    assert.equal(row(f,'unknown').status,'unknown_outcome');assert.equal(barrier(f.store),1);
    assert.deepEqual(f.store.db.prepare('SELECT * FROM operations').all(),receipts);assert.deepEqual(f.store.controls(),controls);
    let reapplied=false;
    f.store.operation('committed-operation',{synthetic:true},()=>{reapplied=true;return {saved:true};},'unknown');
    assert.equal(reapplied,false);
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),result);
    off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,f.store.authority,f.now);
    // Even an old spool copy with a matching input is not restore authority.
    off.put(f.store.scope,'failed','SYNTHETIC failed');
    restarted=new TurnCoordinator(f.store,f.host,off,f.key,f.now);restarted.start();await restarted.idle();
    assert.equal(f.host.calls,0);assert.equal(f.host.cancels,0);
    assert.equal(restarted.accept(f.store.scope,'failed','SYNTHETIC failed').duplicate,true);
    assert.equal(barrier(f.store),1);
    restarted.control(f.store.scope,{memory:'on'});assert.equal(barrier(f.store),1);
    for(const id of ids){
      assert.throws(()=>restarted!.retryTurn(f.store.scope,id),/RECOVERY_NOT_ALLOWED/);
      assert.throws(()=>restarted!.accept(f.store.scope,'new-'+id,'SYNTHETIC resubmission'),/RECOVERY_REQUIRES_USER/);
      await restarted.cancelTurn(f.store.scope,id);
      assert.equal(barrier(f.store),id===ids.at(-1)?0:1);
    }
    assert.deepEqual(f.store.db.prepare('SELECT * FROM operations').all(),receipts);
    restarted.start();await restarted.idle();assert.equal(f.host.calls,0);
  }finally{await restarted?.close();off?.close();await close(f);}
});

test('restore revokes grants, late ACK and every old retry without erasing committed operation results',async()=>{
  const f=fixture();let restarted:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();
    const t=f.store.receive('pending-output','SYNTHETIC favorite blue')!;f.store.context(t.token,{});
    f.store.remember(t.token,'favorite blue','original-operation');const pending=f.store.prepare(t,'SYNTHETIC unacknowledged reply');
    seedTurn(f,t.id,'completed',{message_id:pending.id});
    for(const status of ['accepted','queued','running','failed'])seedTurn(f,status,status,{error_code:status==='failed'?'HOST_DISCONNECTED':undefined});
    seedTurn(f,'unknown','unknown_outcome',{error_code:'UNKNOWN_OUTCOME'});
    seedTurn(f,'acknowledged','completed',{message_id:'confirmed-reply'});
    f.store.db.prepare("INSERT INTO messages(id,role,text,status,at,scope) VALUES(?,'character',?,'confirmed',?,?)").run('confirmed-reply','SYNTHETIC confirmed reply',f.now(),f.store.scope);
    f.store.db.prepare('INSERT INTO render_receipts VALUES(?,?,?,?)').run(f.store.scope,'acknowledged','confirmed-reply',f.now());
    const committed=f.store.db.prepare('SELECT * FROM operations').all(),controls=f.store.controls();
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),{unresolved_off_inputs:0});
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM grants').get() as {n:number}).n,0);
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM pending').get() as {n:number}).n,0);
    assert.equal(f.store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(pending.id),undefined);
    assert.equal(row(f,t.id).status,'unknown_outcome');assert.equal(row(f,t.id).cancelled,0);
    assert.equal(row(f,'unknown').status,'unknown_outcome');assert.equal(row(f,'acknowledged').status,'completed');
    assert.deepEqual(f.store.controls(),controls);assert.deepEqual(f.store.db.prepare('SELECT * FROM operations').all(),committed);
    restarted=new TurnCoordinator(f.store,f.host,undefined,f.key,f.now);restarted.start();await restarted.idle();
    assert.equal(f.host.calls,0);assert.equal(f.host.cancels,0);
    assert.throws(()=>f.store.remember(t.token,'favorite blue','original-operation'),/NOT_AUTHORIZED/);
    assert.throws(()=>restarted!.ack(f.store.scope,t.id,pending.id),/NOT_AUTHORIZED/);
    for(const id of ['accepted','queued','running','failed','unknown',t.id])assert.throws(()=>restarted!.retryTurn(f.store.scope,id),/RECOVERY_NOT_ALLOWED/);
    assert.equal(restarted.ack(f.store.scope,'acknowledged','confirmed-reply'),true);
    assert.deepEqual(f.store.db.prepare('SELECT * FROM operations').all(),committed);
  }finally{await restarted?.close();await close(f);}
});

test('completed off outputs are not lost inputs; explicit cancellations remain resolved and existing barriers survive status inconsistencies',async()=>{
  const f=fixture(false);let restarted:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();
    seedTurn(f,'complete','completed');seedTurn(f,'pending','completed',{message_id:'lost-reply'});
    seedTurn(f,'cancelled','cancelled',{cancelled:1,input_resolved:1});seedTurn(f,'cancel-requested','cancel_requested',{cancelled:1,input_resolved:1});
    seedTurn(f,'legacy-cancelled','cancelled');seedTurn(f,'legacy-cancel-requested','cancel_requested');
    seedTurn(f,'inconsistent-complete','completed',{input_lost:1});seedTurn(f,'inconsistent-cancel','cancel_requested',{input_lost:1});
    f.store.db.prepare('INSERT INTO pending VALUES(?,?,?,?,?,?)').run('lost-reply','pending',f.store.controls().revision,f.store.controls().epoch,f.now()+600000,f.store.scope);
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),{unresolved_off_inputs:4});
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),{unresolved_off_inputs:4});
    for(const id of ['complete','pending','cancelled','cancel-requested'])assert.equal(row(f,id).input_lost,0,id);
    for(const id of ['legacy-cancelled','legacy-cancel-requested']){assert.equal(row(f,id).input_lost,1);assert.equal(row(f,id).input_resolved,0);assert.equal(row(f,id).cancelled,0);}
    assert.equal(row(f,'pending').error_code,'RESTORE_OUTPUT_UNACKNOWLEDGED');
    restarted=new TurnCoordinator(f.store,f.host,undefined,f.key,f.now);restarted.start();await restarted.idle();
    assert.equal(row(f,'pending').input_lost,0);assert.equal(row(f,'inconsistent-complete').error_code,'RESTORE_INPUT_UNAVAILABLE');
    await restarted.cancelTurn(f.store.scope,'inconsistent-complete');assert.equal(barrier(f.store),1);
    await restarted.cancelTurn(f.store.scope,'legacy-cancelled');assert.equal(barrier(f.store),1);
    await restarted.cancelTurn(f.store.scope,'inconsistent-cancel');assert.equal(barrier(f.store),1);
    await restarted.cancelTurn(f.store.scope,'legacy-cancel-requested');assert.equal(barrier(f.store),0);
    assert.equal(f.host.calls,0);
  }finally{await restarted?.close();await close(f);}
});

test('restore applies raw-content retention before exposure and preserves minimum evidence, barriers and unknown outcomes',async()=>{
  const f=fixture();try{
    await f.coordinator.close();
    const retained=f.store.receive('old-memory','SYNTHETIC_DISCARD_BEFORE favorite blue SYNTHETIC_DISCARD_AFTER')!;f.store.context(retained.token,{});f.store.remember(retained.token,'favorite blue','retained-operation');
    const complete=f.store.receive('complete-memory','favorite blue')!;f.store.context(complete.token,{});f.store.remember(complete.token,complete.text,'complete-operation');
    f.store.receive('old-ordinary','SYNTHETIC_DISCARD_ORDINARY');seedTurn(f,'old-memory','unknown_outcome');seedTurn(f,'old-ordinary','failed');
    seedTurn(f,'lost-off','failed',{memory:false,input_lost:1});f.store.db.prepare('UPDATE scope_safety SET control_uncertain=1 WHERE scope=?').run(f.store.scope);
    const operations=f.store.db.prepare('SELECT * FROM operations').all(),controls=f.store.controls();f.advance(30*86400000+1);
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),{unresolved_off_inputs:1});
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM messages').get() as {n:number}).n,0);
    assert.deepEqual(f.store.db.prepare('SELECT text FROM sources WHERE text!=\'\'').all(),[{text:'favorite blue'}]);
    assert.deepEqual(f.store.db.prepare('SELECT text FROM memories WHERE status=\'active\'').all(),[{text:'favorite blue'}]);
    assert.deepEqual(f.store.db.prepare('SELECT text FROM memory_fts').all(),[{text:'favorite blue'}]);
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM tool_audit').get() as {n:number}).n,0);
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM runtime_turns WHERE body IS NOT NULL').get() as {n:number}).n,0);
    assert.equal(row(f,'old-memory').status,'unknown_outcome');assert.equal(row(f,'lost-off').input_lost,1);assert.equal(row(f,'lost-off').cancelled,0);assert.equal(barrier(f.store),1);
    assert.deepEqual(f.store.controls(),controls);assert.deepEqual(f.store.db.prepare('SELECT * FROM operations').all(),operations);
  }finally{await close(f);}
});

test('legacy cancelled lost-input rows cannot leave an orphaned barrier hidden after restore',async()=>{
  const f=fixture(false);let restarted:TurnCoordinator|undefined;
  try{
    await f.coordinator.close();seedTurn(f,'cancelled-before-crash','cancelled',{cancelled:1,input_lost:1});
    f.store.db.prepare('UPDATE scope_safety SET control_uncertain=1 WHERE scope=?').run(f.store.scope);
    assert.deepEqual(sanitizeRestoredImage(f.store.db,f.store.authority.all(),f.now()),{unresolved_off_inputs:1});
    assert.equal(barrier(f.store),1);
    restarted=new TurnCoordinator(f.store,f.host,undefined,f.key,f.now);restarted.start();await restarted.idle();
    assert.equal(barrier(f.store),1);assert.equal(f.host.calls,0);assert.equal(row(f,'cancelled-before-crash').status,'failed');assert.equal(row(f,'cancelled-before-crash').cancelled,0);
    await restarted.cancelTurn(f.store.scope,'cancelled-before-crash');assert.equal(barrier(f.store),0);
    assert.equal(row(f,'cancelled-before-crash').cancelled,1);
  }finally{await restarted?.close();await close(f);}
});

test('ordinary close and reopen preserve visible unresolved off inputs until each explicit cancellation',async()=>{
  const f=fixture(false);let off:OffCache|undefined,c:TurnCoordinator|undefined,reopened:Store|undefined,release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);let ready!:()=>void;const started=new Promise<void>(resolve=>ready=resolve);
  try{
    await f.coordinator.close();off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,f.store.authority,f.now);
    const host:HostAdapter={
      async *startTurn(input:HostTurn):AsyncIterable<HostEvent>{let sequence=0;const common=()=>({...input,event_id:randomUUID(),sequence:sequence++,occurred_at:f.now()});
        yield {...common(),type:'policy',sessionToolAllowlist:input.sessionToolAllowlist,hooks:'sdk_functions',registeredTools:input.sessionToolAllowlist,managed_host_contract_version:2,skip_startup_context:true,upstream_usage_statistics_enabled:false,upstream_telemetry_enabled:false,cli_version:'0.24.7',sdk_version:'0.1.17',policy_source:'runtime_readback'};
        f.store.context(input.grant,{});ready();await gate;
        yield {...common(),type:'failure',code:'HOST_DISCONNECTED',retryable:true,outcome:'definite_failure'};
      },resumeExecution(input){return this.startTurn(input);},async cancelTurn(){},async close(){}
    };
    c=new TurnCoordinator(f.store,host,off,f.key,f.now);c.accept(f.store.scope,'shutdown-active','SYNTHETIC active lost input');await started;
    c.accept(f.store.scope,'shutdown-queued','SYNTHETIC queued lost input');
    f.store.operation('shutdown-committed-operation',{synthetic:true},()=>({saved:true}),'shutdown-active');
    f.advance(900001);off.expire();assert.equal(barrier(f.store),1);
    const closing=c.close();release();await closing;c=undefined;
    assert.equal(row(f,'shutdown-active').status,'unknown_outcome');assert.equal(row(f,'shutdown-active').cancelled,0);assert.equal(row(f,'shutdown-active').input_lost,1);assert.equal(row(f,'shutdown-queued').cancelled,0);
    off.close();off=undefined;f.store.close();
    reopened=new Store(f.file,f.now,true,'synthetic-a');off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,reopened.authority,f.now);const hostAfter=new SyntheticHost();
    c=new TurnCoordinator(reopened,hostAfter,off,f.key,f.now);c.start();await c.idle();
    const visible=c.snapshot().turns;assert.equal(visible.length,2);assert.ok(visible.every(turn=>!turn.cancelled&&['failed','unknown_outcome'].includes(turn.status)));assert.equal(hostAfter.calls,0);
    assert.throws(()=>c!.accept(reopened!.scope,'new','SYNTHETIC new input'),/RECOVERY_REQUIRES_USER/);
    await c.cancelTurn(reopened.scope,'shutdown-active');assert.equal(barrier(reopened),1);
    await c.cancelTurn(reopened.scope,'shutdown-queued');assert.equal(barrier(reopened),0);
  }finally{release();await c?.close();off?.close();reopened?.close();await f.coordinator.close();f.store.close();}
});

test('an in-flight failure cannot reassert a barrier after the user explicitly cancels that lost input',async()=>{
  const f=fixture(false);let off:OffCache|undefined,c:TurnCoordinator|undefined,release!:()=>void;
  let ready!:()=>void;const started=new Promise<void>(resolve=>ready=resolve);
  try{
    await f.coordinator.close();f.host.gate=new Promise<void>(resolve=>release=resolve);f.host.started=ready;
    off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,f.store.authority,f.now);c=new TurnCoordinator(f.store,f.host,off,f.key,f.now);
    c.accept(f.store.scope,'explicit-cancel','SYNTHETIC explicitly cancelled input');await started;
    f.advance(900001);off.expire();assert.equal(barrier(f.store),1);
    await c.cancelTurn(f.store.scope,'explicit-cancel');assert.equal(barrier(f.store),0);
    assert.equal(row(f,'explicit-cancel').input_resolved,1);
    release();await c.idle();assert.equal(barrier(f.store),0);assert.equal(row(f,'explicit-cancel').cancelled,1);assert.equal(row(f,'explicit-cancel').status,'cancelled');assert.equal(row(f,'explicit-cancel').input_resolved,1);
  }finally{release?.();await c?.close();off?.close();await close(f);}
});

test('control-driven execution abort never resolves an off input before or after expiry, cancellation of another input, or restart',async()=>{
  for(const expiryFirst of [true,false]){
    const f=fixture(false);let off:OffCache|undefined,c:TurnCoordinator|undefined,reopened:Store|undefined,release!:()=>void,ready!:()=>void;
    const started=new Promise<void>(resolve=>ready=resolve);
    try{
      await f.coordinator.close();f.host.gate=new Promise<void>(resolve=>release=resolve);f.host.started=ready;
      off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,f.store.authority,f.now);c=new TurnCoordinator(f.store,f.host,off,f.key,f.now);
      c.accept(f.store.scope,'control-aborted','SYNTHETIC active input');await started;c.accept(f.store.scope,'other-input','SYNTHETIC other input');
      if(expiryFirst){f.advance(900001);off.expire();}
      c.control(f.store.scope,{role:'paused',memory:'off'});assert.equal(row(f,'control-aborted').input_resolved,0);assert.equal(row(f,'control-aborted').cancelled,1);
      if(!expiryFirst){assert.equal(row(f,'control-aborted').status,'cancel_requested');f.advance(900001);off.expire();}
      assert.equal(row(f,'control-aborted').input_lost,1);assert.equal(row(f,'control-aborted').input_resolved,0);
      await c.cancelTurn(f.store.scope,'other-input');assert.equal(row(f,'other-input').input_resolved,1);assert.equal(barrier(f.store),1);
      const visible=c.snapshot().turns.find(turn=>turn.turn_id==='control-aborted')!;
      assert.equal(visible.status,'failed');assert.equal(visible.cancelled,false);assert.equal(visible.input_lost,true);assert.equal(visible.input_resolved,false);
      assert.throws(()=>c!.accept(f.store.scope,'new-input','SYNTHETIC new'),/RECOVERY_REQUIRES_USER/);
      const closing=c.close();release();await closing;c=undefined;
      assert.equal(row(f,'control-aborted').status,'failed');assert.equal(row(f,'control-aborted').cancelled,0);assert.equal(row(f,'control-aborted').input_resolved,0);assert.equal(barrier(f.store),1);
      off.close();off=undefined;f.store.close();reopened=new Store(f.file,f.now,true,'synthetic-a');off=new OffCache(path.join(f.dir,'spool.sqlite'),f.key,reopened.authority,f.now);const hostAfter=new SyntheticHost();
      c=new TurnCoordinator(reopened,hostAfter,off,f.key,f.now);c.start();await c.idle();assert.equal(barrier(reopened),1);assert.equal(hostAfter.calls,0);
      const pending=c.snapshot().turns.find(turn=>turn.turn_id==='control-aborted')!;assert.equal(pending.status,'failed');assert.equal(pending.cancelled,false);assert.equal(pending.input_resolved,false);
      assert.throws(()=>c!.accept(reopened!.scope,'new-input','SYNTHETIC new'),/RECOVERY_REQUIRES_USER/);
      await c.cancelTurn(reopened.scope,'control-aborted');assert.equal(barrier(reopened),0);assert.equal(c.snapshot().turns.find(turn=>turn.turn_id==='control-aborted')!.input_resolved,true);
    }finally{release?.();await c?.close();off?.close();reopened?.close();await f.coordinator.close();f.store.close();}
  }
});

test('restore rejects development runtime images without explicit input-resolution provenance rather than migrating them',async()=>{
  const f=fixture();try{
    await f.coordinator.close();f.store.db.exec('ALTER TABLE runtime_turns DROP COLUMN input_resolved');
    assert.throws(()=>verifyScopeVector(f.store.db,f.store.authority.all()),/RESTORE_DATABASE_INVALID/);
    assert.throws(()=>new TurnCoordinator(f.store,f.host,undefined,f.key,f.now),/UNSUPPORTED_RUNTIME_SCHEMA/);
    assert.equal((f.store.db.pragma('table_info(runtime_turns)') as {name:string}[]).some(column=>column.name==='input_resolved'),false);
  }finally{await close(f);}
});

test('coordinator rejects a foreign-installation spool before creating runtime tables or binding scope, even with matching identity and key',async()=>{
  for(const sameIdentity of [false,true]){
    const dir=mkdtempSync(path.join(os.tmpdir(),'foreign-spool-coordinator-')),now=()=>100000,key=Buffer.alloc(32,61),store=new Store(path.join(dir,'main.sqlite'),now,true,'same-scope'),foreign= new PrivacyAuthority(path.join(dir,'foreign.authority.sqlite'),sameIdentity?store.identity:randomUUID(),true);
    let off:OffCache|undefined;
    try{
      store.start(true,true,false);foreign.initializeScope(store.scope);off=new OffCache(path.join(dir,'foreign-spool.sqlite'),key,foreign,now);
      let binds=0;const bind=off.bindScope.bind(off);off.bindScope=(scope,gate)=>{binds++;bind(scope,gate);};
      const before=store.db.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
      assert.throws(()=>new TurnCoordinator(store,new SyntheticHost(),off,key,now),/OFF_CACHE_INSTALLATION_MISMATCH/);
      assert.deepEqual(store.db.prepare('SELECT name FROM sqlite_master ORDER BY name').all(),before);assert.equal(binds,0);assert.equal(store.authority.get(store.scope)!.spool_required,0);
    }finally{off?.close();foreign.close();store.close();}
  }
});

test('full vector includes a deleted A tombstone and active new B, rejects partial/reordered/foreign/dirty images',async()=>{
  const f=fixture();let b:Store|undefined;try{
    const plan=f.coordinator.planDeletion(f.store.scope);
    assert.equal(f.coordinator.confirmDeletion(f.store.scope,plan.plan_id,plan.digest,plan.confirmation_token).state,'deleted');
    b=new Store(f.file,f.now,false,'synthetic-b');b.start(true,true,true);b.receive('new-input','SYNTHETIC new relationship');
    const authority=b.authority.all();assert.equal(authority.length,2);assert.equal(authority[0].state,'deleted');
    assert.doesNotThrow(()=>verifyScopeVector(b!.db,authority));
    assert.throws(()=>verifyScopeVector(b!.db,authority.slice(1)),/RESTORE_SCOPE_VECTOR_MISMATCH/);
    assert.throws(()=>verifyScopeVector(b!.db,[...authority].reverse()),/RESTORE_SCOPE_VECTOR_MISMATCH/);
    assert.throws(()=>verifyScopeVector(b!.db,authority.map((s,i)=>i?{...s,version:s.version+1}:s)),/RESTORE_SCOPE_VECTOR_MISMATCH/);
    for(const state of ['preview','cleaning'] as const)assert.throws(()=>verifyScopeVector(b!.db,authority.map((s,i)=>i?{...s,state}:s)),/RESTORE_CURRENT_AUTHORITY_REQUIRED/);
    b.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)').run('deleted-residue','user','SYNTHETIC forbidden body','confirmed',f.now(),f.store.scope,0);
    assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_DELETED_SCOPE_RESIDUE/);b.db.prepare('DELETE FROM messages WHERE id=?').run('deleted-residue');
    b.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(f.store.scope,'deleted-op','digest','{}','turn');assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_DELETED_SCOPE_RESIDUE/);b.db.prepare('DELETE FROM operations').run();
    b.db.prepare("INSERT INTO runtime_turns(conversation_id,turn_id,input_digest,body,memory,epoch,status,sequence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(f.store.scope,'deleted-turn','digest','SYNTHETIC deleted runtime',1,0,'failed',1,f.now(),f.now());assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_DELETED_SCOPE_RESIDUE/);b.db.prepare('DELETE FROM runtime_turns WHERE conversation_id=?').run(f.store.scope);
    b.db.prepare('INSERT INTO memory_fts VALUES(?,?,?)').run('orphan',null,'SYNTHETIC unattributed body');assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_UNATTRIBUTED_RECORDS/);b.db.prepare('DELETE FROM memory_fts').run();
    b.db.prepare('INSERT INTO observation_gaps(execution_id) VALUES(?)').run('orphan-execution');assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_UNATTRIBUTED_RECORDS/);b.db.prepare('DELETE FROM observation_gaps').run();
    b.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)').run('foreign','user','SYNTHETIC unknown scope','confirmed',f.now(),'foreign',0);assert.throws(()=>verifyScopeVector(b!.db,authority),/RESTORE_UNATTRIBUTED_RECORDS/);b.db.prepare('DELETE FROM messages WHERE id=?').run('foreign');
    assert.deepEqual(sanitizeRestoredImage(b.db,authority,f.now()),{unresolved_off_inputs:0});
    assert.equal((b.db.prepare('SELECT count(*) n FROM privacy_versions').get() as {n:number}).n,2);
    assert.equal((b.db.prepare('SELECT count(*) n FROM scope_controls').get() as {n:number}).n,1);
    assert.equal((b.db.prepare('SELECT count(*) n FROM business_owners').get() as {n:number}).n,0);
    assert.equal(b.history()[0].text,'SYNTHETIC new relationship');
  }finally{b?.close();await close(f);}
});
