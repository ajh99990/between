import {mkdirSync,realpathSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
/** Test installs must not consume RAM-backed /tmp by default. Explicit override
 * is for a writable test directory, never a security/sandbox override. */
export function testTempRoot(){
 const chosen=process.env.BETWEEN_TEST_TMPDIR||path.resolve(repo,'..','.between-test-tmp');
 if(!path.isAbsolute(chosen))throw Error('BETWEEN_TEST_TMPDIR_MUST_BE_ABSOLUTE');
 mkdirSync(chosen,{recursive:true});const canonical=realpathSync(chosen);
 if(canonical!==path.resolve(chosen))throw Error('TEST_TEMP_SYMLINK_DENIED');
 return canonical;
}
