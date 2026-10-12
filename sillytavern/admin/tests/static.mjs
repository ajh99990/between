import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {serveAdmin} from '../../engine/app/admin-static.mjs';
let checks=0;
async function call(pathname,method='GET'){const headers={};let body;const handled=await serveAdmin({method},{setHeader(k,v){headers[k]=v},end(x){body=String(x)}},pathname);return {headers,body,handled}}
const a=await call('/admin'),b=await call('/admin/');assert.equal(a.handled,true);checks++;
const nonce=a.body.match(/name="csp-nonce" content="([^"]+)"/)[1];assert(a.headers['Content-Security-Policy'].includes(`'nonce-${nonce}'`));assert(!a.headers['Content-Security-Policy'].includes("script-src 'unsafe-inline'"));checks++;
assert.notEqual(a.body,b.body);checks++;
const scripts=[...a.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);assert(scripts.length>0);
for(const url of scripts){const r=await call(url);assert.match(r.headers['Content-Type'],/javascript/);assert(r.body.length>100);checks++}
for(const p of ['/admin/%2e%2e/engine/app/server.mjs','/admin/%2Fetc%2Fpasswd','/admin/%00.js','/admin/%ZZ.js','/admin/.env','/admin/nonexistent.js','/admin/../index.html']){await assert.rejects(call(p),e=>e.status===404);checks++}
await assert.rejects(call('/admin','POST'),e=>e.status===405);checks++;
assert.equal((await call('/api/admin/state')).handled,false);checks++;
for(const name of await fs.readdir(new URL('../dist/',import.meta.url))){if(name.endsWith('.css')){assert.match((await call('/admin/'+name)).headers['Content-Type'],/text\/css/);checks++}}
console.log(JSON.stringify({status:'PASS',checks,scope:'built assets, traversal guards, nonce policy; no external network'}));
