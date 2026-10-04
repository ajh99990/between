import {readFileSync,mkdirSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[archiveArg,outputArg]=process.argv.slice(2);
if(!archiveArg||!outputArg)throw Error('Pass verified upstream archive and a NEW output parent');
const archive=path.resolve(archiveArg),out=path.resolve(outputArg),lock=JSON.parse(readFileSync(path.join(repo,'upstream/qwen-code.lock.json'),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(readFileSync(archive))!==lock.archive_sha256)throw Error('UPSTREAM_ARCHIVE_HASH_MISMATCH');if(existsSync(out))throw Error('OUTPUT_MUST_NOT_EXIST');
const manifestPath=path.join(repo,lock.source_manifest);if(sha(readFileSync(manifestPath))!==lock.source_manifest_sha256)throw Error('SOURCE_MANIFEST_HASH_MISMATCH');
for(const item of lock.patches)if(sha(readFileSync(path.join(repo,item.path)))!==item.sha256)throw Error('PATCH_HASH_MISMATCH');
mkdirSync(out,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',out],{stdio:'inherit'});const source=path.join(out,'qwen-code-0.24.7');
for(const item of lock.patches){const patch=path.join(repo,item.path);execFileSync('git',['apply','--check','--directory=qwen-code-0.24.7',patch],{cwd:out,stdio:'inherit'});execFileSync('git',['apply','--directory=qwen-code-0.24.7',patch],{cwd:out,stdio:'inherit'});}
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));for(const item of manifest.files)if(sha(readFileSync(path.join(source,item.path)))!==item.sha256)throw Error('PATCHED_SOURCE_HASH_MISMATCH:'+item.path);
console.log(JSON.stringify({source,upstream:lock.commit,patched_files_verified:manifest.files.length,build_run:false}));
