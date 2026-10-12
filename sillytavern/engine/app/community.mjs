import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {convertCharacterBook,newWorldInfoEntryTemplate} from './vendor/character-book.mjs';
import {snapshot} from './roles.mjs';
import {validateSnapshot} from '../index.mjs';
const base=new URL('./community/',import.meta.url);
export const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base),'utf8'));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export function bookEntries(books,ids){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('世界书绑定重复或无效');
 return ids.flatMap(id=>{const b=books.find(b=>b.id===id);if(!b)throw Error('绑定世界书不存在');return (b.entries??[{...structuredClone(newWorldInfoEntryTemplate),uid:0,key:b.keys,keysecondary:[],content:b.content,selective:false}]).map(e=>({...structuredClone(e),world:b.id}));});
}
export function validateBook(book){
 if(book.entries===undefined)return;
 if(!Array.isArray(book.entries)||book.entries.length>100)throw Error('世界书条目数量无效');
 const ids=new Set();for(const e of book.entries){
  if(!Number.isSafeInteger(e.uid)||e.uid<0||ids.has(e.uid))throw Error('世界书条目标识无效');ids.add(e.uid);
  if(typeof e.content!=='string'||e.content.length>24000||!Array.isArray(e.key)||!Array.isArray(e.keysecondary)||[...e.key,...e.keysecondary].some(k=>typeof k!=='string'||k.length>200))throw Error('世界书条目内容无效');
  if(e.vectorized||e.automationId||e.outletName)throw Error('向量、自动化和outlet条目不受支持');
  if(typeof e.probability!=='number'||e.probability<0||e.probability>100||!Number.isFinite(e.order)||![0,1,2,3].includes(e.selectiveLogic))throw Error('世界书条件参数无效');
  for(const k of ['constant','selective','disable','useProbability'])if(typeof e[k]!=='boolean')throw Error('世界书布尔字段无效');
 }
}
export function parseCard(bytes,id){
 if(bytes.length>256*1024)throw Error('角色卡超过256KiB');
 const card=JSON.parse(Buffer.from(bytes).toString('utf8'),(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))throw Error('危险JSON属性');return v});
 if(card.spec!=='chara_card_v2'||card.spec_version!=='2.0'||!card.data)throw Error('仅支持已核验的v2角色卡');
 const d=card.data;for(const k of ['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'])if(typeof d[k]!=='string'||d[k].length>24000)throw Error('角色字段缺失或过长');
 if(!d.name.trim()||Object.keys(d.extensions||{}).length||Object.keys(d.character_book?.extensions||{}).length)throw Error('不支持此卡的扩展');
 const entries=d.character_book?.entries||[];if(!Array.isArray(entries)||entries.length>100)throw Error('世界书条目数量无效');const seen=new Set();
 for(const e of entries){if(!Number.isSafeInteger(e.id)||e.id<0||seen.has(e.id))throw Error('原始条目标识无效');seen.add(e.id);if(!Array.isArray(e.keys)||!Array.isArray(e.secondary_keys)||typeof e.enabled!=='boolean'||!['before_char','after_char'].includes(e.position))throw Error('原始条目格式无效')}
 const bookId='community-'+id+'-world';const role={id:'community-'+id,name:d.name,icon:'◇',tag:'社区 · CC BY 4.0',description:d.personality.slice(0,180)||'社区测试角色',greeting:d.first_mes,persona:'你是与角色交谈的成年用户。',system:d.system_prompt,detail:d.description,examples:d.mes_example,personality:d.personality,scenario:d.scenario,creatorNotes:d.creator_notes,postHistory:d.post_history_instructions,keys:[],world:'',bookIds:entries.length?[bookId]:[],source:{id,repository:manifest.repository,commit:manifest.commit,license:'CC BY 4.0',attribution:'Foreverse Team',adaptation:'独立世界书绑定；HTML纯文本；使用首个开场；全局历史后指令追加'}};
 const book={id:bookId,name:d.character_book?.name||d.name+'的世界书',keys:[],content:'',entries:Object.values(convertCharacterBook(structuredClone(d.character_book||{entries:[]})).entries),source:role.source};validateBook(book);
 const s=snapshot(role);s.entries=bookEntries([book],role.bookIds);validateSnapshot(s);return {role,book:entries.length?book:null};
}
export async function importCommunity(id){
 const item=manifest.files.find(f=>f.id===id);if(!item)throw Error('社区素材不在已核验目录内');
 const bytes=await fs.readFile(new URL(item.file,base));if(digest(bytes)!==item.sha256)throw Error('原始卡片校验失败');
 const license=await fs.readFile(new URL('LICENSE-CONTENT.txt',base));if(digest(license)!==manifest.licenseSha256)throw Error('许可文件校验失败');
 return parseCard(bytes,id);
}
