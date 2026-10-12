// Explicit secure-transfer receiver. Source must already be a protected file;
// no filesystem search, Codex import, or automatic account discovery.
import {openPlanCredentials} from './plan-credentials.mjs';
import {getHostId} from './plan-oauth.mjs';
import {validateIdToken,hasPlanScope,AuthorizationError} from './plan-oauth-protocol.mjs';
export async function importGrant({source,owner,fetchImpl=fetch,now=Date.now}){
  const sourceOwner=await openPlanCredentials(source,{fetchImpl,now});
  try{
    const r=await sourceOwner.credentials.load();if(!r?.id_token||!r.refresh_token||!hasPlanScope(r.scope)||r.grant_status!=='ready')throw new AuthorizationError('invalid_registration');
    await validateIdToken(r.id_token,{clientId:r.client_id,subject:r.subject,fetchImpl,now,signal:AbortSignal.timeout(30000)});
    const existing=await owner.credentials.load();if(existing&&(existing.client_id!==r.client_id||existing.subject!==r.subject))throw new AuthorizationError('registration_mismatch');
    const hostId=await getHostId(owner.credentials.file);await owner.credentials.save({...r,ext_agent_host_id:hostId});
    return {status:'ready'};
  }finally{await sourceOwner.close()}
}
