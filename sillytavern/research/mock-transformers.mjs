// Preserve real env/RawImage decoding; replace only downloaded-model inference.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const actual=await import(pathToFileURL(path.resolve('node_modules/sillytavern-transformers/src/transformers.js')));
export const env=actual.env;export const RawImage=actual.RawImage;
export async function pipeline(task,model,options){
 const fn=async(input,args)=>{
 const event={task,model,options,args:args||null,input:typeof input==='string'?input:{type:input.constructor.name,length:input.length||null,width:input.width||null,height:input.height||null}};
 fs.appendFileSync(process.env.ST_MEDIA_MOCK_LOG||path.join(globalThis.DATA_ROOT,'media-inference.jsonl'),JSON.stringify(event)+'\n');
 if(task==='automatic-speech-recognition')return {text:'TRANSCRIPT: Lin asks Mira about the harbor.'};
 if(task==='text-to-speech')return {sampling_rate:16000,audio:Float32Array.from({length:3200},(_,i)=>Math.sin(i*2*Math.PI*440/16000)*0.05)};
 if(task==='image-to-text')return [{generated_text:'CAPTION: a synthetic red and blue square.'}];
 throw new Error('Unmocked model task '+task);
 };fn.dispose=async()=>{};return fn;
}
