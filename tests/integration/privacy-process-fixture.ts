// Deterministic synthetic crash checkpoints; never a real provider or user record.
import path from 'node:path';
import {Store} from '@between/core/store';
import {BackupManager} from '@between/core/privacy/backup';
const [mode,directory]=process.argv.slice(2),store=new Store(path.join(directory,'main.sqlite'),()=>100000,true,'crash-scope');
store.start(true,true,true);const turn=store.receive('crash-turn','SYNTHETIC_PROCESS_PRIVATE_CANARY')!;store.context(turn.token,{});store.remember(turn.token,'SYNTHETIC_PROCESS_PRIVATE_CANARY','synthetic-operation');
if(mode==='confirmed'){
 const plan=store.planDeletion(store.scope);store.confirmDeletion(store.scope,plan.plan_id,plan.digest,plan.confirmation_token);process.stdout.write('CHECKPOINT_CONFIRMED\n');setInterval(()=>{},1000);
}else if(mode==='backup'){
 const manager=new BackupManager(store,path.join(directory,'backups'),Buffer.alloc(32,11),()=>100000),backup=store.db.backup.bind(store.db);
 store.db.backup=async(destination,options)=>{const result=await backup(destination,options);process.stdout.write('CHECKPOINT_PLAINTEXT\n');setInterval(()=>{},1000);await new Promise<void>(()=>{});return result;};
 void manager.create();
}else if(mode==='authority'){
 store.authority.advance(store.scope,store.authority.get(store.scope)!.version);process.stdout.write('CHECKPOINT_AUTHORITY\n');setInterval(()=>{},1000);
}else if(mode==='early-exit'){store.close();process.exit(0);}else throw Error('SYNTHETIC_MODE_INVALID');
