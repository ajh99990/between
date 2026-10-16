import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startCompatibilityServer,createCompatibilityPlanProvider} from '../plan-service.mjs';
import {createApp} from '../server.mjs';
import {toResponses} from '../chatgpt-plan.mjs';
import {DEFAULT_PLAN_MODEL} from '../plan-config.mjs';
const root=await fs.realpath(await fs.mkdtemp('/tmp/between-reasoning-test-'));
const localKey='synthetic-reasoning-service-key',adminPassword='synthetic-admin-password';
const requests=[],checks=[];let service,app;const user={},admin={};
const ok=(v,n)=>{assert.ok(v,n);checks.push(n)};
async function call(w,p,method='GET',body){const r=await fetch(app.url+'/api'+p,{method,headers:{Origin:app.url,Cookie:w.cookie||'','X-CSRF-Token':w.csrf||'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.has('set-cookie'))w.cookie=r.headers.get('set-cookie').split(';')[0];const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,text};}
async function configure(reasoningEffort){const s=(await call(admin,'/admin/state')).data;return call(admin,'/admin/plan','PUT',{enabled:true,model:DEFAULT_PLAN_MODEL,reasoningEffort,confirm:true,expectedVersion:s.config.version});}
try{
 for(const effort of ['middle','ultra','',null])assert.throws(()=>toResponses([{role:'user',content:'x'}],DEFAULT_PLAN_MODEL,effort));checks.push('Unknown reasoning values rejected before network');
 service=await startCompatibilityServer({localKey,getAccessToken:async()=> 'synthetic-grant',inspectGrant:async()=>({grantStatus:'ready',subject:'synthetic',workspace:'synthetic',clientId:'synthetic-client',scopes:['resource.invoke','chatgpt.tokens.use.direct'],validated:true,expiresAt:Date.now()+600000,renewable:true}),fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');requests.push(JSON.parse(opts.body));
  return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'合成回复'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }});
 const planProvider=await createCompatibilityPlanProvider({baseUrl:service.baseUrl,localKey});
 app=await createApp({root:root+'/app',port:0,adminPassword,planProvider});
 admin.csrf=(await call(admin,'/admin/login','POST',{password:adminPassword})).data.csrf;
 user.csrf=(await call(user,'/session','POST',{})).data.csrf;
 const initial=(await call(admin,'/admin/state')).data.config;
 ok(initial.planBackend.model===DEFAULT_PLAN_MODEL&&initial.planBackend.reasoningEffort==='medium'&&!initial.planBackend.enabled,'Default model and medium set without implicitly enabling backend');
 for(const effort of ['middle','ultra','',null])ok((await configure(effort)).status===400&&requests.length===0,'Admin rejects invalid effort '+JSON.stringify(effort)+' without a model call');
 const id=(await call(user,'/conversations','POST',{role:'mira'})).data.id;
 for(const effort of ['medium','high']){
  ok((await configure(effort)).status===200,'Save '+effort);
  ok((await call(user,'/state')).data.model.connection==='ready','New effort has no inherited completed verification '+effort);
  const r=await call(user,'/conversations/'+id+'/turn','POST',{id:effort,input:'灯塔测试'});
  ok(r.text.includes('event: done'),'Formal app and engine completes '+effort);
  const sent=requests.at(-1);ok(sent.model===DEFAULT_PLAN_MODEL&&sent.reasoning.effort===effort&&sent.store===false&&sent.stream===true,'Exact effort survives app, provider and compatibility adapter '+effort);
  ok((await call(user,'/state')).data.model.reasoningEffort===effort,'Status exposes configured effort '+effort);
 }
 await app.close();app=await createApp({root:root+'/app',port:0,adminPassword,planProvider});
 admin.csrf=(await call(admin,'/admin/login','POST',{password:adminPassword})).data.csrf;
 const saved=(await call(admin,'/admin/state')).data.config;
 ok(saved.planBackend.reasoningEffort==='high'&&saved.planBackend.model===DEFAULT_PLAN_MODEL,'Selection persists after restart');
 ok(saved.preset.context===8192&&saved.preset.maxTokens===512,'Context and output reserve unchanged');
 console.log(JSON.stringify({status:'PASS',checks:checks.length,details:checks,realModelCalls:0},null,2));
}finally{await app?.close();await service?.close();await fs.rm(root,{recursive:true,force:true});}
