import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {adaptRequest,ResponsesFrames} from '../lingguang/compat.mjs';
import {openPlanCredentials} from '../plan-credentials.mjs';
import {startCompatibilityServer,createCompatibilityPlanProvider} from '../plan-service.mjs';
import {createApp} from '../server.mjs';
const checks=[];const ok=(v,n)=>{assert.ok(v,n);checks.push(n)};
const root=await fs.realpath(await fs.mkdtemp('/tmp/between-plan-shared-')),repo=root+'/repo';await fs.mkdir(repo);
let owner,service,app;const file=root+'/private/grant.json',localKey='synthetic-loopback-service-key-only';
let refreshes=0,requests=[],scenario='success',latestSignal;
const record={app:'Between',schema:1,issuer:'https://auth.openai.com',grant_status:'ready',client_id:'oaiapp_synthetic_between',subject:'synthetic-owner',workspace:'synthetic-workspace',access_token:'synthetic-old-token',refresh_token:'synthetic-refresh-token',expires_at:Date.now()+30000,scope:'openid resource.invoke chatgpt.tokens.use.direct',validated:true};
const tokenFetch=async(url,opts)=>{assert.equal(url,'https://auth.openai.com/api/accounts/oauth/token');refreshes++;await new Promise(r=>setTimeout(r,20));if(scenario==='refresh-fail')return Response.json({error:'temporarily_unavailable'},{status:503});return Response.json({access_token:'synthetic-rotated-token',refresh_token:'synthetic-rotated-refresh',expires_in:3600,token_type:'Bearer'});};
const upstream=async(url,opts)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');latestSignal=opts.signal;const body=JSON.parse(opts.body);requests.push(body);assert.equal(opts.headers.Authorization,'Bearer synthetic-rotated-token');
 if(scenario==='http-quota')return Response.json({error:{code:'subscription_sharing_usage_limit_exceeded'}},{status:429});
 const enc=new TextEncoder();const event=x=>'data: '+JSON.stringify(x)+'\n\n';
 let data=event({type:'response.output_text.delta',delta:'合成共享后端回复'});
 if(scenario==='quota')data+=event({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded',message:'synthetic-sensitive-diagnostic'}}});
 else if(scenario==='incomplete')data+=event({type:'response.incomplete'});
 else if(!['slow','truncated'].includes(scenario))data+=event({type:'response.completed',response:{status:'completed'}});
 return new Response(new ReadableStream({start(c){c.enqueue(enc.encode(data));if(scenario==='slow')opts.signal.addEventListener('abort',()=>c.error(Error('aborted')),{once:true});else c.close()}}),{headers:{'Content-Type':'text/event-stream'}});
};
const admin={},a={},b={};
async function call(w,p,method='GET',body){const r=await fetch(app.url+'/api'+p,{method,headers:{Origin:app.url,Cookie:w.cookie||'','X-CSRF-Token':w.csrf||'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.has('set-cookie'))w.cookie=r.headers.get('set-cookie').split(';')[0];const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,text};}
async function configure(enabled=true){const s=(await call(admin,'/admin/state')).data;return call(admin,'/admin/plan','PUT',{confirm:true,expectedVersion:s.config.version,enabled,model:'synthetic-account-model'});}
try{
 const original={model:'x',stream:true,store:false,temperature:.7,input:[{role:'system',content:'角色'},{role:'user',content:'历史'}]};const adapted=adaptRequest(original);ok(original.input[0].role==='system'&&adapted.body.input[0].role==='developer','直接复用灵光转换且不改输入');ok(adapted.omittedFields.includes('temperature'),'灵光不兼容字段裁剪');assert.throws(()=>adaptRequest({...original,previous_response_id:'old'}));checks.push('拒绝服务器历史');
 const f=new ResponsesFrames();f.push(new TextEncoder().encode('data: [DONE]\n\n'));ok(!f.terminal,'DONE不代表完成');f.push(new TextEncoder().encode('data: {"type":"response.completed"}\r\n\r\n'),true);ok(f.terminalType==='response.completed','复用CRLF终态校验');
 await assert.rejects(openPlanCredentials(repo+'/grant.json',{repositoryRoots:[repo],fetchImpl:tokenFetch}),/outside/);checks.push('拒绝仓库内绝对路径');
 await fs.symlink(repo,root+'/alias');await assert.rejects(openPlanCredentials(root+'/alias/grant.json',{repositoryRoots:[repo],fetchImpl:tokenFetch}));checks.push('拒绝符号链接仓库路径');
 owner=await openPlanCredentials(file,{repositoryRoots:[repo],fetchImpl:tokenFetch});await owner.credentials.save(record);
 ok(((await fs.stat(file)).mode&0o777)===0o600,'合成凭据0600');
 await assert.rejects(openPlanCredentials(file,{repositoryRoots:[repo],fetchImpl:tokenFetch}),e=>e.code==='EEXIST');checks.push('跨实例文件锁拒绝第二持有者');
 const childCode=`import {openPlanCredentials} from ${JSON.stringify(new URL('../plan-credentials.mjs',import.meta.url).href)};try{await openPlanCredentials(process.argv[1],{repositoryRoots:[process.argv[2]]});process.exit(2)}catch(e){process.exit(e.code==='EEXIST'?0:3)}`;
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',childCode,file,repo],{stdio:'ignore'});child.on('error',reject);child.on('exit',resolve)});ok(exitCode===0,'第二进程不能同时持有凭据');
 const tokens=await Promise.all(Array.from({length:12},()=>owner.credentials.getAccessToken()));ok(refreshes===1&&tokens.every(t=>t==='synthetic-rotated-token'),'复用共享Promise：12并发只刷新一次');
 const rotated=await owner.credentials.load();ok(rotated.refresh_token==='synthetic-rotated-refresh'&&rotated.expires_at>Date.now(),'旋转令牌与毫秒过期原子保存');
 await owner.close();owner=await openPlanCredentials(file,{repositoryRoots:[repo],fetchImpl:tokenFetch});ok(await owner.credentials.getAccessToken()==='synthetic-rotated-token'&&refreshes===1,'关闭后重开复用，无额外刷新');
 scenario='refresh-fail';await owner.credentials.save({...rotated,expires_at:Date.now()+1000});await assert.rejects(owner.credentials.getAccessToken());ok((await owner.credentials.load()).refresh_token===rotated.refresh_token,'暂时刷新失败保留记录');await owner.credentials.save(rotated);scenario='success';
 service=await startCompatibilityServer({localKey,getAccessToken:()=>owner.credentials.getAccessToken(),inspectGrant:async()=>{const r=await owner.credentials.load();return {subject:r.subject,workspace:r.workspace,clientId:r.client_id,scopes:r.scope.split(' '),expiresAt:r.expires_at,validated:r.validated,renewable:!!r.refresh_token}},fetchImpl:upstream});
 let health=await fetch(service.baseUrl.replace('/v1','')+'/health',{headers:{Authorization:'Bearer '+localKey}});const h=await health.text();ok(!h.includes('synthetic-rotated')&&requests.length===0,'health不推理不暴露token');
 ok((await fetch(service.baseUrl+'/responses',{method:'POST',body:'{}'})).status===403,'独立服务必须本地密钥');
 ok((await fetch(service.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+localKey,Origin:'http://localhost'},body:'{}'})).status===403,'独立服务拒绝浏览器Origin');
 const planProvider=await createCompatibilityPlanProvider({baseUrl:service.baseUrl,localKey});
 app=await createApp({root:root+'/app',port:0,adminPassword:'synthetic-between-admin',planProvider});
 for(const w of [a,b])w.csrf=(await call(w,'/session','POST',{})).data.csrf;
 admin.csrf=(await call(admin,'/admin/login','POST',{password:'synthetic-between-admin'})).data.csrf;
 ok((await call(a,'/state')).data.model.mode==='unconfigured','共享套餐默认关闭');
 ok((await call(a,'/admin/plan','PUT',{enabled:true,model:'x',confirm:true})).status===401,'普通用户不能启用共享后端');
 const csrf=admin.csrf;admin.csrf='bad';ok((await configure()).status===403,'共享后端CSRF');admin.csrf=csrf;
 let st=(await call(admin,'/admin/state')).data;ok((await call(admin,'/admin/plan','PUT',{enabled:true,model:'x',expectedVersion:st.config.version})).status===409,'管理员必须显式确认');
 ok((await call(admin,'/admin/plan','PUT',{enabled:true,model:'x',confirm:true,expectedVersion:st.config.version,token:'rejected'})).status===400,'配置不接受token字段');
 ok((await configure()).status===200,'管理员明确启用独立Between授权后端');
 const ca=(await call(a,'/conversations','POST',{role:'mira',persona:'A专属人物信息'})).data.id,cb=(await call(b,'/conversations','POST',{role:'lin',persona:'B专属人物信息'})).data.id;
 const [ra,rb]=await Promise.all([call(a,'/conversations/'+ca+'/turn','POST',{id:'a1',input:'灯塔 A私有消息'}),call(b,'/conversations/'+cb+'/turn','POST',{id:'b1',input:'书店 B私有消息'})]);
 ok(ra.text.includes('event: done')&&rb.text.includes('event: done'),'两个业务用户无需单独登录即可用显式共享后端');
 const sa=JSON.stringify(requests[0]),sb=JSON.stringify(requests[1]);ok([sa,sb].some(x=>x.includes('A专属人物信息')&&!x.includes('B专属人物信息'))&&[sa,sb].some(x=>x.includes('B专属人物信息')&&!x.includes('A专属人物信息')),'共享授权但角色/persona/历史隔离');
 ok([sa,sb].some(x=>x.includes('灯塔每晚八点亮灯')),'原ST世界书进入Responses');
 ok(requests.every(x=>x.store===false&&x.stream===true&&!('temperature'in x)&&x.input.every(m=>m.role!=='system')),'全链路兼容限制');
 const saved=(await call(a,'/conversations/'+ca)).data;ok(saved.chat.length===3,'回复保存');ok((await call(b,'/conversations/'+ca)).status===404,'跨用户会话读取拒绝');
 const n=requests.length;await call(a,'/conversations/'+ca+'/turn','POST',{id:'a1',input:'灯塔 A私有消息'});ok(requests.length===n,'成功重试幂等');
 for(const mode of ['quota','incomplete','truncated']){scenario=mode;const r=await call(a,'/conversations/'+ca+'/turn','POST',{id:mode,input:'失败不保存'});ok(r.text.includes('event: error')&&!r.text.includes('event: done'),'失败终态 '+mode);assert.deepEqual((await call(a,'/conversations/'+ca)).data.chat,saved.chat);checks.push('回滚 '+mode);if(mode==='quota'){const before=requests.length;ok((await call(b,'/conversations/'+cb+'/turn','POST',{id:'quota-other',input:'共同暂停'})).status===503&&requests.length===before,'共享额度耗尽暂停其他业务用户');await call(admin,'/admin/plan','PUT',{action:'resume',confirm:true});}}
 scenario='slow';const response=await fetch(app.url+'/api/conversations/'+ca+'/turn',{method:'POST',headers:{Origin:app.url,Cookie:a.cookie,'X-CSRF-Token':a.csrf,'Content-Type':'application/json'},body:JSON.stringify({id:'slow',input:'停止测试'})});const reader=response.body.getReader();let text='';for(;;){const r=await reader.read();assert.ok(!r.done);text+=new TextDecoder().decode(r.value);if(text.includes('event: delta'))break;}
 ok((await configure(false)).status===409,'在途时不能切换账单');await call(admin,'/admin/plan','PUT',{action:'disconnect',confirm:true});for(;;){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);}
 ok(text.includes('event: error')&&!text.includes('event: done'),'管理员断开取消所有在途请求');assert.deepEqual((await call(a,'/conversations/'+ca)).data.chat,saved.chat);checks.push('共享连接断开回滚');
 await new Promise(r=>setTimeout(r,20));ok(latestSignal.aborted,'取消穿过独立兼容服务到上游');
 ok(!(await call(admin,'/admin/state')).text.includes('synthetic-rotated')&&!(await call(a,'/state')).text.includes('synthetic-rotated'),'浏览器响应不含凭据');
 ok((await configure(false)).status===200&&(await call(a,'/state')).data.model.mode==='unconfigured','只由管理员显式切回旧后端');
}finally{await app?.close();await service?.close();await owner?.close();await fs.rm(root,{recursive:true,force:true})}
console.log(JSON.stringify({status:'PASS',checks:checks.length,details:checks,scope:'合成凭据临时文件、模拟刷新与模型流；无真实授权/真实模型'},null,2));
