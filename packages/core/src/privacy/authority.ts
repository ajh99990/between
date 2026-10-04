import Database from 'better-sqlite3';
import {chmodSync,mkdirSync,realpathSync,lstatSync,readdirSync,unlinkSync,rmdirSync,openSync,closeSync,fsyncSync,readFileSync,readlinkSync,constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ProductError} from '../store.js';

export type DeletionState='active'|'preview'|'cleaning'|'deleted';
export type ScopeAuthority={scope:string;version:number;generation:number;state:DeletionState;spool_required:number};
export type DeletionPlan={scope:string;plan_id:string;digest:string;token_hash:string;expires_at:number;inventory:string;status:'preview'|'cleaning'|'deleted';step:string;backup_expires_at:number|null};
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Presence checks must not mistake dangling links or denied metadata for absence. */
export function pathExists(file:string){try{lstatSync(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
export function assertCanonicalParent(file:string){let directory=path.resolve(path.dirname(file));for(;;){if(pathExists(directory)){const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new ProductError('STORAGE_PATH_UNVERIFIED');}const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}}
export const sqliteSidecars=['-wal','-shm','-journal'] as const;
export function assertSqliteSidecars(file:string){for(const suffix of sqliteSidecars){const sibling=file+suffix;if(pathExists(sibling)){const stat=lstatSync(sibling);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('SQLITE_SIDECAR_UNVERIFIED');}}}
export function assertSqliteBundle(file:string){assertCanonicalParent(file);assertSqliteSidecars(file);if(pathExists(file)){const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('SQLITE_BUNDLE_UNVERIFIED');}}
export const MAIN_SCHEMA=5,AUTHORITY_SCHEMA=2;
export type ProcessIdentity={pid:number;boot_id:string;starttime:string;pid_namespace:string};
export type HandleLease={id:string;epoch:number;incarnation:number};
export type MaintenanceState={mode:'ready'|'maintenance';epoch:number;incarnation:number;owner:string|null};
function processRecord(pid:number){
 const stat=readFileSync(`/proc/${pid}/stat`,'utf8'),end=stat.lastIndexOf(')'),fields=stat.slice(end+2).trim().split(/\s+/);
 if(end<0||!/^\d+$/.test(fields[19]??''))throw new ProductError('PROCESS_IDENTITY_UNKNOWN');
 return {starttime:fields[19],state:fields[0],pid_namespace:readlinkSync(`/proc/${pid}/ns/pid`)};
}
export function currentProcessIdentity():ProcessIdentity{
 try{if(process.platform!=='linux')throw Error();const value=processRecord(process.pid),boot_id=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();if(!/^[a-f0-9-]{36}$/.test(boot_id)||!/^pid:\[\d+\]$/.test(value.pid_namespace))throw Error();return {pid:process.pid,boot_id,starttime:value.starttime,pid_namespace:value.pid_namespace};}catch{throw new ProductError('PROCESS_IDENTITY_UNKNOWN');}
}
/** Never treats an inaccessible process or foreign PID namespace as dead. A reused
 * PID is ambiguous and cannot authorize cleanup or its old lease. */
export function classifyProcessIdentity(value:unknown):'live'|'dead'|'unknown'{
 try{const owner=value as ProcessIdentity;if(!owner||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.boot_id!=='string'||!/^[a-f0-9-]{36}$/.test(owner.boot_id)||typeof owner.starttime!=='string'||!/^\d+$/.test(owner.starttime)||typeof owner.pid_namespace!=='string'||!/^pid:\[\d+\]$/.test(owner.pid_namespace))return 'unknown';
  const self=currentProcessIdentity();if(owner.boot_id!==self.boot_id)return 'dead';if(owner.pid_namespace!==self.pid_namespace)return 'unknown';
  let other;try{other=processRecord(owner.pid);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')return 'unknown';try{process.kill(owner.pid,0);return 'unknown';}catch(check){return (check as NodeJS.ErrnoException).code==='ESRCH'?'dead':'unknown';}}
  if(other.pid_namespace!==owner.pid_namespace)return 'unknown';if(other.starttime!==owner.starttime)return 'unknown';if(other.state==='Z'||other.state==='X')return 'dead';return 'live';
 }catch{return 'unknown';}
}
function parseOwner(owner:string){try{return JSON.parse(owner);}catch{return undefined;}}
function sameOwner(owner:string){const value=parseOwner(owner);const current=currentProcessIdentity();return !!value&&value.pid===current.pid&&value.boot_id===current.boot_id&&value.starttime===current.starttime&&value.pid_namespace===current.pid_namespace;}
function syncParent(file:string){const fd=openSync(path.dirname(file),constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
/** Independent, content-free current authority. Never copied into a business backup.
 * An existing installation must retain this file; absence is NOT new installation consent.
 * Two-file commit gaps fail closed. This is not protection against an administrator
 * rolling back both trusted files, and does not claim remote/platform erasure. */
export class PrivacyAuthority {
 readonly db:Database.Database;
 private inode:{dev:number;ino:number};
 private controller?:{epoch:number;owner:string};
 private closed=false;
 static openExisting(file:string){
  assertCanonicalParent(file);assertSqliteSidecars(file);
  if(!pathExists(file))throw new ProductError('PRIVACY_AUTHORITY_REQUIRED');
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');
  let identity:string|undefined;const db=new Database(file,{readonly:true,fileMustExist:true});try{if(db.pragma('user_version',{simple:true})!==AUTHORITY_SCHEMA)throw new ProductError('UNSUPPORTED_AUTHORITY_SCHEMA');identity=(db.prepare('SELECT id FROM identity').get() as {id:string}|undefined)?.id;}finally{db.close();}
  if(!identity)throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');return new PrivacyAuthority(file,identity,false);
 }
 constructor(readonly file:string,readonly identity:string,create:boolean){
  assertCanonicalParent(file);assertSqliteSidecars(file);
  if(!create&&!pathExists(file))throw new ProductError('PRIVACY_AUTHORITY_REQUIRED');
  if(create&&sqliteSidecars.some(suffix=>pathExists(file+suffix)))throw new ProductError('PRIVACY_AUTHORITY_CONFLICT');
  if(create){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});let fd:number;try{fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);}catch{throw new ProductError('PRIVACY_AUTHORITY_CONFLICT');}try{fsyncSync(fd);}finally{closeSync(fd);}syncParent(file);}
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');
  assertSqliteSidecars(file);this.db=new Database(file,{fileMustExist:true});
  try{
   // Reject old authorities without migrating or changing their journal settings.
   if(!create&&this.db.pragma('user_version',{simple:true})!==AUTHORITY_SCHEMA)throw new ProductError('UNSUPPORTED_AUTHORITY_SCHEMA');
   chmodSync(file,0o600);this.db.pragma('journal_mode=WAL');this.db.pragma('synchronous=FULL');this.db.pragma('secure_delete=ON');
   if(this.db.pragma('journal_mode',{simple:true})!=='wal'||this.db.pragma('synchronous',{simple:true})!==2||this.db.pragma('secure_delete',{simple:true})!==1)throw new ProductError('PRIVACY_AUTHORITY_UNAVAILABLE');
   if(create){this.db.transaction(()=>{this.db.exec(`CREATE TABLE identity(id TEXT PRIMARY KEY);
    CREATE TABLE scopes(scope TEXT PRIMARY KEY,version INTEGER NOT NULL,generation INTEGER NOT NULL,state TEXT NOT NULL,spool_required INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE plans(scope TEXT PRIMARY KEY,plan_id TEXT NOT NULL,digest TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,inventory TEXT NOT NULL,status TEXT NOT NULL,step TEXT NOT NULL,backup_expires_at INTEGER);
    CREATE TABLE backups(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL);
    CREATE TABLE configuration(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE backup_work(id TEXT PRIMARY KEY,kind TEXT NOT NULL,pid INTEGER NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL);
    CREATE TABLE installation(singleton INTEGER PRIMARY KEY CHECK(singleton=1),mode TEXT NOT NULL CHECK(mode IN('ready','maintenance')),epoch INTEGER NOT NULL,incarnation INTEGER NOT NULL,owner TEXT);
    CREATE TABLE handles(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('store','spool')),epoch INTEGER NOT NULL,incarnation INTEGER NOT NULL,owner TEXT NOT NULL);
    CREATE TABLE sealed_archives(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,archive_hash TEXT NOT NULL);
    CREATE TABLE recovery_seals(singleton INTEGER PRIMARY KEY CHECK(singleton=1),seal TEXT NOT NULL);
    CREATE TABLE restore_journal(singleton INTEGER PRIMARY KEY CHECK(singleton=1),data TEXT NOT NULL);
    INSERT INTO installation VALUES(1,'ready',0,0,NULL);
    PRAGMA user_version=${AUTHORITY_SCHEMA};`);this.db.prepare('INSERT INTO identity VALUES(?)').run(identity);}).immediate();}
   if(this.db.pragma('user_version',{simple:true})!==AUTHORITY_SCHEMA||(this.db.prepare('SELECT id FROM identity').get() as {id:string}|undefined)?.id!==identity||this.db.pragma('quick_check',{simple:true})!=='ok')throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');
   this.inode=stat;this.maintenanceState();
  }catch(error){this.db.close();throw error;}
 }
 assertAvailable(){assertCanonicalParent(this.file);assertSqliteSidecars(this.file);if(this.closed||!this.db.open)throw new ProductError('PRIVACY_AUTHORITY_UNAVAILABLE');let stat;try{stat=lstatSync(this.file);}catch{throw new ProductError('PRIVACY_AUTHORITY_REQUIRED');}if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.dev!==this.inode.dev||stat.ino!==this.inode.ino)throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');}
 maintenanceState():MaintenanceState{this.assertAvailable();const row=this.db.prepare('SELECT mode,epoch,incarnation,owner FROM installation WHERE singleton=1').get() as MaintenanceState|undefined;if(!row||!['ready','maintenance'].includes(row.mode)||!Number.isSafeInteger(row.epoch)||row.epoch<0||!Number.isSafeInteger(row.incarnation)||row.incarnation<0||(row.mode==='maintenance'&&!row.owner))throw new ProductError('PRIVACY_AUTHORITY_UNVERIFIED');return row;}
 registerHandle(kind:'store'|'spool'):HandleLease{this.assertAvailable();return this.db.transaction(()=>{const state=this.maintenanceState();if(state.mode!=='ready')throw new ProductError('INSTALLATION_MAINTENANCE');if(this.db.prepare('SELECT 1 FROM restore_journal').get())throw new ProductError('RESTORE_RECOVERY_REQUIRED');const lease={id:randomUUID(),epoch:state.epoch,incarnation:state.incarnation};this.db.prepare('INSERT INTO handles VALUES(?,?,?,?,?)').run(lease.id,kind,lease.epoch,lease.incarnation,JSON.stringify(currentProcessIdentity()));return lease;}).immediate();}
 assertHandle(lease:HandleLease){const state=this.maintenanceState(),row=this.db.prepare('SELECT * FROM handles WHERE id=?').get(lease.id) as {epoch:number;incarnation:number;owner:string}|undefined;if(state.mode!=='ready'||state.epoch!==lease.epoch||state.incarnation!==lease.incarnation||!row||row.epoch!==lease.epoch||row.incarnation!==lease.incarnation||!sameOwner(row.owner))throw new ProductError('INSTALLATION_HANDLE_STALE');}
 releaseHandle(lease:HandleLease){this.assertAvailable();const row=this.db.prepare('SELECT owner FROM handles WHERE id=? AND epoch=? AND incarnation=?').get(lease.id,lease.epoch,lease.incarnation) as {owner:string}|undefined;if(row&&!sameOwner(row.owner))throw new ProductError('INSTALLATION_HANDLE_STALE');this.db.prepare('DELETE FROM handles WHERE id=? AND epoch=? AND incarnation=?').run(lease.id,lease.epoch,lease.incarnation);}
 private reapHandles(){for(const row of this.db.prepare('SELECT id,owner FROM handles').all() as {id:string;owner:string}[]){const state=classifyProcessIdentity(parseOwner(row.owner));if(state==='unknown')throw new ProductError('INSTALLATION_HANDLE_OWNER_UNKNOWN');if(state==='live')throw new ProductError('INSTALLATION_HANDLES_OPEN');this.db.prepare('DELETE FROM handles WHERE id=?').run(row.id);}}
 beginMaintenance(){this.assertAvailable();return this.db.transaction(()=>{const state=this.maintenanceState();if(state.mode!=='ready')throw new ProductError('INSTALLATION_MAINTENANCE');this.reapHandles();if(this.hasBackupWork())throw new ProductError('INSTALLATION_BACKUP_WORK_OPEN');const owner=JSON.stringify({...currentProcessIdentity(),token:randomUUID()}),epoch=state.epoch+1;this.db.prepare("UPDATE installation SET mode='maintenance',epoch=?,owner=? WHERE singleton=1").run(epoch,owner);this.controller={epoch,owner};return {epoch,incarnation:state.incarnation};}).immediate();}
 resumeMaintenance(){this.assertAvailable();return this.db.transaction(()=>{const state=this.maintenanceState();if(state.mode!=='maintenance')throw new ProductError('INSTALLATION_NOT_MAINTENANCE');if(this.controller?.epoch===state.epoch&&this.controller.owner===state.owner)return {epoch:state.epoch,incarnation:state.incarnation};const status=classifyProcessIdentity(parseOwner(state.owner!));if(status!=='dead')throw new ProductError(status==='live'?'INSTALLATION_MAINTENANCE_OWNER_LIVE':'INSTALLATION_MAINTENANCE_OWNER_UNKNOWN');this.reapHandles();const owner=JSON.stringify({...currentProcessIdentity(),token:randomUUID()}),epoch=state.epoch+1;this.db.prepare('UPDATE installation SET epoch=?,owner=? WHERE singleton=1').run(epoch,owner);this.controller={epoch,owner};return {epoch,incarnation:state.incarnation};}).immediate();}
 private assertController(){const state=this.maintenanceState();if(state.mode!=='maintenance'||!this.controller||this.controller.epoch!==state.epoch||this.controller.owner!==state.owner||!sameOwner(state.owner!))throw new ProductError('INSTALLATION_MAINTENANCE_REQUIRED');return state;}
 advanceIncarnation(){this.assertController();this.db.prepare('UPDATE installation SET incarnation=incarnation+1 WHERE singleton=1').run();return this.maintenanceState().incarnation;}
 finishMaintenance(){this.db.transaction(()=>{this.assertController();if(this.db.prepare('SELECT 1 FROM restore_journal').get())throw new ProductError('RESTORE_RECOVERY_REQUIRED');this.db.prepare("UPDATE installation SET mode='ready',owner=NULL WHERE singleton=1").run();}).immediate();this.controller=undefined;}
 getSeal():unknown|undefined{this.assertAvailable();const row=this.db.prepare('SELECT seal FROM recovery_seals WHERE singleton=1').get() as {seal:string}|undefined;if(!row)return undefined;try{return JSON.parse(row.seal);}catch{throw new ProductError('RECOVERY_SEAL_INVALID');}}
 setSeal(seal:unknown){this.assertController();this.db.prepare('INSERT OR REPLACE INTO recovery_seals VALUES(1,?)').run(JSON.stringify(seal));}
 clearSeal(){this.assertController();this.db.prepare('DELETE FROM recovery_seals').run();}
 consumeSeal(expected?:unknown){this.assertAvailable();this.db.transaction(()=>{if(this.maintenanceState().mode!=='ready')throw new ProductError('INSTALLATION_MAINTENANCE');const actual=this.getSeal();if(expected!==undefined&&JSON.stringify(actual)!==JSON.stringify(expected))throw new ProductError('RECOVERY_SEAL_CHANGED');this.db.prepare('DELETE FROM recovery_seals').run();}).immediate();}
 get(scope:string):ScopeAuthority|undefined{this.assertAvailable();return this.db.prepare('SELECT * FROM scopes WHERE scope=?').get(scope) as ScopeAuthority|undefined;}
 all():ScopeAuthority[]{this.assertAvailable();return this.db.prepare('SELECT * FROM scopes ORDER BY scope').all() as ScopeAuthority[];}
 initializeScope(scope:string){this.assertAvailable();this.db.prepare("INSERT INTO scopes VALUES(?,0,0,'active',0)").run(scope);}
 advance(scope:string,expected:number){this.assertAvailable();const result=this.db.prepare('UPDATE scopes SET version=version+1 WHERE scope=? AND version=? AND state=\'active\'').run(scope,expected);if(result.changes!==1)throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');return expected+1;}
 requireSpool(scope:string){this.assertAvailable();this.db.prepare('UPDATE scopes SET spool_required=1 WHERE scope=?').run(scope);}
 plan(scope:string){this.assertAvailable();return this.db.prepare('SELECT * FROM plans WHERE scope=?').get(scope) as DeletionPlan|undefined;}
 backupExpiry(){this.assertAvailable();return (this.db.prepare("SELECT max(expires_at) at FROM (SELECT expires_at FROM backups WHERE state!='cleared' UNION ALL SELECT expires_at FROM sealed_archives WHERE state!='cleared')").get() as {at:number|null}).at;}
 expireSealedArchives(now=Date.now()){
  this.assertAvailable();return this.db.transaction(()=>{if(this.maintenanceState().mode!=='ready')return;const rows=this.db.prepare("SELECT id FROM sealed_archives WHERE expires_at<=? AND state!='cleared'").all(now) as {id:string}[];if(!rows.length)return;
  const directory=(this.db.prepare("SELECT value FROM configuration WHERE key='recovery_directory'").get() as {value:string}|undefined)?.value;
  if(!directory||!path.isAbsolute(directory)||!pathExists(directory)||!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink()||realpathSync(directory)!==directory)throw new ProductError('RECOVERY_DIRECTORY_INVALID');
  for(const row of rows){if(!/^[a-f0-9-]{36}$/.test(row.id))throw new ProductError('RECOVERY_ARCHIVE_INVALID');const file=path.join(directory,row.id+'.relcheckpoint');assertCanonicalParent(file);if(pathExists(file)){const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('RECOVERY_ARCHIVE_INVALID');unlinkSync(file);syncParent(file);}this.db.transaction(()=>{this.db.prepare("UPDATE sealed_archives SET state='cleared' WHERE id=?").run(row.id);const seal=this.getSeal() as {id?:string}|undefined;if(seal?.id===row.id)this.db.prepare('DELETE FROM recovery_seals').run();}).immediate();}
  }).immediate();
 }
 createPlan(scope:string,inventory:string,now:number,expectedVersion:number){this.assertAvailable();const token=randomUUID()+randomUUID(),plan_id=randomUUID(),expires_at=now+600000;
  const digest=hash(JSON.stringify({scope,plan_id,inventory,expires_at,kind:'whole_relationship'}));
  this.db.transaction(()=>{const current=this.get(scope);if(!current)throw new ProductError('NOT_AUTHORIZED');if(current.version!==expectedVersion)throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');if(current.state==='deleted'||current.state==='cleaning')throw new ProductError('RELATIONSHIP_DELETED');const previous=this.plan(scope);if(current.state==='preview'&&previous&&previous.expires_at>now)throw new ProductError('DELETION_PLAN_EXISTS');
   this.db.prepare("UPDATE scopes SET state='preview',version=version+1 WHERE scope=?").run(scope);
   this.db.prepare("INSERT OR REPLACE INTO plans VALUES(?,?,?,?,?,?,'preview','confirmation',?)").run(scope,plan_id,digest,hash(token),expires_at,inventory,this.backupExpiry());
  }).immediate();return {...this.publicPlan(this.plan(scope)!),confirmation_token:token};
 }
 confirm(scope:string,id:string,digest:string,token:string,inventory:string,now:number){this.assertAvailable();this.db.transaction(()=>{const p=this.plan(scope);if(!p||p.plan_id!==id||p.digest!==digest||p.token_hash!==hash(token))throw new ProductError('DELETION_CONFIRMATION_INVALID');if(p.status!=='preview'||this.get(scope)?.state!=='preview')throw new ProductError('DELETION_CONFIRMATION_USED');if(p.expires_at<=now)throw new ProductError('DELETION_CONFIRMATION_EXPIRED');if(p.inventory!==inventory)throw new ProductError('DELETION_PREVIEW_STALE');
   this.db.prepare("UPDATE scopes SET generation=generation+1,state='cleaning' WHERE scope=?").run(scope);
   this.db.prepare("UPDATE plans SET status='cleaning',token_hash='',step='quiesce' WHERE scope=?").run(scope);
  }).immediate();
 }
 cancel(scope:string,id:string,expectedVersion:number){this.assertAvailable();this.db.transaction(()=>{const p=this.plan(scope);if(this.get(scope)?.version!==expectedVersion)throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');if(!p||p.plan_id!==id)throw new ProductError('DELETION_CONFIRMATION_INVALID');if(p.status!=='preview'||this.get(scope)?.state!=='preview')throw new ProductError('DELETION_ALREADY_STARTED');this.db.prepare("UPDATE scopes SET state='active',version=version+1 WHERE scope=?").run(scope);this.db.prepare('DELETE FROM plans WHERE scope=?').run(scope);}).immediate();}
 markStep(scope:string,step:string){this.assertAvailable();this.db.prepare("UPDATE plans SET step=? WHERE scope=? AND status='cleaning'").run(step,scope);}
 complete(scope:string){this.assertAvailable();this.db.transaction(()=>{if(this.get(scope)?.state!=='cleaning')throw new ProductError('DELETION_NOT_STARTED');this.db.prepare("UPDATE scopes SET state='deleted' WHERE scope=?").run(scope);this.db.prepare("UPDATE plans SET status='deleted',step='complete',inventory='',token_hash='' WHERE scope=?").run(scope);}).immediate();}
 publicPlan(p:DeletionPlan){return {plan_id:p.plan_id,digest:p.digest,scope:p.scope,kind:'whole_relationship' as const,controlled_categories:['relationship_controls','messages','sources','memories','full_text_index','pending_output','runtime_executions','operation_receipts','transient_history','receipt_spool'],expires_at:p.expires_at,status:p.status,step:p.step,backup_expires_at:p.backup_expires_at,uncontrolled_copies:['host_history','model_provider_history','platform_logs'],physical_media_erasure:false};}
 private backupDirectory(){this.assertAvailable();const directory=(this.db.prepare("SELECT value FROM configuration WHERE key='backup_directory'").get() as {value:string}|undefined)?.value;if(!directory||!path.isAbsolute(directory)||!pathExists(directory)||!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink()||realpathSync(directory)!==directory)throw new ProductError('BACKUP_TEMP_UNVERIFIED');return directory;}
 beginWork(kind:'create'|'validate'){const directory=this.backupDirectory(),id=randomUUID();this.db.prepare("INSERT INTO backup_work VALUES(?,?,?,'active',?)").run(id,kind,process.pid,JSON.stringify(currentProcessIdentity()));const temporary=path.join(directory,'.stage-'+id);mkdirSync(temporary,{mode:0o700});return {id,temporary};}
 private cleanWork(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new ProductError('BACKUP_TEMP_UNVERIFIED');const directory=this.backupDirectory(),temporary=path.join(directory,'.stage-'+id);assertCanonicalParent(temporary);if(pathExists(temporary)){if(lstatSync(temporary).isSymbolicLink()||realpathSync(temporary)!==temporary)throw new ProductError('BACKUP_TEMP_UNVERIFIED');const names=readdirSync(temporary);for(const name of names){if(!['main.sqlite','main.sqlite-wal','main.sqlite-shm','main.sqlite-journal'].includes(name))throw new ProductError('BACKUP_TEMP_UNVERIFIED');const file=path.join(temporary,name),stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('BACKUP_TEMP_UNVERIFIED');}for(const name of names)unlinkSync(path.join(temporary,name));rmdirSync(temporary);}const fd=openSync(directory,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}this.db.prepare('DELETE FROM backup_work WHERE id=?').run(id);}
 finishWork(id:string){this.assertAvailable();const row=this.db.prepare('SELECT owner FROM backup_work WHERE id=?').get(id) as {owner:string}|undefined;if(!row)throw new ProductError('BACKUP_TEMP_UNVERIFIED');const owner=parseOwner(row.owner),state=classifyProcessIdentity(owner);if(state==='unknown'||(state==='live'&&!sameOwner(row.owner)))throw new ProductError('BACKUP_TEMP_OWNER_UNKNOWN');this.db.prepare("UPDATE backup_work SET status='cleanup' WHERE id=?").run(id);this.cleanWork(id);}
 recoverAbandonedWork(){this.assertAvailable();const work=this.db.prepare('SELECT * FROM backup_work').all() as {id:string;pid:number;status:string;owner:string}[];for(const item of work){const owner=parseOwner(item.owner),status=classifyProcessIdentity(owner);if(status==='unknown')throw new ProductError('BACKUP_TEMP_OWNER_UNKNOWN');if(item.status==='active'&&status==='live')continue;this.finishWork(item.id);}}
 hasBackupWork(){this.recoverAbandonedWork();return !!this.db.prepare('SELECT 1 FROM backup_work LIMIT 1').get();}
 close(){if(this.closed)return;this.db.close();this.closed=true;}
}
