// Real independent-process race fixture. All synchronization is IPC, never sleeps.
import {PrivacyAuthority,type HandleLease} from '@between/core/privacy/authority';
import {ProductError} from '@between/core/store';
const [file,mode]=process.argv.slice(2);
if(!process.send||!['register','maintenance'].includes(mode))throw Error('SYNTHETIC_FIXTURE_ARGUMENTS');
const authority=PrivacyAuthority.openExisting(file);
let started=false,lease:HandleLease|undefined,maintenance=false;
process.on('message',message=>{
 const command=(message as {command?:string})?.command;
 if(command==='start'){
  if(started)throw Error('SYNTHETIC_DUPLICATE_START');started=true;
  try{if(mode==='register')lease=authority.registerHandle('store');else{authority.beginMaintenance();maintenance=true;}process.send!({type:'result',mode,ok:true});}
  catch(error){process.send!({type:'result',mode,ok:false,error:error instanceof ProductError?error.code:error instanceof Error?error.message:'SYNTHETIC_UNKNOWN'});}
 }else if(command==='release'){
  if(lease)authority.releaseHandle(lease);if(maintenance)authority.finishMaintenance();authority.close();
  process.send!({type:'released'},undefined,undefined,()=>process.disconnect());
 }else throw Error('SYNTHETIC_UNKNOWN_COMMAND');
});
process.send({type:'ready',mode,pid:process.pid});
