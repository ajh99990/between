import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {Store} from '@between/core/store';
import {TurnCoordinator} from '@between/core/runtime/turn-coordinator';
import {RuntimeService} from '@between/core/runtime/service';
import {requestSchema} from '@between/contracts/commands';
import type {HostAdapter} from '@between/contracts/host';
const host:HostAdapter={async *startTurn(){},async *resumeExecution(){},async cancelTurn(){},async close(){}};
test('fixed trusted protocol rejects legacy send/ack and extra execution fields',()=>{
 assert.equal(requestSchema.safeParse({schema_version:1,id:randomUUID(),action:'send',event:randomUUID(),text:'x'}).success,false);
 assert.equal(requestSchema.safeParse({schema_version:1,id:randomUUID(),action:'ack',message:randomUUID()}).success,false);
 assert.equal(requestSchema.safeParse({schema_version:1,id:randomUUID(),action:'snapshot',command:'shell'}).success,false);
 assert.equal(requestSchema.safeParse({schema_version:1,id:randomUUID(),action:'control',conversation_id:'local_alan',changes:{started:true}}).success,false);
});
test('service versions snapshots and preserves control route when off cache unavailable',async()=>{
 const s=new Store(path.join(mkdtempSync(path.join(os.tmpdir(),'runtime-service-')),'state.db')),c=new TurnCoordinator(s,host),service=new RuntimeService(s,c);
 try{const first=await service.handle({schema_version:1,id:randomUUID(),action:'start',eligible:true,accepted:true,memory:false});const second=service.snapshot();assert.ok(second.snapshot_version>first!.snapshot_version);
 await assert.rejects(()=>service.handle({schema_version:1,id:randomUUID(),action:'send',conversation_id:s.scope,turn_id:randomUUID(),text:'SYNTHETIC'}),/OFF_CACHE_UNAVAILABLE/);
 const controlled=await service.handle({schema_version:1,id:randomUUID(),action:'control',conversation_id:s.scope,changes:{role:'paused'}});assert.equal(controlled!.controls.role,'paused');
 await assert.rejects(()=>service.handle({schema_version:1,id:randomUUID(),action:'control',conversation_id:'foreign',changes:{memory:'on'}}),/NOT_AUTHORIZED/);
 }finally{await service.close();s.close();}
});

test('runtime contract requires exact version without legacy fallback',()=>{for(const version of [undefined,0,2,'1'])assert.equal(requestSchema.safeParse({...(version===undefined?{}:{schema_version:version}),id:randomUUID(),action:'snapshot'}).success,false);assert.equal(requestSchema.safeParse({schema_version:1,id:randomUUID(),action:'snapshot'}).success,true);});
