import fs from 'node:fs';import assert from 'node:assert/strict';import {cases} from './fixtures.mjs';
const root='/workspace/st-research/evidence',label=process.argv[2]||'stage1';const a=JSON.parse(fs.readFileSync(`${root}/baseline.json`)),b=JSON.parse(fs.readFileSync(`${root}/${label}.json`));
const project=xs=>xs.map(({id,captured,chat,fields})=>({id,captured,chat,fields}));assert.deepEqual(project(b),project(a));
for(const item of b){const f=cases.find(x=>x.id===item.id);const text=item.captured[0].messages.map(x=>x.content).join('\n');for(const x of f.has||[])assert.ok(text.includes(x));for(const x of f.absent||[])assert.ok(!text.includes(x));assert.equal(item.errors.length,0);}
console.log('DIFFERENTIAL PASS',label,b.length,'fixtures; exact provider JSON, normalized chat, character fields; all semantic assertions PASS');
