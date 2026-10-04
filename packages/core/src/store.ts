import {HOST_CONTEXT_SCHEMA_VERSION} from '@between/contracts/host';
import type {Controls,Message,Turn} from '@between/contracts/records';
export type {Controls,Message,Turn} from '@between/contracts/records';
import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, chmodSync, lstatSync, openSync, closeSync, fsyncSync, constants } from 'node:fs';
import path from 'node:path';
import { createMachine, initialTransition, transition } from 'xstate';
import {PrivacyAuthority,hash,MAIN_SCHEMA,classifyProcessIdentity,pathExists,assertCanonicalParent,assertSqliteSidecars,sqliteSidecars,type HandleLease} from './privacy/authority.js';
import {businessDigest,verifySchema,tableExists} from './privacy/backup.js';
import {ADMISSION_VERSION,REVISION_ADMISSION_VERSION,admitStanding,admitRevision,chooseIds,residentEligible,toSelected,MEMORY_BYTE_BUDGET,RANKER_CANDIDATE_LIMIT,type MemoryOptions,type MemoryRow,type StandingMemoryInput,type ProposedMemoryInput,type ReviseMemoryInput,type MemoryProposalKind,type SelectedMemory} from './memory/model.js';
import {maintainScopeData,expireReviewCandidates,invalidateSourceDependencies} from './memory/retention.js';
export type {MemoryProposalKind,StandingMemoryInput,ProposedMemoryInput,ReviseMemoryInput,CandidateRanker,MemoryOptions,SelectedMemory} from './memory/model.js';

export class ProductError extends Error { constructor(public code: string) { super(code); } }
const roleMachine=createMachine({id:'role',initial:'active',states:{active:{on:{PAUSE:'paused'}},paused:{on:{RESUME:'active'}}}});
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');

// Only these unambiguous expressions change consent mechanically. Other
// language is left to the host for clarification, never guessed as permission.
export function parseControls(text:string, current:Controls): Partial<Controls> {
  const changes:Partial<Controls>={};
  // Quotes, questions and negated/meta speech are not consent. This parser
  // deliberately supports explicit independent clauses, not arbitrary NLP.
  if(/[?？“”"'「」‘’`<>]/u.test(text))return changes;
  for(const raw of text.split(/[，,。.!！；;\n]|(?:但是|不过|但)(?=只(?:想)?做朋友)/u)){
    const clause=raw.trim().replace(/^(?:不过|但是|但|请)/u,'').trim();
    if(/^(?:我(?:只)?想)?只(?:想)?做朋友$|^只想(?:当|成为)朋友$/u.test(clause))changes.direction='friends';
    if(/^(?:关闭(?:长期)?记忆|不要(?:再)?记住我|不保存(?:聊天|记忆))$/u.test(clause))changes.memory='off';
    if(/^(?:开启|打开)(?:长期)?记忆$/u.test(clause))changes.memory='on';
    const nickname=clause.match(/^(?:以后)?叫我([^\s]{1,20}?)(?:吧)?$/u);
    if(nickname&&!/[别不要]/u.test(nickname[1])){changes.nickname=nickname[1];changes.nicknameState='allowed';}
    const subject=current.nickname||changes.nickname||'';
    if(/^(?:先)?别(?:再)?(?:这样)?叫(?:我)?(?:了)?$|^不要(?:再)?叫(?:我)?(?:了)?$/u.test(clause)||(subject&&[`${subject}先别叫了`,`${subject}别叫了`].includes(clause)))changes.nicknameState='suspended';
    if(/^(?:停止|暂停|退出)(?:角色)?扮演$/u.test(clause))changes.role='paused';
    if(/^(?:恢复|继续)(?:角色)?扮演$/u.test(clause))changes.role='active';
  }
  return changes;
}

export class Store {
  db!: Database.Database;
  private lease!:HandleLease;
  private inode!:{dev:number;ino:number};
  private closed=false;
  private ownerToken?:string;
  readonly authority:PrivacyAuthority;
  readonly identity:string;
  private maintenanceTimer?:ReturnType<typeof setInterval>;
  private rankerCache=new Map<string,{signature:string;ids:string[]}>();
  transient=new Map<string,Message>();
  ephemeral=new Map<string,Turn>();
  constructor(public file:string, public now=()=>Date.now(), recover=true, readonly scope="local_alan", readonly memoryOptions:MemoryOptions={}) {
    const budget=memoryOptions.memoryByteBudget??MEMORY_BYTE_BUDGET;if(!Number.isSafeInteger(budget)||budget<0||budget>MEMORY_BYTE_BUDGET)throw new ProductError('MEMORY_BUDGET_INVALID');
    if(memoryOptions.candidateRanker!==undefined&&typeof memoryOptions.candidateRanker!=='function')throw new ProductError('MEMORY_RANKER_INVALID');
    this.memoryOptions=Object.freeze({...memoryOptions,memoryByteBudget:budget});
    // The authority lease precedes every main DB open, including read-only preflight
    // and recover=false MCP handles. An orphan authority is never new consent.
    assertCanonicalParent(file);assertCanonicalParent(file+'.authority.sqlite');
    const existingFile=pathExists(file),authorityFile=file+'.authority.sqlite',existingAuthority=pathExists(authorityFile);
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    assertSqliteSidecars(file);
    if(!existingAuthority&&(existingFile||sqliteSidecars.some(suffix=>pathExists(file+suffix))))throw new ProductError('PRIVACY_AUTHORITY_REQUIRED');
    this.authority=pathExists(authorityFile)?PrivacyAuthority.openExisting(authorityFile):new PrivacyAuthority(authorityFile,randomUUID(),true);
    this.identity=this.authority.identity;
    try{
      this.lease=this.authority.registerHandle('store');
      if(existingFile){
        const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('MAIN_DATABASE_UNVERIFIED');this.inode=stat;
        const existing=new Database(file,{readonly:true,fileMustExist:true});
        try{
          if(existing.pragma('user_version',{simple:true})!==MAIN_SCHEMA)throw new ProductError('UNSUPPORTED_DATABASE_SCHEMA');
          verifySchema(existing);
          if((existing.prepare('SELECT id FROM privacy_identity').get() as {id:string}|undefined)?.id!==this.identity)throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');
          for(const name of ['privacy_versions','events','messages','sources','memories','memory_fts','grants','tool_audit','pending','scope_controls','business_versions','operations','scope_safety'])if(!tableExists(existing,name))throw new ProductError('MAIN_DATABASE_UNVERIFIED');
          const local=existing.prepare('SELECT scope,version FROM privacy_versions ORDER BY scope').all() as {scope:string;version:number}[],all=this.authority.all();
          if(local.length!==all.length||local.some((row,i)=>row.scope!==all[i].scope||row.version!==all[i].version))throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');
          if(recover)this.checkOwner(existing);
          const seal=this.authority.getSeal() as {format?:number;schema?:number;identity?:string;business_digest?:string;authority?:unknown;incarnation?:number}|undefined;
          if(seal!==undefined){if(!seal||seal.format!==2||seal.schema!==MAIN_SCHEMA||seal.identity!==this.identity||seal.incarnation!==this.lease.incarnation||seal.business_digest!==businessDigest(existing)||JSON.stringify(seal.authority)!==JSON.stringify(all))throw new ProductError('RECOVERY_SEAL_MISMATCH');}
          this.assertFence();
          // This is the last authority operation before opening the writable main.
          // Every failed read-only check leaves the one-use seal intact.
          if(seal!==undefined)this.authority.consumeSeal(seal);
        }finally{existing.close();}
      }else{
        // Existing independent authority plus missing main must go through offline
        // recovery. Only this constructor's newly created authority can initialize.
        if(this.authority.db.prepare('SELECT 1 FROM scopes LIMIT 1').get()||this.authority.getSeal()!==undefined||this.authority.maintenanceState().epoch!==0)throw new ProductError('MAIN_DATABASE_REQUIRED');
        // An authority already on disk when construction began may be an interrupted
        // installation. Refuse to turn its absence of scopes into implicit consent.
        if(existingAuthority)throw new ProductError('MAIN_DATABASE_REQUIRED');
        const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{fsyncSync(fd);}finally{closeSync(fd);}this.inode=lstatSync(file);const directoryFd=openSync(path.dirname(file),constants.O_RDONLY);try{fsyncSync(directoryFd);}finally{closeSync(directoryFd);}
      }
      assertSqliteSidecars(file);this.db=new Database(file,{fileMustExist:true});chmodSync(file,0o600);
    this.db.exec('CREATE TABLE IF NOT EXISTS privacy_identity(id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS privacy_versions(scope TEXT PRIMARY KEY,version INTEGER NOT NULL)');
    if(!existingFile)this.db.prepare('INSERT INTO privacy_identity VALUES(?)').run(this.identity);
    this.db.pragma('journal_mode=WAL');this.db.pragma('synchronous=FULL');this.db.pragma('foreign_keys=ON');this.db.pragma('secure_delete=ON');
    if(this.db.pragma('journal_mode',{simple:true})!=='wal'||this.db.pragma('synchronous',{simple:true})!==2||this.db.pragma('foreign_keys',{simple:true})!==1||this.db.pragma('secure_delete',{simple:true})!==1)throw new ProductError('STORAGE_UNAVAILABLE');
    this.db.exec(`CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, at INTEGER NOT NULL, status TEXT NOT NULL,scope TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL,scope TEXT NOT NULL,turn_order INTEGER);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, text TEXT NOT NULL, at INTEGER NOT NULL, epoch INTEGER NOT NULL, valid INTEGER NOT NULL DEFAULT 1 CHECK(valid IN(0,1)),scope TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),evidence_only INTEGER NOT NULL DEFAULT 0 CHECK(evidence_only IN(0,1)),write_closed INTEGER NOT NULL DEFAULT 0 CHECK(write_closed IN(0,1)),turn_order INTEGER NOT NULL CHECK(turn_order>=1),turn_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES sources(id), text TEXT NOT NULL, at INTEGER NOT NULL,scope TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),record_kind TEXT NOT NULL CHECK(record_kind IN('raw_quote','resident_quote','proposed_user_report')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','invalid','superseded','needs_review')),kind TEXT NOT NULL CHECK(kind IN('fact','preference','history')),evidence_kind TEXT NOT NULL DEFAULT 'user_report' CHECK(evidence_kind='user_report'),
        source_revision INTEGER NOT NULL CHECK(source_revision>=1),evidence_text TEXT NOT NULL,projection_json TEXT,fact_key TEXT,admission_version TEXT,admission_provenance TEXT,valid_from INTEGER NOT NULL,valid_until INTEGER CHECK(valid_until IS NULL OR valid_until>=valid_from),supersedes TEXT REFERENCES memories(id),
        CHECK(record_kind!='resident_quote' OR status='invalid' OR admission_version IS NOT NULL),CHECK(record_kind!='proposed_user_report' OR status IN('invalid','needs_review')),CHECK(status!='needs_review' OR valid_until IS NOT NULL),CHECK(status!='invalid' OR (text='' AND evidence_text='' AND projection_json IS NULL AND fact_key IS NULL AND admission_version IS NULL AND admission_provenance IS NULL)));
      CREATE INDEX IF NOT EXISTS memories_scope_key ON memories(scope,fact_key,status);
      CREATE INDEX IF NOT EXISTS sources_scope_order ON sources(scope,turn_order);
      CREATE INDEX IF NOT EXISTS sources_retention ON sources(scope,evidence_only,at);
      CREATE INDEX IF NOT EXISTS memory_expiry ON memories(scope,record_kind,status,valid_until);
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED,scope UNINDEXED,text, tokenize='trigram');
      CREATE TABLE IF NOT EXISTS grants(token TEXT PRIMARY KEY, turn TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL, epoch INTEGER NOT NULL, expires INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, read_context INTEGER NOT NULL DEFAULT 0,scope TEXT NOT NULL,source_revision INTEGER NOT NULL DEFAULT 1 CHECK(source_revision>=1));
      CREATE TABLE IF NOT EXISTS tool_audit(turn TEXT NOT NULL, tool TEXT NOT NULL, at INTEGER NOT NULL,scope TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pending(id TEXT PRIMARY KEY, turn TEXT NOT NULL, revision INTEGER NOT NULL, epoch INTEGER NOT NULL, expires INTEGER NOT NULL,scope TEXT NOT NULL);
      PRAGMA user_version=${MAIN_SCHEMA};`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS scope_controls(scope TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS business_versions(scope TEXT PRIMARY KEY,version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(scope TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,turn_id TEXT NOT NULL,PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS scope_safety(scope TEXT PRIMARY KEY,control_uncertain INTEGER NOT NULL DEFAULT 0);`);
    this.db.exec("INSERT INTO memory_fts(memory_fts,rank) VALUES('secure-delete',1)");
    if((this.db.prepare("SELECT v FROM memory_fts_config WHERE k='secure-delete'").get() as {v:number}|undefined)?.v!==1)throw new ProductError('STORAGE_UNAVAILABLE');
    // Serialize authoritative ownership before creating any new scope or controls.
    if(recover)this.acquireOwner();
    const known=this.authority.get(this.scope),local=this.db.prepare('SELECT version FROM privacy_versions WHERE scope=?').get(this.scope) as {version:number}|undefined;
    if(!known&&!local){this.authority.initializeScope(this.scope);this.db.prepare('INSERT INTO privacy_versions VALUES(?,0)').run(this.scope);}
    else if(!known||!local||(known.state==='active'&&known.version!==local.version)){throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');}
    // Plaintext staging from a dead backup worker must not outlive an ordinary
    // application restart, even when no key or BackupManager is configured.
    this.authority.recoverAbandonedWork();this.authority.expireSealedArchives(this.now());
    const [initial]=initialTransition(roleMachine);
    if(this.authority.get(this.scope)!.state!=='deleted'){this.db.prepare('INSERT OR IGNORE INTO scope_controls VALUES(?,?)').run(this.scope,JSON.stringify({memory:'off',role:initial.value,direction:'unspecified',nickname:'',nicknameState:'none',revision:0,epoch:0,started:false}));
    this.db.prepare('INSERT OR IGNORE INTO business_versions VALUES(?,0)').run(this.scope);
    this.db.prepare('INSERT OR IGNORE INTO scope_safety VALUES(?,0)').run(this.scope);}
    if(recover&&!this.isSuppressed()){this.db.prepare("UPDATE events SET status='failed_restart' WHERE status='generating' AND scope=?").run(this.scope);this.db.prepare('UPDATE grants SET active=0 WHERE scope=?').run(this.scope);this.db.prepare("DELETE FROM messages WHERE role='character' AND status='pending' AND scope=?").run(this.scope);this.db.prepare('DELETE FROM pending WHERE scope=?').run(this.scope);}
    this.purge();
    if(recover){this.maintenanceTimer=setInterval(()=>{try{if(!this.closed)this.maintainInstallation();}catch{/* Reads/writes still fail closed; no false cleanup confirmation. */}},1000);this.maintenanceTimer.unref();}
    }catch(error){if(this.db?.open)this.db.close();if(this.lease)try{this.authority.releaseHandle(this.lease);}catch{/* Original failure remains authoritative. */}this.authority.close();throw error;}
  }
  private checkOwner(db:Database.Database){
    if(!tableExists(db,'business_owners'))return;
    const owners=db.prepare('SELECT pid,token FROM business_owners').all() as {pid:number;token:string}[];for(const old of owners){
    const handle=this.authority.db.prepare("SELECT owner FROM handles WHERE id=? AND kind='store'").get(old.token) as {owner:string}|undefined;
    if(!handle)continue;let owner:unknown;try{owner=JSON.parse(handle.owner);}catch{throw new ProductError('DATABASE_OWNER_UNKNOWN');}
    const state=classifyProcessIdentity(owner);if(state==='unknown')throw new ProductError('DATABASE_OWNER_UNKNOWN');if(state==='live')throw new ProductError('DATABASE_ALREADY_OPEN');}
  }
  private acquireOwner(){
    this.db.exec('CREATE TABLE IF NOT EXISTS business_owners(scope TEXT PRIMARY KEY,pid INTEGER NOT NULL,token TEXT NOT NULL)');
    this.db.transaction(()=>{this.checkOwner(this.db);this.db.prepare('INSERT OR REPLACE INTO business_owners VALUES(?,?,?)').run(this.scope,process.pid,this.lease.id);}).immediate();this.ownerToken=this.lease.id;
  }
  assertFence(){assertCanonicalParent(this.file);assertSqliteSidecars(this.file);if(this.closed)throw new ProductError('INSTALLATION_HANDLE_STALE');this.authority.assertHandle(this.lease);let stat;try{stat=lstatSync(this.file);}catch{throw new ProductError('MAIN_DATABASE_REQUIRED');}if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.dev!==this.inode.dev||stat.ino!==this.inode.ino)throw new ProductError('MAIN_DATABASE_STALE');}
  isSuppressed(){this.assertFence();return this.authority.get(this.scope)?.state!=='active';}
  assertUsable(){this.assertFence();const state=this.authority.get(this.scope);if(!state)throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');if(state.state!=='active')throw new ProductError(state.state==='preview'?'RELATIONSHIP_SUPPRESSED':'RELATIONSHIP_DELETED');const local=this.db.prepare('SELECT version FROM privacy_versions WHERE scope=?').get(this.scope) as {version:number}|undefined;if(!local||state.version!==local.version)throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');}
  /** Advance outside the backup, before the enclosing business transaction commits.
   * A crash/outer rollback in this gap requires recovery review, never old consent. */
  private advanceAuthority(){const local=this.db.prepare('SELECT version FROM privacy_versions WHERE scope=?').get(this.scope) as {version:number};const version=this.authority.advance(this.scope,local.version);this.db.prepare('UPDATE privacy_versions SET version=? WHERE scope=?').run(version,this.scope);}
  controls():Controls {if(this.isSuppressed())return {memory:'off',role:'paused',direction:'unspecified',nickname:'',nicknameState:'none',revision:0,epoch:this.authority.get(this.scope)!.generation,started:false};this.assertUsable();return JSON.parse((this.db.prepare('SELECT data FROM scope_controls WHERE scope=?').get(this.scope) as {data:string}).data);}
  private write(c:Controls){this.assertUsable();this.db.prepare('UPDATE scope_controls SET data=? WHERE scope=?').run(JSON.stringify(c),this.scope);}
  start(eligible:boolean,accepted:boolean,memory:boolean){if(!eligible||!accepted)throw new ProductError('CONSENT_REQUIRED');return this.set({started:true,memory:memory?'on':'off'});}
  set(changes:Partial<Controls>){this.assertUsable();return this.db.transaction(()=>{
    const c=this.controls();if(changes.role){const [initial]=initialTransition(roleMachine);const from=roleMachine.resolveState({value:c.role,context:initial.context});const [next]=transition(roleMachine,from,{type:changes.role==='paused'?'PAUSE':'RESUME'});changes.role=next.value as Controls['role'];}
    if(Object.entries(changes).every(([key,value])=>c[key as keyof Controls]===value))return c;
    const next={...c,...changes,revision:c.revision+1,epoch:c.epoch+(changes.memory && changes.memory!==c.memory?1:0)};
    this.write(next);this.rankerCache.clear();
    this.db.prepare('UPDATE grants SET active=0 WHERE scope=?').run(this.scope);
    this.db.prepare("DELETE FROM messages WHERE role='character' AND status='pending' AND scope=?").run(this.scope);
    this.db.prepare('DELETE FROM pending WHERE scope=?').run(this.scope);
    for(const [id,m] of this.transient)if(m.role==='character'&&m.status==='pending')this.transient.delete(id);
    if(next.memory==='off')this.transient.clear();
    if(next.memory==='off'||next.role==='paused'){expireReviewCandidates(this.db,this.now(),this.scope,true);invalidateSourceDependencies(this.db,this.now(),this.scope);}
    this.advanceAuthority();return next;
  })();}
  receive(event:string,text:string):Turn|null {
    this.assertUsable();this.purge();
    return this.db.transaction(()=>{
      if(this.db.prepare('SELECT id FROM events WHERE id=? AND scope=?').get(digest(JSON.stringify([this.scope,event])),this.scope))return null;
      const before=this.controls();if(!before.started)throw new ProductError('CONSENT_REQUIRED');
      this.db.prepare('INSERT INTO events(id,at,status,scope) VALUES(?,?,?,?)').run(digest(JSON.stringify([this.scope,event])),this.now(),'generating',this.scope);
      const changes=parseControls(text,before);if(Object.keys(changes).length)this.set(changes);
      const c=this.controls(); const source=digest(JSON.stringify([this.scope,event])),id=event,token=randomUUID()+randomUUID();
      const t={id,token,source,revision:c.revision,epoch:c.epoch,text,memory:c.memory==='on'};const order=this.turnOrder(event);
      if(t.memory){this.db.prepare('INSERT INTO sources(id,text,at,epoch,valid,scope,turn_order,turn_id) VALUES(?,?,?,?,1,?,?,?)').run(source,text,this.now(),c.epoch,this.scope,order,event);this.db.prepare('INSERT INTO messages(id,role,text,status,at,scope,turn_order) VALUES(?,?,?,?,?,?,?)').run(digest(JSON.stringify([this.scope,event])),'user',text,'confirmed',this.now(),this.scope,order);}
      else {this.transient.set(event,{id:event,role:'user',text,status:'confirmed',at:this.now(),turn_order:order});this.ephemeral.set(token,t);}
      this.db.prepare('INSERT INTO grants(token,turn,source,revision,epoch,expires,scope) VALUES(?,?,?,?,?,?,?)').run(digest(token),id,source,c.revision,c.epoch,this.now()+600000,this.scope);
      this.advanceAuthority();return t;
    })();
  }
  authorize(token:string){this.assertUsable();if((this.db.prepare('SELECT control_uncertain FROM scope_safety WHERE scope=?').get(this.scope) as {control_uncertain:number}).control_uncertain)throw new ProductError('RECOVERY_REQUIRES_USER');const grant=this.db.prepare('SELECT * FROM grants WHERE token=? AND scope=?').get(digest(token),this.scope) as any;const c=this.controls();if(!grant||!grant.active||grant.expires<=this.now()||grant.epoch!==c.epoch||grant.revision!==c.revision)throw new ProductError('NOT_AUTHORIZED');return grant as {turn:string;source:string;revision:number;epoch:number;read_context:number;source_revision:number};}
  reauthorize(event:string,text:string,memory:boolean,epoch:number):Turn {
    this.assertUsable();return this.db.transaction(()=>{
      const c=this.controls();if(c.epoch!==epoch||memory!==(c.memory==='on'))throw new ProductError('STALE_REVISION');
      if(!this.db.prepare('SELECT id FROM events WHERE id=? AND scope=?').get(digest(JSON.stringify([this.scope,event])),this.scope))throw new ProductError('NOT_AUTHORIZED');
      const source=digest(JSON.stringify([this.scope,event])),token=randomUUID()+randomUUID();
      if(memory){const row=this.db.prepare('SELECT text FROM sources WHERE id=? AND scope=? AND valid=1').get(source,this.scope) as {text:string}|undefined;if(!row||row.text!==text)throw new ProductError('INVALID_SOURCE');}
      const t={id:event,token,source,revision:c.revision,epoch:c.epoch,text,memory};
      this.db.prepare('INSERT INTO grants(token,turn,source,revision,epoch,expires,scope) VALUES(?,?,?,?,?,?,?)').run(digest(token),event,source,c.revision,c.epoch,this.now()+600000,this.scope);
      if(!memory)this.ephemeral.set(token,t);
      return t;
    })();
  }
  version(){this.assertFence();return (this.db.prepare('SELECT version FROM business_versions WHERE scope=?').get(this.scope) as {version:number}).version;}
  operation<T>(id:string,input:unknown,apply:()=>T,turn_id:string):{result:T;state_version_before:number;state_version_after:number;committed:boolean;readback_version:number} {
    this.assertUsable();const inputDigest=digest(JSON.stringify({turn_id,input}));
    const committed=this.db.transaction(()=>{
      const old=this.db.prepare('SELECT digest,result,turn_id FROM operations WHERE scope=? AND id=?').get(this.scope,id) as {digest:string;result:string;turn_id:string}|undefined;
      if(old){if(old.turn_id!==turn_id||old.digest!==inputDigest)throw new ProductError('OPERATION_CONFLICT');return JSON.parse(old.result);}
      const before=this.version(),result=apply();
      this.db.prepare('UPDATE business_versions SET version=version+1 WHERE scope=?').run(this.scope);
      const value={result,state_version_before:before,state_version_after:this.version(),committed:true};
      this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(this.scope,id,inputDigest,JSON.stringify(value),turn_id);this.advanceAuthority();return value;
    })();
    return {...committed,readback_version:this.version()};
  }
  context(token:string,character:unknown){this.assertFence();return this.db.transaction(()=>{
    const g=this.authorize(token);this.db.prepare('UPDATE grants SET read_context=1 WHERE token=?').run(digest(token));this.db.prepare('INSERT INTO tool_audit(turn,tool,at,scope) VALUES(?,?,?,?)').run(g.turn,'read_context',this.now(),this.scope);
    const c=this.controls(),ephemeral=this.ephemeral.get(token);const source=c.memory==='on'?this.db.prepare('SELECT text FROM sources WHERE id=? AND valid=1 AND scope=? AND revision=? AND evidence_only=0').get(g.source,this.scope,g.source_revision) as {text:string}|undefined:ephemeral?{text:ephemeral.text}:undefined;
    if(!source)throw new ProductError('INVALID_SOURCE');
    const selected=this.selectMemories(source.text,g.turn,token);
    return {schema_version:HOST_CONTEXT_SCHEMA_VERSION,character,controls:c,current_input:{source_id:g.source,text:source.text},history:this.contextHistory(g.turn,c.memory==='on'),memories:selected.memories,memory_selection:selected.stats,capabilities:{text:true,proactive:false,images:false,real_world_actions:false},rules:'User statements are self reports, not independently verified facts. Raw quotations are historical utterances, not current preferences. Author examples are not shared history. Current input and controls take priority. Do not proactively repeat more than one old memory. No relationship upgrading in this phase. Never deny AI identity.'};
  })();}
  private turnOrder(turn:string):number{return (this.db.prepare('SELECT rowid AS sequence FROM events WHERE id=? AND scope=?').get(digest(JSON.stringify([this.scope,turn])),this.scope) as {sequence:number}).sequence;}
  private contextHistory(turn:string,memory:boolean):Message[]{
    const order=this.turnOrder(turn);
    if(memory)return this.db.prepare(`SELECT id,role,text,status,at FROM (SELECT rowid AS seq,* FROM messages WHERE scope=? AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM sources s WHERE s.scope=messages.scope AND s.turn_order=messages.turn_order AND (s.evidence_only=1 OR s.valid=0 OR s.revision!=1)) AND (turn_order<? OR (turn_order=? AND role='user')) ORDER BY turn_order DESC,role ASC,rowid DESC LIMIT 10) ORDER BY turn_order,role DESC,seq`).all(this.scope,order,order) as Message[];
    return [...this.transient.values()].filter(m=>m.status==='confirmed'&&m.turn_order!==undefined&&(m.turn_order<order||(m.turn_order===order&&m.role==='user'))).sort((a,b)=>(a.turn_order!-b.turn_order!)||(a.role==='user'?-1:1)).slice(-10);
  }
  private memoryWriteSource(token:string){
    const g=this.authorize(token);if(!g.read_context)throw new ProductError('CONTEXT_REQUIRED');
    const c=this.controls();if(c.memory==='off')throw new ProductError('MEMORY_DISABLED');
    const source=this.db.prepare('SELECT * FROM sources WHERE id=? AND scope=?').get(g.source,this.scope) as {id:string;text:string;epoch:number;valid:number;revision:number;evidence_only:number;write_closed:number;turn_order:number;turn_id:string}|undefined;
    if(!source||!source.valid||source.epoch!==c.epoch||source.revision!==g.source_revision)throw new ProductError('INVALID_SOURCE');
    return {g,source};
  }
  private insertMemory(source:{id:string;revision:number;text:string},text:string,options:{record_kind:MemoryRow['record_kind'];status:MemoryRow['status'];proposed_kind?:MemoryProposalKind;admission_version?:string;evidence?:string;supersedes?:string;valid_until?:number;provenance?:string}){
    const {record_kind,status,proposed_kind}=options,evidence=options.evidence??text,supersedes=options.supersedes??null;
    const id=digest(JSON.stringify([this.scope,source.id,text,record_kind,proposed_kind??null,supersedes]));
    const existing=this.db.prepare('SELECT * FROM memories WHERE id=? AND scope=?').get(id,this.scope) as MemoryRow|undefined;
    if(existing){if(existing.status==='invalid'||existing.status==='superseded')throw new ProductError('STALE_REVISION');return id;}
    this.db.prepare('INSERT INTO memories(id,source,text,evidence_text,at,scope,record_kind,kind,source_revision,projection_json,fact_key,admission_version,valid_from,supersedes,status,valid_until,admission_provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,source.id,text,evidence,this.now(),this.scope,record_kind,proposed_kind??'history',source.revision,null,null,options.admission_version??null,this.now(),supersedes,status,options.valid_until??null,options.provenance??null);
    this.db.prepare('INSERT INTO memory_fts VALUES(?,?,?)').run(id,this.scope,text);return id;
  }
  remember(token:string,quote:string,operation_id:string){this.assertFence();return this.db.transaction(()=>{
    const {g,source}=this.memoryWriteSource(token);
    const receipt=this.operation(operation_id,{mode:'quote',source_id:g.source,source_revision:source.revision,epoch:g.epoch,quote},()=>{
      if(source.evidence_only||source.write_closed)throw new ProductError('INVALID_SOURCE');
      if(!quote||!source.text.includes(quote)||quote.length>500)throw new ProductError('INVALID_SOURCE');
      const status=quote===source.text?'active':'needs_review',id=this.insertMemory(source,quote,{record_kind:'raw_quote',status,...(status==='needs_review'?{valid_until:this.now()+4*3600000}:{})});
      this.db.prepare('INSERT INTO tool_audit(turn,tool,at,scope) VALUES(?,?,?,?)').run(g.turn,'remember_user_report',this.now(),this.scope);
      return {id,kind:'user_report',source:g.source,status,record_kind:'raw_quote'};
    },g.turn);
    return this.memoryReadback(receipt);
  })();}
  rememberStanding(token:string,input:StandingMemoryInput){this.assertFence();return this.db.transaction(()=>{
    const {g,source}=this.memoryWriteSource(token);
    const receipt=this.operation(input.operation_id,{mode:'standing',source_id:g.source,source_revision:source.revision,epoch:g.epoch,quote:input.quote,expected_version:input.expected_version},()=>{
      if(source.evidence_only||source.write_closed)throw new ProductError('INVALID_SOURCE');
      if(this.version()!==input.expected_version)throw new ProductError('STALE_REVISION');
      if(!admitStanding(source.text,input.quote))throw new ProductError('UNSUPPORTED_MEMORY_SEMANTICS');
      const id=this.insertMemory(source,input.quote,{record_kind:'resident_quote',status:'active',admission_version:ADMISSION_VERSION,provenance:JSON.stringify({kind:'explicit_save',source_revision:source.revision,source_sha256:digest(source.text),span_start:0,span_length:source.text.length})});
      this.db.prepare('INSERT INTO tool_audit(turn,tool,at,scope) VALUES(?,?,?,?)').run(g.turn,'remember_user_report',this.now(),this.scope);
      return {id,revision:1,kind:'user_report',record_kind:'resident_quote',status:'active',source:g.source};
    },g.turn);
    return this.memoryReadback(receipt);
  })();}
  rememberProposed(token:string,input:ProposedMemoryInput){this.assertFence();return this.db.transaction(()=>{
    const {g,source}=this.memoryWriteSource(token);
    if(!['fact','preference','history'].includes(input.proposed_kind))throw new ProductError('UNSUPPORTED_MEMORY_SEMANTICS');
    const receipt=this.operation(input.operation_id,{mode:'propose',source_id:g.source,source_revision:source.revision,epoch:g.epoch,quote:input.quote,proposed_kind:input.proposed_kind,expected_version:input.expected_version},()=>{
      if(source.evidence_only||source.write_closed)throw new ProductError('INVALID_SOURCE');
      if(this.version()!==input.expected_version)throw new ProductError('STALE_REVISION');
      if(input.quote!==source.text||input.quote.length>500)throw new ProductError('INVALID_SOURCE');
      // Canonical DTO validation does not establish semantic accuracy. In this
      // version proposals cannot grant resident or retrieval eligibility.
      const id=this.insertMemory(source,input.quote,{record_kind:'proposed_user_report',status:'needs_review',proposed_kind:input.proposed_kind,valid_until:this.now()+4*3600000});
      this.db.prepare('INSERT INTO tool_audit(turn,tool,at,scope) VALUES(?,?,?,?)').run(g.turn,'remember_user_report',this.now(),this.scope);
      return {id,revision:1,kind:'user_report',record_kind:'proposed_user_report',status:'needs_review',source:g.source};
    },g.turn);
    return this.memoryReadback(receipt);
  })();}
  private memoryReadback<T extends {result:{id:string}}>(receipt:T){
    const row=this.db.prepare('SELECT id,status,revision FROM memories WHERE id=? AND scope=?').get(receipt.result.id,this.scope) as {id:string;status:string;revision:number}|undefined;
    return {...receipt,readback_memory:row||null};
  }
  private invalidateRepresentations(source:string,oldText:string){
    const where="source=? AND scope=? AND status!='invalid' AND (instr(text,?)>0 OR instr(evidence_text,?)>0 OR (text!='' AND instr(?,text)>0))",args=[source,this.scope,oldText,oldText,oldText];
    this.db.prepare('DELETE FROM memory_fts WHERE (id,scope) IN (SELECT id,scope FROM memories WHERE '+where+')').run(...args);
    this.db.prepare("UPDATE memories SET status='invalid',text='',evidence_text='',projection_json=NULL,fact_key=NULL,admission_version=NULL,admission_provenance=NULL,valid_until=MAX(valid_from,?),revision=revision+1 WHERE "+where).run(this.now(),...args);
  }
  reviseMemory(token:string,input:ReviseMemoryInput){this.assertFence();return this.db.transaction(()=>{
    const {g,source}=this.memoryWriteSource(token);
    if(!['correction','change'].includes(input.mode))throw new ProductError('UNSUPPORTED_MEMORY_SEMANTICS');
    const receipt=this.operation(input.operation_id,{mode:'revise',revision_mode:input.mode,source_id:g.source,source_revision:source.revision,epoch:g.epoch,target_id:input.target_id,target_revision:input.target_revision,quote:input.quote,replacement_quote:input.replacement_quote,expected_version:input.expected_version},()=>{
      if(source.evidence_only||source.write_closed)throw new ProductError('INVALID_SOURCE');
      if(this.version()!==input.expected_version)throw new ProductError('STALE_REVISION');
      const target=this.db.prepare('SELECT m.*,s.turn_order AS source_order,s.at AS source_at FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE m.id=? AND m.scope=? AND s.valid=1 AND s.revision=m.source_revision').get(input.target_id,this.scope) as MemoryRow|undefined;
      if(!target||target.status!=='active'||target.revision!==input.target_revision||target.valid_from>this.now()||(target.valid_until!==null&&target.valid_until<=this.now())||target.source_order>=source.turn_order)throw new ProductError('STALE_REVISION');
      if(!admitRevision(source.text,input.quote,input.replacement_quote,input.mode,target.text))throw new ProductError('UNSUPPORTED_MEMORY_SEMANTICS');
      if(input.mode==='correction'){
        this.invalidateRepresentations(target.source,target.text);
      }else{
        const equivalents=this.db.prepare("SELECT id FROM memories WHERE source=? AND source_revision=? AND text=? AND scope=? AND status='active'").all(target.source,target.source_revision,target.text,this.scope) as {id:string}[];
        for(const row of equivalents){this.db.prepare("UPDATE memories SET status='superseded',valid_until=?,revision=revision+1 WHERE id=? AND scope=?").run(this.now(),row.id,this.scope);this.db.prepare('DELETE FROM memory_fts WHERE id=? AND scope=?').run(row.id,this.scope);}
      }
      // Earlier tools in this SAME turn may already have copied the whole
      // old/new instruction, an old fragment, or old-bearing evidence. Retire
      // those derived copies before adding the qualified replacement span.
      this.invalidateRepresentations(source.id,target.text);
      const id=this.insertMemory(source,input.replacement_quote,{record_kind:'resident_quote',status:'active',admission_version:REVISION_ADMISSION_VERSION,evidence:input.replacement_quote,supersedes:target.id,provenance:JSON.stringify({kind:input.mode,source_revision:source.revision,source_sha256:digest(source.text),span_start:source.text.lastIndexOf(input.replacement_quote),span_length:input.replacement_quote.length})});
      this.db.prepare('UPDATE sources SET write_closed=1 WHERE id=? AND scope=?').run(source.id,this.scope);
      // Sealing prevents any newly minted late extraction. A current, authorized
      // duplicate may still receive its historical operation receipt, never apply.
      const fragments=this.db.prepare("SELECT evidence_text FROM memories WHERE source=? AND scope=? AND status!='invalid' AND evidence_text!='' ORDER BY id").all(target.source,this.scope) as {evidence_text:string}[];
      this.db.prepare('UPDATE sources SET text=?,evidence_only=1 WHERE id=? AND scope=?').run([...new Set(fragments.map(r=>r.evidence_text))].join('\n'),target.source,this.scope);
      // Original user/character messages and runtime inputs remain authentic
      // conversation history under their ordinary thirty-day retention. The
      // sealed source prevents replay, and contextHistory excludes its old turn.
      this.db.prepare('INSERT INTO tool_audit(turn,tool,at,scope) VALUES(?,?,?,?)').run(g.turn,'remember_user_report',this.now(),this.scope);
      return {id,revision:1,kind:'user_report',record_kind:'resident_quote',source:g.source,supersedes:target.id,mode:input.mode};
    },g.turn);
    return this.memoryReadback(receipt);
  })();}
  private memoryEligibility(){return "m.scope=? AND s.valid=1 AND m.source_revision=s.revision AND m.status='active' AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?) AND s.turn_order<=? AND m.text!='' AND instr(s.text,m.evidence_text)>0 AND instr(m.evidence_text,m.text)>0";}
  private memoryArguments(order:number){return [this.scope,this.now(),this.now(),order];}
  private residentIds(order:number):string[]{
    const where=this.memoryEligibility()+" AND m.record_kind='resident_quote' AND m.admission_version IN ('explicit-save-v1','explicit-revision-v1')",args=this.memoryArguments(order),join=' FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE '+where;
    const count=(this.db.prepare('SELECT count(*) n'+join).get(...args) as {n:number}).n;if(!count)return [];
    const offset=Math.max(0,order-1)%count,limit=Math.min(2,count),select='SELECT m.id'+join+' ORDER BY s.turn_order,m.id LIMIT ? OFFSET ?';
    const rows=this.db.prepare(select).all(...args,limit,offset) as {id:string}[];
    if(rows.length<limit)rows.push(...this.db.prepare(select).all(...args,limit-rows.length,0) as {id:string}[]);
    return rows.map(r=>r.id);
  }
  private lexicalIds(query:string,order:number):string[]{
    const terms=(query.normalize('NFC').match(/[\p{L}\p{N}]{2,80}/gu)||[]).slice(0,5),long=terms.filter(t=>t.length>=3),short=terms.filter(t=>t.length===2),ids:string[]=[];
    const orderBy=" ORDER BY s.turn_order,CASE WHEN m.record_kind='resident_quote' THEN 0 ELSE 1 END,m.id LIMIT 3";
    if(long.length){const match=long.map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ');const rows=this.db.prepare('SELECT DISTINCT m.id FROM memory_fts f JOIN memories m ON m.id=f.id AND m.scope=f.scope JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE memory_fts MATCH ? AND '+this.memoryEligibility()+orderBy).all(match,...this.memoryArguments(order)) as {id:string}[];ids.push(...rows.map(r=>r.id));}
    if(short.length){const rows=this.db.prepare('SELECT m.id FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE '+this.memoryEligibility()+' AND ('+short.map(()=>"instr(lower(m.text),?)>0").join(' OR ')+')'+orderBy).all(...this.memoryArguments(order),...short.map(t=>t.toLowerCase())) as {id:string}[];ids.push(...rows.map(r=>r.id));}
    return [...new Set(ids)].slice(0,3);
  }
  private readMemoryIds(ids:readonly string[],order:number):MemoryRow[]{
    if(!ids.length)return [];
    return this.db.prepare('SELECT m.*,s.turn_order AS source_order,s.at AS source_at FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE '+this.memoryEligibility()+' AND m.id IN ('+ids.map(()=>'?').join(',')+')').all(...this.memoryArguments(order),...ids) as MemoryRow[];
  }
  private selectMemories(query:string,turn?:string,token?:string){
    const state_version=this.version(),base={state_version,max_records:3,max_resident:2,byte_budget:this.memoryOptions.memoryByteBudget??MEMORY_BYTE_BUDGET,budget_validation:'unmeasured' as const,semantic_quality:'not_measured' as const,ranker_enabled:!!this.memoryOptions.candidateRanker};
    if(this.isSuppressed()||this.controls().memory==='off')return {memories:[] as SelectedMemory[],stats:{...base,resident_count:0,retrieval_count:0,bytes:0,trimmed_records:0,ranker_called:false}};
    const controls=this.controls(),order=turn?this.turnOrder(turn):Number.MAX_SAFE_INTEGER,resident=this.residentIds(order),lexical=this.lexicalIds(query,order);
    const signature=digest(JSON.stringify([state_version,controls.revision,controls.epoch,order,query]));let ranked:string[]=[],ranker_called=false;
    if(this.memoryOptions.candidateRanker&&turn&&token){
      const key=turn||'search',cached=this.rankerCache.get(key);
      if(cached?.signature===signature)ranked=cached.ids;
      else if(!cached){
        const corpus=this.db.prepare('SELECT m.id,m.kind,m.text AS quote FROM memories m JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE '+this.memoryEligibility()+' ORDER BY s.turn_order,m.id LIMIT ?').all(...this.memoryArguments(order),RANKER_CANDIDATE_LIMIT) as {id:string;kind:MemoryRow['kind'];quote:string}[];
        const candidates=corpus.map(r=>Object.freeze(r)),allowed=new Set(candidates.map(r=>r.id));ranker_called=true;
        try{const result=this.memoryOptions.candidateRanker(query,Object.freeze(candidates));if(Array.isArray(result)&&result.length<=RANKER_CANDIDATE_LIMIT&&result.every(id=>typeof id==='string'&&id.length<=128))ranked=[...new Set(result as string[])].filter(id=>allowed.has(id));}catch{/* Optional ranker failure cannot change controls or truth. */}
        while(this.rankerCache.size>=128)this.rankerCache.delete(this.rankerCache.keys().next().value!);
        this.rankerCache.set(key,{signature,ids:ranked});
      }
    }
    if(token)this.authorize(token);else this.assertUsable();
    const after=this.controls();if(this.version()!==state_version||after.revision!==controls.revision||after.epoch!==controls.epoch||after.memory!=='on')throw new ProductError('STALE_REVISION');
    const chosen=chooseIds(resident,[...new Set([...lexical,...ranked])]),current=this.readMemoryIds(chosen.map(r=>r.id),order),byId=new Map(current.map(r=>[r.id,r]));
    const memories:SelectedMemory[]=[],seen=new Set<string>();let bytes=0,trimmed_records=0;
    for(const hint of chosen){const row=byId.get(hint.id);if(!row||(hint.layer==='resident'&&!residentEligible(row)))continue;const identity=JSON.stringify([row.source,row.text]);if(seen.has(identity))continue;seen.add(identity);const item=toSelected(row,hint.layer),size=Buffer.byteLength(JSON.stringify(item),'utf8');if(bytes+size>base.byte_budget){trimmed_records++;continue;}memories.push(item);bytes+=size;}
    return {memories,stats:{...base,resident_count:memories.filter(m=>m.layer==='resident').length,retrieval_count:memories.filter(m=>m.layer==='retrieval').length,bytes,trimmed_records,ranker_called}};
  }
  search(query:string){if(this.isSuppressed()||this.controls().memory==='off')return [];return this.db.transaction(()=>this.selectMemories(query).memories)();}
  prepare(t:Turn,text:string){this.assertFence();return this.db.transaction(()=>{const g=this.authorize(t.token);if(!g.read_context)throw new ProductError('CONTEXT_REQUIRED');
    const c=this.controls();if(c.role==='paused')throw new ProductError('ROLE_PAUSED');if(c.nicknameState==='suspended'&&c.nickname&&text.includes(c.nickname))throw new ProductError('BOUNDARY_VIOLATION');
    if(!text||text.length>8000)throw new ProductError('INVALID_OUTPUT');
    const id=randomUUID();this.db.prepare('INSERT INTO pending(id,turn,revision,epoch,expires,scope) VALUES(?,?,?,?,?,?)').run(id,t.id,c.revision,c.epoch,this.now()+600000,this.scope);
    if(t.memory)this.db.prepare('INSERT INTO messages(id,role,text,status,at,scope,turn_order) VALUES(?,?,?,?,?,?,?)').run(id,'character',text,'pending',this.now(),this.scope,this.turnOrder(t.id));else this.transient.set(id,{id,role:'character',text,status:'pending',at:this.now(),turn_order:this.turnOrder(t.id)});this.advanceAuthority();return {id,role:'character' as const,text,status:'pending',at:this.now()};
  })();}
  ack(id:string){this.assertUsable();return this.db.transaction(()=>{const p=this.db.prepare('SELECT * FROM pending WHERE id=? AND scope=?').get(id,this.scope) as any;const c=this.controls();if(!p||p.revision!==c.revision||p.epoch!==c.epoch||p.expires<=this.now())throw new ProductError('STALE_REVISION');this.db.prepare("UPDATE messages SET status='confirmed' WHERE id=?").run(id);const m=this.transient.get(id);if(m)m.status='confirmed';this.db.prepare('DELETE FROM pending WHERE id=? AND scope=?').run(id,this.scope);this.advanceAuthority();return true;})();}
  end(t:Turn,event:string,status:string){this.rankerCache.delete(t.id);if(this.isSuppressed())return;this.db.transaction(()=>{this.db.prepare('UPDATE grants SET active=0 WHERE token=?').run(digest(t.token));this.db.prepare('UPDATE events SET status=? WHERE id=? AND scope=?').run(status,digest(JSON.stringify([this.scope,event])),this.scope);this.ephemeral.delete(t.token);})();}
  history():Message[]{if(this.isSuppressed())return [];this.assertUsable();this.purge();if(this.controls().memory==='off')return [...this.transient.values()].filter(m=>m.status==='confirmed'||m.status==='pending');return this.db.prepare('SELECT id,role,text,status,at FROM (SELECT rowid AS seq,* FROM messages WHERE scope=? AND status IN (\'confirmed\',\'pending\') ORDER BY at DESC,rowid DESC LIMIT 1000) ORDER BY at,seq').all(this.scope) as Message[];}
  purge(now=this.now()){if(this.isSuppressed())return;this.assertUsable();for(const [id,m] of this.transient)if(m.at<=now-4*3600000||(m.role==='character'&&m.status==='pending'&&m.at<=now-600000))this.transient.delete(id);this.db.transaction(()=>{
    for(const key of this.rankerCache.keys())if(!this.db.prepare('SELECT 1 FROM grants WHERE scope=? AND turn=? AND active=1 AND expires>? LIMIT 1').get(this.scope,key,now))this.rankerCache.delete(key);
    maintainScopeData(this.db,now,this.scope);
  })();}
  private maintainInstallation(){this.assertFence();if(!this.ownerToken)return;this.db.transaction(()=>{
    const authority=this.authority.all(),local=this.db.prepare('SELECT scope,version FROM privacy_versions ORDER BY scope').all() as {scope:string;version:number}[];
    if(local.length!==authority.length||authority.some((row,i)=>row.scope!==local[i].scope||(row.state==='active'&&row.version!==local[i].version)))throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');
    // Scope membership is verified before any sweep, including when one known
    // relationship is suppressed. Its inventory/tombstone is never swept here.
    for(const table of ['scope_controls','business_versions','scope_safety','events','messages','sources','memories','memory_fts','grants','tool_audit','pending','operations'])if(this.db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN privacy_versions p ON p.scope=r.scope WHERE p.scope IS NULL LIMIT 1`).get())throw new ProductError('MAINTENANCE_UNATTRIBUTED_RECORDS');
    if(this.db.prepare('SELECT 1 FROM memories m LEFT JOIN sources s ON s.id=m.source AND s.scope=m.scope WHERE s.id IS NULL LIMIT 1').get())throw new ProductError('MAINTENANCE_UNATTRIBUTED_RECORDS');
    for(const table of ['runtime_turns','executions','render_receipts'])if(this.hasTable(table)&&this.db.prepare(`SELECT 1 FROM ${table} r LEFT JOIN privacy_versions p ON p.scope=r.conversation_id WHERE p.scope IS NULL LIMIT 1`).get())throw new ProductError('MAINTENANCE_UNATTRIBUTED_RECORDS');
    const now=this.now();for(const row of authority)if(row.state==='active'){if(row.scope===this.scope)this.purge(now);else maintainScopeData(this.db,now,row.scope);}
  }).immediate();}
  private trustedScope(scope:string){this.assertFence();if(scope!==this.scope)throw new ProductError('NOT_AUTHORIZED');if(!this.ownerToken)throw new ProductError('DELETION_TRUSTED_CHANNEL_REQUIRED');}
  private localAuthorityVersion(){return (this.db.prepare('SELECT version FROM privacy_versions WHERE scope=?').get(this.scope) as {version:number}).version;}
  private deletionInventory(){const rows:Record<string,unknown>={};for(const table of ['sources','memories','operations'])rows[table]=this.db.prepare(`SELECT * FROM ${table} WHERE scope=? ORDER BY rowid`).all(this.scope);rows.messages=this.db.prepare('SELECT id,role,text,at FROM messages WHERE scope=? ORDER BY rowid').all(this.scope);rows.fts=this.db.prepare('SELECT id,scope,text FROM memory_fts WHERE scope=? ORDER BY rowid').all(this.scope);rows.controls=this.db.prepare('SELECT data FROM scope_controls WHERE scope=?').get(this.scope);rows.transient=[...this.transient.values()].map(({status,...content})=>content);
    // Execution metadata and draft cancellation may settle while suppressed, but
    // cannot create content or new turns. Bind every content-bearing duplicate.
    if(this.hasTable('runtime_turns'))rows.turns=this.db.prepare('SELECT conversation_id,turn_id,body FROM runtime_turns WHERE conversation_id=? ORDER BY sequence').all(this.scope);
    return hash(JSON.stringify(rows));
  }
  private hasTable(name:string){return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
  deletionStatus(){this.assertFence();const state=this.authority.get(this.scope)!;const plan=this.authority.plan(this.scope);return {state:state.state,generation:state.generation,online_records_cleared:state.state==='deleted',...(plan?{plan:this.authority.publicPlan(plan)}:{}),retained_backup_expiry:this.authority.backupExpiry(),backups_physically_cleared:this.authority.backupExpiry()===null};}
  planDeletion(scope:string){this.trustedScope(scope);this.rankerCache.clear();const state=this.authority.get(this.scope)!;if(state.state==='active')this.assertUsable();
    return this.db.transaction(()=>{if(state.state==='active'){expireReviewCandidates(this.db,this.now(),this.scope,true);invalidateSourceDependencies(this.db,this.now(),this.scope);}const plan=this.authority.createPlan(scope,this.deletionInventory(),this.now(),this.localAuthorityVersion());this.db.prepare('UPDATE privacy_versions SET version=? WHERE scope=?').run(this.authority.get(scope)!.version,scope);
      // Revocation does not erase preconfirmation content. Inventory excludes the
      // active bit below so the plan remains valid after this safety change.
      this.db.prepare('UPDATE grants SET active=0 WHERE scope=?').run(scope);this.db.prepare('UPDATE pending SET expires=0 WHERE scope=?').run(scope);this.db.prepare("UPDATE messages SET status='cancelled' WHERE scope=? AND status='pending'").run(scope);for(const message of this.transient.values())if(message.status==='pending')message.status='cancelled';return plan;
    })();
  }
  confirmDeletion(scope:string,plan_id:string,digest:string,token:string){this.trustedScope(scope);this.authority.confirm(scope,plan_id,digest,token,this.deletionInventory(),this.now());return this.deletionStatus();}
  cancelDeletion(scope:string,plan_id:string){this.trustedScope(scope);const plan=this.authority.plan(scope);if(plan?.status==='preview'&&plan.inventory!==this.deletionInventory())throw new ProductError('DELETION_PREVIEW_STALE');this.db.transaction(()=>{this.authority.cancel(scope,plan_id,this.localAuthorityVersion());this.db.prepare('UPDATE privacy_versions SET version=? WHERE scope=?').run(this.authority.get(scope)!.version,scope);})();return this.deletionStatus();}
  /** Called only after all in-flight execution has settled. Every delete is
   * idempotent; the independent tombstone is durable before the first delete. */
  clearRelationshipRecords(){this.verifyDeletionSchema();if(this.authority.hasBackupWork())throw new ProductError('DELETION_BACKUP_WORK_PENDING');if(this.authority.get(this.scope)?.state!=='cleaning')throw new ProductError('DELETION_NOT_STARTED');
    this.authority.markStep(this.scope,'records');
    this.db.transaction(()=>{
      this.db.prepare('DELETE FROM memory_fts WHERE scope=? OR id IN (SELECT id FROM memories WHERE scope=?)').run(this.scope,this.scope);
      for(const table of ['memories','sources','messages','grants','pending','tool_audit','operations','events','scope_controls','business_versions','scope_safety'])this.db.prepare(`DELETE FROM ${table} WHERE scope=?`).run(this.scope);
      if(this.hasTable('executions')){for(const table of ['host_event_ids','model_attempts','tool_observations','observation_gaps'])if(this.hasTable(table))this.db.prepare(`DELETE FROM ${table} WHERE execution_id IN (SELECT execution_id FROM executions WHERE conversation_id=?)`).run(this.scope);this.db.prepare('DELETE FROM executions WHERE conversation_id=?').run(this.scope);}
      for(const table of ['runtime_turns','render_receipts'])if(this.hasTable(table))this.db.prepare(`DELETE FROM ${table} WHERE conversation_id=?`).run(this.scope);
      this.db.prepare('UPDATE privacy_versions SET version=? WHERE scope=?').run(this.authority.get(this.scope)!.version,this.scope);
    })();this.transient.clear();this.ephemeral.clear();this.rankerCache.clear();
  }
  private verifyDeletionSchema(){this.assertFence();const supported=new Set(['privacy_identity','privacy_versions','scope_controls','business_versions','scope_safety','events','messages','sources','memories','memory_fts','memory_fts_data','memory_fts_idx','memory_fts_content','memory_fts_docsize','memory_fts_config','grants','tool_audit','pending','operations','runtime_turns','executions','host_event_ids','model_attempts','tool_observations','observation_gaps','render_receipts','business_owners']);for(const row of this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[])if(!supported.has(row.name))throw new ProductError('DELETION_UNSUPPORTED_TABLE');}
  verifyRelationshipErased(){this.verifyDeletionSchema();if(this.hasTable('executions'))for(const table of ['host_event_ids','model_attempts','tool_observations','observation_gaps'])if(this.hasTable(table)&&this.db.prepare(`SELECT 1 FROM ${table} WHERE execution_id NOT IN(SELECT execution_id FROM executions) LIMIT 1`).get())throw new ProductError('DELETION_UNATTRIBUTED_RECORDS');if(this.authority.hasBackupWork())throw new ProductError('DELETION_BACKUP_WORK_PENDING');if(this.db.prepare('SELECT 1 FROM memory_fts WHERE scope=? OR scope IS NULL LIMIT 1').get(this.scope))throw new ProductError('DELETION_FTS_VERIFICATION_FAILED');for(const table of ['memories','sources','messages','grants','pending','tool_audit','operations','events','scope_controls','business_versions','scope_safety'])if(this.db.prepare(`SELECT 1 FROM ${table} WHERE scope=? LIMIT 1`).get(this.scope))throw new ProductError('DELETION_VERIFICATION_FAILED');for(const table of ['runtime_turns','render_receipts','executions'])if(this.hasTable(table)&&this.db.prepare(`SELECT 1 FROM ${table} WHERE conversation_id=? LIMIT 1`).get(this.scope))throw new ProductError('DELETION_VERIFICATION_FAILED');if(this.transient.size||this.ephemeral.size||this.rankerCache.size)throw new ProductError('DELETION_VERIFICATION_FAILED');
    const checkpoint=this.db.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];if(checkpoint.some(row=>row.busy))throw new ProductError('DELETION_CHECKPOINT_BUSY');
  }
  close(){if(this.closed)return;clearInterval(this.maintenanceTimer);this.rankerCache.clear();this.transient.clear();this.ephemeral.clear();let usable=false;try{this.assertFence();usable=true;}catch{/* Never mutate a replaced main or fenced incarnation. */}try{if(usable&&this.ownerToken&&this.db.open)this.db.prepare('DELETE FROM business_owners WHERE scope=? AND token=?').run(this.scope,this.ownerToken);}finally{this.ownerToken=undefined;if(this.db.open)this.db.close();try{this.authority.releaseHandle(this.lease);}catch{/* Invalid authority remains fail-closed. */}finally{this.authority.close();this.closed=true;}}}
}
