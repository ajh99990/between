import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {adaptRequest,ResponsesFrames} from './lingguang/compat.mjs';

// Based on the supplied Lingguang server interface; its complete server source
// was not supplied. Only loopback is supported in this Between implementation.
export async function startCompatibilityServer({localKey,getAccessToken,inspectGrant=async()=>null,port=0,host='127.0.0.1',fetchImpl=fetch,timeoutMs=180000}={}) {
  if(typeof localKey!=='string'||localKey.length<24||typeof getAccessToken!=='function'||host!=='127.0.0.1')throw new Error('Explicit loopback service key and token getter required');
  const active=new Set();let closing=false;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');const fail=(status,message)=>{if(!res.headersSent)res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message}}))};
    const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+localKey);
    if(closing||req.headers.origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){fail(403,'Local service access denied');return;}
    if(req.url==='/health'&&req.method==='GET'){
      try{const grant=await inspectGrant();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok',authorization:grant?{subject:grant.subject,workspace:grant.workspace,clientId:grant.clientId,scopes:grant.scopes,expiresAt:grant.expiresAt,validated:grant.validated,renewable:grant.renewable===true,grantStatus:grant.grantStatus}:null}));}catch{fail(503,'Authorization inspection unavailable')}return;
    }
    if(req.url!=='/v1/responses'||req.method!=='POST'){fail(404,'Unsupported route');return;}
    const controller=new AbortController();active.add(controller);const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)]);
    res.on('close',()=>{if(!res.writableEnded)controller.abort()});
    try{
      const raw=[];let size=0;for await(const part of req){size+=part.length;if(size>16*1024*1024){fail(413,'Request too large');return;}raw.push(part);}
      let body;try{body=adaptRequest(JSON.parse(Buffer.concat(raw).toString('utf8'))).body;if(body.tools||body.input.some(x=>!['user','assistant','developer'].includes(x.role)||typeof x.content!=='string'))throw Error();}catch{fail(400,'Unsupported text Responses request');return;}
      const permitted=g=>g?.validated===true&&(!g.grantStatus||['ready','temporarily_unavailable'].includes(g.grantStatus))&&Array.isArray(g.scopes)&&g.scopes.includes('resource.invoke')&&g.scopes.includes('chatgpt.tokens.use.direct');
      if(!permitted(await inspectGrant())){fail(401,'Plan authorization required');return;}
      const token=await getAccessToken();signal.throwIfAborted();
      if(!permitted(await inspectGrant())){fail(401,'Plan permission no longer present');return;}
      const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});
      if(!response.ok){
        let error='',bytes=0;for await(const chunk of response.body||[]){bytes+=chunk.byteLength;if(bytes>65536)throw Error('Oversized error');error+=Buffer.from(chunk).toString('utf8');}
        // Error payload stays on the authenticated local transport; UI adapter
        // maps stable codes and never exposes message/detail text.
        res.writeHead(response.status,{'Content-Type':'application/json',...(response.headers.get('x-request-id')?{'x-request-id':response.headers.get('x-request-id')}:{})});res.end(error);return;
      }
      const frames=new ResponsesFrames();let pending=[];
      for await(const chunk of response.body){signal.throwIfAborted();frames.push(chunk);if(!res.headersSent){pending.push(chunk);if(!frames.seenEvent)continue;res.writeHead(200,{'Content-Type':'text/event-stream'});for(const p of pending)res.write(p);pending=[];}else res.write(chunk);}
      frames.push(new Uint8Array(),true);if(!frames.terminal)throw Error('Missing terminal');res.end();
    }catch(e){if(!res.headersSent){if(['reauthorization_required','scope_missing','signed_out','configuration_error','sign_in_required'].includes(e.code)){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'between_plan_reauthorization_required',message:'Between sign-in required'}}))}else fail(502,'Plan service request failed')}else res.destroy();}
    finally{controller.abort();active.delete(controller);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
  return {baseUrl:`http://127.0.0.1:${server.address().port}/v1`,async close(){closing=true;for(const c of active)c.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}

// Client side never reads the actual OAuth token. Health is protected and never
// refreshes or performs inference. Its metadata must come from validated grants.
export async function createCompatibilityPlanProvider({baseUrl,localKey}) {
  const u=new URL(baseUrl);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/v1'||u.username||u.password||u.search||u.hash||typeof localKey!=='string'||localKey.length<24)throw new Error('Explicit loopback compatibility service required');
  const {createPlanProvider}=await import('./chatgpt-plan.mjs');
  return createPlanProvider({getSession:async principal=>{
    const r=await fetch(u.origin+'/health',{headers:{Authorization:'Bearer '+localKey},redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const a=(await r.json()).authorization;return a&&(!a.grantStatus||['ready','temporarily_unavailable'].includes(a.grantStatus))?{...a,expiresAt:a.renewable?Date.now()+180000:a.expiresAt,principal,accessToken:localKey}:null;
  },fetchImpl:(_url,options)=>fetch(baseUrl+'/responses',{...options,headers:{Authorization:'Bearer '+localKey,'Content-Type':'application/json'}})});
}
