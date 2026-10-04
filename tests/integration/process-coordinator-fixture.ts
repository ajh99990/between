import {randomUUID} from 'node:crypto';
import {Store} from '@between/core/store';import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import type {HostTurn,HostEvent,HostAdapter} from '@between/contracts/host';
const [file,stage]=process.argv.slice(2),store=new Store(file);store.start(true,true,true);let coordinator:TurnCoordinator;
const stop=async()=>{process.stdout.write(JSON.stringify({stage,pid:process.pid})+'\n');await new Promise(()=>setInterval(()=>{},60000));};
const host:HostAdapter={async *startTurn(input:HostTurn):AsyncIterable<HostEvent>{let sequence=0;const event=(details:object)=>({...input,event_id:randomUUID(),sequence:sequence++,occurred_at:Date.now(),...details}) as unknown as HostEvent;
 yield event({type:'policy',sessionToolAllowlist:input.sessionToolAllowlist,hooks:'sdk_functions',registeredTools:input.sessionToolAllowlist,managed_host_contract_version:1,cli_version:'0.24.7',sdk_version:'0.1.16',policy_source:'runtime_readback'});
 yield event({type:'attempt_started',attempt_id:'synthetic-attempt',attempt_index:1,reason:'initial',provider:'synthetic',model:'fixture',input:{capture_status:'disabled'}});
 store.context(input.grant,{});
 if(stage==='model_stream'||stage==='before_write')await stop();
 if(stage==='cancel'){await coordinator.cancelTurn(store.scope,input.turn_id);await stop();}
 if(stage==='after_write'){store.remember(input.grant,'SYNTHETIC durable input','one-side-effect');await stop();}
 yield event({type:'attempt_finished',attempt_id:'synthetic-attempt',response_complete:true,status:'succeeded',output:{capture_status:'disabled'}});
 yield event({type:'result',attempt_id:'synthetic-attempt',response_complete:true,text:'SYNTHETIC unconfirmed output'});
},async *resumeExecution(){},async cancelTurn(){},async close(){}};
coordinator=new TurnCoordinator(store,host);coordinator.accept(store.scope,'synthetic-turn','SYNTHETIC durable input');await coordinator.idle();await stop();
