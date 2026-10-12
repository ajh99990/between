import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../admin/dist/',import.meta.url)));
const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
/** Serves only the built administrator app. API identity/CSRF/Origin checks remain in server.mjs. */
export async function serveAdmin(req,res,pathname){
  if(pathname!=='/admin'&&!pathname.startsWith('/admin/'))return false;
  if(req.method!=='GET')throw Object.assign(new Error('请求方式不受支持'),{status:405});
  const index=pathname==='/admin'||pathname==='/admin/';
  let relative;
  try { relative=index?'index.html':decodeURIComponent(pathname.slice('/admin/'.length)); }
  catch { throw Object.assign(new Error('页面不存在'),{status:404}); }
  if (relative.includes('\0') || path.isAbsolute(relative)) throw Object.assign(new Error('页面不存在'),{status:404});
  if(relative.split(/[\\/]/).some(p=>p==='..'||p==='.'||p.startsWith('.'))||(!index&&!types[path.extname(relative)]))throw Object.assign(new Error('页面不存在'),{status:404});
  const filename=path.resolve(root,relative);
  if(!filename.startsWith(root+path.sep)&&filename!==path.join(root,'index.html'))throw Object.assign(new Error('页面不存在'),{status:404});
  let bytes;try{bytes=await fs.readFile(filename);}catch(e){if(e.code!=='ENOENT'&&e.code!=='EISDIR')throw e;throw Object.assign(new Error(index?'管理员前端尚未构建，请按管理端 README 安装并构建':'页面不存在'),{status:index?503:404});}
  if(index){
    const nonce=crypto.randomBytes(18).toString('base64');
    // Ant Design uses nonce-protected style elements and React layout style attributes.
    // This policy applies only to /admin; the chat frontend keeps its original CSP.
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(bytes.toString('utf8').replace('<head>',`<head><meta name="csp-nonce" content="${nonce}">`).replace(/<script\b/g,`<script nonce="${nonce}"`));
  }else{res.setHeader('Content-Type',types[path.extname(relative)]);res.end(bytes);}
  return true;
}
