// Independent checks of the fixed, local-only community importer.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {manifest,importCommunity,parseCard} from '../community.mjs';
const checks=[];const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const base=new URL('../community/',import.meta.url);
for(const [i,item] of manifest.files.entries()){
 const bytes=await fs.readFile(new URL(item.file,base));assert.equal(digest(bytes),item.sha256);assert.equal(bytes.length,item.bytes);
 assert.equal(digest(Buffer.concat([bytes,Buffer.from('\n')])),item.researchSha256);assert.equal(bytes.length+1,item.researchBytes);
 const converted=await importCommunity(item.id),original=JSON.parse(bytes).data;
 assert.equal(converted.book.entries.length,[5,7,4,9][i]);assert.deepEqual(converted.role.bookIds,[converted.book.id]);
 assert.equal(converted.role.detail,original.description);assert.equal(converted.role.greeting,original.first_mes);
 checks.push(item.id+'-raw-hash-lf-equivalence-and-complete-book');
}
assert.equal(digest(await fs.readFile(new URL('LICENSE-CONTENT.txt',base))),manifest.licenseSha256);checks.push('packaged-license-hash');
const license=await fs.readFile(new URL('LICENSE-CONTENT.txt',base));
assert.equal(digest(Buffer.concat([license,Buffer.from('\n')])),manifest.licenseResearchSha256);checks.push('license-terminal-lf-equivalence');
await assert.rejects(importCommunity('https://example.invalid/card.json'));await assert.rejects(importCommunity('../peiyu'));checks.push('non-allowlisted-url-and-path-rejected');
assert.throws(()=>parseCard(Buffer.from('{"__proto__":{}}'),'test'),/危险JSON属性/);checks.push('prototype-key-rejected');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-independent-'));
const app=await createApp({root,port:0,demo:true,adminPassword:'synthetic-password-123'});const admin={},user={};
async function call(w,p,method='GET',body,extra={}){
 const r=await fetch(app.url+p,{method,headers:{Origin:app.url,Cookie:w.cookie||'','X-CSRF-Token':w.csrf||'','Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie'))w.cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};
}
try{
 user.csrf=(await call(user,'/api/session','POST',{})).data.csrf;
 assert.equal((await call(user,'/api/admin/community/import','POST',{id:'peiyu',confirm:true,expectedVersion:1})).status,401);checks.push('user-cannot-import');
 admin.csrf=(await call(admin,'/api/admin/login','POST',{password:'synthetic-password-123'})).data.csrf;
 let c=(await call(admin,'/api/admin/state')).data.config;
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'peiyu',confirm:true,expectedVersion:c.version},{'X-CSRF-Token':user.csrf})).status,403);checks.push('import-admin-csrf');
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'peiyu',expectedVersion:c.version})).status,409);checks.push('import-requires-confirmation');
 const existing=await call(user,'/api/conversations','POST',{role:'mira'});
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'peiyu',confirm:true,expectedVersion:c.version})).status,201);
 assert.deepEqual((await call(user,'/api/conversations/'+existing.data.id)).data.chat,existing.data.chat);checks.push('import-does-not-change-existing-conversation');
 const created=await call(user,'/api/conversations','POST',{role:'community-peiyu'});assert.equal(created.status,201);assert.equal(created.data.character,'裴聿');checks.push('import-available-to-new-conversation');
 const stripped=(await call(admin,'/api/admin/state')).data.config;delete stripped.roles.find(r=>r.id==='community-peiyu').source;
 assert.equal((await call(admin,'/api/admin/config','PUT',{confirm:true,expectedVersion:stripped.version,config:stripped})).status,400);checks.push('existing-community-attribution-cannot-be-stripped');
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'tangtuantuan',confirm:true,expectedVersion:c.version})).status,409);checks.push('import-version-conflict');
 c=(await call(admin,'/api/admin/state')).data.config;c.roles=c.roles.filter(r=>r.id!=='community-peiyu');c.books.find(b=>b.id==='community-peiyu-world').entries[0].content='LOCAL_EDIT_MARKER';
 assert.equal((await call(admin,'/api/admin/config','PUT',{confirm:true,expectedVersion:c.version,config:c})).status,200);
 c=(await call(admin,'/api/admin/state')).data.config;
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'peiyu',confirm:true,expectedVersion:c.version})).status,409);
 const after=(await call(admin,'/api/admin/state')).data.config;assert.deepEqual(after,c);checks.push('book-id-collision-rejected-without-mutation');
 while(c.books.length<100)c.books.push({id:'synthetic-'+c.books.length,name:'Synthetic book',keys:[],content:''});
 assert.equal((await call(admin,'/api/admin/config','PUT',{confirm:true,expectedVersion:c.version,config:c})).status,200);c=(await call(admin,'/api/admin/state')).data.config;
 assert.equal((await call(admin,'/api/admin/community/import','POST',{id:'tangtuantuan',confirm:true,expectedVersion:c.version})).status,400);checks.push('import-book-capacity-limit');
 const result={status:'PASS',checks,scope:'Fixed local files and synthetic API requests; no external fetch, model, or browser; HTML sink review is static and not counted here'};
 console.log(JSON.stringify(result,null,2));if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
}finally{await app.close();await fs.rm(root,{recursive:true,force:true});}
