import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { v1,v2,v1ToV2 } from 'character-card-utils';
import { z } from 'zod';
import { ProductError } from './store.js';
const require=createRequire(import.meta.url);
const extract=require('png-chunks-extract') as (b:Uint8Array)=>{name:string;data:Uint8Array}[];
const decode=require('png-chunk-text').decode as (b:Uint8Array)=>{keyword:string;text:string};
const crc=require('crc-32') as {buf:(b:Uint8Array)=>number};
const fail=()=>{throw new ProductError('INVALID_IMPORT');};
const utf8=(b:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(b);
const str=z.string().max(32768);
const v3=z.object({spec:z.literal('chara_card_v3'),spec_version:z.literal('3.0'),data:z.object({name:str,description:str,personality:str,scenario:str,first_mes:str,mes_example:str,creator_notes:str,system_prompt:str,post_history_instructions:str,alternate_greetings:z.array(str),group_only_greetings:z.array(str),tags:z.array(str),creator:str,character_version:str,extensions:z.record(z.string(),z.unknown()),assets:z.array(z.object({type:str,uri:str,name:str,ext:str})).optional(),character_book:z.object({entries:z.array(z.object({keys:z.array(str),content:str,enabled:z.boolean(),insertion_order:z.number(),use_regex:z.boolean(),extensions:z.record(z.string(),z.unknown())}).passthrough()).max(500)}).passthrough().optional()}).passthrough()});
export function decodePng(file:Buffer){
 if(file.length>10*1024*1024||file.length<45||!file.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return fail();
 let offset=8,first=true,ended=false;const names=new Set<string>();
 while(offset<file.length){if(offset+12>file.length)return fail();const n=file.readUInt32BE(offset),type=file.toString('ascii',offset+4,offset+8);if(n>10*1024*1024||offset+12+n>file.length)return fail();const bytes=file.subarray(offset+4,offset+8+n);if((crc.buf(bytes)>>>0)!==file.readUInt32BE(offset+8+n))return fail();
  if(first){if(type!=='IHDR'||n!==13)return fail();const w=file.readUInt32BE(offset+8),h=file.readUInt32BE(offset+12);if(!w||!h||w>4096||h>4096)return fail();first=false;}else if(type==='IHDR')return fail();
  if(type==='tEXt'){const d=file.subarray(offset+8,offset+8+n);const zero=d.indexOf(0);if(zero<1)return fail();const key=d.toString('ascii',0,zero);if(key==='chara'||key==='ccv3'){if(names.has(key))return fail();names.add(key);}}
  if(type==='IEND'){if(n!==0||offset+12!==file.length)return fail();ended=true;}
  offset+=12+n;
 }
 if(!ended)return fail();
 const blocks=new Map<string,string>();for(const c of extract(file))if(c.name==='tEXt'){const d=decode(c.data);if(d.keyword==='chara'||d.keyword==='ccv3')blocks.set(d.keyword,d.text);}
 const value=blocks.get('ccv3')??blocks.get('chara');if(!value||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return fail();const b=Buffer.from(value,'base64');if(b.length>2*1024*1024||b.toString('base64')!==value)return fail();const json=JSON.parse(utf8(b));if(blocks.has('ccv3')&&(json.spec!=='chara_card_v3'||json.spec_version!=='3.0'))return fail();return json;
}
export function parseCard(file:Buffer){try{
 if(file.length>10*1024*1024)return fail();const isPng=file[0]===137; if(!isPng&&file.length>2*1024*1024)return fail();const j=isPng?decodePng(file):JSON.parse(utf8(file));
 let card:any,format:string;
 if(j.spec===undefined){card=v1ToV2(v1.parse(j));format='v1';}
 else if(j.spec==='chara_card_v2'&&j.spec_version==='2.0'){card=v2.parse(j);format='v2';}
 else if(j.spec==='chara_card_v3'&&j.spec_version==='3.0'){card=v3.parse(j);format='v3';}
 else return fail();
 const lengths=(x:any):void=>{if(typeof x==='string'&&[...x].length>32768)fail();if(Array.isArray(x))x.forEach(lengths);else if(x&&typeof x==='object')Object.values(x).forEach(lengths);};lengths(card);
 const d=card.data;return {status:'draft_requires_review',sourceFormat:format,material:{name:d.name,description:d.description,personality:d.personality,scenario:d.scenario,greeting:d.first_mes,examplesRaw:d.mes_example},quarantined:{system_prompt_chars:d.system_prompt?.length||0,post_history_instructions_chars:d.post_history_instructions?.length||0,asset_count:d.assets?.length||0,lore_count:d.character_book?.entries?.length||0},requirements:['成年身份与原创权利须作者确认','scenario不作为真实共同历史','示例/所有lore待审核，不自动进入运行上下文','system_prompt及外部assets不会执行或联网','完整发布流程本阶段未实现']};
 }catch{return fail();}}
if(process.argv[2]==='import'){const file=process.argv[3];if(!file)throw new Error('Usage: node dist/src/cards.js import PATH');console.log(JSON.stringify(parseCard(readFileSync(file)),null,2));}
