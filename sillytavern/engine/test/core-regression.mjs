import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCore} from '../core.mjs';
import {fixture} from './probe.mjs';
import {cases} from '../../research/fixtures.mjs';
const base=JSON.parse(fs.readFileSync(new URL('../../research/baseline.json',import.meta.url)));
for(const f of cases){const s=structuredClone(fixture);s.chat=structuredClone(f.history)||s.chat.slice(0,1);s.chat.push({name:'Lin',is_user:true,mes:f.input,extra:{}});s.entries=f.entries||[];s.wi={recursive:!!f.recursive,cap:f.wiBudgetCap||0};s.preset.openai_max_context=f.context||1024;s.power={pin_examples:!!f.pin};let core=createCore(s);let r=await core.run();assert.deepEqual(JSON.parse(JSON.stringify(r.messages)),base.find(x=>x.id===f.id).captured[0].messages,f.id);assert.deepEqual(JSON.parse(JSON.stringify(r.fields)),base.find(x=>x.id===f.id).fields,f.id+' fields');console.log('PASS',f.id);for(const[i,input]of(f.turns||[]).entries()){core.context.chat.push({name:'Mira',is_user:false,mes:'MOCK_REPLY: The lantern is ready.',extra:{}},{name:'Lin',is_user:true,mes:input,extra:{}});r=await core.run();assert.deepEqual(JSON.parse(JSON.stringify(r.messages)),base.find(x=>x.id===f.id).captured[i+1].messages,f.id+'turn'+i);}}
