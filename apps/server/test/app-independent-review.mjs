// Independent synthetic app review. No credentials, external model, or browser required.
import {createApp} from '../server.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const roots=[],checks=[];let app,upstream;
const root=async()=>{const x=await fs.mkdtemp(path.join(os.tmpdir(),'app-independent-review-'));roots.push(x);return x;};
async function call(w,p,method='GET',body,headers={}){
 const r=await fetch(app.url+p,{method,headers:{Origin:app.url,Cookie:w.cookie||'','X-CSRF-Token':w.csrf||'','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie'))w.cookie=r.headers.get('set-cookie').split(';')[0];
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,text};
}
function delayed(w,p,body){
 let resolve;const result=new Promise(r=>resolve=r);
 const q=http.request(app.url+p,{method:'POST',headers:{Origin:app.url,Cookie:w.cookie,'X-CSRF-Token':w.csrf,'Content-Type':'application/json'}},r=>{let text='';r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,text}));});
 q.on('error',e=>resolve({error:e.message}));q.write('{');return {finish(){q.end(JSON.stringify(body).slice(1));},result};
}
const tick=()=>new Promise(r=>setTimeout(r,50));
const login=async w=>w.csrf=(await call(w,'/api/admin/login','POST',{password:'synthetic-password-123'})).data.csrf;
const session=async w=>w.csrf=(await call(w,'/api/session','POST',{})).data.csrf;
try{
 app=await createApp({root:await root(),port:0,demo:true,adminPassword:'synthetic-password-123'});
 const a={},b={},admin={};await session(a);await session(b);await login(admin);
 const id=(await call(a,'/api/conversations','POST',{role:'mira'})).data.id;
 assert.equal((await call(a,'/api/admin/state')).status,401);checks.push('admin-user-auth-separation');
 assert.equal((await call(admin,'/api/admin/user','PUT',{confirm:true},{'X-CSRF-Token':a.csrf})).status,403);checks.push('admin-csrf');
 assert.equal((await call(admin,'/api/admin/state','GET',undefined,{Origin:'http://evil.example'})).status,403);checks.push('cross-origin');
 assert.equal((await call(b,'/api/conversations/'+id)).status,404);checks.push('cross-user');
 const x=delayed(a,'/api/conversations/'+id+'/turn',{id:'race1',input:'one'}),y=delayed(a,'/api/conversations/'+id+'/turn',{id:'race2',input:'two'});await tick();x.finish();y.finish();
 const rr=await Promise.all([x.result,y.result]);assert.deepEqual(rr.map(x=>x.status).sort(),[200,409]);assert.equal((await call(a,'/api/conversations/'+id)).data.chat.length,3);checks.push('slow-body-turn-registration-200-409');
 const pending=delayed(a,'/api/conversations/'+id+'/turn',{id:'disabled-race',input:'must not run'});await tick();
 const state=(await call(admin,'/api/admin/state')).data;const user=state.users.find(x=>x.conversations.some(c=>c.id===id));
 assert.equal((await call(admin,'/api/admin/user','PUT',{confirm:true,userId:user.id,disabled:true})).status,200);pending.finish();assert.equal((await pending.result).status,403);checks.push('disable-during-upload-rejected');
 await call(admin,'/api/admin/user','PUT',{confirm:true,userId:user.id,disabled:false});
 const slowCreate=delayed(a,'/api/conversations',{role:'mira'});await tick();let timer;
 const config=(await call(admin,'/api/admin/state')).data.config;
 let saved;try{saved=await Promise.race([call(admin,'/api/admin/config','PUT',{confirm:true,expectedVersion:config.version,config}),new Promise(r=>timer=setTimeout(()=>r({status:'timeout'}),1000))]);}finally{clearTimeout(timer);slowCreate.finish();await slowCreate.result;}
 assert.equal(saved.status,200);checks.push('slow-upload-does-not-lock-admin-config');
 await app.close();app=null;
 const secret='SYNTHETIC_REVIEW_CREDENTIAL_NOT_REAL';let captured;
 upstream=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;captured={auth:req.headers.authorization,body:JSON.parse(raw)};res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:secret}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+upstream.address().port+'/v1';const realRoot=await root();
 app=await createApp({root:realRoot,port:0,modelUrl:url,key:secret,adminPassword:'synthetic-password-123'});
 const c={},manager={};await session(c);await login(manager);const cid=(await call(c,'/api/conversations','POST',{role:'mira'})).data.id;
 const response=await call(c,'/api/conversations/'+cid+'/turn','POST',{id:'error',input:'synthetic only'});
 assert.equal(captured.auth,'Bearer '+secret);assert.ok(response.text.includes('event: error'));assert.ok(!response.text.includes(secret));
 assert.ok(!(await call(c,'/api/state')).text.includes(secret));assert.ok(!(await call(manager,'/api/admin/state')).text.includes(secret));checks.push('provider-error-and-state-redact-synthetic-credential');
 assert.equal((await call(manager,'/api/admin/model','PUT',{confirm:true,url:'http://127.0.0.1:1/v1',name:'blocked'})).status,400);checks.push('credential-origin-change-rejected');
 assert.equal((await call(manager,'/api/admin/model','PUT',{confirm:true,url,name:'persisted-model-name'})).status,200);
 await app.close();app=await createApp({root:realRoot,port:0,key:secret,adminPassword:'synthetic-password-123'});
 assert.equal((await call(c,'/api/state')).data.model.model,'persisted-model-name');checks.push('configured-model-persists-across-restart');
 const result={status:'PASS',checks,scope:'Independent local synthetic API checks only; no external provider or real credentials',node:process.version};
 console.log(JSON.stringify(result,null,2));
 if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
}finally{
 if(app)await app.close();if(upstream){upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
 for(const x of roots)await fs.rm(x,{recursive:true,force:true});
}
