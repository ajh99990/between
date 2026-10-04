import {requestSchema} from '@between/contracts/commands';
import {RUNTIME_PROTOCOL_VERSION} from '@between/contracts/protocol-version';
import { app,BrowserWindow,ipcMain,safeStorage } from 'electron';
import { spawn,type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync,existsSync,readFileSync,writeFileSync } from 'node:fs';
import {randomBytes} from 'node:crypto';
import {loadRuntimeConfig,selectedProviderEnvironment} from '@between/host-qwen/config';
import {trustedPageUrl} from './trusted-page.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const userData=path.join(root,'.runtime/electron');mkdirSync(userData,{recursive:true,mode:0o700});app.setPath('userData',userData);
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0);}
let win:BrowserWindow;let broker:ChildProcess;
const pending=new Map<string,{resolve:(x:unknown)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
function call(payload:Record<string,unknown>){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const request=requestSchema.parse({...payload,id});const timer=setTimeout(()=>{pending.delete(id);reject(new Error('SERVICE_TIMEOUT'));},70000);pending.set(id,{resolve,reject,timer});broker.stdin!.write(JSON.stringify(request)+'\n');});}
const page=path.join(root,'dist/renderer/index.html');
const trustedURL=trustedPageUrl(page,process.env.REL_VISUAL==='1');
function trusted(event:Electron.IpcMainInvokeEvent){if(event.sender!==win.webContents||event.senderFrame?.url!==trustedURL||event.senderFrame!==win.webContents.mainFrame)throw new Error('NOT_AUTHORIZED');}
app.whenReady().then(async()=>{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
// No plaintext Linux basic_text fallback for the memory-off receipt key.
let dataKey:string|undefined;
if(safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text')){
 const dir=path.join(root,'.runtime/data-v5');mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'receipt-key.enc');
 if(existsSync(file))dataKey=safeStorage.decryptString(readFileSync(file));
 else {dataKey=randomBytes(32).toString('base64');writeFileSync(file,safeStorage.encryptString(dataKey),{mode:0o600,flag:'wx'});}
}
const environment:NodeJS.ProcessEnv={REL_ROOT:path.join(root,'resources'),REL_CONFIG_ROOT:root,REL_DB:process.env.REL_DB||path.join(root,'.runtime/data-v5/relationship.db'),PATH:process.env.PATH,LANG:process.env.LANG,TMPDIR:process.env.TMPDIR};
Object.assign(environment,selectedProviderEnvironment(loadRuntimeConfig(root)?.providerEnvironment,process.env));
if(dataKey)environment.REL_DATA_KEY=dataKey;
broker=spawn(process.env.REL_NODE||'node',[path.join(root,'dist/runtime-entry.js')],{cwd:root,env:environment,stdio:['pipe','pipe','pipe']});
dataKey=undefined;delete environment.REL_DATA_KEY;
createInterface({input:broker.stdout!}).on('line',line=>{try{const r=JSON.parse(line);const p=pending.get(r.id);if(r.schema_version!==RUNTIME_PROTOCOL_VERSION){if(p){clearTimeout(p.timer);pending.delete(r.id);p.reject(new Error('UNSUPPORTED_PROTOCOL_VERSION'));}return;}if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(new Error(r.error)):p.resolve(r.value);}}catch{}});
const disconnected=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('SERVICE_DISCONNECTED'));}pending.clear();};broker.on('exit',disconnected);broker.on('error',disconnected);broker.stderr!.on('data',()=>{});
win=new BrowserWindow({width:762,height:553,minWidth:762,minHeight:553,frame:false,resizable:true,backgroundColor:'#ededed',webPreferences:{preload:path.join(root,'dist/preload/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
ipcMain.handle('relationship',async(event,payload)=>{trusted(event);if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>20000)throw new Error('INVALID_INPUT');const actions=['snapshot','start','send','ack','control','cancel','retry','plan_deletion','confirm_deletion','cancel_deletion','resume_deletion'];if(!actions.includes(payload.action))throw new Error('INVALID_ACTION');return call(payload);});
ipcMain.handle('window-action',(event,action)=>{trusted(event);if(action==='close')win.close();else if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else throw new Error('INVALID_ACTION');});
await win.loadURL(trustedURL);
app.on('before-quit',()=>{broker?.kill('SIGTERM');disconnected();});
app.on('window-all-closed',()=>app.quit());
}).catch(error=>{console.error('Client startup failed',error);app.quit();});
