import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {ISSUER,TOKEN_ENDPOINT,AUTHORIZE_ENDPOINT,RESOURCE,SCOPES,createAttempt,exchangeCallback,validateIdToken} from '../plan-oauth-protocol.mjs';
import {openPlanCredentials} from '../plan-credentials.mjs';
import {getHostId,startLogin} from '../plan-oauth.mjs';
import {importGrant} from '../plan-grant-import.mjs';
const checks=[];const ok=(v,n)=>{assert.ok(v,n);checks.push(n)};
const rejected=async(p,code,n)=>{await assert.rejects(p,e=>e.code===code);checks.push(n)};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-key',alg:'RS256',use:'sig'};
let time=1900000000000,mode='success',refreshes=0,exchanges=0,revokeCalls=0,activeAttempt,releaseRefresh;
const now=()=>time;
function jwt(overrides={},header={alg:'RS256',kid:'synthetic-key'}){const h=Buffer.from(JSON.stringify(header)).toString('base64url'),c=Buffer.from(JSON.stringify({iss:ISSUER,aud:'oaiapp_between_test',sub:'test-admin',exp:time/1000+3600,iat:time/1000,nonce:activeAttempt?.nonce,...overrides})).toString('base64url');return h+'.'+c+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+c),privateKey).toString('base64url')}
const fakeFetch=async(url,opts={})=>{
 assert.ok(url.startsWith(ISSUER+'/'),'mock refuses other endpoints');
 if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer:ISSUER,authorization_endpoint:AUTHORIZE_ENDPOINT,token_endpoint:TOKEN_ENDPOINT,jwks_uri:ISSUER+'/.well-known/jwks.json',revocation_endpoint:ISSUER+'/revoke'});
 if(url.endsWith('/jwks.json'))return Response.json({keys:[jwk]});
 if(url.endsWith('/revoke')){revokeCalls++;return new Response(null,{status:mode==='revoke-fail'?503:200})}
 assert.equal(url,TOKEN_ENDPOINT);assert.equal(opts.redirect,'error');const b=opts.body;assert.equal(b.get('resource'),RESOURCE);assert.equal(b.get('client_id'),'oaiapp_between_test');
 if(b.get('grant_type')==='authorization_code'){exchanges++;if(activeAttempt.challenge)assert.equal(createHash('sha256').update(b.get('code_verifier')).digest('base64url'),activeAttempt.challenge);else assert.equal(b.get('code_verifier'),activeAttempt.verifier);assert.equal(b.get('redirect_uri'),activeAttempt.redirectUri);return Response.json({access_token:'fake-access',refresh_token:'fake-refresh',token_type:'Bearer',expires_in:3600,scope:mode==='scope-loss'?'openid':SCOPES,id_token:jwt()})}
 refreshes++;assert.equal(b.get('grant_type'),'refresh_token');assert.equal(b.has('scope'),false);
 if(mode==='refresh-slow')await new Promise(r=>releaseRefresh=r);
 if(['invalid_grant','refresh_token_reused','invalid_client'].includes(mode))return Response.json({error:mode},{status:400});
 if(mode.startsWith('malformed-'))return Response.json(JSON.parse(mode.slice(10)),{status:400});
 if(mode==='transient')return Response.json({error:'temporarily_unavailable'},{status:503});
 return Response.json({access_token:'fake-rotated',refresh_token:'fake-rotated-refresh',token_type:'Bearer',expires_in:3600,...(mode==='scope-loss'?{scope:'openid'}:{})});
};
const temp=await fs.realpath(await fs.mkdtemp('/tmp/between-oauth-offline-'));let owner,helper,other;
try{
 owner=await openPlanCredentials(temp+'/private/grant.json',{fetchImpl:fakeFetch,now});const hostId=await getHostId(owner.credentials.file);ok(hostId===await getHostId(owner.credentials.file),'host identity stable');
 const make=registration=>createAttempt({redirectUri:'http://127.0.0.1:56789/auth/callback',hostId,registration,now});
 activeAttempt=make();const auth=new URL(activeAttempt.authorizationUrl);ok(auth.searchParams.get('client_id')==='dynamic_agent_client'&&auth.searchParams.get('scope')===SCOPES&&auth.searchParams.get('code_challenge_method')==='S256','initial dynamic client + scopes + PKCE');
 await rejected(exchangeCallback(activeAttempt.redirectUri+'?state=wrong',activeAttempt,{fetchImpl:fakeFetch,now}),'invalid_callback','wrong state rejected');ok(!activeAttempt.used&&exchanges===0,'wrong state does not burn attempt or exchange');
 const cb=a=>a.redirectUri+'?'+new URLSearchParams({state:a.state,client_id:'oaiapp_between_test',code:'fake-one-time-code'});
 const saved=await exchangeCallback(cb(activeAttempt),activeAttempt,{fetchImpl:fakeFetch,now});await owner.credentials.save(saved);ok(saved.grant_status==='ready'&&saved.workspace==='registration:oaiapp_between_test','signed identity saved without guessing workspace');
 await rejected(exchangeCallback(cb(activeAttempt),activeAttempt,{fetchImpl:fakeFetch,now}),'expired_attempt','callback single use');
 for(const [overrides,label]of [[{iss:'https://evil.invalid'},'issuer'],[{aud:'other'},'audience'],[{exp:time/1000-10},'expiry'],[{iat:time/1000+20},'future iat'],[{nonce:'wrong'},'nonce'],[{sub:'other'},'subject'],[{aud:['oaiapp_between_test','other']},'multi audience azp']])await rejected(validateIdToken(jwt(overrides),{clientId:saved.client_id,nonce:activeAttempt.nonce,subject:saved.subject,fetchImpl:fakeFetch,now}),'invalid_id_token','reject '+label);
 await rejected(validateIdToken(jwt({},null),{clientId:saved.client_id,fetchImpl:fakeFetch,now}),'invalid_id_token','reject null header');
 await rejected(validateIdToken(jwt({}, {alg:'HS256',kid:'synthetic-key'}),{clientId:saved.client_id,fetchImpl:fakeFetch,now}),'invalid_id_token','reject algorithm confusion');
 activeAttempt=make(saved);ok(new URL(activeAttempt.authorizationUrl).searchParams.get('client_id')===saved.client_id&&!activeAttempt.authorizationUrl.includes('id_token_hint'),'relogin reuses issued client without URL token');
 await rejected(exchangeCallback(activeAttempt.redirectUri+'?'+new URLSearchParams({state:activeAttempt.state,error:'access_denied'}),activeAttempt,{fetchImpl:fakeFetch,now}),'consent_denied','decline without token exchange');
 for(const error of ['invalid_grant','refresh_token_reused','invalid_client']){
  mode=error;await owner.credentials.save({...saved,expires_at:time-1});const before=refreshes,expected=error==='invalid_client'?'configuration_error':'reauthorization_required';await rejected(owner.credentials.getAccessToken(),expected,'terminal refresh '+error);
  const r=await owner.credentials.load();ok(!r.access_token&&!r.refresh_token&&!r.id_token&&r.client_id===saved.client_id,'terminal clears tokens retains registration '+error);
  await owner.close();owner=await openPlanCredentials(temp+'/private/grant.json',{fetchImpl:fakeFetch,now});await rejected(owner.credentials.getAccessToken(),expected,'terminal persists after restart '+error);ok(refreshes===before+1,'no repeated refresh '+error);
 }
 for(const value of ['null','[]','"bad"']){mode='malformed-'+value;await owner.credentials.save({...saved,expires_at:time-1});const count=refreshes;await rejected(owner.credentials.getAccessToken(),'temporarily_unavailable','malformed refresh response '+value);await assert.rejects(owner.credentials.getAccessToken());ok(refreshes===count+1,'malformed response cooldown '+value)}
 mode='scope-loss';await owner.credentials.save({...saved,expires_at:time-1});await rejected(owner.credentials.getAccessToken(),'scope_missing','refresh scope loss blocks');ok(!(await owner.credentials.load()).access_token,'scope loss clears usable token');
 mode='transient';await owner.credentials.save({...saved,expires_at:time-1});const before=refreshes;await rejected(owner.credentials.getAccessToken(),'temporarily_unavailable','503 transient');await rejected(owner.credentials.getAccessToken(),'temporarily_unavailable','cooldown blocks hot loop');ok(refreshes===before+1&&(await owner.credentials.load()).refresh_token===saved.refresh_token,'transient retains credentials');time+=31000;mode='success';await owner.credentials.getAccessToken();ok((await owner.credentials.load()).refresh_token==='fake-rotated-refresh','rotation after cooldown');
 mode='refresh-slow';await owner.credentials.save({...saved,expires_at:time-1});const refresh=owner.credentials.getAccessToken();const denied=assert.rejects(refresh);while(!releaseRefresh)await new Promise(r=>setTimeout(r,1));const logout=owner.credentials.signOut();const closing=owner.close();releaseRefresh();const out=await logout;await denied;await closing;owner=await openPlanCredentials(temp+'/private/grant.json',{fetchImpl:fakeFetch,now});ok(out.remoteRevoked&&(await owner.credentials.load()).grant_status==='signed_out','logout waits refresh and close waits logout');ok(!(await owner.credentials.load()).access_token,'logout cannot resurrect token');
 mode='revoke-fail';await owner.credentials.save(saved);const failed=await owner.credentials.signOut();ok(!failed.remoteRevoked&&!(await owner.credentials.load()).refresh_token,'remote failure still clears local tokens');
 // Loopback browser flow: local HTTP only. fakeFetch owns every official URL.
 mode='success';helper=await startLogin({credentials:owner.credentials,hostId,fetchImpl:fakeFetch,now});let response=await fetch(helper.url,{redirect:'manual'});const cookie=response.headers.get('set-cookie').split(';')[0],origin=new URL(helper.url).origin;
 ok(response.status===303,'ticket exchanges for HttpOnly cookie');response=await fetch(origin+'/auth',{headers:{Cookie:cookie}});const html=await response.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)[1];
 ok((await fetch(origin+'/auth/authorize',{method:'POST',headers:{Cookie:cookie,Origin:'http://evil.invalid'},body:new URLSearchParams({csrf}),redirect:'manual'})).status===403,'reject cross origin login start');
 response=await fetch(origin+'/auth/authorize',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:new URLSearchParams({csrf}),redirect:'manual'});const url=new URL(response.headers.get('location'));ok(response.status===303&&url.origin===ISSUER,'explicit click redirects to official auth');
 // Read nonce/PKCE only from synthetic flow. The mock does not need the secret verifier;
 // assert challenge from submitted verifier instead in this phase.
 activeAttempt={nonce:url.searchParams.get('nonce'),redirectUri:url.searchParams.get('redirect_uri'),challenge:url.searchParams.get('code_challenge')};
 // Actual token exchange mock uses the verifier passed by helper; validate its digest below.
 const count=exchanges;
 // This first callback intentionally has wrong state, so no exchange is expected.
 response=await fetch(origin+'/auth/callback?state=wrong&code=fake',{headers:{Cookie:cookie}});ok(response.status===400&&exchanges===count,'helper wrong state never exchanges');
 response=await fetch(origin+'/auth/callback?'+new URLSearchParams({state:url.searchParams.get('state'),client_id:'oaiapp_between_test',code:'fake-code'}),{headers:{Cookie:cookie}});ok(response.status===200&&(await helper.result).status==='ready','full browser-protocol callback saves verified grant');ok(exchanges===count+1,'one code exchange only');await helper.close();helper=null;
 // Explicit secure transfer preserves receiving host identity.
 activeAttempt=make();mode='success';const fresh=await exchangeCallback(cb(activeAttempt),activeAttempt,{fetchImpl:fakeFetch,now});await owner.credentials.save(fresh);await owner.close();owner=null;
 other=await openPlanCredentials(temp+'/receiver/grant.json',{fetchImpl:fakeFetch,now});const receiverHost=await getHostId(other.credentials.file);await importGrant({source:temp+'/private/grant.json',owner:other,fetchImpl:fakeFetch,now});ok((await other.credentials.load()).ext_agent_host_id===receiverHost&&receiverHost!==hostId,'import validates JWT and preserves VM host identity');
 ok(revokeCalls===2,'only explicitly requested mock revocation');
}finally{await helper?.close();await owner?.close();await other?.close();await fs.rm(temp,{recursive:true,force:true})}
console.log(JSON.stringify({status:'PASS',checks:checks.length,details:checks,network:'only loopback HTTP; all official endpoints mocked; no real tokens/models'},null,2));
