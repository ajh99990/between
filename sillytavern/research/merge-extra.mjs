import fs from 'node:fs';import {cases} from './fixtures.mjs';
const root='/workspace/st-research/evidence',label=process.argv[2];const prior=JSON.parse(fs.readFileSync(`${root}/${label}-14.json`)),extra=JSON.parse(fs.readFileSync(`${root}/${label}-subset.json`));
const map=new Map([...prior,...extra].map(x=>[x.id,x]));const result=cases.map(x=>map.get(x.id));if(result.some(x=>!x))throw new Error('Missing fixture');fs.writeFileSync(`${root}/${label}.json`,JSON.stringify(result,null,2));console.log('Merged independently executed fixture evidence',label,result.length);
