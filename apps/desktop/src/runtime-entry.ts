import {RUNTIME_PROTOCOL_VERSION} from '@between/contracts/protocol-version';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Store,ProductError} from '@between/core/store';
import {ManagedQwenAdapter} from '@between/host-qwen/qwen-adapter';
import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import {OffCache} from '@between/core/runtime/off-cache';
import {RuntimeService} from '@between/core/runtime/service';
import {loadRuntimeConfig,selectedProviderEnvironment} from '@between/host-qwen/config';
const root=process.env.REL_ROOT||process.cwd();
const file=process.env.REL_DB||path.join(root,'.runtime/data-v6/relationship.db');
const runtimeConfig=loadRuntimeConfig(process.env.REL_CONFIG_ROOT||root);
const {providerEnvironment,...config}=runtimeConfig??{};
const providerEnv=selectedProviderEnvironment(providerEnvironment,process.env);
const store=new Store(file);
const key=process.env.REL_DATA_KEY?Buffer.from(process.env.REL_DATA_KEY,'base64'):undefined;
delete process.env.REL_DATA_KEY;
if(key&&key.length!==32)throw new ProductError('DATA_KEY_INVALID');
const off=key?new OffCache(path.join(path.dirname(file),'receipt-spool.db'),key,store.authority):undefined;
const host=new ManagedQwenAdapter({root,databasePath:file,characterPath:path.join(root,'characters/alan.json'),...config,providerEnv,getEphemeral:input=>({turn:store.ephemeral.get(input.grant),messages:store.history().filter(m=>m.status==='confirmed')})});
const coordinator=new TurnCoordinator(store,host,off,key?createHash('sha256').update(key).update('turn-digest-v1').digest():undefined);
const service=new RuntimeService(store,coordinator);
let stopping=false;
createInterface({input:process.stdin}).on('line',async line=>{let id='invalid';try{
 if(stopping)throw new ProductError('SERVICE_CLOSED');if(line.length>20000)throw new ProductError('INVALID_INPUT');
 const payload=JSON.parse(line);if(typeof payload.id==='string')id=payload.id;
 const value=await service.handle(payload);process.stdout.write(JSON.stringify({schema_version:RUNTIME_PROTOCOL_VERSION,id,value})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({schema_version:RUNTIME_PROTOCOL_VERSION,id,error:error instanceof ProductError?error.code:'INVALID_INPUT'})+'\n');}
});
coordinator.start();
async function shutdown(){if(stopping)return;stopping=true;await service.close();off?.close();store.close();key?.fill(0);process.exit(0);}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());process.stdin.on('end',()=>void shutdown());
