import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,symlinkSync,existsSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {readVerifiedContent} from '@between/host-qwen/verified-read';
import {Client} from '@modelcontextprotocol/client';import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';import {Store} from '@between/core/store';
test('官方SDK真实stdio握手/工具/schema/来源/旧grant拒绝（无模型）',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'relationship-mcp-'));const s=new Store(path.join(dir,'state.db'));s.start(true,true,true);const t=s.receive(crypto.randomUUID(),'我喜欢雨天')!;
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp-server/dist/trusted-stdio.js')],env:{PATH:process.env.PATH||'',REL_DB:s.file,REL_CHARACTER_JSON:readFileSync('characters/alan.json','utf8'),REL_CHARACTER_SHA256:createHash('sha256').update(readFileSync('characters/alan.json')).digest('hex'),REL_GRANT:t.token,REL_SCOPE:s.scope},stderr:'pipe'});
 const client=new Client({name:'contract-test',version:'1.0.0'});await client.connect(transport);
 try{const list=await client.listTools();assert.deepEqual(list.tools.map(x=>x.name).sort(),['read_context','remember_user_report']);
 const context:any=await client.callTool({name:'read_context',arguments:{}});assert.equal(context.isError,undefined);const value=JSON.parse(context.content[0].text);assert.equal(value.schema_version,1);assert.equal(value.current_input.text,'我喜欢雨天');assert.equal(value.character.identity.name,'阿岚');assert.ok(!JSON.stringify(value.character).includes('deeper'));
 const memory:any=await client.callTool({name:'remember_user_report',arguments:{quote:'我喜欢雨天',operation_id:t.id+':memory'}});assert.ok(!memory.isError);assert.equal((s.db.prepare('select count(*) n from memories').get() as any).n,1);
 const extra:any=await client.callTool({name:'read_context',arguments:{relationship_id:'other'}});assert.equal(extra.isError,true);
 s.end(t,'unused','done');const stale:any=await client.callTool({name:'read_context',arguments:{}});assert.equal(stale.isError,true);assert.match(stale.content[0].text,/NOT_AUTHORIZED/);
 }finally{await client.close();s.close();}
});

test('actual MCP process consumes verified character snapshot after source symlink replacement',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'mcp-character-race-')),file=path.join(dir,'character.json'),outside=path.join(mkdtempSync(path.join(os.tmpdir(),'outside-character-')),'private.json');
 writeFileSync(file,readFileSync('characters/alan.json'));writeFileSync(outside,JSON.stringify({secret:'SYNTHETIC_OUTSIDE_CANARY'}));
 const bytes=await readVerifiedContent(dir,file),hash=createHash('sha256').update(bytes).digest('hex');unlinkSync(file);symlinkSync(outside,file);
 const store=new Store(path.join(dir,'state.db'));store.start(true,true,true);const turn=store.receive(crypto.randomUUID(),'SYNTHETIC snapshot')!;
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('packages/mcp-server/dist/trusted-stdio.js')],env:{REL_DB:store.file,REL_GRANT:turn.token,REL_SCOPE:store.scope,REL_CHARACTER_JSON:bytes.toString('utf8'),REL_CHARACTER_SHA256:hash,REL_CHARACTER:file},stderr:'pipe'}),client=new Client({name:'snapshot-race-test',version:'1'});
 try{await client.connect(transport);const result:any=await client.callTool({name:'read_context',arguments:{}});assert.ok(!result.isError);assert.equal(JSON.parse(result.content[0].text).character.identity.name,'阿岚');assert.ok(!JSON.stringify(result).includes('SYNTHETIC_OUTSIDE_CANARY'));}finally{await client.close();store.close();}
});
test('MCP snapshot hash mismatch fails before creating/opening business database',async()=>{const dir=mkdtempSync(path.join(os.tmpdir(),'mcp-snapshot-invalid-')),db=path.join(dir,'must-not-exist.db');const child=spawn(process.execPath,[path.resolve('packages/mcp-server/dist/trusted-stdio.js')],{env:{REL_DB:db,REL_GRANT:'SYNTHETIC',REL_SCOPE:'fixture',REL_CHARACTER_JSON:'{}',REL_CHARACTER_SHA256:'0'.repeat(64)},stdio:['ignore','ignore','ignore']});const code=await new Promise<number|null>(resolve=>child.once('exit',resolve));assert.equal(code,1);assert.equal(existsSync(db),false);});
