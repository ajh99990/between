import {mkdir,lstat,realpath,open,unlink,rename} from 'node:fs/promises';
import {dirname,basename,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {AuthorizationError,ISSUER,TOKEN_ENDPOINT,RESOURCE,hasPlanScope,readJson,discovery,validateIdToken} from './plan-oauth-protocol.mjs';
import {PlanCredentials} from './lingguang/credentials.mjs';

// Original save and promise coalescing are reused; terminal refresh states are
// Between additions. Original vendored source remains unchanged.
// This wrapper adds path checks and one owner across instances/processes.
export async function openPlanCredentials(file,{repositoryRoots=[],fetchImpl=fetch,now=Date.now}={}) {
  if(!isAbsolute(file))throw new Error('Credential path must be absolute');
  file=resolve(file);
  const roots=[fileURLToPath(new URL('../../',import.meta.url)),...repositoryRoots].map(x=>resolve(x));
  const contained=(root,p)=>p===root||(!relative(root,p).startsWith('..')&&!isAbsolute(relative(root,p)));
  async function guard(){
    let current=dirname(file),suffix=[];
    while(true){try{current=await realpath(current);break}catch(e){if(e.code!=='ENOENT')throw e;suffix.unshift(basename(current));current=dirname(current);}}
    const canonical=resolve(current,...suffix,basename(file));
    for(const root of roots){let canonicalRoot;try{canonicalRoot=await realpath(root)}catch{canonicalRoot=root}if(contained(root,file)||contained(canonicalRoot,canonical))throw new Error('Credential path must be outside repositories');}
    if(canonical!==file)throw new Error('Credential path must not contain symbolic links');
    try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>65536||s.nlink!==1||(s.mode&0o077)||process.getuid&&s.uid!==process.getuid())throw new Error('Credential file must be owner-only regular file');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await guard();await mkdir(dirname(file),{recursive:true,mode:0o700});
  const directory=await lstat(dirname(file));if(!directory.isDirectory()||(directory.mode&0o077)||process.getuid&&directory.uid!==process.getuid())throw new Error('Use a dedicated owner-only credential directory');
  const lockPath=file+'.owner';const lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));
  let closed=false,closing;
  let signingOut=false;
  const terminal=new Set(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused']);
  class Guarded extends PlanCredentials {
    async getAccessToken(){if(closed||closing||signingOut)throw new AuthorizationError('signed_out');const token=await super.getAccessToken();if(signingOut)throw new AuthorizationError('signed_out');return token;}
    async load(){if(closed)throw new Error('Credential owner closed');await guard();const r=await super.load();if(r&&(r.app!=='Between'||r.schema!==1||r.issuer!==ISSUER||r.validated!==true))throw new AuthorizationError('invalid_registration');return r;}
    async save(record){
      if(closed)throw new Error('Credential owner closed');await guard();
      if(record.app!=='Between'||record.schema!==1||record.issuer!==ISSUER||record.validated!==true)throw new AuthorizationError('invalid_registration');
      if(!record.client_id||record.client_id==='dynamic_agent_client'||!record.subject||!Number.isFinite(record.expires_at))throw new Error('Invalid authorization record');
      if(record.access_token)await super.save(record);
      else {const temporary=file+'.'+randomUUID()+'.tmp';try{const h=await open(temporary,'wx',0o600);try{await h.writeFile(JSON.stringify(record));await h.sync()}finally{await h.close()}await rename(temporary,file)}finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e})}}
      const d=await open(dirname(file),'r');try{await d.sync()}finally{await d.close()}
    }
    async block(saved,status,reason){
      const record={...saved,grant_status:status,last_error:reason,expires_at:0};
      delete record.access_token;delete record.refresh_token;delete record.id_token;delete record.next_retry_at;
      await this.save(record);return record;
    }
    async obtainToken(){
      const saved=await this.load();if(!saved)throw new AuthorizationError('sign_in_required');
      if(saved.grant_status&&!['ready','temporarily_unavailable'].includes(saved.grant_status))throw new AuthorizationError(saved.grant_status);
      if(!hasPlanScope(saved.scope)){await this.block(saved,'scope_missing','scope_missing');throw new AuthorizationError('scope_missing')}
      if(saved.next_retry_at>now())throw new AuthorizationError('temporarily_unavailable');
      if(saved.expires_at>now()+60000&&saved.access_token)return saved.access_token;
      if(!saved.refresh_token){await this.block(saved,'reauthorization_required','missing_refresh_token');throw new AuthorizationError('reauthorization_required')}
      const signal=AbortSignal.timeout(30000);
      const transient=async()=>{await this.save({...saved,grant_status:'temporarily_unavailable',next_retry_at:now()+30000});throw new AuthorizationError('temporarily_unavailable')};
      let r,t;try{r=await this.fetch(TOKEN_ENDPOINT,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:saved.client_id,refresh_token:saved.refresh_token,resource:RESOURCE})});t=await readJson(r)}catch{return transient()}
      if(!r.ok){
        if(terminal.has(t.error)){await this.block(saved,'reauthorization_required',t.error);throw new AuthorizationError('reauthorization_required')}
        if(t.error==='invalid_client'){await this.block(saved,'configuration_error','invalid_client');throw new AuthorizationError('configuration_error')}
        if(r.status>=500||r.status===429)return transient();
        await this.block(saved,'reauthorization_required','refresh_rejected');throw new AuthorizationError('reauthorization_required');
      }
      const scope=t.scope??saved.scope;
      if(!hasPlanScope(scope)){await this.block(saved,'scope_missing','scope_missing');throw new AuthorizationError('scope_missing')}
      if(typeof t.access_token!=='string'||!t.access_token||!Number.isFinite(t.expires_in)||t.expires_in<=0||String(t.token_type).toLowerCase()!=='bearer'||t.refresh_token!==undefined&&(typeof t.refresh_token!=='string'||!t.refresh_token)){
        await this.block(saved,'reauthorization_required','invalid_refresh_response');throw new AuthorizationError('reauthorization_required');
      }
      if(t.id_token){try{await validateIdToken(t.id_token,{clientId:saved.client_id,subject:saved.subject,fetchImpl:this.fetch,signal,now})}catch{await this.block(saved,'reauthorization_required','invalid_id_token');throw new AuthorizationError('reauthorization_required')}}
      await this.save({...saved,access_token:t.access_token,refresh_token:t.refresh_token??saved.refresh_token,id_token:t.id_token??saved.id_token,scope,expires_at:now()+t.expires_in*1000,grant_status:'ready',next_retry_at:0,last_error:undefined});
      return t.access_token;
    }
    signOut(){if(closed||closing)return Promise.reject(new AuthorizationError('signed_out'));return this.signingOutPromise??=(async()=>{try{return await this.performSignOut()}finally{this.signingOutPromise=null}})()}
    async performSignOut(){
      if(signingOut)throw new AuthorizationError('signed_out');signingOut=true;
      try{await this.refreshing?.catch(()=>{});const saved=await this.load();if(!saved)return {localCleared:true,remoteRevoked:false};let remoteRevoked=false;
        if(saved.refresh_token){try{const signal=AbortSignal.timeout(10000),d=await discovery(this.fetch,signal);if(d.revocation_endpoint){const r=await this.fetch(d.revocation_endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:saved.refresh_token,token_type_hint:'refresh_token',client_id:saved.client_id})});remoteRevoked=r.status===200;await r.body?.cancel()}}catch{}}
        await this.block(saved,'signed_out',remoteRevoked?'revoked':'remote_revocation_unconfirmed');return {localCleared:true,remoteRevoked};
      }finally{signingOut=false}
    }
  }
  const credentials=new Guarded(file,{fetchImpl,now});
  return {credentials,close(){return closing??=(async()=>{await credentials.signingOutPromise?.catch(()=>{});await credentials.refreshing?.catch(()=>{});closed=true;await lock.close();await unlink(lockPath)})()}};
}
