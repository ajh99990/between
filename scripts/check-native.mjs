import assert from 'node:assert/strict';import Database from 'better-sqlite3';
const db=new Database(':memory:');let sqlite;
try{db.exec('CREATE TABLE native_gate(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');db.transaction(()=>db.prepare('INSERT INTO native_gate(value) VALUES(?)').run('SYNTHETIC_NATIVE_GATE'))();assert.equal(db.prepare('SELECT value FROM native_gate').get().value,'SYNTHETIC_NATIVE_GATE');sqlite=db.prepare('SELECT sqlite_version() version').get().version;}finally{db.close();}
const natives=process.report.getReport().sharedObjects.filter(x=>x.endsWith('.node')&&x.includes('better-sqlite3'));
assert.ok(natives.length>0,'SQLite native binary was not loaded');assert.ok(natives.every(x=>x.replaceAll('\\','/').includes('/prebuilds/')),'only official package prebuild path is accepted');
console.log(JSON.stringify({status:'passed',node:process.version,abi:process.versions.modules,sqlite,platform:process.platform,arch:process.arch,native_prebuilds:natives.map(x=>x.slice(x.lastIndexOf('/prebuilds/'))),sqlite_loaded_in_electron:false}));
