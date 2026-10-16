import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPlanProvider,toResponses,PLAN_ENDPOINT,PlanError} from '../chatgpt-plan.mjs';
import {createApp} from '../server.mjs';

const checks=[];
function ok(value,name){assert.ok(value,name);checks.push(name)}
const a={tenant:'local',user:'a'},b={tenant:'local',user:'b'},bindings=new Map();
const key=p=>JSON.stringify([p.tenant,p.user]);
const credential=(p,extra={})=>({principal:p,validated:true,subject:'synthetic-'+p.user,workspace:'synthetic-workspace',clientId:'oaiapp_synthetic',accessToken:'synthetic-secret-'+p.user,scopes:['resource.invoke','chatgpt.tokens.use.direct'],expiresAt:Date.now()+600000,...extra});
const event=o=>'data: '+JSON.stringify(o)+'\n\n';
const delta=text=>event({type:'response.output_text.delta',delta:text});
const completed=event({type:'response.completed',response:{status:'completed'}});
let requestCount=0,seen,scenario='success',streamSignal;
const mockFetch=async(url,opts)=>{
  requestCount++;assert.equal(url,PLAN_ENDPOINT);seen={url,body:JSON.parse(opts.body),headers:opts.headers};streamSignal=opts.signal;
  if(scenario==='401'||scenario==='403'||scenario==='429'||scenario==='503')return Response.json({detail:'synthetic-private-error'}, {status:Number(scenario)});
  if(scenario==='quota-http')return Response.json({error:{code:'subscription_sharing_usage_limit_exceeded',message:'private'}},{status:429});
  let text=delta('合成文字回复');
  if(scenario==='quota')text+=event({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded',message:'private'}}});
  else if(scenario==='unavailable')text+=event({type:'response.failed',response:{error:{code:'subscription_sharing_usage_unavailable'}}});
  else if(scenario==='incomplete')text+=event({type:'response.incomplete'});
  else if(scenario==='error')text+=event({type:'error',code:'unknown',message:'synthetic-secret-a'});
  else if(scenario==='tool')text=event({type:'response.output_item.added',item:{type:'function_call'}});
  else if(scenario==='malformed')text='data: not-json\n\n';
  else if(scenario!=='truncated'&&scenario!=='slow')text+=completed;
  const data=new TextEncoder().encode(text);
  return new Response(new ReadableStream({start(c){
    // Deliberately split UTF-8 and SSE lines across chunks.
    c.enqueue(data.slice(0,23));c.enqueue(data.slice(23));
    if(scenario==='slow')opts.signal.addEventListener('abort',()=>c.error(new Error('aborted')),{once:true});else c.close();
  }}),{headers:{'Content-Type':'text/event-stream','x-request-id':'synthetic-request'}});
};
const plan=createPlanProvider({getSession:async p=>bindings.get(key(p)),fetchImpl:mockFetch});
const compiled=[{role:'system',content:'角色和persona'},{role:'user',name:'example_user',content:'示例'},{role:'assistant',name:'example_assistant',content:'示例回复'},{role:'user',content:'历史'},{role:'system',content:'深度世界书'},{role:'user',content:'当前问题'}];
const body=toResponses(compiled,'account-model');
assert.deepEqual(Object.keys(body).sort(),['input','model','store','stream']);
ok(body.store===false&&body.stream===true,'仅允许字段，强制 store=false/stream=true');
assert.deepEqual(body.input.map(x=>x.role),['developer','user','assistant','user','developer','user']);
ok(body.input[4].content==='深度世界书'&&body.input[1].content==='[example_user]\n示例','角色顺序、历史深度与示例名称保留，system 转 developer');
assert.throws(()=>toResponses([{role:'user',content:[{type:'image_url'}]}],'x'),PlanError);checks.push('非文本不静默丢弃');
ok((await plan.status(a,'x')).connection==='authorization_required','默认未授权，不读环境或凭据文件');
await assert.rejects(plan.generate({principal:a,messages:compiled,model:'x'}),e=>e.code==='authorization_required');ok(requestCount===0,'未授权零外部请求');
bindings.set(key(a),credential(a));
ok((await plan.status(a,'x')).connection==='ready','新绑定清除旧的未授权状态但不伪装推理成功');
// A new provider models installing a future trusted authorization adapter.
const ready=createPlanProvider({getSession:async p=>bindings.get(key(p)),fetchImpl:mockFetch});
ok((await ready.status(a,'x')).connection==='ready','绑定材料不等于真实推理通过');
let chunks='';const reply=await ready.generate({principal:a,messages:compiled,model:'account-model',onDelta:t=>{chunks+=t}});
ok(reply===chunks&&reply==='合成文字回复','分块 UTF-8/SSE 流文本');
ok((await ready.status(a,'account-model')).connection==='completed','仅 response.completed 标记推理完成');
ok((await ready.status(a,'another-model')).connection==='ready','切换模型不继承完成状态');
ok(seen.headers.Authorization==='Bearer synthetic-secret-a','按账户选取合成凭据');
const before=requestCount;await assert.rejects(ready.generate({principal:b,messages:compiled,model:'x'}));ok(requestCount===before,'第二用户无全局 token 回退');
bindings.set(key(b),credential(a));await assert.rejects(ready.generate({principal:b,messages:compiled,model:'x'}));ok(requestCount===before,'拒绝其他 principal 的绑定');
bindings.set(key(b),credential(b,{scopes:['openid']}));await assert.rejects(ready.generate({principal:b,messages:compiled,model:'x'}),e=>e.code==='scope_missing');checks.push('身份登录不代表推理授权');
bindings.set(key(b),credential(b,{expiresAt:0}));await assert.rejects(ready.generate({principal:b,messages:compiled,model:'x'}),e=>e.code==='expired');checks.push('过期凭据禁止发送');
for(const [mode,code]of [['quota','usage_limit'],['quota-http','usage_limit'],['unavailable','unavailable'],['401','auth_rejected'],['403','forbidden'],['429','rate_limited'],['503','unavailable'],['incomplete','incomplete'],['truncated','incomplete'],['malformed','incomplete'],['tool','unsupported'],['error','failed']]){
  scenario=mode;const p=createPlanProvider({getSession:async()=>credential(a),fetchImpl:mockFetch});
  await assert.rejects(p.generate({principal:a,messages:compiled,model:'x'}),e=>e.code===code&&!e.message.includes('synthetic-secret'));checks.push('错误与脱敏 '+mode);
  if(mode==='quota'){const n=requestCount;await assert.rejects(p.generate({principal:a,messages:compiled,model:'x'}));ok(requestCount===n,'额度耗尽暂停新请求，不自动重试或切换账单');p.resume(a);scenario='success';await p.generate({principal:a,messages:compiled,model:'x'});checks.push('用户检查后可显式恢复');}
}
scenario='slow';const cancel=new AbortController();await assert.rejects(ready.generate({principal:a,messages:compiled,model:'x',signal:cancel.signal,onDelta:()=>cancel.abort()}),e=>e.code==='cancelled');ok(streamSignal.aborted,'取消传到上游');
const disconnect=createPlanProvider({getSession:async()=>credential(a),fetchImpl:mockFetch});await assert.rejects(disconnect.generate({principal:a,messages:compiled,model:'x',onDelta:()=>disconnect.disconnect(a)}),e=>e.code==='disconnected');ok(streamSignal.aborted,'本地断开中止当前推理');
await assert.rejects(disconnect.generate({principal:a,messages:compiled,model:'x'}),e=>e.code==='disconnected');checks.push('断开后不得复用旧 token');

console.log(JSON.stringify({status:'PASS',checks:checks.length,details:checks,scope:'合成会话与Responses mock；传输层测试不代表真实授权'},null,2));
