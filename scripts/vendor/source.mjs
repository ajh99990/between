import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

export const commit='06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
const source=process.argv[2];
if(!source||!path.isAbsolute(source))throw Error('Provide an absolute path to a clean SillyTavern checkout at '+commit);
const sourceRoot=fs.realpathSync(source);
const head=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(head!==commit)throw Error('Upstream checkout must be pinned to '+commit);
const changed=execFileSync('git',['-C',sourceRoot,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'});
if(changed.trim())throw Error('Upstream checkout must be clean');
export const parse=createRequire(new URL('../../packages/role-engine/package.json',import.meta.url))('acorn').parse;
export const readSource=file=>fs.readFileSync(path.join(sourceRoot,file),'utf8');
export function writeOutput(file,text){
  const target=path.join(repositoryRoot,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,text);
}
