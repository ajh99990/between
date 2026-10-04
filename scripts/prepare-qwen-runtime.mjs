import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const [rootArg,outputArg,appArg]=process.argv.slice(2);
if(!rootArg||!outputArg)throw Error('Usage: node prepare-runtime.mjs <built Qwen root> <new output directory> [app root]');
const root=realpathSync(rootArg),output=path.resolve(outputArg),appRoot=path.resolve(appArg||path.join(here,'..'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const repository=path.resolve(here,'..'),lock=JSON.parse(readFileSync(path.join(repository,'upstream/qwen-code.lock.json'),'utf8'));
const sourceBytes=readFileSync(path.join(repository,lock.source_manifest));
if(sha(sourceBytes)!==lock.source_manifest_sha256)throw Error('SOURCE_MANIFEST_HASH_MISMATCH');
const source=JSON.parse(sourceBytes);
for(const item of source.files){const file=path.join(root,item.path);if(lstatSync(file).isSymbolicLink()||!realpathSync(file).startsWith(root+path.sep)||sha(readFileSync(file))!==item.sha256)throw Error('SOURCE_MANIFEST_MISMATCH: '+item.path);}
const manifest={};
for(const directory of ['dist','packages/sdk-typescript/dist']){
 const files=[];function visit(dir){for(const name of readdirSync(dir).sort()){const file=path.join(dir,name),stat=lstatSync(file);if(stat.isSymbolicLink())throw Error('RUNTIME_SYMLINK_DENIED');if(stat.isDirectory())visit(file);else if(stat.isFile()){const bytes=readFileSync(file);files.push({path:path.relative(root,file).split(path.sep).join('/'),bytes:bytes.length,sha256:sha(bytes)});}else throw Error('RUNTIME_FILE_TYPE_DENIED');}}
 visit(path.join(root,directory));manifest[directory]=files;
}
mkdirSync(output,{recursive:true});const manifestPath=path.join(output,'runtime-manifest.json');
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const config={provider:'openai',runtimeRootPath:root,runtimeManifestPath:manifestPath,runtimeManifestSha256:sha(readFileSync(manifestPath)),sdkModulePath:path.join(root,'packages/sdk-typescript/dist/index.mjs'),cliPath:path.join(root,'dist/cli.js'),sdkSha256:sha(readFileSync(path.join(root,'packages/sdk-typescript/dist/index.mjs'))),cliSha256:sha(readFileSync(path.join(root,'dist/cli.js'))),providerEnvironment:[]};
const {verifyManagedRuntime}=await import(pathToFileURL(path.join(appRoot,'packages/host-qwen/dist/qwen-adapter.js')).href);
const verification=await verifyManagedRuntime(config);
// Import without constructing a query/provider: missing public runtime dependencies
// must fail the binding rather than pass because only the CLI loader was checked.
const sdk=await import(pathToFileURL(config.sdkModulePath).href);
if(sdk.SDK_VERSION!=='0.1.17'||sdk.MANAGED_HOST_CONTRACT_VERSION!==2||typeof sdk.query!=='function')throw Error('SDK_CONTRACT_UNSUPPORTED');
const sdkImport={version:sdk.SDK_VERSION,managed_host_contract_version:sdk.MANAGED_HOST_CONTRACT_VERSION,query_export:true,query_invoked:false};
writeFileSync(path.join(output,'runtime-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
writeFileSync(path.join(output,'runtime-verification.json'),JSON.stringify({verification,sdkImport,source_files_verified:source.files.length,real_model_calls:0,credentials_supplied:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified_files:verification.file_count,source_files_verified:source.files.length,config:path.join(output,'runtime-config.json'),real_model_calls:0}));
