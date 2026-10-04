import type Database from 'better-sqlite3';
/** Preserve only independently admitted exact evidence. Invalid corrected text is
 * never concatenated back into a source. Minimization is not a source edit. */
export function minimizeSources(db:Database.Database,cutoff:number,now:number,scope?:string):void {
  const scoped=scope===undefined?'':' AND scope=?',args=scope===undefined?[cutoff,now]:[cutoff,now,scope];
  const sources=db.prepare(`SELECT id,scope,revision,valid FROM sources WHERE evidence_only=0 AND at<? AND NOT EXISTS(SELECT 1 FROM grants WHERE source=sources.id AND scope=sources.scope AND active=1 AND expires>?)${scoped}`).all(...args) as {id:string;scope:string;revision:number;valid:number}[];
  for(const s of sources){
    const fragments=s.valid?db.prepare("SELECT evidence_text AS text FROM memories WHERE source=? AND source_revision=? AND scope=? AND status IN ('active','superseded','needs_review') AND evidence_text!='' ORDER BY id").all(s.id,s.revision,s.scope) as {text:string}[]:[];
    if(fragments.length)db.prepare('UPDATE sources SET text=?,evidence_only=1 WHERE id=? AND scope=?').run([...new Set(fragments.map(m=>m.text))].join('\n'),s.id,s.scope);
    else if(db.prepare('SELECT 1 FROM memories WHERE source=? AND scope=? LIMIT 1').get(s.id,s.scope))db.prepare("UPDATE sources SET text='',evidence_only=1 WHERE id=? AND scope=?").run(s.id,s.scope);
    else db.prepare('DELETE FROM sources WHERE id=? AND scope=?').run(s.id,s.scope);
  }
}

/** Incomplete quotations and unverified proposals are bounded candidates. */
export function expireReviewCandidates(db:Database.Database,now:number,scope?:string,force=false):void {
  const where="status='needs_review' AND (valid_until<=? OR ?=1)"+(scope===undefined?'':' AND scope=?'),args=scope===undefined?[now,+force]:[now,+force,scope];
  db.prepare('DELETE FROM memory_fts WHERE (id,scope) IN (SELECT id,scope FROM memories WHERE '+where+')').run(...args);
  db.prepare("UPDATE memories SET status='invalid',text='',evidence_text='',projection_json=NULL,fact_key=NULL,admission_version=NULL,admission_provenance=NULL,valid_until=CASE WHEN ?=1 THEN MAX(valid_from,?) ELSE valid_until END,revision=revision+1 WHERE "+where).run(+force,now,...args);
}

/** Fail-closed hygiene when a trusted lifecycle has invalidated/revised source
 * evidence. This is not itself a platform edit/retraction ingestion API. */
export function invalidateSourceDependencies(db:Database.Database,now:number,scope?:string):void {
  const ids="SELECT m.id,m.scope FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE m.status!='invalid' AND (s.valid=0 OR s.revision!=m.source_revision)"+(scope===undefined?'':' AND m.scope=?'),args=scope===undefined?[]:[scope];
  db.prepare('DELETE FROM memory_fts WHERE (id,scope) IN ('+ids+')').run(...args);
  db.prepare("UPDATE memories SET status='invalid',text='',evidence_text='',projection_json=NULL,fact_key=NULL,admission_version=NULL,admission_provenance=NULL,valid_until=MAX(valid_from,?),revision=revision+1 WHERE (id,scope) IN ("+ids+')').run(now,...args);
  // Already-minimized evidence is a derived memory copy, not a thirty-day
  // original transcript. Remove it when no current valid dependency remains.
  db.prepare("UPDATE sources SET text='' WHERE evidence_only=1 AND text!='' AND (valid=0 OR NOT EXISTS(SELECT 1 FROM memories m WHERE m.source=sources.id AND m.scope=sources.scope AND m.source_revision=sources.revision AND m.status IN ('active','superseded','needs_review') AND m.evidence_text!=''))"+(scope===undefined?'':' AND scope=?')).run(...args);
}

/** Shared scoped lifecycle, called only after the caller establishes its current
 * authority. Backup and installation maintenance use the exact same mutations. */
export function maintainScopeData(db:Database.Database,now:number,scope:string):void {
  const cutoff=now-30*86400000;
  expireReviewCandidates(db,now,scope);
  invalidateSourceDependencies(db,now,scope);
  minimizeSources(db,cutoff,now,scope);
  db.prepare('DELETE FROM messages WHERE scope=? AND (at<? OR id IN(SELECT id FROM pending WHERE scope=? AND expires<?))').run(scope,cutoff,scope,now);
  db.prepare('DELETE FROM grants WHERE scope=? AND expires<?').run(scope,now);
  db.prepare('DELETE FROM tool_audit WHERE scope=? AND at<?').run(scope,cutoff);
  db.prepare('DELETE FROM pending WHERE scope=? AND expires<?').run(scope,now);
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runtime_turns'").get())db.prepare('UPDATE runtime_turns SET body=NULL WHERE conversation_id=? AND (memory=0 OR created_at<?)').run(scope,cutoff);
}
