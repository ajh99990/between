import {constants} from 'node:fs';
import {open,realpath,readlink,lstat} from 'node:fs/promises';
import path from 'node:path';
export async function readBoundedDescriptor(handle:{read(buffer:Buffer,offset:number,length:number,position:number):Promise<{bytesRead:number}>},limit:number):Promise<Buffer>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>1024*1024+1)throw Error('HOST_APP_ASSET_UNVERIFIED');
 const buffer=Buffer.alloc(limit);let used=0;
 while(used<limit){const {bytesRead}=await handle.read(buffer,used,limit-used,used);if(!Number.isSafeInteger(bytesRead)||bytesRead<0||bytesRead>limit-used)throw Error('HOST_APP_ASSET_UNVERIFIED');if(bytesRead===0)break;used+=bytesRead;}
 return buffer.subarray(0,used);
}
/** Runtime content reader. Linux /proc descriptor identity is required; no weaker fallback. */
export async function readVerifiedContent(root:string,file:string,maxBytes=1024*1024):Promise<Buffer>{
 const deny=():never=>{throw Error('HOST_APP_ASSET_UNVERIFIED');};
 if(process.platform!=='linux')throw Error('HOST_CONTENT_BOUNDARY_UNAVAILABLE');
 if(!path.isAbsolute(root)||!path.isAbsolute(file)||path.resolve(root)!==root||path.resolve(file)!==file)return deny();
 if(await realpath(root)!==root)return deny();
 const relative=path.relative(root,file);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return deny();
 let component=root;for(const piece of relative.split(path.sep)){component=path.join(component,piece);if((await lstat(component)).isSymbolicLink())return deny();}
 // O_NOFOLLOW closes leaf substitution; descriptor identity closes replaced-parent escapes.
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat({bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.size<0n||before.size>BigInt(maxBytes))return deny();
  const descriptorPath=()=>readlink(`/proc/self/fd/${handle.fd}`);
  const resolved=await descriptorPath();if(resolved!==file||resolved.endsWith(' (deleted)'))return deny();
  // A concurrently growing file cannot make this allocation or read unbounded.
  const content=await readBoundedDescriptor(handle,Number(before.size)+1);
  const after=await handle.stat({bigint:true});
  if(await descriptorPath()!==resolved||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.nlink!==1n||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs||content.length!==Number(before.size))return deny();
  return content;
 }finally{await handle.close();}
}
