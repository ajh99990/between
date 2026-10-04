// Synthetic cross-installation initialization race, synchronized only by IPC.
import {PrivacyAuthority} from '@between/core/privacy/authority';
import {OffCache} from '@between/core/runtime/off-cache';
import {ProductError} from '@between/core/store';
const [authorityFile,spool]=process.argv.slice(2),authority=PrivacyAuthority.openExisting(authorityFile);
let off:OffCache|undefined,started=false;
process.on('message',message=>{const command=(message as {command:string}).command;
 if(command==='start'){if(started)throw Error('SYNTHETIC_DUPLICATE_START');started=true;try{off=new OffCache(spool,Buffer.alloc(32,71),authority,()=>100000);off.put('same-scope','same-id','SYNTHETIC_'+authority.identity);process.send!({type:'result',ok:true,identity:authority.identity});}catch(error){process.send!({type:'result',ok:false,error:error instanceof ProductError?error.code:error instanceof Error?error.message:'SYNTHETIC_UNKNOWN'});}}
 else if(command==='release'){off?.close();authority.close();process.send!({type:'released'},undefined,undefined,()=>process.disconnect());}
 else throw Error('SYNTHETIC_COMMAND');
});
process.send!({type:'ready'});
