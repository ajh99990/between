// Between local OAuth helper. No server, browser, or network starts on import.
import http from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,open,lstat} from 'node:fs/promises';
import {createAttempt,exchangeCallback,same,AuthorizationError} from './plan-oauth-protocol.mjs';

export async function getHostId(file){
  const path=file+'.host';
  try{const h=await open(path,'wx',0o600);const id='urn:uuid:'+randomUUID();try{await h.writeFile(id);await h.sync()}finally{await h.close()}return id}
  catch(e){if(e.code!=='EEXIST')throw e}
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)||stat.size>100||process.getuid&&stat.uid!==process.getuid())throw new Error('Unsafe host identity file');
  const id=await readFile(path,'utf8');if(!/^urn:uuid:[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid host identity');return id;
}
export async function startLogin({credentials,hostId,fetchImpl=fetch,port=0,now=Date.now,reconsent=false,timeoutMs=600000}={}){
  if(!credentials||!hostId)throw new Error('Explicit independent Between credential owner required');
  const ticket=randomBytes(32).toString('base64url'),cookie=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const controller=new AbortController();let attempt,busy=false,closed=false,closingPromise,origin,timer,pendingRegistration,resolveResult,idle=Promise.resolve(),resolveIdle;
  const result=new Promise(r=>resolveResult=r);
  const registration=await credentials.load();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self' https://auth.openai.com; frame-ancestors 'none'; base-uri 'none'");
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(body)};
    if(closed||req.headers.host!==new URL(origin).host){reply(403,'本地授权访问被拒绝');return}
    const u=new URL(req.url,origin),cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());const authenticated=cookies.includes('between_oauth='+cookie);
    if(req.method==='GET'&&u.pathname==='/'&&same(u.searchParams.get('ticket'),ticket)){
      res.setHeader('Set-Cookie',`between_oauth=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);res.writeHead(303,{Location:'/auth'});res.end();return;
    }
    if(!authenticated){reply(403,'请从终端显示的本地入口重新打开');return}
    if(req.method==='GET'&&u.pathname==='/auth'){
      reply(200,`<html lang="zh-CN"><meta charset="utf-8"><title>Between 授权</title><h1>Between 独立授权</h1><p>继续后才会访问 OpenAI 官方登录。此授权由管理员管理，应用用户共享额度。托管共享使用资格仍需确认。</p><form method="post" action="/auth/authorize"><input type="hidden" name="csrf" value="${csrf}"><button>Continue with ChatGPT</button></form></html>`);return;
    }
    if(req.method==='POST'&&u.pathname==='/auth/authorize'){
      if(req.headers.origin!==origin||busy){reply(403,'请求被拒绝');return}
      let body='';for await(const part of req){body+=part.toString();if(body.length>4096){reply(413,'请求过大');return}}
      if(!same(new URLSearchParams(body).get('csrf'),csrf)){reply(403,'请求被拒绝');return}
      attempt=createAttempt({redirectUri:origin+'/auth/callback',hostId,registration:registration||pendingRegistration,now,reconsent});
      res.writeHead(303,{Location:attempt.authorizationUrl});res.end();return;
    }
    if(req.method==='GET'&&u.pathname==='/auth/callback'){
      if(busy||!attempt||!same(u.searchParams.get('state'),attempt.state)){reply(400,'回调状态不匹配');return}
      busy=true;idle=new Promise(r=>resolveIdle=r);
      try{
        const record=await exchangeCallback(u.href,attempt,{fetchImpl,now,signal:controller.signal,onIssuedClient:client_id=>{pendingRegistration={client_id}}});
        controller.signal.throwIfAborted();await credentials.save(record);
        reply(200,record.grant_status==='ready'?'授权已安全保存，可以关闭此窗口。':'登录已验证，但缺少套餐权限；套餐生成仍禁用。');resolveResult({status:record.grant_status});
        setImmediate(()=>close());
      }catch(e){reply(400,'授权未完成：'+(e instanceof AuthorizationError?e.code:'authorization_failed')+'。返回本地入口可重试。')}
      finally{busy=false;resolveIdle()}return;
    }
    reply(404,'未找到');
  });
  function close(){return closingPromise??=(async()=>{closed=true;clearTimeout(timer);controller.abort();await idle;server.closeAllConnections();await new Promise(r=>server.close(r));resolveResult({status:'cancelled'})})()}
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  origin='http://127.0.0.1:'+server.address().port;timer=setTimeout(()=>close(),timeoutMs);timer.unref();
  return {url:origin+'/?ticket='+ticket,result,close};
}
