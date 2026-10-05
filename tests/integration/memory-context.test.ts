import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '@between/core/store';
import {fixture} from './memory-fixtures.js';

test('actual SQLite explicitly requested quoted memory survives twenty unrelated turns and restart for a paraphrase',()=>{
 const f=fixture();try{const saved=f.save();for(let i=0;i<20;i++)f.turn('今天处理无关任务编号'+i);f.reopen();const q=f.turn('你还记得我偏爱哪种天气吗？'),context=f.store.context(q.token,{core:'DO_NOT_TRIM'});assert.ok(!JSON.stringify(context.history).includes('我喜欢雨天'));assert.ok(context.memories.some(m=>m.id===saved.id&&m.text==='请记住：我喜欢雨天'&&m.evidence_kind==='user_report'));assert.ok(context.memories.length<=3);assert.equal(context.memory_selection.semantic_quality,'not_measured');assert.equal(context.memory_selection.budget_validation,'unmeasured');assert.equal(context.memory_selection.ranker_enabled,false);assert.deepEqual(context.character,{core:'DO_NOT_TRIM'});assert.equal(context.current_input.text,'你还记得我偏爱哪种天气吗？');}finally{f.store.close();}
});
test('two-character scoped query finds full raw historical evidence but never promotes it to resident',()=>{
 const f=fixture();try{const t=f.turn('我喜欢雨天');f.store.context(t.token,{});const raw=f.store.remember(t.token,t.text,'raw');const rows=f.store.search('雨天');assert.equal(rows.length,1);assert.equal(rows[0].id,raw.result.id);assert.equal(rows[0].record_kind,'raw_quote');assert.equal(rows[0].kind,'history');assert.equal(rows[0].layer,'retrieval');assert.deepEqual(f.store.search('完全不相关的问题'),[]);}finally{f.store.close();}
});
test('oldest literal hit remains retrievable outside a newer candidate subset, with total three and two residents',()=>{
 const f=fixture();try{const first=f.save();for(let i=0;i<35;i++)f.save('我参加了活动编号'+i);const t=f.turn('雨天'),a=f.store.context(t.token,{}),b=f.store.context(t.token,{});assert.ok(a.memories.some(m=>m.id===first.id));assert.ok(a.memories.length<=3);assert.ok(a.memories.filter(m=>m.layer==='resident').length<=2);assert.equal(new Set(a.memories.map(m=>m.id)).size,a.memories.length);assert.deepEqual(a.memories,b.memories);assert.equal(a.memory_selection.state_version,36);}finally{f.store.close();}
});
test('resident rotation is stable per turn, same-millisecond ties, and actual reopen/reauthorization',()=>{
 const f=fixture();try{for(const color of ['红色','蓝色','绿色','黄色','白色'])f.save('我喜欢'+color);const t=f.turn('聊点别的吧'),a=f.store.context(t.token,{});const ids=a.memories.map(m=>m.id);const timestamps=f.store.db.prepare('SELECT id,at FROM memories ORDER BY id').all();assert.deepEqual(f.store.context(t.token,{}).memories.map(m=>m.id),ids);f.reopen();const current=f.store.reauthorize(t.id,t.text,true,t.epoch);assert.deepEqual(f.store.context(current.token,{}).memories.map(m=>m.id),ids);assert.deepEqual(f.store.db.prepare('SELECT id,at FROM memories ORDER BY id').all(),timestamps);const seen=new Set(ids);for(let i=0;i<5;i++){const next=f.turn('继续聊别的'+i);for(const m of f.store.context(next.token,{}).memories)seen.add(m.id);}assert.equal(seen.size,5);}finally{f.store.close();}
});
test('current truth removes invalid source/revised source/future/expired/superseded records despite stale indexes',()=>{
 const f=fixture();try{const records=['雨天','晴天','雪天','阴天','有风的天气'].map(x=>f.save('我喜欢'+x));f.store.db.prepare('UPDATE sources SET valid=0 WHERE id=?').run(records[0].turn.source);f.store.db.prepare('UPDATE sources SET revision=revision+1 WHERE id=?').run(records[1].turn.source);f.store.db.prepare('UPDATE memories SET valid_from=? WHERE id=?').run(f.now()+1,records[2].id);f.store.db.prepare('UPDATE memories SET valid_until=? WHERE id=?').run(f.now(),records[3].id);f.store.db.prepare("UPDATE memories SET status='superseded' WHERE id=?").run(records[4].id);assert.equal((f.store.db.prepare('SELECT count(*) n FROM memory_fts').get() as any).n,5);assert.deepEqual(f.store.search('天气'),[]);}finally{f.store.close();}
});
test('IDs-only optional ranker cannot inject text, unknown or cross-scope rows, and is called once per turn',()=>{
 let ids:unknown=[],calls=0;const f=fixture({candidateRanker:()=>{calls++;return ids;}});let other:Store|undefined;try{const own=f.save('我喜欢蓝色');other=new Store(f.file,f.now,false,'other-synthetic');other.start(true,true,true);const t=other.receive('other','请记住：我喜欢雨天')!;other.context(t.token,{});const foreign=other.rememberStanding(t.token,{quote:t.text,expected_version:0,operation_id:'other-memory'}).result.id;ids=[foreign,'unknown',own.id,own.id];const q=f.turn('无关问题'),before=calls,c=f.store.context(q.token,{});assert.equal(calls,before+1);assert.ok(c.memories.every(m=>m.id===own.id));f.store.context(q.token,{});assert.equal(calls,before+1);for(const bad of [[{id:own.id,text:'INJECTED'}],Array(129).fill(own.id),'not-an-array']){ids=bad;const fresh=f.turn('无关新问题');assert.ok(!JSON.stringify(f.store.context(fresh.token,{})).includes('INJECTED'));}}finally{other?.close();f.store.close();}
});
test('memory off makes every long-memory path empty without ranker invocation, and reopening preserves pre-off stock only',()=>{
 let calls=0;const f=fixture({candidateRanker:()=>{calls++;return [];}});try{const original=f.save(),old=original.turn;f.store.set({memory:'off'});const off=f.turn('OFF_SECRET_SHOULD_NOT_PERSIST'),before=calls;assert.deepEqual(f.store.context(off.token,{}).memories,[]);assert.deepEqual(f.store.search('天气'),[]);assert.equal(calls,before);f.reopen();assert.equal(f.store.controls().memory,'off');assert.ok(!JSON.stringify(f.store.db.prepare('SELECT * FROM sources').all()).includes('OFF_SECRET'));f.store.set({memory:'on'});assert.throws(()=>f.store.rememberStanding(old.token,{...original.input,operation_id:'late'}),/NOT_AUTHORIZED/);const current=f.turn('我偏爱哪种天气？');assert.ok(f.store.context(current.token,{}).memories.some(m=>m.id===original.id));}finally{f.store.close();}
});
test('substring of historical negation remains a nonresident candidate, expires, and cannot revive after thirty-day minimization',()=>{
 const f=fixture();try{const t=f.turn('以前我喜欢雨天，现在不喜欢');f.store.context(t.token,{});const raw=f.store.remember(t.token,'我喜欢雨天','old-fragment');assert.equal(raw.result.status,'needs_review');assert.throws(()=>f.store.rememberStanding(t.token,{quote:'我喜欢雨天',expected_version:f.store.version(),operation_id:'unsafe'}),/UNSUPPORTED_MEMORY_SEMANTICS/);assert.deepEqual(f.store.search('雨天'),[]);f.advance(30*86400000-1);f.store.purge();assert.equal((f.store.db.prepare('SELECT text FROM sources WHERE id=?').get(t.source) as any).text,t.text);f.advance(1);f.store.purge();assert.equal((f.store.db.prepare('SELECT text FROM sources WHERE id=?').get(t.source) as any).text,t.text);f.advance(1);f.store.purge();assert.equal((f.store.db.prepare('SELECT text,revision,evidence_only FROM sources WHERE id=?').get(t.source) as any).text,'');f.reopen();assert.deepEqual(f.store.search('雨天'),[]);assert.equal((f.store.db.prepare('SELECT status,admission_version FROM memories WHERE id=?').get(raw.result.id) as any).admission_version,null);}finally{f.store.close();}
});
test('ordinary and qualified utterances cannot be promoted by a standing tool label alone',()=>{
 const f=fixture();try{for(const text of ['只是不喜欢昨天那首','朋友说她喜欢雨天','小说里我喜欢雨天','如果我喜欢雨天呢？','我猜自己可能有某种疾病','我喜欢雨天，但现在不喜欢','我喜欢雨天，也喜欢晴天']){const t=f.turn(text);f.store.context(t.token,{});assert.throws(()=>f.store.rememberStanding(t.token,{quote:text,expected_version:f.store.version(),operation_id:t.id}),/UNSUPPORTED_MEMORY_SEMANTICS/);}assert.equal((f.store.db.prepare('SELECT count(*) n FROM memories').get() as any).n,0);}finally{f.store.close();}
});
test('later queued source cannot leak into earlier turn context',()=>{
 const f=fixture();try{const early=f.turn('你记得我的天气喜好吗？');f.save();assert.deepEqual(f.store.context(early.token,{}).memories,[]);}finally{f.store.close();}
});
test('record byte sub-budget drops whole optional memories without truncating character, current input or controls',()=>{
 const f=fixture({memoryByteBudget:1});try{f.save();const t=f.turn('我偏爱哪种天气？'+'很长'.repeat(500)),character={core:'core'.repeat(2000)},controls=f.store.controls(),c=f.store.context(t.token,character);assert.deepEqual(c.memories,[]);assert.ok(c.memory_selection.trimmed_records>0);assert.equal(c.current_input.text,t.text);assert.deepEqual(c.character,character);assert.deepEqual(c.controls,controls);assert.equal(c.memory_selection.budget_validation,'unmeasured');}finally{f.store.close();}
});
test('ranker-side invalidation is re-read and a controls change fails authorization rather than returning stale candidates',()=>{
 let action:(()=>void)|undefined;const f=fixture({candidateRanker:(_q,c)=>{action?.();return c.map(x=>x.id);}});try{const first=f.save();action=()=>{f.store.db.prepare('UPDATE sources SET valid=0 WHERE id=?').run(first.turn.source);};let t=f.turn('天气');assert.deepEqual(f.store.context(t.token,{}).memories,[]);action=()=>f.store.set({memory:'off'});t=f.turn('天气');assert.throws(()=>f.store.context(t.token,{}),/NOT_AUTHORIZED/);}finally{f.store.close();}
});


test('ordinary preference paraphrase remains an explicitly documented semantic-admission gap',()=>{
 const f=fixture();try{const t=f.turn('我喜欢雨天');f.store.context(t.token,{});f.store.remember(t.token,t.text,'ordinary-quote');for(let i=0;i<20;i++)f.turn('无关任务'+i);f.reopen();const q=f.turn('你还记得我偏爱哪种天气吗？');const c=f.store.context(q.token,{});assert.deepEqual(c.memories,[]);assert.equal(c.memory_selection.semantic_quality,'not_measured');assert.equal(f.store.search('雨天').length,1);}finally{f.store.close();}
});
test('generic proposals persist only exact source text with an unverified kind and expire within four hours',()=>{
 const f=fixture();try{const t=f.turn('我喜欢在周末做陶艺');f.store.context(t.token,{});const r=f.store.rememberProposed(t.token,{quote:t.text,proposed_kind:'preference',expected_version:0,operation_id:'proposal'});let row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(r.result.id) as any;assert.equal(row.status,'needs_review');assert.equal(row.text,t.text);assert.equal(row.projection_json,null);assert.equal(row.valid_until,f.now()+4*3600000);assert.deepEqual(f.store.search('陶艺'),[]);f.advance(4*3600000);f.store.purge();row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(r.result.id) as any;assert.equal(row.status,'invalid');assert.equal(row.text,'');assert.equal(row.evidence_text,'');assert.equal((f.store.db.prepare('SELECT count(*) n FROM memory_fts WHERE id=?').get(r.result.id) as any).n,0);}finally{f.store.close();}
});
test('generic explicit save admission preserves qualified complete quotations without extracting current facts',()=>{
 const f=fixture();try{for(const text of ['每周三我参加陶艺课','朋友说她喜欢雨天','以前我喜欢雨天，现在不喜欢','如果有空，我想学西班牙语']){const x=f.save(text);const row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(x.id) as any;assert.equal(row.kind,'history');assert.equal(row.projection_json,null);assert.equal(row.text,'请记住：'+text);}const q=f.turn('聊其他事情');const c=f.store.context(q.token,{});assert.ok(c.memories.length<=2);for(const m of c.memories){assert.equal(m.interpretation,'quoted_self_report_only');assert.equal(m.subject,null);assert.equal(m.object,null);assert.equal(m.condition,null);}}finally{f.store.close();}
});

test('pausing or switching memory off clears pending proposal bodies; old receipts cannot reactivate them',()=>{
 for(const change of [{role:'paused' as const},{memory:'off' as const}]){const f=fixture();try{const t=f.turn('也许周末可以去徒步');f.store.context(t.token,{});const input={quote:t.text,proposed_kind:'history' as const,expected_version:f.store.version(),operation_id:'proposal'};const r=f.store.rememberProposed(t.token,input);f.store.set(change);const row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(r.result.id) as any;assert.equal(row.status,'invalid');assert.equal(row.text,'');assert.equal(row.evidence_text,'');assert.throws(()=>f.store.rememberProposed(t.token,input),/NOT_AUTHORIZED/);f.store.set({role:'active',memory:'on'});assert.ok(!f.store.search('徒步').some(m=>m.id===r.result.id));}finally{f.store.close();}}
});

test('same-source identical raw and admitted quotation use one slot without implicit latest-wins across distinct reports',()=>{
 const f=fixture();try{const first=f.save('我喜欢早起');f.store.remember(first.turn.token,first.turn.text,'also-raw');assert.equal(f.store.search('早起').filter(m=>m.source===first.turn.source).length,1);const second=f.save('我喜欢晚睡');const rows=f.store.search('我喜欢');assert.ok(rows.some(m=>m.id===first.id));assert.ok(rows.some(m=>m.id===second.id));assert.equal((f.store.db.prepare("SELECT count(*) n FROM memories WHERE status='active'").get() as any).n,3);}finally{f.store.close();}
});

test('memory byte sub-budget rejects nonfinite, fractional, negative and excessive trusted configuration',()=>{
 const f=fixture();try{for(const budget of [NaN,Infinity,-1,0.5,6145])assert.throws(()=>new Store(f.file,f.now,false,f.store.scope,{memoryByteBudget:budget}),/MEMORY_BUDGET_INVALID/);}finally{f.store.close();}
});

test('SQL candidate reads stay bounded before materialization, including a 128-record optional corpus',()=>{
 let armed=false,corpusSize=0;const f=fixture({candidateRanker:(_q,c)=>{if(armed)corpusSize=c.length;return c.map(x=>x.id);}});try{for(let i=0;i<140;i++)f.save('通用活动编号'+i);armed=true;const seen:{sql:string;size:number}[]=[],original=f.store.db.prepare.bind(f.store.db);(f.store.db as any).prepare=(sql:string)=>{const statement=original(sql);if(!/FROM memories m/u.test(sql))return statement;return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key);if(key==='all')return (...args:unknown[])=>{const rows=(value as Function).apply(target,args);seen.push({sql,size:rows.length});return rows;};return typeof value==='function'?value.bind(target):value;}});};const t=f.turn('无关内容'),context=f.store.context(t.token,{});assert.equal(corpusSize,128);assert.ok(context.memories.length<=3);assert.ok(seen.length>0);for(const read of seen){assert.ok(/LIMIT|m\.id IN/u.test(read.sql),read.sql);assert.ok(read.size<=128);}f.store.db.prepare=original as typeof f.store.db.prepare;}finally{f.store.close();}
});

test('optional ranker cache is body-free, count-bounded, and cleared by end, expiry, off, deletion and close',()=>{
 const f=fixture({candidateRanker:()=>[]});try{for(let i=0;i<130;i++){const t=f.turn('CACHE_SYNTHETIC_SECRET_'+i);f.store.context(t.token,{});}let cache=(f.store as any).rankerCache as Map<string,unknown>;assert.equal(cache.size,128);assert.ok(!JSON.stringify([...cache]).includes('CACHE_SYNTHETIC_SECRET'));const t=f.turn('end-this-turn');f.store.context(t.token,{});f.store.end(t,t.id,'done');assert.equal(cache.has(t.id),false);f.advance(600001);f.store.purge();assert.equal(cache.size,0);const u=f.turn('after-expiry-secret');f.store.context(u.token,{});assert.equal(cache.size,1);f.store.set({memory:'off'});assert.equal(cache.size,0);f.store.set({memory:'on'});const v=f.turn('before-delete-secret');f.store.context(v.token,{});const plan=f.store.planDeletion(f.store.scope);assert.equal(cache.size,0);f.store.confirmDeletion(f.store.scope,plan.plan_id,plan.digest,plan.confirmation_token);f.store.clearRelationshipRecords();f.store.verifyRelationshipErased();assert.equal(cache.size,0);}finally{f.store.close();assert.equal((f.store as any).rankerCache.size,0);}
});
test('invalidated or revised source evidence is excluded from context history immediately, while UI history remains authentic',()=>{
 const f=fixture();try{const invalid=f.save('旧的失效陈述'),edited=f.save('修订前的陈述');f.store.db.prepare('UPDATE sources SET valid=0 WHERE id=?').run(invalid.turn.source);f.store.db.prepare("UPDATE sources SET revision=2,text='修订后的真实源文本' WHERE id=?").run(edited.turn.source);const current=f.turn('继续聊天'),c=f.store.context(current.token,{});assert.ok(!c.history.some(m=>m.text===invalid.turn.text||m.text===edited.turn.text));assert.ok(f.store.history().some(m=>m.text===invalid.turn.text));assert.ok(f.store.history().some(m=>m.text===edited.turn.text));assert.ok(!c.memories.some(m=>m.id===invalid.id||m.id===edited.id));f.advance(30*86400000+1);f.store.purge();for(const id of [invalid.id,edited.id]){const row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(id) as any;assert.equal(row.status,'invalid');assert.equal(row.text,'');}assert.ok(!JSON.stringify(f.store.db.prepare('SELECT text FROM sources').all()).includes('修订前'));f.reopen();assert.deepEqual(f.store.search('陈述'),[]);}finally{f.store.close();}
});

test('raw-fragment candidates expire within four hours and cached receipt readback never restores their body',()=>{
 const f=fixture();try{const t=f.turn('以前我喜欢这首歌，现在不喜欢了');f.store.context(t.token,{});const quote='我喜欢这首歌',original=f.store.remember(t.token,quote,'partial');const row=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(original.result.id) as any;assert.equal(row.valid_until,f.now()+4*3600000);f.advance(4*3600000);f.store.purge();const updated=f.store.db.prepare('SELECT * FROM memories WHERE id=?').get(original.result.id) as any;assert.equal(updated.status,'invalid');assert.equal(updated.text,'');assert.equal(updated.evidence_text,'');const current=f.store.reauthorize(t.id,t.text,true,t.epoch);f.store.context(current.token,{});const retry=f.store.remember(current.token,quote,'partial');assert.deepEqual(retry.result,original.result);assert.equal(retry.readback_memory?.status,'invalid');assert.throws(()=>f.store.remember(current.token,quote,'new-operation'),/STALE_REVISION/);}finally{f.store.close();}
});

// Context reads also write the grant/audit. Reserve the SQLite writer before
// reading authorization so an overlapping maintenance commit cannot invalidate
// a deferred read snapshot during its later write upgrade.
test('context waits for a concurrent SQLite writer and checks the committed authorization state', {timeout:10000}, async()=>{
 const {Worker}=await import('node:worker_threads');
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 for(const revoke of [false,true]){
  const f=fixture();let worker:InstanceType<typeof Worker>|undefined;let exited:Promise<void>|undefined;
  try{
   const turn=f.turn('SYNTHETIC_CONTEXT_WRITER_CONTENTION');
   const state=new SharedArrayBuffer(4),signal=new Int32Array(state);
   worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const Database=require(workerData.module),db=new Database(workerData.file);
    const signal=new Int32Array(workerData.state);
    try{
     db.exec('BEGIN IMMEDIATE');
     db.prepare(workerData.revoke?'UPDATE grants SET active=0':'UPDATE grants SET read_context=read_context').run();
     parentPort.postMessage('writer-locked');
     if(Atomics.wait(signal,0,0,5000)==='timed-out')throw Error('Context did not start');
     Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);
     db.exec('COMMIT');
    }finally{db.close();}
   `,{eval:true,workerData:{module:require.resolve('better-sqlite3'),file:f.store.file,state,revoke}});
   exited=new Promise<void>((resolve,reject)=>{worker!.once('error',reject);worker!.once('exit',code=>code===0?resolve():reject(Error(`SQLite writer exited ${code}`)));});
   // Attach a rejection handler immediately, then propagate it in finally.
   void exited.catch(()=>{});
   await new Promise<void>((resolve,reject)=>{worker!.once('message',message=>message==='writer-locked'?resolve():reject(Error('Unexpected writer barrier')));worker!.once('error',reject);});
   Atomics.store(signal,0,1);Atomics.notify(signal,0);
   if(revoke){
    assert.throws(()=>f.store.context(turn.token,{}),/NOT_AUTHORIZED/);
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM tool_audit').get() as {n:number}).n,0);
   }else{
    assert.equal(f.store.context(turn.token,{}).current_input.text,turn.text);
    assert.equal((f.store.db.prepare('SELECT count(*) n FROM tool_audit').get() as {n:number}).n,1);
   }
  }finally{try{if(exited)await exited;}finally{await worker?.terminate();f.store.close();}}
 }
});
