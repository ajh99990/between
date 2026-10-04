import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,renameSync,writeFileSync,existsSync,symlinkSync,unlinkSync,linkSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {Store} from '@between/core/store';
import {OffCache} from '@between/core/runtime/off-cache';
import {PrivacyAuthority,MAIN_SCHEMA,AUTHORITY_SCHEMA,currentProcessIdentity,classifyProcessIdentity} from '@between/core/privacy/authority';
const fixture=()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'installation-fence-')),file=path.join(dir,'main.sqlite'),store=new Store(file,()=>100000,true,'synthetic');return {dir,file,store};};
const handles=(a:PrivacyAuthority)=>(a.db.prepare('SELECT count(*) n FROM handles').get() as {n:number}).n;
test('all ordinary and MCP Store handles and unopened-scope spools fence maintenance',()=>{
 const f=fixture(),mcp=new Store(f.file,()=>100000,false,f.store.scope),off=new OffCache(path.join(f.dir,'spool.sqlite'),Buffer.alloc(32,17),f.store.authority),controller=PrivacyAuthority.openExisting(f.store.authority.file);
 try{assert.equal(handles(controller),3);assert.throws(()=>controller.beginMaintenance(),/INSTALLATION_HANDLES_OPEN/);f.store.close();assert.equal(handles(controller),2);assert.throws(()=>controller.beginMaintenance(),/INSTALLATION_HANDLES_OPEN/);mcp.close();assert.equal(handles(controller),1);off.put('never-bound','id','SYNTHETIC');assert.throws(()=>controller.beginMaintenance(),/INSTALLATION_HANDLES_OPEN/);off.close();assert.equal(handles(controller),0);controller.beginMaintenance();controller.finishMaintenance();}finally{off.close();mcp.close();f.store.close();controller.close();}
});
test('maintenance rejects Store and spool registration before touching their SQLite files',()=>{
 const f=fixture();f.store.close();const a=PrivacyAuthority.openExisting(f.file+'.authority.sqlite');a.beginMaintenance();const bytes=readFileSync(f.file),spool=path.join(f.dir,'not-created.sqlite');
 try{for(const recover of [false,true])assert.throws(()=>new Store(f.file,()=>100000,recover,'synthetic'),/INSTALLATION_MAINTENANCE/);assert.throws(()=>new OffCache(spool,Buffer.alloc(32,17),a),/INSTALLATION_MAINTENANCE/);assert.deepEqual(readFileSync(f.file),bytes);assert.equal(existsSync(spool),false);assert.equal(handles(a),0);}finally{a.finishMaintenance();a.close();}
});
test('maintenance belongs to one controller instance, including within the same process',()=>{
 const f=fixture();f.store.close();const a=PrivacyAuthority.openExisting(f.file+'.authority.sqlite'),b=PrivacyAuthority.openExisting(a.file);
 try{const first=a.beginMaintenance();assert.throws(()=>a.beginMaintenance(),/INSTALLATION_MAINTENANCE/);assert.throws(()=>b.resumeMaintenance(),/OWNER_LIVE/);assert.throws(()=>b.finishMaintenance(),/MAINTENANCE_REQUIRED/);assert.deepEqual(a.resumeMaintenance(),first);assert.equal(a.advanceIncarnation(),1);a.finishMaintenance();const store=new Store(f.file,()=>100000,false,'synthetic');try{assert.equal(store.authority.maintenanceState().incarnation,1);}finally{store.close();}}finally{a.close();b.close();}
});
test('handle epochs, incarnations, registration and exact current process ownership are checked',()=>{
 const f=fixture(),a=f.store.authority,lease=a.registerHandle('spool');try{a.assertHandle(lease);for(const changed of [{...lease,epoch:lease.epoch+1},{...lease,incarnation:lease.incarnation+1},{...lease,id:'unregistered'}])assert.throws(()=>a.assertHandle(changed),/HANDLE_STALE/);const owner=currentProcessIdentity();a.db.prepare('UPDATE handles SET owner=? WHERE id=?').run(JSON.stringify({...owner,starttime:String(BigInt(owner.starttime)+1n)}),lease.id);assert.throws(()=>a.assertHandle(lease),/HANDLE_STALE/);assert.throws(()=>a.releaseHandle(lease),/HANDLE_STALE/);}finally{a.db.prepare('DELETE FROM handles WHERE id=?').run(lease.id);f.store.close();}
});
test('Linux PID identity classifies reused PID and namespace ambiguity unknown',()=>{
 const owner=currentProcessIdentity();assert.equal(classifyProcessIdentity(owner),'live');assert.equal(classifyProcessIdentity({...owner,starttime:String(BigInt(owner.starttime)+1n)}),'unknown');assert.equal(classifyProcessIdentity({...owner,pid_namespace:'pid:[1]'}),'unknown');assert.equal(classifyProcessIdentity({...owner,boot_id:'00000000-0000-0000-0000-000000000000'}),'dead');assert.equal(classifyProcessIdentity({...owner,pid:0}),'unknown');assert.equal(classifyProcessIdentity({pid:process.pid}),'unknown');
});
test('ambiguous handle owner prevents offline maintenance rather than reaping',()=>{
 const f=fixture(),a=PrivacyAuthority.openExisting(f.store.authority.file);f.store.close();const owner=currentProcessIdentity();a.db.prepare('INSERT INTO handles VALUES(?,?,?,?,?)').run('synthetic-ambiguous','store',0,0,JSON.stringify({...owner,starttime:String(BigInt(owner.starttime)+1n)}));try{assert.throws(()=>a.beginMaintenance(),/HANDLE_OWNER_UNKNOWN/);assert.equal(a.maintenanceState().mode,'ready');assert.equal(handles(a),1);}finally{a.db.prepare('DELETE FROM handles').run();a.close();}
});
test('replaced main inode fences reads, writes and teardown owner cleanup',()=>{
 const f=fixture();f.store.db.pragma('wal_checkpoint(TRUNCATE)');renameSync(f.file,f.file+'.retained');writeFileSync(f.file,'SYNTHETIC_REPLACEMENT');const before=readFileSync(f.file);try{for(const call of [()=>f.store.controls(),()=>f.store.version(),()=>f.store.history(),()=>f.store.set({memory:'on'}),()=>f.store.deletionStatus(),()=>f.store.purge()])assert.throws(call,/MAIN_DATABASE_STALE/);}finally{f.store.close();}assert.deepEqual(readFileSync(f.file),before);const a=PrivacyAuthority.openExisting(f.file+'.authority.sqlite');try{assert.equal(handles(a),0);}finally{a.close();}
});
test('spool inode replacement and authority incarnation changes fence every public DB path',()=>{
 const f=fixture(),off=new OffCache(path.join(f.dir,'spool.sqlite'),Buffer.alloc(32,17),f.store.authority);off.db.pragma('wal_checkpoint(TRUNCATE)');renameSync(path.join(f.dir,'spool.sqlite'),path.join(f.dir,'retained-spool'));writeFileSync(path.join(f.dir,'spool.sqlite'),'SYNTHETIC_REPLACEMENT');try{for(const call of [()=>off.put('s','id','x'),()=>off.get('s','id'),()=>off.remove('s','id'),()=>off.removeScope('s'),()=>off.expire()])assert.throws(call,/SPOOL_STALE/);f.store.authority.db.prepare('UPDATE installation SET incarnation=incarnation+1').run();assert.throws(()=>f.store.controls(),/HANDLE_STALE/);}finally{off.close();f.store.close();}
});
test('schema 6/authority 2 creation rejects schema 5 without mutation or migration',()=>{
 const f=fixture();assert.equal(f.store.db.pragma('user_version',{simple:true}),MAIN_SCHEMA);assert.equal(f.store.authority.db.pragma('user_version',{simple:true}),AUTHORITY_SCHEMA);f.store.db.pragma('user_version=5');f.store.close();const bytes=readFileSync(f.file);assert.throws(()=>new Store(f.file,()=>100000,false,'synthetic'),/UNSUPPORTED_DATABASE_SCHEMA/);assert.deepEqual(readFileSync(f.file),bytes);const a=PrivacyAuthority.openExisting(f.file+'.authority.sqlite');try{assert.equal(handles(a),0);}finally{a.close();}
});
test('missing main never initializes under an existing empty authority',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'orphan-authority-')),file=path.join(dir,'main.sqlite'),a=new PrivacyAuthority(file+'.authority.sqlite','11111111-1111-4111-8111-111111111111',true);a.close();assert.throws(()=>new Store(file),/MAIN_DATABASE_REQUIRED/);assert.equal(existsSync(file),false);const reopened=PrivacyAuthority.openExisting(a.file);try{assert.equal(handles(reopened),0);}finally{reopened.close();}
});
test('dangling main and authority symlinks and linked parents never create implicit installations',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'symlink-installation-')),file=path.join(dir,'main.sqlite');symlinkSync(path.join(dir,'missing'),file);assert.throws(()=>new Store(file),/PRIVACY_AUTHORITY_REQUIRED/);assert.equal(existsSync(file+'.authority.sqlite'),false);unlinkSync(file);symlinkSync(path.join(dir,'missing-authority'),file+'.authority.sqlite');assert.throws(()=>new Store(file),/AUTHORITY_UNVERIFIED/);assert.equal(existsSync(file),false);const link=path.join(dir,'link');symlinkSync(dir,link);assert.throws(()=>new Store(path.join(link,'nested.sqlite')),/STORAGE_PATH_UNVERIFIED/);assert.equal(existsSync(path.join(dir,'nested.sqlite.authority.sqlite')),false);
});
test('old independent authority schema fails closed without migration',()=>{
 const f=fixture();f.store.close();const db=new Database(f.file+'.authority.sqlite');db.pragma('user_version=1');db.close();const bytes=readFileSync(f.file+'.authority.sqlite');assert.throws(()=>new Store(f.file),/UNSUPPORTED_AUTHORITY_SCHEMA/);assert.deepEqual(readFileSync(f.file+'.authority.sqlite'),bytes);
});

test('every database open rejects dangling, symlink, and hardlink SQLite sidecars',()=>{
 for(const target of ['main','authority','spool'])for(const [suffix,kind] of [['-wal','symlink'],['-shm','dangling'],['-journal','hardlink']] as const){
  const f=fixture(),authorityFile=f.store.authority.file,spool=path.join(f.dir,'spool.sqlite');if(target==='spool'){const off=new OffCache(spool,Buffer.alloc(32,17),f.store.authority);off.close();}f.store.close();
  const file=target==='main'?f.file:target==='authority'?authorityFile:spool,outside=path.join(f.dir,'external-canary');writeFileSync(outside,'SYNTHETIC_EXTERNAL_UNCHANGED');const sidecar=file+suffix;if(existsSync(sidecar))unlinkSync(sidecar);
  if(kind==='hardlink')linkSync(outside,sidecar);else symlinkSync(kind==='dangling'?path.join(f.dir,'does-not-exist'):outside,sidecar);
  let authority:PrivacyAuthority|undefined;try{if(target==='spool'){authority=PrivacyAuthority.openExisting(authorityFile);assert.throws(()=>new OffCache(spool,Buffer.alloc(32,17),authority!),/SQLITE_SIDECAR_UNVERIFIED/);}else assert.throws(()=>new Store(f.file),/SQLITE_SIDECAR_UNVERIFIED/);assert.equal(readFileSync(outside,'utf8'),'SYNTHETIC_EXTERNAL_UNCHANGED');}finally{authority?.close();unlinkSync(sidecar);}
 }
});
test('orphan main SQLite sidecars cannot seed a new independent authority',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'orphan-sidecar-')),file=path.join(dir,'main.sqlite');writeFileSync(file+'-wal','SYNTHETIC_ORPHAN');assert.throws(()=>new Store(file),/PRIVACY_AUTHORITY_REQUIRED/);assert.equal(existsSync(file+'.authority.sqlite'),false);assert.equal(existsSync(file),false);assert.equal(readFileSync(file+'-wal','utf8'),'SYNTHETIC_ORPHAN');
});

// A separate runtime may not acquire a second writer by selecting another scope.
test('independent authoritative runtime is exclusive across all scopes',()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'whole-owner-')),file=path.join(dir,'state.db'),owner=new Store(file,()=>Date.now(),true,'owner-a');try{assert.throws(()=>new Store(file,()=>Date.now(),true,'owner-b'),/DATABASE_ALREADY_OPEN/);assert.equal(owner.authority.all().some(s=>s.scope==='owner-b'),false);}finally{owner.close();}const next=new Store(file,()=>Date.now(),true,'owner-b');next.close();});
