import Database from 'better-sqlite3';
import {randomUUID,randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {constants,openSync,closeSync,fsyncSync,writeFileSync,lstatSync,realpathSync,mkdirSync,readdirSync,renameSync,unlinkSync,rmdirSync,fstatSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {ProductError} from '../store.js';
import {PrivacyAuthority,MAIN_SCHEMA,assertSqliteBundle,type ScopeAuthority} from './authority.js';
import {businessDigest,verifySchema,MAX_ARCHIVE,MAX_DATABASE,RETENTION,boundedArchive,syncDirectory} from './backup.js';
import {verifyScopeVector,sanitizeRestoredImage} from './restore-policy.js';

const MAGIC=Buffer.from('REL_SEALED_CHECKPOINT_V2\0');
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/);
const vector=z.array(z.object({scope:z.string(),version:z.number().int().nonnegative(),generation:z.number().int().nonnegative(),state:z.enum(['active','deleted']),spool_required:z.number().int().min(0).max(1)}).strict()).max(10000);
const sealSchema=z.object({format:z.literal(2),schema:z.literal(6),identity:uuid,id:uuid,seal_id:uuid,created_at:z.number().int(),expires_at:z.number().int(),business_digest:sha,archive_hash:sha,authority:vector,incarnation:z.number().int().nonnegative()}).strict();
export type RecoverySeal=z.infer<typeof sealSchema>;
const payloadSchema=sealSchema.omit({archive_hash:true}).extend({database:z.string().max(MAX_ARCHIVE)}).strict();
type Stamp={dev:number;ino:number;size?:number;mtime?:number;hash?:string};
type FileRole='candidate'|'archive'|'main'|'wal'|'shm'|'journal';
type Move={role:Exclude<FileRole,'archive'>;from:string;to:string;stamp:Stamp;state:'intent'|'done'|'undo_intent'|'undone'};
type Journal={format:1;id:string;kind:'checkpoint'|'restore';decision:'pending'|'committed'|'rollback';phase:'preparing'|'staged'|'replacing'|'verifying'|'commit_decided'|'cleanup'|'ready';seal?:RecoverySeal;files:Partial<Record<'candidate'|'archive',Stamp|null>>;sidecars?:Partial<Record<'-wal'|'-shm'|'-journal',Stamp|null>>;directory?:Stamp|null;moves:Move[];original:Partial<Record<'main'|'wal'|'shm'|'journal',Stamp>>;candidate_digest?:string;rollback?:boolean;cleaned:string[]};
const stampSchema=z.object({dev:z.number().int().nonnegative(),ino:z.number().int().nonnegative(),size:z.number().int().nonnegative().optional(),mtime:z.number().optional(),hash:sha.optional()}).strict();
const journalSchema=z.object({format:z.literal(1),id:uuid,kind:z.enum(['checkpoint','restore']),decision:z.enum(['pending','committed','rollback']),phase:z.enum(['preparing','staged','replacing','verifying','commit_decided','cleanup','ready']),seal:sealSchema.optional(),files:z.object({candidate:stampSchema.nullable().optional(),archive:stampSchema.nullable().optional()}).strict(),sidecars:z.object({'-wal':stampSchema.nullable().optional(),'-shm':stampSchema.nullable().optional(),'-journal':stampSchema.nullable().optional()}).strict().optional(),directory:stampSchema.nullable().optional(),moves:z.array(z.object({role:z.enum(['candidate','main','wal','shm','journal']),from:z.string(),to:z.string(),stamp:stampSchema,state:z.enum(['intent','done','undo_intent','undone'])}).strict()).max(5),original:z.object({main:stampSchema.optional(),wal:stampSchema.optional(),shm:stampSchema.optional(),journal:stampSchema.optional()}).strict(),candidate_digest:sha.optional(),rollback:z.boolean().optional(),cleaned:z.array(z.string()).max(12)}).strict();
export type RecoveryCheckpoint=(name:string)=>void;
const suffixes={main:'',wal:'-wal',shm:'-shm',journal:'-journal'} as const;
function present(file:string){try{return lstatSync(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
function safeDirectory(directory:string){const s=present(directory);if(!s?.isDirectory()||s.isSymbolicLink()||realpathSync(directory)!==directory)throw new ProductError('RECOVERY_DIRECTORY_UNVERIFIED');}
function stamp(file:string,full=true):Stamp{const stat=present(file);if(!stat?.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ProductError('RECOVERY_FILE_UNVERIFIED');const result:Stamp={dev:stat.dev,ino:stat.ino};if(full){const bytes=boundedArchive(file,MAX_ARCHIVE);result.size=stat.size;result.mtime=stat.mtimeMs;result.hash=createHash('sha256').update(bytes).digest('hex');const after=lstatSync(file);if(after.dev!==stat.dev||after.ino!==stat.ino||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw new ProductError('RECOVERY_FILE_CHANGED');}return result;}
function matches(file:string,expected:Stamp){const actual=stamp(file,expected.hash!==undefined);if(actual.dev!==expected.dev||actual.ino!==expected.ino||(expected.hash!==undefined&&(actual.size!==expected.size||actual.mtime!==expected.mtime||actual.hash!==expected.hash)))throw new ProductError('RECOVERY_FILE_CHANGED');}
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
/** Trusted class API only. A seal authorizes recovery only while no successful
 * normal open has happened since capture. The authority is never replaced.
 * Linux process-crash safety is supported; hardware power-loss/admin rollback
 * and recovery after later activity are deliberately outside this contract. */
export class OfflineRecovery {
 readonly authority:PrivacyAuthority;
 readonly directory:string;
 private journal?:Journal;
 constructor(readonly file:string,directory:string,private key:Buffer,private now=()=>Date.now(),private onCheckpoint:RecoveryCheckpoint=()=>{}){
  if(!path.isAbsolute(file)||path.resolve(file)!==file||!path.isAbsolute(directory)||path.resolve(directory)!==directory)throw new ProductError('RECOVERY_PATH_INVALID');
  if(key.length!==32)throw new ProductError('DATA_KEY_INVALID');safeDirectory(path.dirname(file));
  this.authority=PrivacyAuthority.openExisting(file+'.authority.sqlite');
  try{if(!present(directory))mkdirSync(directory,{recursive:true,mode:0o700});safeDirectory(directory);this.directory=directory;
   const configured=this.authority.db.prepare("SELECT value FROM configuration WHERE key='recovery_directory'").get() as {value:string}|undefined;
   if(configured&&configured.value!==directory)throw new ProductError('RECOVERY_DIRECTORY_MISMATCH');this.authority.db.prepare("INSERT OR IGNORE INTO configuration VALUES('recovery_directory',?)").run(directory);
  }catch(error){this.authority.close();throw error;}
 }
 private operationDirectory(j:Journal){return path.join(path.dirname(this.file),'.recovery-'+uuid.parse(j.id));}
 private archive(id:string){return path.join(this.directory,uuid.parse(id)+'.relcheckpoint');}
 private candidate(j:Journal){return path.join(this.operationDirectory(j),'candidate.sqlite');}
 private original(j:Journal,role:keyof typeof suffixes){return path.join(this.operationDirectory(j),'original.sqlite'+suffixes[role]);}
 private writeJournal(j:Journal){this.authority.assertAvailable();this.authority.db.prepare('INSERT OR REPLACE INTO restore_journal(singleton,data) VALUES(1,?)').run(JSON.stringify(j));this.journal=j;}
 private phase(j:Journal,phase:Journal['phase']){j.phase=phase;this.writeJournal(j);this.onCheckpoint('phase:'+phase);}
 private initialize(kind:Journal['kind'],seal?:RecoverySeal){const j:Journal={format:1,id:randomUUID(),kind,decision:'pending',phase:'preparing',seal,files:{},moves:[],original:{},cleaned:[]};this.writeJournal(j);return j;}
 private begin(kind:Journal['kind'],seal?:RecoverySeal){const j=this.authority.db.transaction(()=>{this.authority.beginMaintenance();return this.initialize(kind,seal);}).immediate();this.onCheckpoint('phase:preparing');return j;}
 private ensureOperationDirectory(j:Journal){const directory=this.operationDirectory(j);if(!present(directory)){j.directory=null;this.writeJournal(j);mkdirSync(directory,{mode:0o700});syncDirectory(path.dirname(directory));}safeDirectory(directory);const stat=lstatSync(directory);if(j.directory&&(j.directory.dev!==stat.dev||j.directory.ino!==stat.ino))throw new ProductError('RECOVERY_DIRECTORY_CHANGED');j.directory={dev:stat.dev,ino:stat.ino};this.writeJournal(j);return directory;}
 private allocate(j:Journal,role:'candidate'|'archive'){const file=role==='candidate'?this.candidate(j):this.archive(j.seal!.id);if(present(file))throw new ProductError('RECOVERY_FILE_EXISTS');j.files[role]=null;this.writeJournal(j);const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{fsyncSync(fd);j.files[role]={dev:fstatSync(fd).dev,ino:fstatSync(fd).ino};this.writeJournal(j);syncDirectory(path.dirname(file));}finally{closeSync(fd);}return file;}
 private writeAllocated(j:Journal,role:'candidate'|'archive',bytes:Buffer){const file=role==='candidate'?this.candidate(j):this.archive(j.seal!.id);matches(file,j.files[role]!);const fd=openSync(file,constants.O_WRONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd),expected=j.files[role]!;if(s.dev!==expected.dev||s.ino!==expected.ino||s.nlink!==1)throw new ProductError('RECOVERY_FILE_CHANGED');writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}j.files[role]=stamp(file);this.writeJournal(j);syncDirectory(path.dirname(file));}
 private captureVector(db:Database.Database){verifySchema(db);const identity=db.prepare('SELECT id FROM privacy_identity').get() as {id:string}|undefined;if(identity?.id!==this.authority.identity)throw new ProductError('RECOVERY_IDENTITY_MISMATCH');const rows=this.authority.all();verifyScopeVector(db,rows);return rows;}
 private validSeal(id:string){const parsed=sealSchema.safeParse(this.authority.getSeal());if(!parsed.success)throw new ProductError('RECOVERY_SEAL_REQUIRED');const seal=parsed.data;
  if(seal.id!==id||seal.identity!==this.authority.identity||seal.schema!==MAIN_SCHEMA||seal.expires_at-seal.created_at!==RETENTION||seal.expires_at<=this.now()||seal.created_at>this.now())throw new ProductError('RECOVERY_SEAL_UNAVAILABLE');
  if(seal.incarnation!==this.authority.maintenanceState().incarnation||!same(seal.authority,this.authority.all()))throw new ProductError('RECOVERY_STALE_SEAL');
  const catalog=this.authority.db.prepare("SELECT * FROM sealed_archives WHERE id=? AND state='retained'").get(id) as {created_at:number;expires_at:number;archive_hash:string}|undefined;
  if(!catalog||catalog.created_at!==seal.created_at||catalog.expires_at!==seal.expires_at||catalog.archive_hash!==seal.archive_hash)throw new ProductError('RECOVERY_SEAL_UNAVAILABLE');return seal;
 }
 private authenticate(seal:RecoverySeal){let payload:z.infer<typeof payloadSchema>;try{const bytes=boundedArchive(this.archive(seal.id));if(createHash('sha256').update(bytes).digest('hex')!==seal.archive_hash||!bytes.subarray(0,MAGIC.length).equals(MAGIC)||bytes.length<MAGIC.length+28)throw Error();const decipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(MAGIC.length,MAGIC.length+12));decipher.setAAD(MAGIC);decipher.setAuthTag(bytes.subarray(MAGIC.length+12,MAGIC.length+28));payload=payloadSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(MAGIC.length+28)),decipher.final()]).toString('utf8')));}catch{throw new ProductError('RECOVERY_AUTHENTICATION_FAILED');}
  const {database,...certificate}=payload,{archive_hash,...expected}=seal;if(!same(certificate,expected))throw new ProductError('RECOVERY_CERTIFICATE_MISMATCH');const bytes=Buffer.from(database,'base64');if(bytes.length>MAX_DATABASE||bytes.toString('base64')!==database)throw new ProductError('RECOVERY_DATABASE_INVALID');return bytes;
 }
 async createSealedCheckpoint(){this.authority.expireSealedArchives(this.now());const j=this.begin('checkpoint');let source:Database.Database|undefined;
  try{this.ensureOperationDirectory(j);assertSqliteBundle(this.file);stamp(this.file);source=new Database(this.file,{readonly:true,fileMustExist:true});const authority=this.captureVector(source);if(source.prepare("SELECT 1 FROM memories WHERE status='needs_review' AND valid_until<=? AND (text!='' OR evidence_text!='') LIMIT 1").get(this.now()))throw new ProductError('RECOVERY_EXPIRED_PENDING_MEMORY');const business_digest=businessDigest(source),created_at=this.now();
   const seal:RecoverySeal={format:2,schema:6,identity:this.authority.identity,id:randomUUID(),seal_id:randomUUID(),created_at,expires_at:created_at+RETENTION,business_digest,archive_hash:'0'.repeat(64),authority:vector.parse(authority),incarnation:this.authority.maintenanceState().incarnation};j.seal=seal;this.writeJournal(j);
   const temporary=this.allocate(j,'candidate');j.sidecars={'-wal':null,'-shm':null,'-journal':null};this.writeJournal(j);await source.backup(temporary,{progress:info=>{for(const suffix of Object.keys(j.sidecars!) as ('-wal'|'-shm'|'-journal')[]){const sidecar=temporary+suffix;if(present(sidecar)){if(j.sidecars![suffix])matches(sidecar,j.sidecars![suffix]!);else j.sidecars![suffix]=stamp(sidecar,false);}}this.writeJournal(j);this.onCheckpoint(info.remainingPages===info.totalPages?'capture:opened':'capture:copying');return 100;}});source.close();source=undefined;j.files.candidate=stamp(temporary);this.writeJournal(j);
   // SQLite's backup is a complete standalone image. Force rollback-format
   // header before its first open, so readonly validation cannot allocate WAL.
   const standalone=boundedArchive(temporary,MAX_DATABASE);if(standalone.length<100||standalone.subarray(0,16).toString()!=='SQLite format 3\0')throw new ProductError('RECOVERY_DATABASE_INVALID');standalone[18]=1;standalone[19]=1;j.files.candidate=stamp(temporary,false);this.writeJournal(j);this.writeAllocated(j,'candidate',standalone);
   const snapshot=new Database(temporary,{readonly:true,fileMustExist:true});try{this.captureVector(snapshot);if(businessDigest(snapshot)!==business_digest)throw new ProductError('RECOVERY_SNAPSHOT_CHANGED');}finally{snapshot.close();}
   const {archive_hash,...certificate}=seal,payload=Buffer.from(JSON.stringify({...certificate,database:boundedArchive(temporary,MAX_DATABASE).toString('base64')})),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(MAGIC);const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]),bytes=Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),encrypted]);if(bytes.length>MAX_ARCHIVE)throw new ProductError('BACKUP_TOO_LARGE');seal.archive_hash=createHash('sha256').update(bytes).digest('hex');this.writeJournal(j);this.allocate(j,'archive');this.writeAllocated(j,'archive',bytes);this.phase(j,'staged');
   if(this.now()>=seal.expires_at||!same(this.authority.all(),authority))throw new ProductError('RECOVERY_SNAPSHOT_CHANGED');
   this.authority.db.transaction(()=>{this.authority.db.prepare("INSERT INTO sealed_archives VALUES(?,?,?,'retained',?)").run(seal.id,seal.created_at,seal.expires_at,seal.archive_hash);this.authority.setSeal(seal);j.phase='commit_decided';j.decision='committed';this.writeJournal(j);}).immediate();this.onCheckpoint('phase:commit_decided');this.finish(j);return {id:seal.id,seal_id:seal.seal_id,created_at,expires_at:seal.expires_at,sealed:true,activation_supported:true,excludes:['receipt_spool','current_authority'],invalidated_by:'successful_normal_open'};
  }catch(error){source?.close();throw error;}
 }
 inspectRestore(id:string){this.authority.expireSealedArchives(this.now());const seal=this.validSeal(uuid.parse(id));this.authenticate(seal);return {id:seal.id,seal_id:seal.seal_id,expires_at:seal.expires_at,eligible:true,requires:'installation_offline_and_explicit_trusted_confirmation',scope_count:seal.authority.length};}
 /** Requires exact trusted confirmation and the still-current one-use seal. */
 activateRestore(input:{id:string;seal_id:string;confirmation:'activate_sealed_checkpoint'}){
  if(!input||input.confirmation!=='activate_sealed_checkpoint'||!uuid.safeParse(input.id).success||!uuid.safeParse(input.seal_id).success)throw new ProductError('RECOVERY_CONFIRMATION_REQUIRED');
  this.authority.expireSealedArchives(this.now());const seal=this.validSeal(input.id);if(input.seal_id!==seal.seal_id)throw new ProductError('RECOVERY_CONFIRMATION_STALE');
  const j=this.begin('restore',seal);let candidate:Database.Database|undefined;
  try{
   this.ensureOperationDirectory(j);const bytes=this.authenticate(this.validSeal(input.id));this.allocate(j,'candidate');this.writeAllocated(j,'candidate',bytes);
   if(bytes.length<100||bytes[18]!==1||bytes[19]!==1)throw new ProductError('RECOVERY_DATABASE_INVALID');j.files.candidate=stamp(this.candidate(j),false);this.writeJournal(j);
   candidate=new Database(this.candidate(j),{fileMustExist:true});candidate.pragma('journal_mode=MEMORY');candidate.pragma('synchronous=FULL');candidate.pragma('secure_delete=ON');candidate.pragma('foreign_keys=ON');
   this.captureVector(candidate);if(businessDigest(candidate)!==seal.business_digest)throw new ProductError('RECOVERY_DATABASE_INVALID');
   this.onCheckpoint('candidate:mutable');const result=sanitizeRestoredImage(candidate,seal.authority,this.now());this.onCheckpoint('candidate:sanitized');
   const checkpoint=candidate.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];if(checkpoint.some(row=>row.busy))throw new ProductError('RECOVERY_CHECKPOINT_BUSY');
   if(candidate.pragma('journal_mode=DELETE',{simple:true})!=='delete')throw new ProductError('RECOVERY_DATABASE_INVALID');
   this.captureVector(candidate);j.candidate_digest=businessDigest(candidate);candidate.close();candidate=undefined;
   const fd=openSync(this.candidate(j),constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(this.operationDirectory(j));
   j.files.candidate=stamp(this.candidate(j));this.writeJournal(j);this.phase(j,'staged');
   this.validSeal(input.id);if(!same(this.authority.getSeal(),seal))throw new ProductError('RECOVERY_STALE_SEAL');
   for(const role of Object.keys(suffixes) as (keyof typeof suffixes)[]){const file=this.file+suffixes[role];if(present(file))j.original[role]=stamp(file);}
   this.writeJournal(j);this.phase(j,'replacing');
   for(const role of Object.keys(j.original) as (keyof typeof suffixes)[])this.move(j,role,this.file+suffixes[role],this.original(j,role),j.original[role]!);
   for(const role of Object.keys(suffixes) as (keyof typeof suffixes)[])if(present(this.file+suffixes[role]))throw new ProductError('RECOVERY_UNEXPECTED_MAIN_BUNDLE');
   this.move(j,'candidate',this.candidate(j),this.file,j.files.candidate!);this.phase(j,'verifying');this.verifyInstalled(j);
   if(!same(this.validSeal(input.id),seal))throw new ProductError('RECOVERY_STALE_SEAL');
   this.authority.db.transaction(()=>{this.authority.advanceIncarnation();this.authority.clearSeal();j.decision='committed';j.phase='commit_decided';this.writeJournal(j);}).immediate();this.onCheckpoint('phase:commit_decided');
   this.finish(j);return {restoration_performed:true,incarnation:this.authority.maintenanceState().incarnation,unresolved_off_inputs:result.unresolved_off_inputs,execution_started:false};
  }catch(error){candidate?.close();
   // Only unambiguous, precommit replacement failures roll back automatically.
   // All activation failures retain the durable fence, even when rollback has
   // restored the original bundle. Explicit recovery verifies and cleans it.
   if(j.decision==='pending')try{this.rollback(j);}catch{/* Preserve original error and the fenced journal. */}
   throw error;
  }
 }
 private move(j:Journal,role:Move['role'],from:string,to:string,expected:Stamp){const movement:Move={role,from,to,stamp:expected,state:'intent'};j.moves.push(movement);this.writeJournal(j);this.onCheckpoint('rename:'+role+':before');
  if(!present(from)||present(to))throw new ProductError('RECOVERY_RENAME_AMBIGUOUS');matches(from,expected);renameSync(from,to);syncDirectory(path.dirname(from));if(path.dirname(from)!==path.dirname(to))syncDirectory(path.dirname(to));this.onCheckpoint('rename:'+role+':after');movement.state='done';this.writeJournal(j);
 }
 private validateMove(j:Journal,m:Move){const expectedFrom=m.role==='candidate'?this.candidate(j):this.file+suffixes[m.role],expectedTo=m.role==='candidate'?this.file:this.original(j,m.role);
  if(m.from!==expectedFrom||m.to!==expectedTo||!['intent','done','undo_intent','undone'].includes(m.state)||!m.stamp)throw new ProductError('RECOVERY_JOURNAL_INVALID');
 }
 private rollback(j:Journal){if(j.decision==='committed')throw new ProductError('RECOVERY_ALREADY_COMMITTED');j.decision='rollback';j.rollback=true;this.writeJournal(j);
  for(const movement of [...j.moves].reverse()){
   this.validateMove(j,movement);const from=present(movement.from),to=present(movement.to);
   if(movement.state==='undone'){if(!from)throw new ProductError('RECOVERY_ROLLBACK_AMBIGUOUS');matches(movement.from,movement.stamp);if(to){if(movement.role!=='candidate'||!j.original.main)throw new ProductError('RECOVERY_ROLLBACK_AMBIGUOUS');matches(movement.to,j.original.main);}continue;}
   if(from&&!to){matches(movement.from,movement.stamp);movement.state='undone';this.writeJournal(j);continue;}
   if(from||!to)throw new ProductError('RECOVERY_ROLLBACK_AMBIGUOUS');matches(movement.to,movement.stamp);movement.state='undo_intent';this.writeJournal(j);this.onCheckpoint('rollback:'+movement.role+':before');renameSync(movement.to,movement.from);syncDirectory(path.dirname(movement.to));if(path.dirname(movement.to)!==path.dirname(movement.from))syncDirectory(path.dirname(movement.from));this.onCheckpoint('rollback:'+movement.role+':after');movement.state='undone';this.writeJournal(j);
  }
  for(const role of Object.keys(suffixes) as (keyof typeof suffixes)[]){const file=this.file+suffixes[role],expected=j.original[role];if(expected)matches(file,expected);else if(present(file)&&j.moves.length)throw new ProductError('RECOVERY_ROLLBACK_CHANGED');}
 }
 private verifyInstalled(j:Journal){if(!j.files.candidate||!j.candidate_digest)throw new ProductError('RECOVERY_JOURNAL_INVALID');matches(this.file,j.files.candidate);for(const suffix of ['-wal','-shm','-journal'])if(present(this.file+suffix))throw new ProductError('RECOVERY_UNEXPECTED_MAIN_BUNDLE');
  const installed=new Database(this.file,{readonly:true,fileMustExist:true});try{this.captureVector(installed);if(installed.pragma('journal_mode',{simple:true})!=='delete'||businessDigest(installed)!==j.candidate_digest)throw new ProductError('RECOVERY_INSTALLED_INVALID');}finally{installed.close();}matches(this.file,j.files.candidate);
 }
 private remove(j:Journal,role:string,file:string,expected:Stamp){if(j.cleaned.includes(role)){if(present(file))throw new ProductError('RECOVERY_CLEANUP_CHANGED');return;}if(present(file)){matches(file,expected);this.writeJournal(j);this.onCheckpoint('unlink:'+role+':before');unlinkSync(file);syncDirectory(path.dirname(file));this.onCheckpoint('unlink:'+role+':after');}j.cleaned.push(role);this.writeJournal(j);}
 private finish(j:Journal){const committed=j.decision==='committed';this.phase(j,'cleanup');const directory=this.operationDirectory(j);
  if(present(directory)){this.ensureOperationDirectory(j);const allowed=new Set(['candidate.sqlite',...Object.keys(j.sidecars??{}).map(suffix=>'candidate.sqlite'+suffix),...Object.keys(j.original).map(role=>'original.sqlite'+suffixes[role as keyof typeof suffixes])]);for(const name of readdirSync(directory))if(!allowed.has(name))throw new ProductError('RECOVERY_UNKNOWN_FILE');}
  for(const suffix of Object.keys(j.sidecars??{}) as ('-wal'|'-shm'|'-journal')[]){if(!['-wal','-shm','-journal'].includes(suffix))throw new ProductError('RECOVERY_JOURNAL_INVALID');const file=this.candidate(j)+suffix;if(present(file)){if(!j.sidecars![suffix]){j.sidecars![suffix]=stamp(file);this.writeJournal(j);}this.remove(j,'candidate'+suffix,file,j.sidecars![suffix]!);}else if(j.sidecars![suffix])this.remove(j,'candidate'+suffix,file,j.sidecars![suffix]!);}
  if(Object.hasOwn(j.files,'candidate')){if(!j.files.candidate&&present(this.candidate(j))){j.files.candidate=stamp(this.candidate(j));this.writeJournal(j);}if(j.files.candidate)this.remove(j,'candidate',this.candidate(j),j.files.candidate);}
  else if(present(this.candidate(j)))throw new ProductError('RECOVERY_UNKNOWN_FILE');
  if(j.kind==='restore'&&committed&&!j.rollback)for(const role of Object.keys(j.original) as (keyof typeof suffixes)[])this.remove(j,'original:'+role,this.original(j,role),j.original[role]!);
  if(j.kind==='checkpoint'&&!committed&&Object.hasOwn(j.files,'archive')){if(!j.seal)throw new ProductError('RECOVERY_JOURNAL_INVALID');if(!j.files.archive&&present(this.archive(j.seal.id))){j.files.archive=stamp(this.archive(j.seal.id));this.writeJournal(j);}if(j.files.archive)this.remove(j,'archive',this.archive(j.seal.id),j.files.archive);}
  if(present(directory)){if(readdirSync(directory).length)throw new ProductError('RECOVERY_UNKNOWN_FILE');rmdirSync(directory);syncDirectory(path.dirname(directory));}
  this.phase(j,'ready');this.authority.db.transaction(()=>{this.authority.db.prepare('DELETE FROM restore_journal WHERE singleton=1').run();this.authority.finishMaintenance();}).immediate();this.journal=undefined;this.onCheckpoint('fence:ready');
 }
 /** Resolves only the registered operation. No normal Store/host is opened. */
 recoverInterruptedActivation(){const row=this.authority.db.prepare('SELECT data FROM restore_journal WHERE singleton=1').get() as {data:string}|undefined;
  if(!row){if(this.authority.maintenanceState().mode!=='ready')throw new ProductError('RECOVERY_JOURNAL_REQUIRED');return {recovered:false,restoration_performed:false};}
  let j:Journal;try{j=journalSchema.parse(JSON.parse(row.data));if(j.decision==='committed'&&!['commit_decided','cleanup','ready'].includes(j.phase))throw Error();if(j.phase==='commit_decided'&&j.decision!=='committed')throw Error();if(j.kind==='restore'&&!j.seal)throw Error();}catch{throw new ProductError('RECOVERY_JOURNAL_INVALID');}
  this.authority.resumeMaintenance();this.journal=j;
  const committed=j.decision==='committed';if(j.kind==='restore'){if(committed)this.verifyInstalled(j);else if(!['cleanup','ready'].includes(j.phase))this.rollback(j);}this.finish(j);return {recovered:true,restoration_performed:j.kind==='restore'&&committed,rolled_back:j.kind==='restore'&&!committed,original_health_verified:false,checkpoint_retained:j.kind==='checkpoint'&&committed};
 }
 close(){this.authority.close();}
}
