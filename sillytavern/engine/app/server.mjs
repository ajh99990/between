import http from 'node:http';
import {readUtf8Body} from './read-body.mjs';
import {serveAdmin} from './admin-static.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {RoleEngine,validateSnapshot} from '../index.mjs';
import {roles as defaults,snapshot} from './roles.mjs';
import {importCommunity,bookEntries,validateBook} from './community.mjs';
import {provider} from './provider.mjs';
import {createCompatibilityPlanProvider} from './plan-service.mjs';
import {createPlanProvider,PlanError} from './chatgpt-plan.mjs';
import {DEFAULT_PLAN_MODEL,DEFAULT_PLAN_REASONING,validReasoningEffort} from './plan-config.mjs';
const community=JSON.parse(await fs.readFile(new URL('./community-catalog.json',import.meta.url),'utf8'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const uuid=()=>crypto.randomUUID();
const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const publicRoot=fileURLToPath(new URL('./public/',import.meta.url));
const httpError=(status,message)=>Object.assign(new Error(message),{status});
async function jsonBody(req){const raw=await readUtf8Body(req,16*1024*1024);try{return JSON.parse(raw||'{}')}catch{throw httpError(400,'无效 JSON')}}
async function atomic(file,value){const tmp=file+'.'+uuid()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file);}
export async function createApp(options={}){
  const root=path.resolve(options.root||'/tmp/between-role-app');await fs.mkdir(root,{recursive:true,mode:0o700});
  let config;try{config=JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;config={version:1,roles:structuredClone(defaults),preset:{context:8192,maxTokens:512,temperature:.7,pinExamples:false,postHistory:'用中文自然回应，避免重复上一条回复。'},acceptNew:true,paused:false,model:null};}
  if(!config.books){config.books=config.roles.map(r=>({id:r.id+'-world',name:r.name+'的世界',keys:r.keys,content:r.world}));config.roles=config.roles.map(r=>({...r,bookIds:[r.id+'-world']}));}
  for(const r of config.roles)r.examples??=snapshot(r).character.mes_example;
  const bridge=await provider({...options,modelUrl:options.demo?'':options.modelUrl||config.model?.url||'',modelName:options.modelName||config.model?.name||'gpt-4o-mini'});
  const plan=options.planProvider||createPlanProvider();
  const planPrincipal=Object.freeze({tenant:'local',user:'between-plan-backend'});
  config.planBackend??={enabled:false,model:DEFAULT_PLAN_MODEL,reasoningEffort:DEFAULT_PLAN_REASONING};
  config.planBackend.reasoningEffort??=DEFAULT_PLAN_REASONING;let planChanging=false;
  let engine;try{engine=await RoleEngine.open({root:path.join(root,'engine'),...bridge.engineConfig,generate:async request=>{if(config.planBackend.enabled)return plan.generate({...request,principal:planPrincipal,model:config.planBackend.model,reasoningEffort:config.planBackend.reasoningEffort});}})}catch(e){await bridge.close();throw e;}
  const userRoot=path.join(root,'users');await fs.mkdir(userRoot,{recursive:true,mode:0o700});
  const users=new Map();for(const file of await fs.readdir(userRoot)){if(/^[a-f0-9]{64}\.json$/.test(file)){const u=JSON.parse(await fs.readFile(path.join(userRoot,file),'utf8'));users.set(file.slice(0,-5),u);}}
  const admins=new Map(),attempts=new Map(),tasks=new Map(),deleting=new Set(),audit=[];let auditSeq=0;let stopping=false;
  const passwordHash=options.adminPassword?hash(options.adminPassword):null;
  const log=(actor,action,target,result='ok')=>{audit.push({sequence:++auditSeq,at:new Date().toISOString(),actor,action,target,result});if(audit.length>200)audit.shift();};
  const saveUser=async(key,u)=>atomic(path.join(userRoot,key+'.json'),u);
  const modelState=()=>config.planBackend.enabled?plan.status(planPrincipal,config.planBackend.model,config.planBackend.reasoningEffort):Promise.resolve(bridge.status);
  const client=u=>engine.forPrincipal({tenant:'local',user:u.id});
  const cookie=(req,name)=>{const part=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return part?.slice(name.length+1);};
  const getUser=req=>{const token=cookie(req,'between_user');const key=token&&hash(token);const u=key&&users.get(key);if(!u)throw httpError(401,'请先初始化浏览器会话');if(u.disabled)throw httpError(403,'此用户已停用');return {u,key};};
  const getAdmin=req=>{const token=cookie(req,'between_admin'),a=token&&admins.get(hash(token));if(!a||a.expires<Date.now())throw httpError(401,'管理员登录已过期');return a;};
  const own=(u,id)=>{if(!safeId(id)||deleting.has(u.id+':'+id)||!u.conversations.some(c=>c.id===id))throw httpError(404,'会话不存在');return u.conversations.find(c=>c.id===id);};
  const taskKey=(u,id)=>u.id+':'+id;
  const viewState=async(u,id)=>{const s=await client(u).snapshot(id);return {id,character:s.character.name,chat:s.chat,media:Object.values(s.media),revision:s.revision,configVersion:u.conversations.find(c=>c.id===id)?.configVersion,active:tasks.has(taskKey(u,id))};};
  const confirm=body=>{if(body.confirm!==true)throw httpError(409,'请明确确认操作范围');};
  const makeSnapshot=(role,input={})=>{for(const [k,v]of Object.entries(input)){if(!['role','userName','persona','characterDescription'].includes(k))throw httpError(400,'不支持的会话配置字段');const limit=k==='userName'?40:k==='persona'?3000:5000;if(typeof v!=='string'||v.length>limit)throw httpError(400,'会话配置字段无效或过长');}const s=snapshot(role,input);s.entries=bookEntries(config.books,role.bookIds||[]);s.preset.openai_max_context=config.preset.context;s.preset.openai_max_tokens=config.preset.maxTokens;s.preset.temp_openai=config.preset.temperature;s.power={pin_examples:config.preset.pinExamples};s.character.data.post_history_instructions=[role.postHistory,config.preset.postHistory].filter(Boolean).join('\n');validateSnapshot(s);return s;};
  let mutationTail=Promise.resolve();
  const acquireMutation=async()=>{let release;const next=new Promise(r=>release=r),previous=mutationTail;mutationTail=next;await previous;return release;};
  const server=http.createServer(async(req,res)=>{
    const port=server.address()?.port;const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];const origin=req.headers.origin;
    const send=(status,value)=>{if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let releaseMutation,parsedBody;const readBody=()=>parsedBody===undefined?jsonBody(req):Promise.resolve(parsedBody);try{
      if(stopping)throw httpError(503,'服务正在停止');
      if(!hosts.includes(req.headers.host))throw httpError(403,'Host 不受支持');
      if(origin&&!hosts.some(h=>origin==='http://'+h))throw httpError(403,'跨来源请求已拒绝');
      if(!['GET','HEAD'].includes(req.method)&&!hosts.some(h=>origin==='http://'+h))throw httpError(403,'请求缺少有效 Origin');
      const url=new URL(req.url,'http://'+req.headers.host),p=url.pathname;
      if(req.method!=='GET'&&(p==='/api/conversations'||['/api/admin/plan','/api/admin/community/import','/api/admin/config','/api/admin/model','/api/admin/user','/api/admin/conversation'].includes(p))){const identity=p.startsWith('/api/admin/')?getAdmin(req):getUser(req).u;if(req.headers['x-csrf-token']!==identity.csrf)throw httpError(403,'请求校验失败');parsedBody=await jsonBody(req);releaseMutation=await acquireMutation();}
      if(await serveAdmin(req,res,p))return;
      if(!p.startsWith('/api/')){const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const file=files[p];if(!file||req.method!=='GET')throw httpError(404,'页面不存在');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(await fs.readFile(path.join(publicRoot,file)));return;}
      if(p==='/api/session'&&req.method==='POST'){
        const token=cookie(req,'between_user'),existing=token&&users.get(hash(token));if(existing){if(existing.disabled)throw httpError(403,'此用户已停用');send(200,{csrf:existing.csrf});return;}
        if(!config.acceptNew)throw httpError(403,'管理员已暂停新用户进入');const value=crypto.randomBytes(32).toString('hex'),key=hash(value),u={id:uuid(),csrf:crypto.randomBytes(24).toString('hex'),createdAt:new Date().toISOString(),disabled:false,conversations:[]};await saveUser(key,u);users.set(key,u);res.setHeader('Set-Cookie',`between_user=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);send(200,{csrf:u.csrf});return;
      }
      if(p==='/api/admin/auth'&&req.method==='GET'){send(200,{initialized:!!passwordHash});return;}
      if(p==='/api/admin/login'&&req.method==='POST'){
        if(!passwordHash)throw httpError(503,'管理员未初始化，请以 --admin-password-stdin 启动');const record=attempts.get(req.socket.remoteAddress)||{count:0,start:Date.now()};if(Date.now()-record.start>60000){record.count=0;record.start=Date.now()}if(++record.count>5)throw httpError(429,'尝试过多，请稍后再试');attempts.set(req.socket.remoteAddress,record);
        const b=await readBody();if(typeof b.password!=='string'||!crypto.timingSafeEqual(Buffer.from(hash(b.password)),Buffer.from(passwordHash)))throw httpError(401,'管理员口令不正确');const token=crypto.randomBytes(32).toString('hex'),a={csrf:crypto.randomBytes(24).toString('hex'),expires:Date.now()+8*3600000};admins.set(hash(token),a);res.setHeader('Set-Cookie',`between_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800`);send(200,{csrf:a.csrf});return;
      }
      if(p.startsWith('/api/admin/')){
        const a=getAdmin(req);if(req.method!=='GET'&&req.headers['x-csrf-token']!==a.csrf)throw httpError(403,'管理员请求校验失败');const b=req.method==='GET'?{}:await readBody();
        if(p==='/api/admin/logout'&&req.method==='POST'){admins.delete(hash(cookie(req,'between_admin')));res.setHeader('Set-Cookie','between_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');send(200,{ok:true});return;}
        if(p==='/api/admin/state'&&req.method==='GET'){send(200,{csrf:a.csrf,config,community,model:{...bridge.status,credentialConfigured:!!options.key},plan:await plan.status(planPrincipal,config.planBackend.model,config.planBackend.reasoningEffort),users:[...users.values()].map(u=>({id:u.id,createdAt:u.createdAt,disabled:u.disabled,conversations:u.conversations})),tasks:[...tasks.values()].map(t=>({id:t.id,userId:t.userId,conversation:t.conversation,mode:t.mode,startedAt:t.startedAt})),audit,diagnostics:{langfuse:'未接入',audit:'仅本进程最近200条操作记录，非不可篡改审计',storage:'本机私有目录；按用户隔离',plan:'管理员显式选择的独立 Between 授权；业务会话隔离不代表独立模型额度。官方多人托管适用性未确认。',modelVerified:bridge.status.connection==='connected',version:'role-chat-app-v1'}});return;}
        if(p==='/api/admin/community/import'&&req.method==='POST'){confirm(b);if(b.expectedVersion!==config.version)throw httpError(409,'配置已变更，请刷新');if(config.roles.length>=20)throw httpError(400,'角色库已满');const imported=await importCommunity(b.id);if(config.roles.some(r=>r.id===imported.role.id))throw httpError(409,'此素材已导入');if(imported.book&&config.books.some(x=>x.id===imported.book.id))throw httpError(409,'此世界书ID已存在，请先处理现有书；不会覆盖或重复绑定');if(imported.book&&config.books.length>=100)throw httpError(400,'世界书库已满');const updated={...config,roles:[...config.roles,imported.role],books:imported.book?[...config.books,imported.book]:config.books,version:config.version+1};await atomic(path.join(root,'settings.json'),updated);config=updated;log('admin','community.import',b.id);send(201,{roleId:imported.role.id,bookId:imported.book?.id,version:config.version});return;}
        if(p==='/api/admin/config'&&req.method==='PUT'){
          confirm(b);if(b.expectedVersion!==config.version)throw httpError(409,'配置已变更，请刷新后重试');const next=b.config;
          if(!next||!Array.isArray(next.roles)||next.roles.length<1||next.roles.length>20)throw httpError(400,'角色数量须为1至20');if(!Number.isInteger(next.preset?.context)||!Number.isInteger(next.preset.maxTokens)||next.preset.context>128000||next.preset.maxTokens<1||next.preset.maxTokens>=next.preset.context||!Number.isFinite(next.preset.temperature)||next.preset.temperature<0||next.preset.temperature>2||typeof next.preset.pinExamples!=='boolean'||typeof next.preset.postHistory!=='string'||next.preset.postHistory.length>10000)throw httpError(400,'预设参数无效');
          if(!Array.isArray(next.books)||next.books.length>100)throw httpError(400,'世界书数量无效');const bookIds=new Set();for(const b of next.books){if(!safeId(b.id)||bookIds.has(b.id)||typeof b.name!=='string'||!b.name.trim()||!Array.isArray(b.keys)||b.keys.length>100||b.keys.some(k=>typeof k!=='string'||k.length>200)||typeof b.content!=='string'||b.content.length>20000)throw httpError(400,'世界书格式无效');validateBook(b);bookIds.add(b.id);}
          for(const [items,previous]of [[next.roles,config.roles],[next.books,config.books]])for(const item of items){const old=previous.find(x=>x.id===item.id);if(old?.source&&JSON.stringify(item.source)!==JSON.stringify(old.source))throw httpError(400,'社区来源归因不可改动；可编辑内容或移除资源');}
          const ids=new Set();for(const r of next.roles){if(!safeId(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||!Array.isArray(r.keys)||r.keys.some(k=>typeof k!=='string'))throw httpError(400,'角色或世界书字段无效');if(!Array.isArray(r.bookIds)||r.bookIds.some(id=>!bookIds.has(id))||new Set(r.bookIds).size!==r.bookIds.length)throw httpError(400,'世界书绑定无效');ids.add(r.id);for(const k of ['system','detail','world','greeting','persona','tag','description','examples'])if(typeof r[k]!=='string'||r[k].length>10000)throw httpError(400,'角色字段缺失或过长');const s=snapshot(r);s.character.data.post_history_instructions=[r.postHistory,next.preset.postHistory].filter(Boolean).join('\n');s.entries=bookEntries(next.books,r.bookIds);s.preset={...s.preset,openai_max_context:next.preset.context,openai_max_tokens:next.preset.maxTokens};validateSnapshot(s);}
          const updated={...config,roles:next.roles,books:next.books,preset:next.preset,acceptNew:!!next.acceptNew,paused:!!next.paused,version:config.version+1};await atomic(path.join(root,'settings.json'),updated);config=updated;log('admin','config.update','new-conversations');send(200,{version:config.version});return;
        }
        if(p==='/api/admin/plan'&&req.method==='PUT'){
          confirm(b);if(Object.keys(b).some(k=>!['enabled','model','reasoningEffort','action','confirm','expectedVersion'].includes(k)))throw httpError(400,'不接受凭据字段');
          if(b.action==='disconnect'){plan.disconnect(planPrincipal);for(const t of tasks.values())t.controller.abort();send(200,{ok:true});return;}
          if(b.action==='resume'){plan.resume(planPrincipal);send(200,{ok:true});return;}
          if(b.expectedVersion!==config.version)throw httpError(409,'配置已变更，请刷新');
          if(typeof b.enabled!=='boolean'||typeof b.model!=='string'||b.model.length>200||b.enabled&&!b.model.trim())throw httpError(400,'套餐后端设置无效');
          const reasoningEffort=b.reasoningEffort===undefined?(config.planBackend.reasoningEffort??DEFAULT_PLAN_REASONING):b.reasoningEffort;
          if(!validReasoningEffort(reasoningEffort))throw httpError(400,'思考档位须为 medium 或 high');
          if(tasks.size)throw httpError(409,'先停止正在运行的任务再切换后端');
          planChanging=true;try{const updated={...config,planBackend:{enabled:b.enabled,model:b.model.trim(),reasoningEffort},version:config.version+1};await atomic(path.join(root,'settings.json'),updated);config=updated;}finally{planChanging=false}
          log('admin','plan.backend.update','future-requests');send(200,{ok:true});return;
        }
        if(p==='/api/admin/model'&&req.method==='PUT'){confirm(b);if(typeof b.url!=='string'||typeof b.name!=='string'||!b.name.trim()||b.name.length>200)throw httpError(400,'模型地址或名称无效');bridge.configure(b,true);const updated={...config,model:{url:b.url,name:b.name},version:config.version+1};await atomic(path.join(root,'settings.json'),updated);bridge.configure(b);config=updated;log('admin','model.update','future-requests');send(200,{ok:true});return;}
        if(p==='/api/admin/user'&&req.method==='PUT'){confirm(b);const found=[...users.entries()].find(([,u])=>u.id===b.userId);if(!found)throw httpError(404,'用户不存在');const [key,u]=found;u.disabled=!!b.disabled;await saveUser(key,u);if(u.disabled)for(const t of tasks.values())if(t.userId===u.id)t.controller.abort();log('admin',u.disabled?'user.disable':'user.enable',u.id);send(200,{ok:true});return;}
        if(p==='/api/admin/stop'&&req.method==='POST'){const t=[...tasks.values()].find(t=>t.id===b.taskId);if(!t)throw httpError(404,'任务已结束');t.controller.abort();log('admin','task.stop',t.id);send(200,{ok:true});return;}
        if(p==='/api/admin/conversation'&&req.method==='DELETE'){confirm(b);const found=[...users.entries()].find(([,u])=>u.id===b.userId);if(!found)throw httpError(404,'用户不存在');const [key,u]=found;own(u,b.conversation);const deletingKey=taskKey(u,b.conversation);deleting.add(deletingKey);try{const task=tasks.get(deletingKey);if(task){task.controller.abort();await task.finished;}await client(u).delete(b.conversation);u.conversations=u.conversations.filter(x=>x.id!==b.conversation);await saveUser(key,u);log('admin','conversation.delete',b.conversation);send(200,{ok:true});}finally{deleting.delete(deletingKey)}return;}
        throw httpError(404,'管理员接口不存在');
      }
      const {u,key}=getUser(req);if(req.method!=='GET'&&req.headers['x-csrf-token']!==u.csrf)throw httpError(403,'请求校验失败');
      if(p==='/api/state'&&req.method==='GET'){send(200,{roles:config.roles.map(({system,detail,world,keys,...r})=>r),conversations:u.conversations,model:await modelState(u),modelSelection:config.planBackend.enabled?'chatgpt-plan':'chat-completions',paused:config.paused,tasks:[...tasks.values()].filter(t=>t.userId===u.id).map(t=>({conversation:t.conversation}))});return;}
      if(p==='/api/conversations'&&req.method==='POST'){const b=await readBody(),role=config.roles.find(x=>x.id===b.role);if(!role)throw httpError(400,'请选择有效角色');const id=uuid();await client(u).create(id,makeSnapshot(role,b));u.conversations.push({id,role:role.id,name:role.name,title:role.name+'的会话',createdAt:new Date().toISOString(),configVersion:config.version});await saveUser(key,u);send(201,await viewState(u,id));return;}
      const match=p.match(/^\/api\/conversations\/([a-zA-Z0-9_-]+)(?:\/(turn|stop))?$/);if(!match)throw httpError(404,'接口不存在');const [,id,action]=match;own(u,id);
      if(!action&&req.method==='GET'){send(200,await viewState(u,id));return;}
      if(action==='stop'&&req.method==='POST'){tasks.get(taskKey(u,id))?.controller.abort();send(200,{ok:true});return;}
      if(action==='turn'&&req.method==='POST'){
        if(config.paused)throw httpError(503,'管理员已暂停生成');const selectedModel=await modelState(u);if(selectedModel.mode==='unconfigured'||selectedModel.canGenerate===false)throw httpError(503,selectedModel.description||'尚未配置模型，请联系管理员');const k=taskKey(u,id);if(tasks.has(k))throw httpError(409,'此会话正在生成，请先停止');const b=await readBody();const op={id:b.id,mode:b.mode||'normal',...(b.input!==undefined?{input:b.input}:{}),...(b.media?{media:b.media}:{}),...(b.audio?{audio:b.audio}:{}),...(b.image?{image:b.image}:{}),...(b.speak?{speak:true}:{})};
        if(!safeId(op.id))throw httpError(400,'消息标识无效');if(!['normal','regenerate','voice','image','caption'].includes(op.mode))throw httpError(400,'不支持的生成模式');const selectedBackend=config.planBackend;const currentModel=await modelState(u);if(currentModel.canGenerate===false)throw httpError(503,currentModel.description);const caps=currentModel.capabilities;if(op.mode==='voice'&&!caps.voice||op.mode==='image'&&!caps.image||op.mode==='caption'&&!caps.caption||op.speak&&!caps.tts||op.media?.some(m=>m.type==='image'?!caps.imageInput:m.type==='audio'?!caps.audioInput:true))throw httpError(400,'此连接尚未启用所请求的媒体能力');getUser(req);own(u,id);if(planChanging||selectedBackend!==config.planBackend)throw httpError(409,'模型连接正在保存，请稍后再试');if(config.paused)throw httpError(503,'管理员已暂停生成');if(tasks.has(k))throw httpError(409,'此会话正在生成，请先停止');const controller=new AbortController();let finish;const finished=new Promise(r=>finish=r);const task={id:uuid(),userId:u.id,conversation:id,mode:op.mode,startedAt:new Date().toISOString(),controller,finished};tasks.set(k,task);
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'});const emit=(event,data)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};res.on('close',()=>{if(!res.writableEnded)controller.abort()});emit('start',{taskId:task.id});
        try{const result=await client(u).turn(id,op,{signal:controller.signal,...(['normal','regenerate','voice'].includes(op.mode)?{onDelta:text=>emit('delta',{text})}:{})});emit('done',{result});log(u.id,'turn.complete',id);}catch(e){emit('error',{message:controller.signal.aborted?'已停止，本轮未保存':e instanceof PlanError?e.message:/^Provider HTTP \d+$/.test(e.message)?'模型请求失败，请重试':e.message.includes('Truncated')?'连接中断，本轮未保存':'操作失败，请检查模型或媒体配置',cancelled:controller.signal.aborted});log(u.id,controller.signal.aborted?'turn.cancel':'turn.fail',id,'error');}finally{tasks.delete(k);finish();res.end();}return;
      }
      throw httpError(405,'请求方式不受支持');
    }catch(e){send(e.status||400,{error:e.status?e.message:'配置或操作无效，请检查输入'});}finally{releaseMutation?.();}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??8787,'127.0.0.1',resolve)});}catch(e){await engine.close();await bridge.close();throw e;}
  return {url:`http://127.0.0.1:${server.address().port}`,async close(){if(stopping)return;stopping=true;for(const t of tasks.values())t.controller.abort();await Promise.all([...tasks.values()].map(t=>t.finished));server.closeAllConnections();await new Promise(r=>server.close(r));await engine.close();await bridge.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};let adminPassword='';
  if(args.includes('--admin-password-stdin')){process.stderr.write('从标准输入读取管理员口令（不保存、不回显）。\n');for await(const chunk of process.stdin)adminPassword+=chunk;if(adminPassword.endsWith('\n'))adminPassword=adminPassword.slice(0,-1);if(adminPassword.length<12)throw new Error('管理员口令至少12个字符');}
  const planProvider=process.env.BETWEEN_PLAN_SERVICE_URL?await createCompatibilityPlanProvider({baseUrl:process.env.BETWEEN_PLAN_SERVICE_URL,localKey:process.env.BETWEEN_PLAN_LOCAL_KEY}):undefined;
  const app=await createApp({planProvider,root:option('--data',path.resolve('role-app-data')),port:Number(option('--port','8787')),demo:args.includes('--demo'),modelUrl:process.env.BETWEEN_MODEL_URL||'',modelName:process.env.BETWEEN_MODEL_NAME||undefined,key:process.env.BETWEEN_MODEL_KEY||'',adminPassword});console.log(`Between 本机聊天：${app.url}\n管理员页面：${app.url}/admin\n${adminPassword?'管理员已初始化':'管理员未初始化；请使用 --admin-password-stdin'}\n${args.includes('--demo')?'模式：合成演示（非真实模型）':'模式：真实连接配置 / 未配置'}`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0)});
}
