// Starts a clean loopback-only research instance and always stops it.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import yaml from 'yaml';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(here);
const output=process.argv[2]?path.resolve(process.argv[2]):fs.mkdtempSync(path.join(os.tmpdir(),'st-slice-verify-'));
if(process.argv[2])fs.mkdirSync(output);fs.mkdirSync(path.join(output,'evidence'));
fs.copyFileSync(path.join(here,'media-baseline.json'),path.join(output,'evidence/media-baseline.json'));
fs.copyFileSync(path.join(here,'baseline.json'),path.join(output,'evidence/baseline.json'));fs.copyFileSync(path.join(here,'fixture-settings.json'),path.join(output,'fixture-settings.json'));
const cfg=yaml.parse(fs.readFileSync(path.join(repo,'default/config.yaml'),'utf8'));
cfg.browserLaunch.enabled=false;cfg.extensions.autoUpdate=false;cfg.extensions.models.autoDownload=false;cfg.enableDownloadableTokenizers=false;
const config=path.join(output,'config.yaml');fs.writeFileSync(config,yaml.stringify(cfg));const port=Number(process.env.ST_TEST_PORT||8154);
const log=fs.openSync(path.join(output,'server.log'),'w');const env={PATH:process.env.PATH,NODE_ENV:'test'};
const server=spawn(process.execPath,['--import',path.join(here,'mock-media-register.mjs'),'server.js','--configPath',config,'--dataRoot',path.join(output,'runtime-final'),'--port',String(port)],{cwd:repo,env,stdio:['ignore',log,log]});
let stopped=false;const stop=()=>{if(!stopped){stopped=true;server.kill('SIGTERM');}};process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
 let ready=false;for(let n=0;n<240;n++){if(server.exitCode!==null)throw new Error('Research server failed; see '+output+'/server.log');try{const r=await fetch(`http://127.0.0.1:${port}/version`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw new Error('Server startup timeout');
 const runner=spawn(process.execPath,[path.join(here,'run.mjs'),'final',String(port)],{cwd:repo,env:{...env,ST_RESEARCH_ROOT:output},stdio:'inherit'});
 const code=await new Promise(r=>runner.once('exit',r));if(code!==0)throw new Error('Behavior regression failed with exit '+code);
 const mediaRunner=spawn(process.execPath,[path.join(here,'media-run.mjs'),'final-media',String(port)],{cwd:repo,env:{...env,ST_RESEARCH_ROOT:output,ST_DATA_LABEL:'final'},stdio:'inherit'});
 const mediaCode=await new Promise(r=>mediaRunner.once('exit',r));if(mediaCode!==0)throw new Error('Media regression failed with exit '+mediaCode);
 const status=fs.readFileSync(`/proc/${server.pid}/status`,'utf8');fs.writeFileSync(path.join(output,'server-memory.txt'),status.split('\n').filter(x=>/^Vm(RSS|HWM|Size):/.test(x)).join('\n')+'\n');
 console.log('FINAL VERIFIED',output);
}finally{
 stop();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.closeSync(log);
 fs.writeFileSync(path.join(output,'shutdown.json'),JSON.stringify({pid:server.pid,exitCode:server.exitCode,signalCode:server.signalCode},null,2));console.log('Research server stopped');
}
