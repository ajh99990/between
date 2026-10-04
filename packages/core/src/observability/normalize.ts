import type {CapturedField,HostEvent,NativeProviderAttempt} from '@between/contracts/host';
export type ObservationAttributes=Record<string,string|number|boolean>;
export type CapturePolicy={captureContent:boolean;maxBytes?:number;redactValues?:readonly string[]};
const fieldNames=['request','input','system','tools','output'] as const;
const sensitive=/authorization|password|secret|token|api.?key|cookie|credential/i;
/** A second privacy boundary before any exporter or persistence queue. Never hashes secrets. */
export function exportField(field:CapturedField,policy:CapturePolicy):CapturedField{
 if(!policy.captureContent)return {capture_status:'disabled',reason:'export_content_disabled'};
 if(!['present','redacted'].includes(field.capture_status)||field.value===undefined)return {capture_status:field.capture_status,...(field.reason?{reason:field.reason}:{}),...(field.bytes!==undefined?{bytes:field.bytes}:{})};
 let redacted=field.capture_status==='redacted',count=0;const seen=new Set<object>();
 const clean=(value:unknown,depth=0):unknown=>{
  if(++count>10000||depth>32)throw Error('complexity');
  if(typeof value==='string'){let text=value;for(const secret of policy.redactValues??[])if(secret&&text.includes(secret)){text=text.split(secret).join('[REDACTED]');redacted=true;}return text;}
  if(value===null||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return value;
  if(typeof value!=='object'||seen.has(value))throw Error('not_json');seen.add(value);
  try{if(Array.isArray(value))return value.map(v=>clean(v,depth+1));const out:Record<string,unknown>=Object.create(null);for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))){if(!descriptor.enumerable)continue;if(!('value' in descriptor))throw Error('accessor');if(sensitive.test(key)){out[key]='[REDACTED]';redacted=true;}else out[key]=clean(descriptor.value,depth+1);}return out;}finally{seen.delete(value);}
 };
 try{const value=clean(field.value),bytes=Buffer.byteLength(JSON.stringify(value));if(bytes>(policy.maxBytes??16384))return {capture_status:'oversize',reason:'export_byte_limit',bytes};return {capture_status:redacted?'redacted':'present',value,bytes,encoding:'utf-8',normalization:'semantic-json-v1'};}catch{return {capture_status:'unavailable',reason:'export_capture_failed'};}
}
/** GenAI semantic input conversion only. Provider output remains labelled raw events. */
export function normalizeAttempt(attempt:NativeProviderAttempt,policy:CapturePolicy):ObservationAttributes{
 const attrs:ObservationAttributes={'qwen.attempt.id':attempt.attempt_id,'qwen.attempt.exchange_id':attempt.exchange_id,'qwen.attempt.index':attempt.attempt_index,'qwen.attempt.phase':attempt.phase,'qwen.attempt.status':attempt.status,'qwen.response.complete':attempt.response_complete,'gen_ai.provider.name':attempt.provider,'qwen.native.trace_id':attempt.trace_id,'qwen.native.span_id':attempt.span_id,'qwen.native.parent_span_id':attempt.parent_span_id,'qwen.correlation.status':attempt.correlation_status};
 if(attempt.model)attrs['gen_ai.request.model']=attempt.model;
 const fields={} as Record<typeof fieldNames[number],CapturedField>;
 for(const name of fieldNames){const source=attempt[name],field=fields[name]=exportField(source,policy);attrs[`qwen.capture.${name}.source_status`]=source.capture_status;attrs[`qwen.capture.${name}.status`]=field.capture_status;if(field.reason)attrs[`qwen.capture.${name}.reason`]=field.reason;if(field.bytes!==undefined)attrs[`qwen.capture.${name}.bytes`]=field.bytes;if(field.value!==undefined)attrs[`qwen.capture.${name}.value`]=JSON.stringify(field.value);}
 const decode=(value:unknown):unknown=>typeof value==='string'?JSON.parse(value):value;
 try{
  const input=fields.input.value===undefined?undefined:decode(fields.input.value),system=fields.system.value===undefined?undefined:decode(fields.system.value);
  if(input!==undefined&&!Array.isArray(input))throw Error('messages_not_array');
  if(system!==undefined&&!Array.isArray(system))throw Error('system_not_array');
  const messages=[...(Array.isArray(system)&&system.length?[{role:'system',parts:system}]:[]),...(Array.isArray(input)?input:[])];
  if(messages.length||Array.isArray(input)){attrs['gen_ai.input.messages']=JSON.stringify(messages);attrs['langfuse.observation.input']=JSON.stringify(messages);}
  attrs['qwen.input.compatibility']='system-prepended-v1';
 }catch{attrs['qwen.input.compatibility']='unavailable';attrs['qwen.input.compatibility.reason']='invalid_semantic_content';}
 if(fields.tools.value!==undefined)attrs['gen_ai.tool.definitions']=JSON.stringify(fields.tools.value);
 if(fields.output.value!==undefined){attrs['langfuse.observation.output']=JSON.stringify(fields.output.value);attrs['qwen.output.representation']='provider-events';}
 // No cost inference; unknown usage stays unknown and duplicate events are handled upstream.
 if(attempt.usage.capture_status==='present'&&attempt.usage.value&&typeof attempt.usage.value==='object')for(const [key,value] of Object.entries(attempt.usage.value))if(/^(input_tokens|output_tokens|prompt_tokens|completion_tokens|total_tokens|promptTokenCount|candidatesTokenCount|totalTokenCount)$/.test(key)&&Number.isSafeInteger(value)&&Number(value)>=0)attrs[`qwen.usage.${key}`]=Number(value);
 return attrs;
}
export function observationAttributes(event:HostEvent,policy:CapturePolicy={captureContent:false}):ObservationAttributes{
 const attrs:ObservationAttributes={'session.id':event.conversation_id,'langfuse.session.id':event.conversation_id,'relationship.turn_id':event.turn_id,'relationship.execution_id':event.execution_id,'relationship.event_id':event.event_id,'relationship.sequence':event.sequence,'relationship.event_type':event.type,'relationship.product.trace_id':event.trace_id};
 if((event.type==='attempt_started'||event.type==='attempt_finished')&&event.native_attempt)Object.assign(attrs,normalizeAttempt(event.native_attempt,policy));
 if(event.type==='failure')attrs['relationship.error_code']=event.code;
 if(event.type==='tool'){attrs['gen_ai.tool.name']=event.tool;attrs['relationship.tool_call_id']=event.tool_call_id;attrs['relationship.tool.status']=event.status;if(event.operation_id)attrs['relationship.operation_id']=event.operation_id;for(const field of ['input','output'] as const){const safe=exportField(event[field]??{capture_status:'unavailable'},policy);attrs[`relationship.tool.${field}.capture_status`]=safe.capture_status;if(safe.value!==undefined)attrs[`relationship.tool.${field}`]=JSON.stringify(safe.value);}}
 if(event.type==='skill'){attrs['relationship.skill.phase']=event.phase;attrs['relationship.skill.resource_id']=event.resource_id;if(event.hash)attrs['relationship.skill.hash']=event.hash;attrs['relationship.skill.injection_status']=event.phase==='injected'?'present':'unavailable';}
 // Results never export role text implicitly, nor grants, request input or callback objects.
 return attrs;
}
