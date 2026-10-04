import type Database from 'better-sqlite3';
import {ProductError} from '../store.js';
import type {ScopeAuthority} from './authority.js';
import {minimizeSources,expireReviewCandidates,invalidateSourceDependencies} from '../memory/retention.js';

const scopedTables=['scope_controls','business_versions','scope_safety','events','messages','sources','memories','memory_fts','grants','tool_audit','pending','operations'] as const;
const runtimeTables=['runtime_turns','executions','render_receipts'] as const;
const executionTables=['host_event_ids','model_attempts','tool_observations','observation_gaps'] as const;
const shadowTables=['memory_fts_data','memory_fts_idx','memory_fts_content','memory_fts_docsize','memory_fts_config'];
const hasTable=(db:Database.Database,name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
type RestoredTurn={conversation_id:string;turn_id:string;memory:number;status:string;cancelled:number;input_lost:number;input_resolved:number;message_id:string|null;error_code:string|null};

/** Verify the complete image against the independent, current authority vector.
 * The archive is never allowed to initialize an omitted scope or revive a deleted
 * one. Process ownership is disposable metadata, not relationship content. */
export function verifyScopeVector(db:Database.Database,authority:ScopeAuthority[]):void {
  const local=db.prepare('SELECT scope,version FROM privacy_versions ORDER BY scope').all() as {scope:string;version:number}[];
  if(local.length!==authority.length)throw new ProductError('RESTORE_SCOPE_VECTOR_MISMATCH');
  for(let i=0;i<authority.length;i++){
    const current=authority[i];
    if(!current||!current.scope||!Number.isSafeInteger(current.version)||current.version<0||!Number.isSafeInteger(current.generation)||current.generation<0||![0,1].includes(current.spool_required)||!['active','deleted'].includes(current.state))throw new ProductError('RESTORE_CURRENT_AUTHORITY_REQUIRED');
    if(local[i].scope!==current.scope||local[i].version!==current.version)throw new ProductError('RESTORE_SCOPE_VECTOR_MISMATCH');
  }
  const supported=new Set<string>(['privacy_identity','privacy_versions','business_owners',...scopedTables,...runtimeTables,...executionTables,...shadowTables]);
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[])if(!supported.has(name))throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  if(hasTable(db,'runtime_turns')){
    if(!(db.pragma('table_info(runtime_turns)') as {name:string;type:string;notnull:number;dflt_value:string}[]).some(c=>c.name==='input_resolved'&&c.type==='INTEGER'&&c.notnull===1&&c.dflt_value==='0'))throw new ProductError('RESTORE_DATABASE_INVALID');
    if(db.prepare('SELECT 1 FROM runtime_turns WHERE input_resolved NOT IN (0,1) LIMIT 1').get())throw new ProductError('RESTORE_DATABASE_INVALID');
  }
  for(const table of scopedTables){
    if(!hasTable(db,table))throw new ProductError('RESTORE_DATABASE_INVALID');
    if(db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN privacy_versions p ON p.scope=r.scope WHERE p.scope IS NULL LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  }
  for(const table of runtimeTables)if(hasTable(db,table)&&db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN privacy_versions p ON p.scope=r.conversation_id WHERE p.scope IS NULL LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  if(hasTable(db,'business_owners')&&db.prepare('SELECT 1 FROM business_owners r LEFT JOIN privacy_versions p ON p.scope=r.scope WHERE p.scope IS NULL LIMIT 1').get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  for(const table of executionTables)if(hasTable(db,table)){
    if(!hasTable(db,'executions')){if(db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');}
    else if(db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN executions e ON e.execution_id=r.execution_id WHERE e.execution_id IS NULL LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  }
  if(db.prepare('SELECT 1 FROM memories m LEFT JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE s.id IS NULL LIMIT 1').get()||db.prepare('SELECT 1 FROM memory_fts f LEFT JOIN memories m ON m.id=f.id AND m.scope=f.scope WHERE m.id IS NULL OR f.text IS NOT m.text LIMIT 1').get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  for(const table of ['executions','render_receipts'])if(hasTable(db,table)){
    if(!hasTable(db,'runtime_turns')){if(db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');}
    else if(db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN runtime_turns t ON t.conversation_id=r.conversation_id AND t.turn_id=r.turn_id WHERE t.turn_id IS NULL LIMIT 1`).get())throw new ProductError('RESTORE_UNATTRIBUTED_RECORDS');
  }
  for(const current of authority){
    if(current.state==='deleted'){
      for(const table of scopedTables)if(db.prepare(`SELECT 1 FROM ${table} WHERE scope=? LIMIT 1`).get(current.scope))throw new ProductError('RESTORE_DELETED_SCOPE_RESIDUE');
      for(const table of runtimeTables)if(hasTable(db,table)&&db.prepare(`SELECT 1 FROM ${table} WHERE conversation_id=? LIMIT 1`).get(current.scope))throw new ProductError('RESTORE_DELETED_SCOPE_RESIDUE');
    }else for(const table of ['scope_controls','business_versions','scope_safety'])if(!db.prepare(`SELECT 1 FROM ${table} WHERE scope=?`).get(current.scope))throw new ProductError('RESTORE_DATABASE_INVALID');
  }
}

/** Sanitize a private staging image, before it can be activated or read. No host,
 * receipt spool or external service is consulted. Lost off inputs remain explicit
 * per-input barriers; only the trusted cancellation path may resolve them. */
export function sanitizeRestoredImage(db:Database.Database,authority:ScopeAuthority[],now:number):{unresolved_off_inputs:number} {
  if(!Number.isSafeInteger(now)||now<0)throw new ProductError('RESTORE_TIME_INVALID');
  return db.transaction(()=>{
    verifyScopeVector(db,authority);
    const turns=hasTable(db,'runtime_turns')?db.prepare('SELECT * FROM runtime_turns').all() as RestoredTurn[]:[];
    const hasReceipts=hasTable(db,'render_receipts');
    const acknowledged=(r:RestoredTurn)=>!!(r.message_id&&hasReceipts&&db.prepare('SELECT 1 FROM render_receipts WHERE conversation_id=? AND turn_id=? AND message_id=?').get(r.conversation_id,r.turn_id,r.message_id));
    // Capture these identities BEFORE changing any statuses. A completed off
    // turn already consumed its input; loss of its pending output is different.
    const unresolved=turns.filter(r=>!r.input_resolved&&(!!r.input_lost||(!r.memory&&r.error_code!=='RESTORE_OUTPUT_UNACKNOWLEDGED'&&r.status!=='completed')));
    const unresolvedKeys=new Set(unresolved.map(r=>JSON.stringify([r.conversation_id,r.turn_id])));
    db.prepare('DELETE FROM grants').run();
    db.prepare('DELETE FROM pending').run();
    db.prepare("DELETE FROM messages WHERE role='character' AND status!='confirmed'").run();
    if(hasTable(db,'business_owners'))db.prepare('DELETE FROM business_owners').run();
    for(const r of turns){
      const writes=!!db.prepare('SELECT 1 FROM operations WHERE scope=? AND turn_id=?').get(r.conversation_id,r.turn_id);
      const unacknowledged=!!r.message_id&&!acknowledged(r);
      if(unacknowledged)db.prepare("DELETE FROM messages WHERE scope=? AND id=? AND role='character'").run(r.conversation_id,r.message_id);
      if(unresolvedKeys.has(JSON.stringify([r.conversation_id,r.turn_id]))){
        db.prepare("UPDATE runtime_turns SET input_lost=1,cancelled=0,status=?,error_code='RESTORE_INPUT_UNAVAILABLE',body=NULL,updated_at=? WHERE conversation_id=? AND turn_id=?").run(writes||r.status==='unknown_outcome'?'unknown_outcome':'failed',now,r.conversation_id,r.turn_id);
        db.prepare('UPDATE scope_safety SET control_uncertain=1 WHERE scope=?').run(r.conversation_id);
      }else if(r.cancelled||r.status==='cancelled'||r.status==='cancel_requested'){
        // Execution cancellation is distinct from explicit input resolution.
        // Any unresolved off input was already captured above, regardless of it.
        db.prepare("UPDATE runtime_turns SET status='cancelled',body=CASE WHEN memory=0 THEN NULL ELSE body END,updated_at=? WHERE conversation_id=? AND turn_id=?").run(now,r.conversation_id,r.turn_id);
      }else if(r.status!=='completed'||unacknowledged){
        db.prepare('UPDATE runtime_turns SET status=?,error_code=?,body=CASE WHEN memory=0 THEN NULL ELSE body END,updated_at=? WHERE conversation_id=? AND turn_id=?').run(writes||r.status==='unknown_outcome'?'unknown_outcome':'failed',unacknowledged?'RESTORE_OUTPUT_UNACKNOWLEDGED':'RESTORE_REQUIRES_NEW_INPUT',now,r.conversation_id,r.turn_id);
      }
    }
    if(hasTable(db,'executions'))db.prepare("UPDATE executions SET status='interrupted',approval_id=NULL WHERE status='running'").run();
    const cutoff=now-30*86400000;
    expireReviewCandidates(db,now);
    invalidateSourceDependencies(db,now);
    minimizeSources(db,cutoff,now);
    db.prepare('DELETE FROM messages WHERE at<?').run(cutoff);
    db.prepare('DELETE FROM tool_audit WHERE at<?').run(cutoff);
    if(hasTable(db,'runtime_turns'))db.prepare('UPDATE runtime_turns SET body=NULL WHERE memory=0 OR created_at<?').run(cutoff);
    // Operation receipts/results, unknown outcomes and input/control tombstones
    // are evidence, not replay permission. Their removal would erase ambiguity
    // or allow old input/operation identities to be treated as new work.
    verifyScopeVector(db,authority);
    return {unresolved_off_inputs:unresolved.length};
  })();
}
