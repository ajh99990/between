import {fileURLToPath} from 'node:url';
import {openPlanCredentials} from './plan-credentials.mjs';
import {startCompatibilityServer} from './plan-service.mjs';

// Never run on import. This entry point does not start OAuth, import existing
// Codex/Lingguang credentials, fetch models, or perform a startup inference.
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(!process.argv.includes('--enable-plan-service'))throw Error('Explicit --enable-plan-service required');
  const file=process.env.BETWEEN_PLAN_CREDENTIALS,localKey=process.env.BETWEEN_PLAN_LOCAL_KEY;
  if(!file||!localKey||localKey.length<24)throw Error('Set independent Between credential path and local service key');
  const owner=await openPlanCredentials(file);let service;
  try{
    service=await startCompatibilityServer({localKey,port:Number(process.env.BETWEEN_PLAN_PORT||8766),getAccessToken:()=>owner.credentials.getAccessToken(),inspectGrant:async()=>{
      const r=await owner.credentials.load();return r?{grantStatus:r.grant_status,subject:r.subject,workspace:r.workspace,clientId:r.client_id,scopes:String(r.scope||'').split(' '),expiresAt:r.expires_at,validated:r.validated===true,renewable:!!r.refresh_token}:null;
    }});
    console.log('Between 独立套餐兼容服务：'+service.baseUrl+'；未执行登录或模型测试。');
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();await owner.close();process.exit(0)});
  }catch(e){await service?.close();await owner.close();throw e;}
}
