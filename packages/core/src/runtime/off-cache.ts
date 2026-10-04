import Database from 'better-sqlite3';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdirSync,chmodSync,lstatSync,openSync,closeSync,fsyncSync,constants} from 'node:fs';
import path from 'node:path';
import {ProductError} from '../store.js';
import {PrivacyAuthority,assertCanonicalParent,assertSqliteSidecars,assertSqliteBundle,sqliteSidecars,pathExists,type HandleLease} from '../privacy/authority.js';
export const SPOOL_SCHEMA=2;
const identityDDL='CREATE TABLE spool_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1),installation TEXT NOT NULL)';
const receiptsDDL='CREATE TABLE receipts(id TEXT NOT NULL,scope TEXT NOT NULL,nonce BLOB NOT NULL,tag BLOB NOT NULL,body BLOB NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(scope,id))';
/** Encrypted 15-minute receipt spool, excluded from business backup and traces.
 * Its independent installation lease is registered before SQLite is opened. */
export class OffCache {
  readonly db!:Database.Database;
  readonly authority:PrivacyAuthority;
  private lease!:HandleLease;
  private inode!:{dev:number;ino:number};
  private closed=false;
  private gates=new Map<string,()=>void>();
  private expiryListeners=new Set<(receipts:{scope:string;id:string}[])=>void>();
  private expiryTimer?:ReturnType<typeof setInterval>;
  constructor(private file:string,private key:Buffer,authority:PrivacyAuthority,private now=()=>Date.now()){
    assertCanonicalParent(file);assertSqliteSidecars(file);
    if(!pathExists(file)&&sqliteSidecars.some(suffix=>pathExists(file+suffix)))throw new ProductError('SPOOL_UNVERIFIED');
    if(key.length!==32)throw new ProductError('DATA_KEY_INVALID');
    authority.assertAvailable();this.authority=PrivacyAuthority.openExisting(authority.file);
    if(this.authority.identity!==authority.identity){this.authority.close();throw new ProductError('PRIVACY_AUTHORITY_MISMATCH');}
    try{
      this.lease=this.authority.registerHandle('spool');
      // An isolated spool cannot certify the sealed main. Open a verified Store
      // first; no encryption, expiry sweep, or schema write may spend its seal.
      if(this.authority.getSeal()!==undefined)throw new ProductError('RECOVERY_SEAL_REQUIRES_MAIN_OPEN');
      const existing=pathExists(file);
      if(existing){
        assertSqliteBundle(file);this.inode=lstatSync(file);
        // No chmod, schema/PRAGMA writes, expiry, or encryption before the existing
        // database's installation and exact schema have passed read-only checks.
        const read=new Database(file,{readonly:true,fileMustExist:true});
        try{read.transaction(()=>this.verifySpool(read)).deferred();}finally{read.close();}
        this.assertPath();this.authority.assertHandle(this.lease);
      }else{
        if(sqliteSidecars.some(suffix=>pathExists(file+suffix)))throw new ProductError('SPOOL_UNVERIFIED');
        mkdirSync(path.dirname(file),{recursive:true,mode:0o700});assertCanonicalParent(file);
        // Different installation registries cannot serialize each other. O_EXCL
        // claims this shared filesystem path exactly once before any SQLite open.
        let fd:number;try{fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new ProductError('SPOOL_CREATION_CONFLICT');throw error;}
        try{fsyncSync(fd);}finally{closeSync(fd);}this.inode=lstatSync(file);
        const directory=openSync(path.dirname(file),constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
      }
      assertSqliteBundle(file);this.assertPath();this.db=new Database(file,{fileMustExist:true});
      if(existing)this.verifySpool(this.db);
      chmodSync(file,0o600);this.db.pragma('journal_mode=WAL');this.db.pragma('synchronous=FULL');this.db.pragma('secure_delete=ON');
      if(this.db.pragma('synchronous',{simple:true})!==2||this.db.pragma('journal_mode',{simple:true})!=='wal'||this.db.pragma('secure_delete',{simple:true})!==1)throw new ProductError('STORAGE_UNAVAILABLE');
      if(!existing)this.db.transaction(()=>{this.db.exec(identityDDL+';'+receiptsDDL+`;PRAGMA user_version=${SPOOL_SCHEMA};`);this.db.prepare('INSERT INTO spool_identity VALUES(1,?)').run(this.authority.identity);}).immediate();
      this.verifySpool(this.db);
      this.expire();this.expiryTimer=setInterval(()=>{try{this.expire();}catch{/* Public reads remain fenced and reject expired rows. */}},1000);this.expiryTimer.unref();
    }catch(error){if(this.db?.open)this.db.close();if(this.lease)try{this.authority.releaseHandle(this.lease);}catch{/* Preserve the primary failure. */}this.authority.close();throw error;}
  }
  private verifySpool(db:Database.Database){
    if(db.pragma('user_version',{simple:true})!==SPOOL_SCHEMA)throw new ProductError('SPOOL_UNSUPPORTED_SCHEMA');
    if(db.pragma('quick_check',{simple:true})!=='ok')throw new ProductError('SPOOL_UNVERIFIED');
    const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string;sql:string}[];
    if(tables.length!==2||tables[0].name!=='receipts'||tables[0].sql!==receiptsDDL||tables[1].name!=='spool_identity'||tables[1].sql!==identityDDL||db.prepare("SELECT 1 FROM sqlite_master WHERE type IN('view','trigger') LIMIT 1").get())throw new ProductError('SPOOL_UNSUPPORTED_SCHEMA');
    this.assertIdentity(db);
  }
  private assertIdentity(db:Database.Database){const identities=db.prepare('SELECT singleton,installation FROM spool_identity').all() as {singleton:number;installation:string}[];if(identities.length!==1||identities[0].singleton!==1||identities[0].installation!==this.authority.identity)throw new ProductError('SPOOL_IDENTITY_MISMATCH');}
  private assertPath(){assertCanonicalParent(this.file);assertSqliteSidecars(this.file);let stat;try{stat=lstatSync(this.file);}catch{throw new ProductError('SPOOL_UNVERIFIED');}if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.dev!==this.inode.dev||stat.ino!==this.inode.ino)throw new ProductError('SPOOL_STALE');}
  private aad(scope:string,id:string){return Buffer.from(JSON.stringify(['relationship-receipt-spool-v2',this.authority.identity,scope,id]));}
  assertFence(){if(this.closed)throw new ProductError('INSTALLATION_HANDLE_STALE');this.authority.assertHandle(this.lease);this.assertPath();this.assertIdentity(this.db);}
  bindScope(scope:string,gate:()=>void){this.assertFence();this.gates.set(scope,gate);}
  removeScope(scope:string){this.assertFence();this.db.prepare('DELETE FROM receipts WHERE scope=?').run(scope);const checkpoint=this.db.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];if(checkpoint.some(row=>row.busy))throw new ProductError('DELETION_CHECKPOINT_BUSY');if(this.db.prepare('SELECT 1 FROM receipts WHERE scope=?').get(scope))throw new ProductError('DELETION_VERIFICATION_FAILED');}
  put(scope:string,id:string,text:string){this.assertFence();this.gates.get(scope)?.();const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(this.aad(scope,id));const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);this.db.prepare('INSERT OR REPLACE INTO receipts VALUES(?,?,?,?,?,?)').run(id,scope,nonce,cipher.getAuthTag(),body,this.now()+900000);}
  get(scope:string,id:string){this.assertFence();this.gates.get(scope)?.();const r=this.db.prepare('SELECT * FROM receipts WHERE id=? AND scope=?').get(id,scope) as any;if(!r)throw new ProductError('OFF_INPUT_UNAVAILABLE');if(r.expires<=this.now()){this.expire();throw new ProductError('OFF_INPUT_UNAVAILABLE');}try{const cipher=createDecipheriv('aes-256-gcm',this.key,r.nonce);cipher.setAAD(this.aad(scope,id));cipher.setAuthTag(r.tag);return Buffer.concat([cipher.update(r.body),cipher.final()]).toString('utf8');}catch{throw new ProductError('OFF_INPUT_UNAVAILABLE');}}
  remove(scope:string,id:string){this.assertFence();this.db.prepare('DELETE FROM receipts WHERE id=? AND scope=?').run(id,scope);}
  onBeforeExpire(listener:(receipts:{scope:string;id:string}[])=>void){this.assertFence();this.expiryListeners.add(listener);return ()=>this.expiryListeners.delete(listener);}
  expire(){this.assertFence();const expired=this.db.prepare('SELECT scope,id FROM receipts WHERE expires<=?').all(this.now()) as {scope:string;id:string}[];if(!expired.length)return;for(const listener of this.expiryListeners)listener(expired);this.assertFence();this.db.prepare('DELETE FROM receipts WHERE expires<=?').run(this.now());}
  close(){if(this.closed)return;clearInterval(this.expiryTimer);if(this.db.open)this.db.close();try{this.authority.releaseHandle(this.lease);}catch{/* Missing/replaced authority stays fenced; DB is already closed. */}finally{this.authority.close();this.closed=true;}}
}
