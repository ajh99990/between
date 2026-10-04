import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '@between/core/store';

function fixture(){const store=new Store(path.join(mkdtempSync(path.join(os.tmpdir(),'operation-binding-')),'state.db'));store.start(true,true,true);return store;}
test('operation replay requires current turn context before returning any cached result',()=>{
 const s=fixture();try {const first=s.receive('first','SYNTHETIC same quote')!;s.context(first.token,{});s.remember(first.token,'same quote','shared-operation');
 const second=s.receive('second','SYNTHETIC same quote')!;
 assert.throws(()=>s.remember(second.token,'same quote','shared-operation'),/CONTEXT_REQUIRED/);
 assert.equal((s.db.prepare('SELECT count(*) n FROM operations WHERE turn_id=?').get('second') as {n:number}).n,0);
 } finally{s.close();}
});
test('same operation ID cannot cross a turn/source even after current context was read',()=>{
 const s=fixture();try {const first=s.receive('first','SYNTHETIC same quote')!;s.context(first.token,{});const result=s.remember(first.token,'same quote','shared-operation');
 assert.deepEqual(s.remember(first.token,'same quote','shared-operation'),result);
 const second=s.receive('second','SYNTHETIC same quote')!;s.context(second.token,{});
 assert.throws(()=>s.remember(second.token,'same quote','shared-operation'),/OPERATION_CONFLICT/);
 assert.equal(s.version(),1);
 } finally{s.close();}
});
test('cached operation cannot return a source invalidated after commit',()=>{
 const s=fixture();try {const t=s.receive('first','SYNTHETIC same quote')!;s.context(t.token,{});s.remember(t.token,'same quote','shared-operation');
 s.db.prepare('UPDATE sources SET valid=0 WHERE id=?').run(t.source);
 assert.throws(()=>s.remember(t.token,'same quote','shared-operation'),/INVALID_SOURCE/);
 } finally{s.close();}
});
test('second business owner cannot revoke current grants or recover a live process',()=>{const s=fixture();try{const t=s.receive('live','SYNTHETIC live')!;s.context(t.token,{});assert.throws(()=>new Store(s.file),/DATABASE_ALREADY_OPEN/);assert.doesNotThrow(()=>s.authorize(t.token));const mcp=new Store(s.file,()=>Date.now(),false,s.scope);try{assert.doesNotThrow(()=>mcp.authorize(t.token));}finally{mcp.close();}}finally{s.close();}});
