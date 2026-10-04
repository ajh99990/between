import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
import os from 'node:os';import path from 'node:path';
import {Store} from '@between/core/store';import {OfflineRecovery} from '@between/core/privacy/offline-recovery';
// Inject one real Node filesystem call failure at a durable journal boundary.
// SQLite still uses its actual native database; no success result is simulated.
for(const kind of ['rename','fsync','unlink'] as const)test('actual '+kind+' I/O error retains durable fence until verified recovery',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-io-')),file=path.join(dir,'main.sqlite'),directory=path.join(dir,'sealed'),key=Buffer.alloc(32,42),now=()=>100000,store=new Store(file,now,true,'synthetic');store.start(true,true,true);store.set({memory:'on'});store.receive('input','SYNTHETIC_RESTORED_AFTER_IO');store.close();
 let enabled=false,armed=false,failures=0;
 const recovery=new OfflineRecovery(file,directory,key,now,name=>{if(enabled&&name===(kind==='unlink'?'unlink:original:main:before':'rename:main:before'))armed=true;});
 const realRename=fs.renameSync,realFsync=fs.fsyncSync,realUnlink=fs.unlinkSync;
 const fail=()=>{if(!armed)return false;armed=false;enabled=false;failures++;const error=Error('SYNTHETIC_'+kind+'_EIO') as NodeJS.ErrnoException;error.code='EIO';throw error;};
 try{const seal=await recovery.createSealedCheckpoint();fs.writeFileSync(file,'SYNTHETIC_CORRUPT_ORIGINAL');const original=fs.readFileSync(file);enabled=true;
  if(kind==='rename')fs.renameSync=((...args:Parameters<typeof fs.renameSync>)=>{fail();return realRename(...args);}) as typeof fs.renameSync;
  if(kind==='fsync')fs.fsyncSync=((...args:Parameters<typeof fs.fsyncSync>)=>{fail();return realFsync(...args);}) as typeof fs.fsyncSync;
  if(kind==='unlink')fs.unlinkSync=((...args:Parameters<typeof fs.unlinkSync>)=>{fail();return realUnlink(...args);}) as typeof fs.unlinkSync;
  syncBuiltinESMExports();assert.throws(()=>recovery.activateRestore({...seal,confirmation:'activate_sealed_checkpoint'}),/SYNTHETIC_.*_EIO/);assert.equal(failures,1);assert.equal(recovery.authority.maintenanceState().mode,'maintenance');assert.throws(()=>new Store(file,now,false,'synthetic'),/INSTALLATION_MAINTENANCE/);
  fs.renameSync=realRename;fs.fsyncSync=realFsync;fs.unlinkSync=realUnlink;syncBuiltinESMExports();
  const result=recovery.recoverInterruptedActivation();assert.equal(recovery.authority.maintenanceState().mode,'ready');
  if(kind==='unlink'){assert.equal(result.restoration_performed,true);const reopened=new Store(file,now,true,'synthetic');try{assert.equal(reopened.history()[0].text,'SYNTHETIC_RESTORED_AFTER_IO');}finally{reopened.close();}}
  else {assert.equal(result.restoration_performed,false);assert.equal(result.rolled_back,true);assert.deepEqual(fs.readFileSync(file),original);assert.equal(recovery.inspectRestore(seal.id).eligible,true);}
 }finally{fs.renameSync=realRename;fs.fsyncSync=realFsync;fs.unlinkSync=realUnlink;syncBuiltinESMExports();recovery.close();}
});
