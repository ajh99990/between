import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repository=fileURLToPath(new URL('../',import.meta.url));
assert(process.env.npm_execpath,'Run this test through npm run test:smoke');
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'between-cli-smoke-')));
const env={...process.env};
for(const name of Object.keys(env))if(name.startsWith('BETWEEN_'))delete env[name];
const child=spawn(process.execPath,[process.env.npm_execpath,'start','--','--data',root,'--port','0','--admin-password-stdin'],{cwd:repository,env,detached:true,stdio:['pipe','pipe','pipe']});
let output='',errorOutput='',closed=false;
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{closed=true;resolve({code,signal})});});
child.stdin.end('synthetic-cli-smoke-password');
child.stdout.on('data',chunk=>{output+=chunk;});
child.stderr.on('data',chunk=>{errorOutput+=chunk;});
const checks=[];
const until=async(fn,ms=15000)=>{const until=Date.now()+ms;while(Date.now()<until){if(fn())return;assert(!closed,'Application CLI exited before startup');await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Application CLI readiness timed out');};
try{
 await until(()=>/Between 本机聊天：http:\/\/127\.0\.0\.1:\d+/.test(output));
 const url=output.match(/Between 本机聊天：(http:\/\/127\.0\.0\.1:\d+)/)[1];
 assert(!['8787','8766'].includes(new URL(url).port));
 const call=(route,options={})=>fetch(url+route,{...options,headers:{Origin:url,...options.headers},signal:AbortSignal.timeout(5000)});
 for(const route of ['/','/app.js','/style.css','/admin/']){const response=await call(route);assert.equal(response.status,200,route);await response.body.cancel();}
 checks.push('root npm start launches all current static entrypoints on a random loopback port');
 assert.equal((await call('/api/admin/state')).status,401);
 const login=await call('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'synthetic-cli-smoke-password'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const admin=await call('/api/admin/state',{headers:{Cookie:cookie}});assert.equal(admin.status,200);assert((await admin.json()).config.roles.length>0);
 checks.push('administrator authentication and settings work through the root CLI');
 const session=await call('/api/session',{method:'POST'});assert.equal(session.status,200);
 const userCookie=session.headers.get('set-cookie').split(';')[0];
 const state=await (await call('/api/state',{headers:{Cookie:userCookie}})).json();
 assert.equal(state.model.mode,'unconfigured');
 checks.push('clean startup performs no provider inference and reports an unconfigured model');
 process.kill(-child.pid,'SIGTERM');
 const stopped=await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('CLI did not stop')),8000);timer.unref();})]);
 assert(stopped.code===0||stopped.signal==='SIGTERM',JSON.stringify(stopped));
 const lock=path.join(root,'engine/.owner');
 const deadline=Date.now()+8000;
 while(true){
  try{await fs.stat(lock);}catch(error){if(error.code==='ENOENT')break;throw error;}
  assert(Date.now()<deadline,'Application process did not release its lock after SIGTERM');
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 checks.push('SIGTERM shuts down the owned process group and releases the engine lock');
 console.log(JSON.stringify({status:'PASS',checks,realModelCalls:0,scope:'actual root npm start, synthetic password, clean temporary data; no runtime credentials'},null,2));
}finally{
 if(!closed){try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}await exited;}
 await fs.rm(root,{recursive:true,force:true});
}
