import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {cases} from './fixtures.mjs';
const target=process.argv[2]||'baseline',port=Number(process.argv[3]||8131);
const root=process.env.ST_RESEARCH_ROOT||'/workspace/st-research';
const outputLabel=target+(process.argv[4]?'-subset':'');
const settings=JSON.parse(fs.readFileSync(fs.existsSync(`${root}/fixture-settings.json`)?`${root}/fixture-settings.json`:`${root}/baseline/default/content/settings.json`));
settings.firstRun=false;settings.main_api='openai';settings.name1='Lin';
settings.extension_settings.disabledExtensions=['assets','attachments','caption','connection-manager','expressions','gallery','memory','quick-reply','regex','stable-diffusion','token-counter','translate','tts','vectors'];
fs.writeFileSync(`${root}/runtime-${target}/default-user/settings.json`,JSON.stringify(settings));
let captured=[],activeCase,failedOnce=false; const results=[];
const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c; if(req.url.endsWith('/chat/completions')){captured.push(JSON.parse(raw));if(activeCase?.failFirst&&!failedOnce){failedOnce=true;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Synthetic transport failure'}}));return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'mock-1',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'MOCK_REPLY: The lantern is ready.'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'gpt-4o-mini'}]}));}});
await new Promise(r=>mock.listen(port+100,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true});
for(const fixture of cases.filter(f=>!process.argv[4]||process.argv[4].split(',').includes(f.id))){
activeCase=fixture;captured=[];failedOnce=false;
const ctx=await browser.newContext({locale:'en-US',timezoneId:'UTC'});const p=await ctx.newPage();
const errors=[],requests=[],logs=[];
p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{logs.push(m.text());if(m.text().includes('Generate entered'))console.log('GENERATE',fixture.id);});
await p.route('**/*',async route=>{const u=new URL(route.request().url());requests.push(u.pathname);if(u.hostname!=='127.0.0.1'){return route.abort('blockedbyclient');} if(u.pathname.startsWith('/api/horde/'))return route.fulfill({json:[]});return route.continue();});
await p.addInitScript(()=>{Math.random=()=>0.42;const D=Date;globalThis.Date=class extends D{constructor(...args){super(...(args.length?args:[1735689600000]));}static now(){return 1735689600000;}};});
try{
await p.goto(`http://127.0.0.1:${port}`);await p.waitForFunction(async()=>(await import('/script.js')).settingsReady,null,{timeout:60000});
await p.waitForFunction(()=>document.getElementById('preloader')===null,null,{timeout:60000}); await p.waitForTimeout(1500); console.log('READY',target,fixture.id);
await p.evaluate(async(f)=>{
const s=await import('/script.js'),o=await import('/scripts/openai.js'),pw=await import('/scripts/power-user.js');
$.fx.off=true;s.setAnimationDuration(0);s.characters.splice(0,s.characters.length,{name:'Mira',avatar:'research.png',chat:'research-chat',description:'DESCRIPTION: {{char}} is a patient lighthouse keeper.',personality:'PERSONALITY: curious and concise.',scenario:'SCENARIO: {{user}} visits the island.',mes_example:'<START>\n{{user}}: Example question?\n{{char}}: EXAMPLE: Watch the sea.',first_mes:'Welcome.',data:{name:'Mira',system_prompt:'SYSTEM: Play {{char}} in a fictional scene.',post_history_instructions:'POST: Keep the reply brief.',extensions:{depth_prompt:{prompt:'DEPTH: Stay in character.',depth:1,role:'system'}}}});
s.setCharacterId(0);s.setCharacterName('Mira');s.setUserName('Lin',{toastPersonaNameChange:false});
s.changeMainAPI('openai');Object.assign(o.oai_settings,{chat_completion_source:'custom',custom_url:`http://127.0.0.1:${f.mockPort}/v1`,custom_model:'gpt-4o-mini',openai_model:'gpt-4o-mini',stream_openai:false,openai_max_context:f.context||1024,openai_max_tokens:64,temp_openai:0.7,seed:42});
Object.assign(pw.power_user,{persona_description:'PERSONA: Lin is a mapmaker.',prefer_character_prompt:true,prefer_character_jailbreak:true,pin_examples:!!f.pin,tokenizer:2});
const w=await import('/scripts/world-info.js');w.worldInfoCache.clear(); w.selected_world_info.splice(0);w.worldInfoCache.set('research',{entries:Object.fromEntries((f.entries||[]).map(e=>[e.uid,e]))});w.setWorldInfoSettings({world_info:{globalSelect:['research']},world_info_recursive:!!f.recursive,world_info_depth:2,world_info_budget:25,world_info_budget_cap:f.wiBudgetCap||0},{world_names:['research']});s.setOnlineStatus('mock-ready');s.chat.splice(0,s.chat.length,{name:'Mira',is_user:false,is_system:false,mes:'HISTORY: Welcome to the island.',send_date:'2025-01-01',extra:{}});if(f.history)s.chat.splice(0,s.chat.length,...f.history);$('#chat').empty();
$('#send_textarea').val(f.input);globalThis.researchFailure=null;try{await s.Generate('normal',{},false);}catch(e){if(!f.failFirst)throw e;globalThis.researchFailure=String(e);s.setOnlineStatus('mock-ready');await s.Generate('normal',{automatic_trigger:true},false);}await s.saveChat({force:true});
},{...fixture,mockPort:port+100});
const state=await p.evaluate(async()=>{const s=await import('/script.js');return {chat:s.chat,fields:s.getCharacterCardFields()};});
if(target==='final'&&fixture.id==='basic'){
const guardResults=await p.evaluate(async()=>{const s=await import('/script.js');const headers=s.getRequestHeaders();const post=async(url,body)=>(await fetch(url,{method:'POST',headers,body:JSON.stringify(body)})).status;const base={chat_completion_source:'custom',model:'gpt-4o-mini',messages:[{role:'user',content:'test'}]};let front=false;try{await s.Generate('swipe',{},false);}catch(e){front=String(e).includes('Research slice');}return {otherProvider:await post('/api/backends/chat-completions/generate',{...base,chat_completion_source:'openai'}),streaming:await post('/api/backends/chat-completions/generate',{...base,stream:true}),invalidMessages:await post('/api/backends/chat-completions/generate',{...base,messages:'invalid'}),tokenizer:await post('/api/tokenizers/llama/encode',{text:'test'}),vectors:await post('/api/vector/query',{}),extensions:await post('/api/extensions/install',{}),front};});
assert.deepEqual(guardResults,{otherProvider:422,streaming:422,invalidMessages:422,tokenizer:422,vectors:501,extensions:501,front:true});fs.writeFileSync(`${root}/evidence/negative-guards.json`,JSON.stringify(guardResults,null,2));console.log('PASS explicit unsupported feature guards');
}

assert.equal(captured.length,fixture.failFirst?2:1);assert.match(state.chat.at(-1).mes,/MOCK_REPLY/);
const validate=(req,has=[],absent=[])=>{const text=req.messages.map(m=>m.content).join('\n');for(const x of has)assert.ok(text.includes(x),`${fixture.id} missing ${x}`);for(const x of absent)assert.ok(!text.includes(x),`${fixture.id} unexpected ${x}`);};
validate(captured.at(-1),fixture.has,fixture.absent);
const snapshots=[state];
for(const [i,input] of (fixture.turns||[]).entries()){
await p.evaluate(async(input)=>{const s=await import('/script.js');$('#send_textarea').val(input);await s.Generate('normal',{},false);await s.saveChat({force:true});},input);
validate(captured.at(-1),fixture.turnHas?.[i],fixture.turnAbsent?.[i]);
snapshots.push(await p.evaluate(async()=>({chat:(await import('/script.js')).chat})));
}
if(fixture.regenerate){await p.evaluate(async()=>{const s=await import('/script.js');await s.Generate('regenerate',{},false);await s.saveChat({force:true});});const chat=await p.evaluate(async()=>(await import('/script.js')).chat);assert.equal(chat.length,state.chat.length);assert.match(chat.at(-1).mes,/MOCK_REPLY/);assert.deepEqual(captured.at(-1),captured[0]);snapshots.push({chat});}
const saved=fs.readFileSync(`${root}/runtime-${target}/default-user/chats/research/research-chat.jsonl`,'utf8');assert.match(saved,/MOCK_REPLY/);
assert.equal(errors.length,0,JSON.stringify(errors));
results.push({id:fixture.id,captured,chat:snapshots.map(s=>s.chat.map(m=>({name:m.name,is_user:m.is_user,mes:m.mes}))),fields:state.fields,browser:await p.evaluate(()=>({domNodes:document.querySelectorAll('*').length,heap:performance.memory?.usedJSHeapSize})),errors,requests:[...new Set(requests)],interceptors:logs.filter(x=>x.includes('interceptor'))});fs.writeFileSync(`${root}/evidence/${target}-progress.json`,JSON.stringify(results,null,2)); console.log('PASS',fixture.id,captured.length,state.chat.length);
}catch(e){fs.writeFileSync(`${root}/failure-${target}.json`,JSON.stringify({error:String(e),errors,logs:logs.slice(-150)},null,2));await browser.close();await new Promise(r=>mock.close(r));throw e;}finally{await ctx.close();}
}
fs.mkdirSync(`${root}/evidence`,{recursive:true});fs.writeFileSync(`${root}/evidence/${outputLabel}.json`,JSON.stringify(results,null,2));
if(target!=='baseline'){const baseline=JSON.parse(fs.readFileSync(`${root}/evidence/baseline.json`));assert.deepEqual(JSON.parse(JSON.stringify(results.map(({id,captured,chat,fields})=>({id,captured,chat,fields})))),baseline.filter(x=>results.some(r=>r.id===x.id)).map(({id,captured,chat,fields})=>({id,captured,chat,fields})));console.log('DIFFERENTIAL PASS',results.length);}
await browser.close();await new Promise(r=>mock.close(r));
