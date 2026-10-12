// Between implementation from the public SIWC contract; not copied from the
// unavailable Lingguang OAuth experiment. Importing this module does no I/O.
import {randomBytes,createHash,createPublicKey,verify,timingSafeEqual} from 'node:crypto';
export const ISSUER='https://auth.openai.com';
export const RESOURCE='https://api.openai.com/v1';
export const TOKEN_ENDPOINT=ISSUER+'/api/accounts/oauth/token';
export const AUTHORIZE_ENDPOINT=ISSUER+'/api/accounts/authorize';
export const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export class AuthorizationError extends Error {
  constructor(code,message='授权尚不可用，请按状态重新登录或稍后重试。'){super(message);this.code=code;}
}
export const hasPlanScope=scope=>typeof scope==='string'&&['resource.invoke','chatgpt.tokens.use.direct'].every(x=>scope.split(/\s+/).includes(x));
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function officialUrl(value){let u;try{u=new URL(value)}catch{throw new AuthorizationError('invalid_discovery')}
  if(u.origin!==ISSUER||u.username||u.password||u.search||u.hash)throw new AuthorizationError('invalid_discovery');return u.href;
}
export async function readJson(response,limit=65536){
  const chunks=[];let size=0;for await(const c of response.body||[]){size+=c.byteLength;if(size>limit)throw new AuthorizationError('invalid_response');chunks.push(c)}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw new AuthorizationError('invalid_response')}
}
export async function discovery(fetchImpl=fetch,signal){
  const r=await fetchImpl(ISSUER+'/.well-known/openid-configuration',{signal,redirect:'error'});if(!r.ok)throw new AuthorizationError('discovery_unavailable');
  const d=await readJson(r);if(d.issuer!==ISSUER||d.authorization_endpoint!==AUTHORIZE_ENDPOINT||d.token_endpoint!==TOKEN_ENDPOINT)throw new AuthorizationError('invalid_discovery');
  officialUrl(d.jwks_uri);if(d.revocation_endpoint)officialUrl(d.revocation_endpoint);return d;
}
export async function validateIdToken(token,{clientId,nonce,subject,fetchImpl=fetch,signal,now=Date.now,allowExpired=false}={}) {
  if(typeof clientId!=='string'||!clientId||clientId==='dynamic_agent_client'||typeof token!=='string'||token.length>32768)throw new AuthorizationError('invalid_id_token');
  const parts=token.split('.');if(parts.length!==3||parts.some(x=>!x||!/^[A-Za-z0-9_-]+$/.test(x)))throw new AuthorizationError('invalid_id_token');
  let header,claims;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'))}catch{throw new AuthorizationError('invalid_id_token')}
  if(!header||!claims||typeof header!=='object'||typeof claims!=='object'||header.alg!=='RS256'||typeof header.kid!=='string'||header.crit||header.jku||header.jwk||header.x5u||header.b64===false)throw new AuthorizationError('invalid_id_token');
  const d=await discovery(fetchImpl,signal);const r=await fetchImpl(d.jwks_uri,{signal,redirect:'error'});if(!r.ok)throw new AuthorizationError('jwks_unavailable');const jwks=await readJson(r);
  const matches=Array.isArray(jwks.keys)?jwks.keys.filter(k=>k&&k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')&&(!k.key_ops||Array.isArray(k.key_ops)&&k.key_ops.includes('verify'))):[];
  if(matches.length!==1)throw new AuthorizationError('invalid_id_token');
  let valid=false;try{const key=createPublicKey({key:matches[0],format:'jwk'});if(key.asymmetricKeyDetails?.modulusLength>=2048)valid=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url'))}catch{}
  const nowSeconds=now()/1000,aud=claims.aud;
  if(!valid||claims.iss!==ISSUER||!(aud===clientId||Array.isArray(aud)&&aud.every(x=>typeof x==='string')&&aud.includes(clientId))||Array.isArray(aud)&&aud.length>1&&claims.azp!==clientId||claims.azp&&claims.azp!==clientId||!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.iat>nowSeconds+5||!allowExpired&&claims.exp<=nowSeconds-5||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>nowSeconds+5)||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>500||nonce!==undefined&&!same(claims.nonce,nonce)||subject!==undefined&&!same(claims.sub,subject))throw new AuthorizationError('invalid_id_token');
  return claims;
}
export function createAttempt({redirectUri,hostId,registration,now=Date.now,reconsent=false}={}) {
  const u=new URL(redirectUri);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/auth/callback'||!u.port||u.search||u.hash||u.username||u.password||!/^urn:uuid:[0-9a-f-]{36}$/i.test(hostId))throw new AuthorizationError('invalid_local_configuration');
  const clientId=registration?.client_id||'dynamic_agent_client';if(registration&&(!clientId||clientId==='dynamic_agent_client'))throw new AuthorizationError('invalid_registration');
  const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
  const params={client_id:clientId,ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')};
  if(!registration)params.agent_name_hint='Between';
  // Do not put retained ID tokens into a printable URL. Reauthorization works
  // without hints and the newly verified subject must still match registration.
  if(reconsent)params.prompt='consent';
  return {state,nonce,verifier,redirectUri,hostId,clientId,registration,expiresAt:now()+600000,used:false,authorizationUrl:AUTHORIZE_ENDPOINT+'?'+new URLSearchParams(params)};
}
export async function exchangeCallback(callback,attempt,{fetchImpl=fetch,now=Date.now,signal,onIssuedClient=()=>{}}={}) {
  if(attempt.used||attempt.expiresAt<=now())throw new AuthorizationError('expired_attempt');
  const u=new URL(callback),expected=new URL(attempt.redirectUri);
  if(u.origin!==expected.origin||u.pathname!==expected.pathname||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>u.searchParams.getAll(k).length!==1)||!same(u.searchParams.get('state'),attempt.state))throw new AuthorizationError('invalid_callback');
  attempt.used=true;
  if(u.searchParams.has('error'))throw new AuthorizationError(u.searchParams.get('error')==='access_denied'?'consent_denied':'authorization_failed');
  const issued=u.searchParams.get('client_id')||attempt.clientId;
  if(!issued||issued==='dynamic_agent_client'||issued.length>300||attempt.registration&&issued!==attempt.clientId)throw new AuthorizationError('invalid_client');
  const code=u.searchParams.get('code');if(!code||code.length>8192)throw new AuthorizationError('invalid_callback');
  // Retain an issued client only in this attempt if code exchange fails. It is
  // not made active until the verified identity is known.
  onIssuedClient(issued);
  const r=await fetchImpl(TOKEN_ENDPOINT,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:issued,code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri,resource:RESOURCE})});
  const t=await readJson(r);if(!r.ok)throw new AuthorizationError(t.error==='invalid_grant'?'invalid_grant':'exchange_failed');
  const claims=await validateIdToken(t.id_token,{clientId:issued,nonce:attempt.nonce,subject:attempt.registration?.subject,fetchImpl,signal,now});
  if(typeof t.scope!=='string')throw new AuthorizationError('invalid_response');
  const permitted=hasPlanScope(t.scope);
  if(permitted&&(typeof t.access_token!=='string'||!t.access_token||String(t.token_type).toLowerCase()!=='bearer'||!Number.isFinite(t.expires_in)||t.expires_in<=0||t.scope.split(/\s+/).includes('offline_access')&&(typeof t.refresh_token!=='string'||!t.refresh_token)))throw new AuthorizationError('invalid_response');
  signal?.throwIfAborted();
  return {app:'Between',schema:1,issuer:ISSUER,client_id:issued,subject:claims.sub,email:typeof claims.email==='string'?claims.email:undefined,workspace:'registration:'+issued,ext_agent_host_id:attempt.hostId,validated:true,grant_status:permitted?'ready':'scope_missing',scope:t.scope,id_token:t.id_token,access_token:permitted?t.access_token:undefined,refresh_token:permitted?t.refresh_token:undefined,expires_at:permitted?now()+t.expires_in*1000:0,saved_at:new Date(now()).toISOString()};
}
