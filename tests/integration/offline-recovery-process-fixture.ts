// Synthetic process fault fixture; no renderer, provider, keys or user files.
import path from 'node:path';
import {OfflineRecovery,type RecoverySeal} from '@between/core/privacy/offline-recovery';
import {Store} from '@between/core/store';
import {OffCache} from '@between/core/runtime/off-cache';
const [mode,directory,checkpoint]=process.argv.slice(2),file=path.join(directory,'main.sqlite'),key=Buffer.alloc(32,19),now=()=>100000;
function stop(name:string){if(name===checkpoint){process.stdout.write('CHECKPOINT_'+name+'\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}}
if(mode==='seed-wal'){
 const store=new Store(file,now,true,'synthetic');store.start(true,true,true);store.set({memory:'on'});store.db.pragma('wal_checkpoint(TRUNCATE)');const turn=store.receive('wal-input','SYNTHETIC_COMMITTED_WAL')!;store.context(turn.token,{});store.remember(turn.token,'SYNTHETIC_COMMITTED_WAL','wal-operation');store.end(turn,turn.id,'completed');process.stdout.write('CHECKPOINT_REAL_WAL\n');setInterval(()=>{},1000);
}else if(mode==='restore'){
 const recovery=new OfflineRecovery(file,path.join(directory,'sealed'),key,now,stop),seal=recovery.authority.getSeal() as RecoverySeal;
 recovery.activateRestore({id:seal.id,seal_id:seal.seal_id,confirmation:'activate_sealed_checkpoint'});recovery.close();
}else if(mode==='recover'){
 const recovery=new OfflineRecovery(file,path.join(directory,'sealed'),key,now,stop);process.stdout.write(JSON.stringify(recovery.recoverInterruptedActivation())+'\n');recovery.close();
}else if(mode==='store'||mode==='spool'){
 const store=new Store(file,now,false,'synthetic');if(mode==='spool'){const off=new OffCache(path.join(directory,'spool.sqlite'),key,store.authority,now);store.close();process.stdout.write('CHECKPOINT_SPOOL_OPEN\n');setInterval(()=>{},1000);}else {process.stdout.write('CHECKPOINT_STORE_OPEN\n');setInterval(()=>{},1000);}
}else if(mode==='seal'){
 const recovery=new OfflineRecovery(file,path.join(directory,'sealed'),key,now,stop);await recovery.createSealedCheckpoint();recovery.close();
}else throw Error('SYNTHETIC_MODE_INVALID');
