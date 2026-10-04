import Database from 'better-sqlite3';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdirSync,chmodSync,realpathSync,lstatSync,existsSync,openSync,closeSync,writeFileSync,fsyncSync,unlinkSync,fstatSync,readSync,constants} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {Store,ProductError} from '../store.js';
import {MAIN_SCHEMA} from './authority.js';
import {sanitizeRestoredImage} from './restore-policy.js';

export const MAX_ARCHIVE=96*1024*1024,MAX_DATABASE=64*1024*1024,RETENTION=7*86400000;
const magic=Buffer.from('REL_BACKUP_V1\0');
const idSchema=z.string().uuid();
const payloadSchema=z.object({format:z.literal(1),identity:z.string().uuid(),id:idSchema,created_at:z.number().int(),expires_at:z.number().int(),business_digest:z.string().regex(/^[a-f0-9]{64}$/),authority:z.array(z.object({scope:z.string(),version:z.number().int().nonnegative(),generation:z.number().int().nonnegative(),state:z.literal('active'),spool_required:z.number().int()})).max(10000),database:z.string().max(MAX_ARCHIVE)}).strict();
const contentTables=['privacy_identity','privacy_versions','scope_controls','business_versions','scope_safety','events','messages','sources','memories','memory_fts','grants','tool_audit','pending','operations','runtime_turns','executions','host_event_ids','model_attempts','tool_observations','observation_gaps','render_receipts'];
export function tableExists(db:Database.Database,name:string){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
export function verifySchema(db:Database.Database){if(db.pragma('user_version',{simple:true})!==MAIN_SCHEMA||db.pragma('quick_check',{simple:true})!=='ok')throw new ProductError('BACKUP_DATABASE_INVALID');if(tableExists(db,'runtime_turns')&&!(db.pragma('table_info(runtime_turns)') as {name:string;type:string;notnull:number;dflt_value:string}[]).some(row=>row.name==='input_resolved'&&row.type==='INTEGER'&&row.notnull===1&&row.dflt_value==='0'))throw new ProductError('UNSUPPORTED_DATABASE_SCHEMA');const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];for(const {name} of names)if(!contentTables.includes(name)&&name!=='business_owners'&&!['memory_fts_data','memory_fts_idx','memory_fts_content','memory_fts_docsize','memory_fts_config'].includes(name))throw new ProductError('BACKUP_UNSUPPORTED_TABLE');}
export function assertBudget(db:Database.Database){const size=Number(db.pragma('page_count',{simple:true}))*Number(db.pragma('page_size',{simple:true}));if(!Number.isSafeInteger(size)||size>MAX_DATABASE)throw new ProductError('BACKUP_TOO_LARGE');}
export function businessDigest(db:Database.Database){assertBudget(db);verifySchema(db);const digest=createHash('sha256');for(const table of contentTables){digest.update(table);if(tableExists(db,table)){for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate())digest.update(JSON.stringify(row)).update('\n');}}return digest.digest('hex');}
export function durableWrite(file:string,bytes:Buffer){const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
export function syncDirectory(directory:string){const fd=openSync(directory,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function boundedArchive(file:string,limit=MAX_ARCHIVE){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const before=fstatSync(fd);if(!before.isFile()||before.nlink!==1||before.size>limit)throw new ProductError('BACKUP_FILE_INVALID');const bytes=Buffer.alloc(before.size+1);let used=0;while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,used);if(!n)break;used+=n;}const after=fstatSync(fd);if(used!==before.size||after.size!==before.size||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs)throw new ProductError('BACKUP_FILE_CHANGED');return bytes.subarray(0,used);}finally{closeSync(fd);}}

/** Encrypted local main-database snapshots, deliberately excluding receipt-spool
 * and the independent current authority. Restoring a live database is NOT exposed:
 * validation is a bounded foundation and never renames/swaps a user file. */
export class BackupManager {
 readonly directory:string;
 private expiryTimer:ReturnType<typeof setInterval>;
 private expiryError:string|null=null;
 constructor(readonly store:Store,directory:string,private key:Buffer,private now=()=>Date.now()){
  if(key.length!==32)throw new ProductError('DATA_KEY_INVALID');if(!path.isAbsolute(directory))throw new ProductError('BACKUP_DIRECTORY_INVALID');mkdirSync(directory,{recursive:true,mode:0o700});if(lstatSync(directory).isSymbolicLink()||realpathSync(directory)!==path.resolve(directory))throw new ProductError('BACKUP_DIRECTORY_INVALID');this.directory=realpathSync(directory);chmodSync(this.directory,0o700);
  store.authority.assertAvailable();store.authority.db.exec('CREATE TABLE IF NOT EXISTS configuration(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const old=store.authority.db.prepare("SELECT value FROM configuration WHERE key='backup_directory'").get() as {value:string}|undefined;if(old&&old.value!==this.directory)throw new ProductError('BACKUP_DIRECTORY_MISMATCH');store.authority.db.prepare("INSERT OR IGNORE INTO configuration VALUES('backup_directory',?)").run(this.directory);this.store.authority.recoverAbandonedWork();this.expire();this.expiryTimer=setInterval(()=>{if(!this.store.authority.db.open){clearInterval(this.expiryTimer);return;}try{this.expire();this.expiryError=null;}catch(error){this.expiryError=error instanceof ProductError?error.code:'BACKUP_EXPIRY_FAILED';}},1000);this.expiryTimer.unref();
 }
 private file(id:string){return path.join(this.directory,idSchema.parse(id)+'.relbackup');}
 private current(){this.store.assertUsable();const authority=this.store.authority.all();for(const row of authority){const local=this.store.db.prepare('SELECT version FROM privacy_versions WHERE scope=?').get(row.scope) as {version:number}|undefined;if(row.state!=='active'||local?.version!==row.version)throw new ProductError('BACKUP_CURRENT_AUTHORITY_REQUIRED');}return {authority,business_digest:businessDigest(this.store.db)};}
 async create(){this.expire();const initial=this.current(),id=randomUUID(),created_at=this.now(),expires_at=created_at+RETENTION;
  // Reserve before writing, so a crash can never create an untracked managed copy.
  this.store.authority.db.prepare("INSERT INTO backups VALUES(?,?,?,'creating')").run(id,created_at,expires_at);const work=this.store.authority.beginWork('create'),database=path.join(work.temporary,'main.sqlite');
  try{await this.store.db.backup(database);chmodSync(database,0o600);const bytes=boundedArchive(database,MAX_DATABASE);const snapshot=new Database(database,{readonly:true,fileMustExist:true});try{if(businessDigest(snapshot)!==initial.business_digest)throw new ProductError('BACKUP_CHANGED_DURING_CREATION');}finally{snapshot.close();}
   if(this.now()>=expires_at)throw new ProductError('BACKUP_CREATION_EXPIRED');const current=this.current();if(JSON.stringify(current)!==JSON.stringify(initial))throw new ProductError('BACKUP_CHANGED_DURING_CREATION');
   const payload=Buffer.from(JSON.stringify({format:1,identity:this.store.identity,id,created_at,expires_at,...initial,database:bytes.toString('base64')}));const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(magic);const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);durableWrite(this.file(id),Buffer.concat([magic,nonce,cipher.getAuthTag(),encrypted]));syncDirectory(this.directory);
   this.store.authority.db.prepare("UPDATE backups SET state='retained' WHERE id=?").run(id);return {id,created_at,expires_at,encrypted:true,excludes:['receipt_spool','current_authority'],restore_activation_supported:false};
  }catch(error){if(existsSync(this.file(id)))unlinkSync(this.file(id));syncDirectory(this.directory);this.store.authority.db.prepare("UPDATE backups SET state='cleared' WHERE id=?").run(id);throw error;}finally{this.store.authority.finishWork(work.id);}
 }
 /** Decrypts only to restricted staging, validates before any use, and destroys
  * staging on every outcome. A valid report grants no restore/activation right. */
 validateRestore(id:string){this.expire();const current=this.current(),catalog=this.store.authority.db.prepare("SELECT * FROM backups WHERE id=? AND state='retained'").get(idSchema.parse(id)) as {created_at:number;expires_at:number}|undefined;if(!catalog||catalog.expires_at<=this.now())throw new ProductError('BACKUP_UNAVAILABLE');const file=this.file(id);let payload:z.infer<typeof payloadSchema>;
  try{const archive=boundedArchive(file);if(!archive.subarray(0,magic.length).equals(magic)||archive.length<magic.length+28)throw Error();const nonce=archive.subarray(magic.length,magic.length+12),tag=archive.subarray(magic.length+12,magic.length+28),decipher=createDecipheriv('aes-256-gcm',this.key,nonce);decipher.setAAD(magic);decipher.setAuthTag(tag);payload=payloadSchema.parse(JSON.parse(Buffer.concat([decipher.update(archive.subarray(magic.length+28)),decipher.final()]).toString('utf8')));}catch{throw new ProductError('BACKUP_AUTHENTICATION_FAILED');}
  if(payload.identity!==this.store.identity||payload.id!==id||payload.created_at!==catalog.created_at||payload.expires_at!==catalog.expires_at||payload.expires_at-payload.created_at!==RETENTION)throw new ProductError('BACKUP_IDENTITY_MISMATCH');
  if(JSON.stringify(payload.authority)!==JSON.stringify(current.authority))throw new ProductError('BACKUP_STALE_AUTHORITY');if(payload.business_digest!==current.business_digest)throw new ProductError('BACKUP_STALE_BUSINESS_STATE');
  const bytes=Buffer.from(payload.database,'base64');if(bytes.length>MAX_DATABASE||bytes.toString('base64')!==payload.database)throw new ProductError('BACKUP_DATABASE_INVALID');const work=this.store.authority.beginWork('validate'),database=path.join(work.temporary,'main.sqlite');let stage:Database.Database|undefined;
  try{durableWrite(database,bytes);stage=new Database(database,{fileMustExist:true});verifySchema(stage);if((stage.prepare('SELECT id FROM privacy_identity').get() as {id:string}|undefined)?.id!==this.store.identity||businessDigest(stage)!==payload.business_digest)throw new ProductError('BACKUP_DATABASE_INVALID');
   // This remains disposable validation, never an activation certificate.
   sanitizeRestoredImage(stage,current.authority,this.now());
   if(JSON.stringify(this.current())!==JSON.stringify(current))throw new ProductError('BACKUP_CHANGED_DURING_VALIDATION');return {validated:true,restoration_performed:false,activation_supported:false,staged_grants:0,staged_pending:0,expires_at:payload.expires_at};
  }finally{stage?.close();this.store.authority.finishWork(work.id);}
 }
 expire(){this.store.authority.assertAvailable();this.store.authority.recoverAbandonedWork();const rows=this.store.authority.db.prepare("SELECT id FROM backups WHERE expires_at<=? AND state!='cleared'").all(this.now()) as {id:string}[];for(const row of rows){const file=this.file(row.id);if(existsSync(file)){if(lstatSync(file).isSymbolicLink())throw new ProductError('BACKUP_FILE_INVALID');unlinkSync(file);syncDirectory(this.directory);}this.store.authority.db.prepare("UPDATE backups SET state='cleared' WHERE id=?").run(row.id);}}
 maintenanceStatus(){return {expiry_sweeper:'while_manager_open',expiry_error:this.expiryError,plaintext_recovery:'on_store_start',offline_archive_cleanup:'on_next_manager_start'};}
 close(){clearInterval(this.expiryTimer);}
 status(){this.store.authority.assertAvailable();return this.store.authority.db.prepare('SELECT id,created_at,expires_at,state FROM backups ORDER BY created_at').all();}
}
