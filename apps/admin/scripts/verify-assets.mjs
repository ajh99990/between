import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('design-assets.json',root),'utf8'));
for(const item of manifest.files){const bytes=await fs.readFile(new URL('public/design/'+item.path,root));if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Design asset mismatch: '+item.path);}
console.log('PASS: '+manifest.files.length+' packaged design assets match the source manifest');
