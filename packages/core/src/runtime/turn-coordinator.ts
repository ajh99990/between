import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {Store,ProductError,parseControls,type Turn,type Controls} from '../store.js';
import {SESSION_TOOLS,type HostAdapter,type HostTurn,type HostEvent} from '@between/contracts/host';
import {OffCache} from './off-cache.js';
import {observationAttributes} from '../observability/normalize.js';
import {disabledObservationSink,type ObservationSink} from '../observability/contracts.js';

export type TurnStatus='accepted'|'queued'|'running'|'cancel_requested'|'cancelled'|'completed'|'failed'|'unknown_outcome';
type Row={conversation_id:string;turn_id:string;input_digest:string;body:string|null;memory:number;epoch:number;status:TurnStatus;sequence:number;execution_id:string|null;message_id:string|null;error_code:string|null;cancelled:number;input_lost:number;input_resolved:number;created_at:number};
const terminal=new Set<TurnStatus>(['cancelled','completed','failed','unknown_outcome']);
export class TurnCoordinator {
  private deletionTimer:ReturnType<typeof setInterval>;
  private expiryUnsubscribe?:()=>void;
  private gapWriteFailures=0; private active?:{turn:Row;execution_id:string}; private closing=false; private jobs?:Promise<void>;
  constructor(public store:Store,private host:HostAdapter,private off?:OffCache,private digestKey?:Buffer,private now=()=>Date.now(),private observations:ObservationSink=disabledObservationSink){
    if(off&&(off.authority.identity!==store.authority.identity||off.authority.file!==store.authority.file))throw new ProductError('OFF_CACHE_INSTALLATION_MISMATCH');
    if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runtime_turns'").get()&&!(store.db.pragma('table_info(runtime_turns)') as {name:string;type:string;notnull:number;dflt_value:string}[]).some(c=>c.name==='input_resolved'&&c.type==='INTEGER'&&c.notnull===1&&c.dflt_value==='0'))throw new ProductError('UNSUPPORTED_RUNTIME_SCHEMA');
    store.db.exec(`CREATE TABLE IF NOT EXISTS runtime_turns(conversation_id TEXT NOT NULL,turn_id TEXT NOT NULL,input_digest TEXT NOT NULL,body TEXT,memory INTEGER NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL,sequence INTEGER NOT NULL,execution_id TEXT,message_id TEXT,error_code TEXT,cancelled INTEGER NOT NULL DEFAULT 0,input_lost INTEGER NOT NULL DEFAULT 0,input_resolved INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(conversation_id,turn_id));
      CREATE TABLE IF NOT EXISTS executions(execution_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,turn_id TEXT NOT NULL,trace_id TEXT NOT NULL,traceparent TEXT NOT NULL,resumes_execution_id TEXT,status TEXT NOT NULL,last_sequence INTEGER NOT NULL DEFAULT -1,approval_id TEXT,policy_verified INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS host_event_ids(execution_id TEXT NOT NULL,event_id TEXT NOT NULL,sequence INTEGER NOT NULL,type TEXT NOT NULL,PRIMARY KEY(execution_id,event_id),UNIQUE(execution_id,sequence));
      CREATE TABLE IF NOT EXISTS model_attempts(execution_id TEXT NOT NULL,attempt_id TEXT NOT NULL,attempt_index INTEGER NOT NULL,status TEXT NOT NULL,response_complete INTEGER NOT NULL DEFAULT 0,input_capture_status TEXT NOT NULL,output_capture_status TEXT NOT NULL DEFAULT 'unavailable',PRIMARY KEY(execution_id,attempt_id));
      CREATE TABLE IF NOT EXISTS tool_observations(execution_id TEXT NOT NULL,tool_call_id TEXT NOT NULL,operation_id TEXT,tool TEXT NOT NULL,status TEXT NOT NULL,input_capture_status TEXT NOT NULL,output_capture_status TEXT NOT NULL,PRIMARY KEY(execution_id,tool_call_id));
      CREATE TABLE IF NOT EXISTS observation_gaps(execution_id TEXT PRIMARY KEY,last_emitted_sequence INTEGER NOT NULL DEFAULT -1,last_accepted_sequence INTEGER NOT NULL DEFAULT -1,dropped INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'disabled');
      CREATE TABLE IF NOT EXISTS render_receipts(conversation_id TEXT NOT NULL,turn_id TEXT NOT NULL,message_id TEXT PRIMARY KEY,at INTEGER NOT NULL);`);
    off?.bindScope(store.scope,()=>store.assertUsable());if(off)store.authority.requireSpool(store.scope);
    this.expiryUnsubscribe=off?.onBeforeExpire(receipts=>{
      if(this.store.isSuppressed())return;const affected=receipts.filter(receipt=>receipt.scope===this.store.scope).map(receipt=>receipt.id);
      this.store.db.transaction(()=>{for(const id of affected){const row=this.row(id);if(!row||row.input_resolved||row.status==='completed')continue;this.markInputLost(id);}})();
      if(this.active&&affected.includes(this.active.turn.turn_id))void this.host.cancelTurn(this.active.execution_id).catch(()=>{});
    });
    this.recover();this.deletionTimer=setInterval(()=>{try{if(this.store.authority.get(this.store.scope)?.state==='cleaning')this.resumeDeletion();}catch{/* Remain suppressed until durable authority and cleanup are available. */}},1000);this.deletionTimer.unref();
  }
  private row(id:string){return this.store.db.prepare('SELECT * FROM runtime_turns WHERE turn_id=? AND conversation_id=?').get(id,this.store.scope) as Row|undefined;}
  private update(id:string,status:TurnStatus,error:string|null=null){this.store.db.prepare('UPDATE runtime_turns SET status=?,error_code=?,updated_at=? WHERE turn_id=? AND conversation_id=?').run(status,error,this.now(),id,this.store.scope);}
  private markInputLost(id:string){if(this.store.isSuppressed())return;
    const current=this.row(id);
    if(current?.input_resolved)return;
    this.store.db.prepare('UPDATE runtime_turns SET input_lost=1,cancelled=0 WHERE conversation_id=? AND turn_id=?').run(this.store.scope,id);
    this.store.db.prepare('UPDATE grants SET active=0 WHERE scope=? AND turn=?').run(this.store.scope,id);
    this.update(id,this.hasWrites(id)||current?.status==='unknown_outcome'?'unknown_outcome':'failed',current?.error_code==='RESTORE_INPUT_UNAVAILABLE'?'RESTORE_INPUT_UNAVAILABLE':'OFF_INPUT_UNAVAILABLE');
    this.store.db.prepare('UPDATE scope_safety SET control_uncertain=1 WHERE scope=?').run(this.store.scope);
  }
  private hasWrites(turn_id:string){return !!this.store.db.prepare('SELECT 1 FROM operations WHERE scope=? AND turn_id=?').get(this.store.scope,turn_id);}
  private controlUncertain(){return !!(this.store.db.prepare('SELECT control_uncertain FROM scope_safety WHERE scope=?').get(this.store.scope) as {control_uncertain:number}|undefined)?.control_uncertain;}
  private resolveCancelledInputBarrier(){this.store.db.prepare('UPDATE scope_safety SET control_uncertain=0 WHERE scope=? AND NOT EXISTS(SELECT 1 FROM runtime_turns WHERE conversation_id=? AND input_lost=1 AND input_resolved=0)').run(this.store.scope,this.store.scope);}
  private recover(){if(this.store.isSuppressed()){this.blockForDeletion();return;}this.store.db.transaction(()=>{
    const rows=this.store.db.prepare('SELECT * FROM runtime_turns WHERE conversation_id=?').all(this.store.scope) as Row[];
    for(const r of rows){
      // A restore deliberately has no receipt spool. Keep its per-input barrier
      // and non-runnable error across every restart, even if an old status says
      // completed/cancel_requested. Only trusted input_resolved=1 resolves it;
      // cancelled merely says that the execution was aborted by some cause.
      if(r.input_lost&&!r.input_resolved){this.markInputLost(r.turn_id);continue;}
      if(r.cancelled||r.status==='cancel_requested'||r.status==='cancelled'){
        if(!r.memory&&!r.input_resolved){try{this.off?.get(this.store.scope,r.turn_id);if(!this.off)throw new Error();}catch{this.markInputLost(r.turn_id);continue;}}
        this.update(r.turn_id,'cancelled',this.hasWrites(r.turn_id)?'CANCELLED_WITH_COMMITTED_OPERATIONS':null);continue;
      }
      if(r.error_code?.startsWith('RESTORE_')){
        this.store.db.prepare('UPDATE grants SET active=0 WHERE scope=? AND turn=?').run(this.store.scope,r.turn_id);
        this.update(r.turn_id,this.hasWrites(r.turn_id)||r.status==='unknown_outcome'?'unknown_outcome':'failed',r.error_code);continue;
      }
      if(r.status==='running'){
        const writes=this.hasWrites(r.turn_id);
        this.update(r.turn_id,writes?'unknown_outcome':'failed',writes?'RECOVERY_REQUIRES_READBACK':'EXECUTION_INTERRUPTED');
        if(r.execution_id)this.store.db.prepare("UPDATE executions SET status='interrupted' WHERE execution_id=?").run(r.execution_id);
      }
      if(r.message_id&&!this.store.db.prepare('SELECT 1 FROM render_receipts WHERE message_id=?').get(r.message_id)){
        this.store.db.prepare("DELETE FROM messages WHERE id=? AND role='character' AND status='pending'").run(r.message_id);
        this.store.db.prepare('DELETE FROM pending WHERE id=?').run(r.message_id);
        this.update(r.turn_id,this.hasWrites(r.turn_id)||r.status==='unknown_outcome'?'unknown_outcome':'failed','UNCONFIRMED_OUTPUT_LOST');
      }
      if(['accepted','queued','running','failed','unknown_outcome'].includes(r.status)&&!r.memory){try{this.off?.get(this.store.scope,r.turn_id);if(!this.off)throw new Error();}catch{this.markInputLost(r.turn_id);}}
    }
  })();this.off?.expire();}
  /** Trusted control entrypoint. It never consumes an ordinary-message queue slot. */
  control(conversation_id:string,changes:Partial<Controls>){
    if(conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');
    this.store.assertUsable();const allowed=['memory','role','nickname','nicknameState','direction'];
    if(Object.keys(changes).some(k=>!allowed.includes(k)))throw new ProductError('INVALID_CONTROL');
    const choices:Record<string,readonly string[]>={memory:['on','off'],role:['active','paused'],nicknameState:['none','allowed','suspended'],direction:['friends','unspecified']};
    for(const [key,value] of Object.entries(changes)){
      if(key==='nickname'){if(typeof value!=='string'||value.length>20)throw new ProductError('INVALID_CONTROL');}
      else if(typeof value!=='string'||!choices[key]?.includes(value))throw new ProductError('INVALID_CONTROL');
    }
    const value=this.store.set(changes);
    if(this.active){const a=this.active;this.store.db.transaction(()=>{
      this.store.db.prepare('UPDATE runtime_turns SET cancelled=1 WHERE turn_id=? AND conversation_id=?').run(a.turn.turn_id,this.store.scope);
      this.update(a.turn.turn_id,'cancel_requested');
    })();void this.host.cancelTurn(a.execution_id).catch(()=>{});}
    return {controls:value,control_applied:true};
  }
  accept(conversation_id:string,turn_id:string,text:string){
    this.store.assertUsable();if(this.closing)throw new ProductError('SERVICE_CLOSED');if(conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');
    if(!text||text.length>8000)throw new ProductError('INVALID_INPUT');
    const memory=(parseControls(text,this.store.controls()).memory??this.store.controls().memory)==='on';
    if(!memory&&(!this.off||!this.digestKey)){
      const changes=parseControls(text,this.store.controls());if(Object.keys(changes).length)this.control(conversation_id,changes);
      throw new ProductError('OFF_CACHE_UNAVAILABLE');
    }
    const hash=this.digestKey?createHmac('sha256',this.digestKey).update(text).digest('hex'):createHash('sha256').update(text).digest('hex');
    const existing=this.row(turn_id);if(existing){if(existing.input_digest!==hash)throw new ProductError('TURN_INPUT_CONFLICT');return {duplicate:true,turn:this.publicRow(existing)};}
    if(this.controlUncertain())throw new ProductError('RECOVERY_REQUIRES_USER');
    const controls=parseControls(text,this.store.controls());if(Object.keys(controls).length)this.control(conversation_id,controls);
    const queued=(this.store.db.prepare("SELECT count(*) n FROM runtime_turns WHERE conversation_id=? AND status IN ('accepted','queued')").get(conversation_id) as {n:number}).n;
    if(queued>=20)throw new ProductError('QUEUE_FULL');
    if(!memory)this.off!.put(conversation_id,turn_id,text);
    try{this.store.db.transaction(()=>{
      const before=this.store.controls().revision,t=this.store.receive(turn_id,text);if(!t)throw new ProductError('TURN_INPUT_CONFLICT');
      const seq=(this.store.db.prepare('SELECT coalesce(max(sequence),0)+1 n FROM runtime_turns WHERE conversation_id=?').get(conversation_id) as {n:number}).n;
      this.store.db.prepare('INSERT INTO runtime_turns(conversation_id,turn_id,input_digest,body,memory,epoch,status,sequence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(conversation_id,turn_id,hash,memory?text:null,+memory,t.epoch,this.active?'queued':'accepted',seq,this.now(),this.now());
      this.store.end(t,turn_id,'accepted');
      if(this.store.controls().revision!==before&&this.active){const active=this.active;this.store.db.prepare('UPDATE runtime_turns SET cancelled=1 WHERE turn_id=? AND conversation_id=?').run(active.turn.turn_id,this.store.scope);this.update(active.turn.turn_id,'cancel_requested');void this.host.cancelTurn(active.execution_id).catch(()=>{});}
    })();}catch(e){if(!memory)this.off?.remove(conversation_id,turn_id);throw e;}
    this.pump();return {duplicate:false,turn:this.publicRow(this.row(turn_id)!)};
  }
  private publicRow(r:Row){const writes=this.hasWrites(r.turn_id),unresolved=!!r.input_lost&&!r.input_resolved;return {conversation_id:r.conversation_id,turn_id:r.turn_id,status:unresolved?(writes||r.status==='unknown_outcome'?'unknown_outcome':'failed'):r.status,sequence:r.sequence,execution_id:r.execution_id,message_id:r.message_id,error_code:unresolved?(r.error_code==='RESTORE_INPUT_UNAVAILABLE'?r.error_code:'OFF_INPUT_UNAVAILABLE'):r.error_code,cancelled:!unresolved&&!!r.cancelled,input_lost:!!r.input_lost,input_resolved:!!r.input_resolved,side_effect_outcome:writes?'committed':'none'};}
  snapshot(){if(this.store.isSuppressed())return {schema_version:1,conversation_id:this.store.scope,controls:this.store.controls(),messages:[],turns:[],deletion:this.store.deletionStatus(),host:'Qwen Code',observation:{configured:this.observations!==disabledObservationSink,platform_verified:false,gap_write_failures:this.gapWriteFailures},capabilities:{proactive:false,images:false}};this.store.assertUsable();this.off?.expire();this.store.db.prepare('UPDATE runtime_turns SET body=NULL WHERE conversation_id=? AND created_at<?').run(this.store.scope,this.now()-30*86400000);return {schema_version:1,conversation_id:this.store.scope,controls:this.store.controls(),deletion:this.store.deletionStatus(),messages:this.store.history(),turns:(this.store.db.prepare('SELECT * FROM runtime_turns WHERE conversation_id=? ORDER BY sequence DESC LIMIT 100').all(this.store.scope) as Row[]).reverse().map(r=>this.publicRow(r)),host:'Qwen Code',observation:{configured:this.observations!==disabledObservationSink,platform_verified:false,gap_write_failures:this.gapWriteFailures},capabilities:{proactive:false,images:false}};}
  async cancelTurn(conversation_id:string,turn_id:string){this.store.assertFence();if(conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');const r=this.row(turn_id);if(!r)throw new ProductError('NOT_AUTHORIZED');
    if(r.input_resolved){this.resolveCancelledInputBarrier();return this.publicRow(r);}
    if(r.status==='completed'&&!r.input_lost&&(!r.message_id||this.store.db.prepare('SELECT 1 FROM render_receipts WHERE message_id=?').get(r.message_id)))return this.publicRow(r);
    this.store.db.transaction(()=>{this.store.db.prepare('UPDATE runtime_turns SET cancelled=1,input_resolved=1 WHERE turn_id=? AND conversation_id=?').run(turn_id,conversation_id);this.update(turn_id,r.status==='running'?'cancel_requested':'cancelled',this.hasWrites(turn_id)?'CANCELLED_WITH_COMMITTED_OPERATIONS':null);this.store.db.prepare('UPDATE grants SET active=0 WHERE turn=? AND scope=?').run(turn_id,conversation_id);this.resolveCancelledInputBarrier();})();
    if(r.message_id){this.store.db.prepare("DELETE FROM messages WHERE id=? AND scope=? AND status='pending'").run(r.message_id,conversation_id);this.store.db.prepare('DELETE FROM pending WHERE id=? AND scope=?').run(r.message_id,conversation_id);this.store.transient.delete(r.message_id);}
    this.off?.remove(conversation_id,turn_id);
    if(r.status==='running'&&r.execution_id)await this.host.cancelTurn(r.execution_id);return this.publicRow(this.row(turn_id)!);
  }
  ack(conversation_id:string,turn_id:string,message_id:string){this.store.assertUsable();if(conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');return this.store.db.transaction(()=>{
    const r=this.row(turn_id);if(!r||r.message_id!==message_id||r.cancelled||r.input_lost||r.error_code?.startsWith('RESTORE_'))throw new ProductError('NOT_AUTHORIZED');
    const old=this.store.db.prepare('SELECT * FROM render_receipts WHERE message_id=?').get(message_id) as any;if(old){if(old.conversation_id!==conversation_id||old.turn_id!==turn_id)throw new ProductError('NOT_AUTHORIZED');return true;}
    this.store.ack(message_id);this.store.db.prepare('INSERT INTO render_receipts VALUES(?,?,?,?)').run(conversation_id,turn_id,message_id,this.now());return true;
  })();}
  retryTurn(conversation_id:string,turn_id:string){this.store.assertUsable();if(conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');const r=this.row(turn_id);if(!r||r.cancelled||r.status!=='failed')throw new ProductError('RECOVERY_NOT_ALLOWED');
    if(r.input_lost||r.error_code?.startsWith('RESTORE_'))throw new ProductError('RECOVERY_NOT_ALLOWED');
    if(this.controlUncertain())throw new ProductError('RECOVERY_REQUIRES_USER');
    if(['HOST_AUTH_OR_API_ERROR','HOST_POLICY_UNVERIFIED','OFF_INPUT_UNAVAILABLE','UNCONFIRMED_OUTPUT_LOST'].includes(r.error_code||''))throw new ProductError('RECOVERY_NOT_ALLOWED');
    if(this.hasWrites(turn_id))throw new ProductError('RECOVERY_REQUIRES_READBACK');
    this.update(turn_id,'queued');this.pump();return this.publicRow(this.row(turn_id)!);
  }
  start(){if(this.store.isSuppressed()){this.resumeDeletion();return;}this.pump();}
  private pump(){if(this.jobs||this.closing||this.store.isSuppressed()||this.controlUncertain())return;this.jobs=this.drain().finally(()=>{this.jobs=undefined;if(this.store.isSuppressed()){this.resumeDeletion();return;}if(!this.closing&&!this.controlUncertain()&&this.store.db.prepare("SELECT 1 FROM runtime_turns WHERE conversation_id=? AND status IN ('accepted','queued') AND cancelled=0 AND input_lost=0 AND (error_code IS NULL OR error_code NOT LIKE 'RESTORE_%')").get(this.store.scope))this.pump();});}
  private async drain(){while(!this.closing&&!this.store.isSuppressed()&&!this.controlUncertain()){const row=this.store.db.prepare("SELECT * FROM runtime_turns WHERE conversation_id=? AND cancelled=0 AND input_lost=0 AND (error_code IS NULL OR error_code NOT LIKE 'RESTORE_%') AND status IN ('accepted','queued') ORDER BY sequence LIMIT 1").get(this.store.scope) as Row|undefined;if(!row)return;await this.run(row);}}
  private async run(r:Row){const execution_id=randomUUID(),trace_id=randomBytes(16).toString('hex'),traceparent='00-'+trace_id+'-'+randomBytes(8).toString('hex')+'-01';let t:Turn|undefined,policy=false;
    try{
      const text=r.memory?r.body!:this.off!.get(r.conversation_id,r.turn_id);t=this.store.reauthorize(r.turn_id,text,!!r.memory,r.epoch);
      this.store.db.transaction(()=>{this.store.db.prepare('INSERT INTO executions(execution_id,conversation_id,turn_id,trace_id,traceparent,resumes_execution_id,status) VALUES(?,?,?,?,?,?,?)').run(execution_id,r.conversation_id,r.turn_id,trace_id,traceparent,r.execution_id,'running');this.store.db.prepare('UPDATE runtime_turns SET execution_id=? WHERE turn_id=? AND conversation_id=?').run(execution_id,r.turn_id,this.store.scope);this.update(r.turn_id,'running');})();this.active={turn:r,execution_id};
      if(this.store.controls().role==='paused'||/这句不用回/.test(text)){this.update(r.turn_id,'completed');this.store.db.prepare("UPDATE executions SET status='completed' WHERE execution_id=?").run(execution_id);return;}
      const input:HostTurn={schema_version:1,conversation_id:r.conversation_id,turn_id:r.turn_id,execution_id,trace_id,traceparent,...(r.execution_id?{resumes_execution_id:r.execution_id}:{}),grant:t.token,input:text,memory:!!r.memory,sessionToolAllowlist:SESSION_TOOLS};
      let result:string|undefined;
      for await(const event of this.host.startTurn(input)){
        if(this.store.isSuppressed())throw new ProductError('RELATIONSHIP_SUPPRESSED');if(this.row(r.turn_id)?.cancelled)throw new ProductError('TURN_CANCELLED');if(this.row(r.turn_id)?.input_lost)throw new ProductError('OFF_INPUT_UNAVAILABLE');
        if(this.closing)throw new ProductError('SERVICE_CLOSED');
        if(!this.record(input,event))continue;
        this.observe(event);
        if(event.type==='policy'){
          if(event.policy_source!=='runtime_readback'||event.hooks!=='sdk_functions'||event.managed_host_contract_version!==2||event.skip_startup_context!==true||event.upstream_usage_statistics_enabled!==false||event.upstream_telemetry_enabled!==false||event.registeredTools.length!==SESSION_TOOLS.length||SESSION_TOOLS.some(x=>!event.registeredTools.includes(x))||event.cli_version!=='0.24.7'||event.sdk_version!=='0.1.17'||event.sessionToolAllowlist.length!==SESSION_TOOLS.length||SESSION_TOOLS.some(x=>!event.sessionToolAllowlist.includes(x)))throw new ProductError('HOST_POLICY_UNVERIFIED');
          policy=true;this.store.db.prepare('UPDATE executions SET policy_verified=1 WHERE execution_id=?').run(execution_id);continue;
        }
        if(event.type==='failure')throw new ProductError(event.outcome==='unknown_outcome'?'UNKNOWN_OUTCOME':event.code);
        if(!policy)throw new ProductError('HOST_POLICY_UNVERIFIED');
        if(event.type==='approval'){this.store.db.prepare('UPDATE executions SET approval_id=? WHERE execution_id=?').run(event.status==='pending'?event.approval_id:null,execution_id);throw new ProductError('APPROVAL_DENIED');}
        if(event.type==='tool'&&!SESSION_TOOLS.includes(event.tool)){await this.host.cancelTurn(execution_id);throw new ProductError('HOST_TOOL_BOUNDARY_FAILED');}
        if(event.type==='result'){
          const attempt=this.store.db.prepare('SELECT * FROM model_attempts WHERE execution_id=? AND attempt_id=?').get(execution_id,event.attempt_id) as any;
          if(!attempt||attempt.status!=='succeeded'||!attempt.response_complete)throw new ProductError('ATTEMPT_EVIDENCE_MISSING');result=event.text;
        }
      }
      if(!policy||!result)throw new ProductError('HOST_RESULT_MISSING');
      if(this.store.isSuppressed())throw new ProductError('RELATIONSHIP_SUPPRESSED');if(this.row(r.turn_id)?.cancelled)throw new ProductError('TURN_CANCELLED');if(this.row(r.turn_id)?.input_lost)throw new ProductError('OFF_INPUT_UNAVAILABLE');
      if(this.closing)throw new ProductError('SERVICE_CLOSED');
      this.store.db.transaction(()=>{const m=this.store.prepare(t!,result!);this.store.end(t!,r.turn_id,'prepared');this.store.db.prepare('UPDATE runtime_turns SET message_id=? WHERE turn_id=? AND conversation_id=?').run(m.id,r.turn_id,this.store.scope);this.update(r.turn_id,'completed');this.store.db.prepare("UPDATE executions SET status='completed' WHERE execution_id=?").run(execution_id);})();
    }catch(e){const code=this.row(r.turn_id)?.input_lost?'OFF_INPUT_UNAVAILABLE':e instanceof ProductError?e.code:'HOST_FAILURE';if(code==='OFF_INPUT_UNAVAILABLE'&&!r.memory)this.markInputLost(r.turn_id);const writes=this.hasWrites(r.turn_id),current=this.row(r.turn_id);const status:TurnStatus=current?.cancelled?'cancelled':code==='UNKNOWN_OUTCOME'||writes||current?.status==='unknown_outcome'?'unknown_outcome':'failed';this.update(r.turn_id,status,status==='cancelled'&&writes?'CANCELLED_WITH_COMMITTED_OPERATIONS':code);this.store.db.prepare('UPDATE executions SET status=? WHERE execution_id=?').run(status,execution_id);
    }finally{const settled=this.row(r.turn_id);if(t&&settled)this.store.end(t,r.turn_id,settled.status);if(!this.store.isSuppressed()&&settled&&(settled.status==='completed'||settled.input_resolved))this.off?.remove(r.conversation_id,r.turn_id);this.active=undefined;}
  }
  private observe(event:HostEvent){
    let outcome:'accepted'|'dropped'|'disabled'='dropped';
    try{const result=this.observations.emit(Object.freeze({execution_id:event.execution_id,event_id:event.event_id,sequence:event.sequence,attributes:Object.freeze(observationAttributes(event))}));if(result==='accepted'||result==='dropped'||result==='disabled')outcome=result;}catch{/* Observation failure never replays or fails business work. */}
    // Gap metadata lives in the small business store, not in a potentially full export queue.
    try{this.store.db.prepare(`INSERT INTO observation_gaps(execution_id,last_emitted_sequence,last_accepted_sequence,dropped,status) VALUES(?,?,?,?,?) ON CONFLICT(execution_id) DO UPDATE SET last_emitted_sequence=excluded.last_emitted_sequence,last_accepted_sequence=CASE WHEN excluded.last_accepted_sequence>=0 THEN excluded.last_accepted_sequence ELSE last_accepted_sequence END,dropped=dropped+excluded.dropped,status=CASE WHEN dropped+excluded.dropped>0 THEN 'incomplete' ELSE excluded.status END`).run(event.execution_id,event.sequence,outcome==='accepted'?event.sequence:-1,outcome==='dropped'?1:0,outcome==='dropped'?'incomplete':outcome);}catch{this.gapWriteFailures++;}
  }
  private record(input:HostTurn,event:HostEvent){if(event.schema_version!==1||event.conversation_id!==input.conversation_id||event.turn_id!==input.turn_id||event.execution_id!==input.execution_id||event.trace_id!==input.trace_id||event.traceparent!==input.traceparent)throw new ProductError('HOST_CONTEXT_MISMATCH');
    return this.store.db.transaction(()=>{
      if(this.store.db.prepare('SELECT 1 FROM host_event_ids WHERE execution_id=? AND event_id=?').get(input.execution_id,event.event_id))return false;
      const last=(this.store.db.prepare('SELECT last_sequence FROM executions WHERE execution_id=?').get(input.execution_id) as any).last_sequence;if(event.sequence<=last)throw new ProductError('HOST_EVENT_OUT_OF_ORDER');
      this.store.db.prepare('INSERT INTO host_event_ids VALUES(?,?,?,?)').run(input.execution_id,event.event_id,event.sequence,event.type);this.store.db.prepare('UPDATE executions SET last_sequence=? WHERE execution_id=?').run(event.sequence,input.execution_id);
      if(event.type==='tool')this.store.db.prepare('INSERT INTO tool_observations VALUES(?,?,?,?,?,?,?) ON CONFLICT(execution_id,tool_call_id) DO UPDATE SET status=excluded.status,output_capture_status=excluded.output_capture_status').run(input.execution_id,event.tool_call_id,event.operation_id??null,event.tool,event.status,event.input.capture_status,event.output?.capture_status??'unavailable');
      if(event.type==='attempt_started')this.store.db.prepare('INSERT INTO model_attempts(execution_id,attempt_id,attempt_index,status,input_capture_status) VALUES(?,?,?,?,?)').run(input.execution_id,event.attempt_id,event.attempt_index,'running',event.input.capture_status);
      if(event.type==='attempt_finished'){const change=this.store.db.prepare('UPDATE model_attempts SET status=?,response_complete=?,output_capture_status=? WHERE execution_id=? AND attempt_id=?').run(event.status,+event.response_complete,event.output.capture_status,input.execution_id,event.attempt_id);if(change.changes!==1)throw new ProductError('ATTEMPT_EVIDENCE_MISSING');}
      return true;
    })();
  }
  /** Safety cancellation preserves content until the explicit deletion confirmation. */
  private blockForDeletion(){this.store.db.transaction(()=>{this.store.db.prepare('UPDATE grants SET active=0 WHERE scope=?').run(this.store.scope);this.store.db.prepare("UPDATE runtime_turns SET cancelled=1,status=CASE WHEN status='running' THEN 'cancel_requested' ELSE 'cancelled' END,error_code='RELATIONSHIP_SUPPRESSED' WHERE conversation_id=? AND (status IN ('accepted','queued','running') OR (status='completed' AND message_id IN (SELECT id FROM pending WHERE scope=? AND expires=0)))").run(this.store.scope,this.store.scope);})();if(this.active)void this.host.cancelTurn(this.active.execution_id).catch(()=>{});}
  planDeletion(conversation_id:string){const plan=this.store.planDeletion(conversation_id);this.blockForDeletion();return plan;}
  cancelDeletion(conversation_id:string,plan_id:string){const result=this.store.cancelDeletion(conversation_id,plan_id);return result;}
  confirmDeletion(conversation_id:string,plan_id:string,digest:string,token:string){this.store.confirmDeletion(conversation_id,plan_id,digest,token);this.blockForDeletion();return this.resumeDeletion();}
  /** A hung/cancel-failed host remains suppressed. Cleanup starts only after the
   * async generator actually settles, or on a new process with no old execution. */
  resumeDeletion(){this.store.assertFence();const state=this.store.authority.get(this.store.scope);if(state?.state!=='cleaning')return this.store.deletionStatus();if(this.active||this.jobs){this.store.authority.markStep(this.store.scope,'quiesce');return this.store.deletionStatus();}
    try{this.store.authority.markStep(this.store.scope,'spool');if(state.spool_required&&!this.off)throw new ProductError('DELETION_SPOOL_UNAVAILABLE');this.off?.removeScope(this.store.scope);this.store.clearRelationshipRecords();this.store.authority.markStep(this.store.scope,'verify');this.store.verifyRelationshipErased();this.store.authority.complete(this.store.scope);}catch(error){this.store.authority.markStep(this.store.scope,'blocked:'+(error instanceof ProductError?error.code:'DELETION_STORAGE_FAILED'));}
    return this.store.deletionStatus();
  }
  async idle(){await this.jobs;}
  async close(){this.closing=true;clearInterval(this.deletionTimer);
    // Stopping a process is not the user's explicit cancellation of an input.
    // In particular it must never resolve or hide an expired off-input barrier.
    if(this.active){if(this.store.isSuppressed())this.blockForDeletion();else await this.host.cancelTurn(this.active.execution_id);}
    await this.jobs;this.expiryUnsubscribe?.();this.expiryUnsubscribe=undefined;await this.host.close();
  }
}
