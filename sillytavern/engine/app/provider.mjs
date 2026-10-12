import http from 'node:http';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import Jimp from 'jimp';
const media = JSON.parse(await fs.readFile(new URL('../../research/media-data.json',import.meta.url)));
export async function provider({demo=false,modelUrl='',modelName='gpt-4o-mini',key='',mediaConfig={},pipeline,rawImage,asrModel}={}) {
  let target;
  if(modelUrl){target=new URL(modelUrl);if(target.username||target.password||target.search||target.hash||!(target.protocol==='https:'||target.protocol==='http:'&&['127.0.0.1','[::1]'].includes(target.hostname)))throw new Error('模型地址须为 HTTPS 或本机 HTTP，不能含凭据或查询参数');}
  if(demo&&target)throw new Error('演示模式不能同时配置真实模型');
  const secret=crypto.randomBytes(24).toString('hex');
  const status={mode:demo?'demo':target?'configured':'unconfigured',model:modelName,connection:demo?'demo':target?'unchecked':'unconfigured',description:demo?'本地合成演示 · 不代表真实模型效果':target?'真实模型已配置，尚未验证连接':'尚未配置真实模型连接',capabilities:{imageInput:demo,audioInput:demo,voice:demo||!!(pipeline&&mediaConfig.ttsEndpoint),tts:demo||!!mediaConfig.ttsEndpoint,image:demo||!!mediaConfig.sdEndpoint,caption:demo||!!(pipeline&&rawImage)}};
  const server=http.createServer(async(req,res)=>{
    if(req.url!==`/${secret}/chat/completions`&&req.url!==`/${secret}/audio/speech`&&req.url!==`/${secret}/sdapi/v1/txt2img`){res.writeHead(404);res.end();return;}
    let raw='';for await(const c of req){raw+=c;if(raw.length>20*1024*1024){res.writeHead(413);res.end();return;}}
    const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort()});
    try{
      const body=JSON.parse(raw);
      if(!demo){
        if(!target){res.writeHead(503);res.end();return;}
        const url=target.href.replace(/\/$/,'')+'/chat/completions';
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({...body,model:modelName}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(120000)]),redirect:'error'});
        status.connection=response.ok?'connected':response.status===401||response.status===403?'auth-required':'error';status.description=response.ok?'真实模型已响应':`模型请求失败（HTTP ${response.status}）`;
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});
        if(!response.ok){res.end(JSON.stringify({error:{message:'模型服务请求失败'}}));return;}
        for await(const part of response.body){if(res.destroyed)break;res.write(part);}res.end();return;
      }
      if(req.url.endsWith('/audio/speech')){res.writeHead(200,{'Content-Type':'audio/mpeg'});res.end(Buffer.from(media.ttsAudio.split(',')[1],'base64'));return;}
      if(req.url.endsWith('/txt2img')){res.end(JSON.stringify({images:[media.image.split(',')[1]]}));return;}
      const input=body.messages.findLast(x=>x.role==='user')?.content;
      const text=typeof input==='string'?input:input?.find(x=>x.type==='text')?.text||'这张图片';
      if(text.includes('[测试失败]')){res.writeHead(503);res.end();return;}
      const reply=!body.stream?'synthetic illustration, lighthouse, calm sea, daylight':`这是本地演示回复。我听见你说：“${text.slice(0,100)}”。接上真实模型后，这里会由角色根据设定、世界书和聊天历史回应。`;
      if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});for(const char of reply){abort.signal.throwIfAborted();res.write('data: '+JSON.stringify({choices:[{delta:{content:char}}]})+'\n\n');await new Promise(r=>setTimeout(r,12));}res.end('data: [DONE]\n\n');}else res.end(JSON.stringify({choices:[{message:{content:reply}}]}));
    }catch(e){if(!res.headersSent)res.writeHead(502);res.end();if(!demo&&!abort.signal.aborted){status.connection='error';status.description='无法连接模型服务，请检查启动配置';}}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/${secret}`;
  return {status,configure({url,name},checkOnly=false){if(demo)throw new Error('演示模式的连接不可修改');const u=new URL(url);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('模型地址不受支持');if(key&&(!target||u.origin!==target.origin))throw new Error('已有运行时凭据时不能切换模型服务域名，请重启配置');if(checkOnly)return;target=u;modelName=name||'gpt-4o-mini';Object.assign(status,{mode:'configured',model:modelName,connection:'unchecked',description:'配置已更新，等待首次请求验证'});},engineConfig:{endpoint:base,media:demo?{ttsEndpoint:base+'/audio/speech',sdEndpoint:base,voiceMap:{'米拉':'alloy','林间':'alloy','[Default Voice]':'alloy'},sd:{width:64,height:64}}:mediaConfig,pipeline:demo?async task=>async()=>task==='automatic-speech-recognition'?{text:'这是一段合成语音转写，我想聊聊今天的生活。'}:task==='image-to-text'?[{generated_text:'这是一张红蓝色的合成测试图片。'}]:{sampling_rate:16000,audio:new Float32Array(3200)}:pipeline,rawImage:demo?x=>Jimp.read(Buffer.from(x.split(',')[1],'base64')):rawImage,asrModel},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
