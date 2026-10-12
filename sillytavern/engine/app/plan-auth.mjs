import {fileURLToPath} from 'node:url';
import {openPlanCredentials} from './plan-credentials.mjs';
import {importGrant} from './plan-grant-import.mjs';
import {getHostId,startLogin} from './plan-oauth.mjs';
// CLI only. No existing Codex/Lingguang credential discovery or implicit login.
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [command,...args]=process.argv.slice(2),at=args.indexOf('--credentials'),file=at>=0?args[at+1]:undefined;
  if(!['login','status','logout','import'].includes(command)||!file)throw Error('Usage: node app/plan-auth.mjs login|status|logout|import --credentials /absolute/private/between.json [--consent|--confirm]');
  if(command==='login'&&!args.includes('--consent')||['logout','import'].includes(command)&&!args.includes('--confirm'))throw Error('Explicit --consent (login) or --confirm (logout) required');
  const owner=await openPlanCredentials(file);let helper;
  const close=async()=>{await helper?.close();await owner.close()};
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await close();process.exit(0)});
  try{
    if(command==='import'){const at=args.indexOf('--source');if(at<0||!args[at+1])throw Error('Explicit --source protected grant file required');await importGrant({source:args[at+1],owner});console.log('独立 Between 授权已导入；本机 host identity 保持独立。')}
    if(command==='status'){const r=await owner.credentials.load();console.log(JSON.stringify({status:r?.grant_status||'sign_in_required',clientId:r?.client_id,subject:r?.subject,expiresAt:r?.expires_at},null,2))}
    if(command==='logout'){const r=await owner.credentials.signOut();console.log(r.remoteRevoked?'已撤销并清除本地令牌。':'本地令牌已清除；远端撤销未确认，请在 ChatGPT 设置中核查。')}
    if(command==='login'){
      helper=await startLogin({credentials:owner.credentials,hostId:await getHostId(file),reconsent:args.includes('--reconsent')});
      console.log('在运行此命令的电脑浏览器打开：'+helper.url+'\n点击 Continue with ChatGPT 后才开始官方授权。');
      const r=await helper.result;console.log('Between 授权状态：'+r.status);
    }
  }finally{await close()}
}
