import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {openPlanCredentials} from '../plan-credentials.mjs';
import {getHostId,startLogin} from '../plan-oauth.mjs';
import {ISSUER,TOKEN_ENDPOINT,AUTHORIZE_ENDPOINT,SCOPES} from '../plan-oauth-protocol.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=await fs.mkdtemp('/tmp/between-oauth-browser-');let browser,owner,helper,authUrl,exchanges=0;const errors=[],requests=[];
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...publicKey.export({format:'jwk'}),kid:'test'};
const fakeFetch=async(url,o={})=>{
 if(url===ISSUER+'/.well-known/openid-configuration')return Response.json({issuer:ISSUER,authorization_endpoint:AUTHORIZE_ENDPOINT,token_endpoint:TOKEN_ENDPOINT,jwks_uri:ISSUER+'/.well-known/jwks.json'});
 if(url===ISSUER+'/.well-known/jwks.json')return Response.json({keys:[jwk]});
 assert.equal(url,TOKEN_ENDPOINT);assert.equal(o.body.get('redirect_uri'),authUrl.searchParams.get('redirect_uri'));assert.equal(createHash('sha256').update(o.body.get('code_verifier')).digest('base64url'),authUrl.searchParams.get('code_challenge'));exchanges++;
 const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url'),c=Buffer.from(JSON.stringify({iss:ISSUER,aud:'oaiapp_browser_fake',sub:'fake-admin',nonce:authUrl.searchParams.get('nonce'),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return Response.json({id_token:h+'.'+c+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+c),privateKey).toString('base64url'),access_token:'fake-browser-token',refresh_token:'fake-browser-refresh',token_type:'Bearer',expires_in:3600,scope:SCOPES});
};
try{
 owner=await openPlanCredentials(root+'/private/grant.json',{fetchImpl:fakeFetch});helper=await startLogin({credentials:owner.credentials,hostId:await getHostId(owner.credentials.file),fetchImpl:fakeFetch});
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true});const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 const origin=new URL(helper.url).origin;
 const cdp=await context.newCDPSession(page);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 cdp.on('Fetch.requestPaused',async event=>{const u=new URL(event.request.url);if(u.origin===origin)return cdp.send('Fetch.continueRequest',{requestId:event.requestId});if(u.origin===ISSUER&&u.pathname==='/api/accounts/authorize'){authUrl=u;requests.push('mocked-official-authorize');return cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<title>Synthetic authorization</title><link rel="icon" href="data:,"><p>Offline fixture. No real authorization.</p>').toString('base64')})}requests.push('blocked-unexpected-origin');return cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'})});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(helper.url);assert.equal(exchanges,0);assert.ok((await context.cookies()).some(c=>c.name==='between_oauth'&&c.httpOnly&&c.sameSite==='Lax'));
 await Promise.all([page.waitForURL(ISSUER+'/**'),page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click()]);assert.ok(authUrl);assert.equal(exchanges,0);
 await page.goto(authUrl.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:authUrl.searchParams.get('state'),client_id:'oaiapp_browser_fake',code:'fake-browser-code'}));
 assert.equal((await helper.result).status,'ready');assert.equal(exchanges,1);assert.ok((await page.textContent('body')).includes('授权已安全保存'));assert.deepEqual(errors,[]);assert.deepEqual(requests,['mocked-official-authorize']);
 console.log(JSON.stringify({status:'PASS',sandbox:true,checks:['HttpOnly SameSite cookie','no automatic exchange','CSP allows explicit official redirect','official page fully intercepted','cross-site callback cookie and state','PKCE exact redirect','verified grant saved','no browser errors'],actualExternalRequests:0},null,2));
}finally{await browser?.close();await helper?.close();await owner?.close();await fs.rm(root,{recursive:true,force:true})}
