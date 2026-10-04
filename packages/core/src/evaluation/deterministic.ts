import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {parseControls,type Controls} from '../store.js';
import {exportField,normalizeAttempt} from '../observability/normalize.js';
import type {NativeProviderAttempt,CapturedField} from '@between/contracts/host';
const field=z.object({capture_status:z.enum(['present','disabled','redacted','oversize','unavailable']),value:z.unknown().optional(),reason:z.string().optional(),bytes:z.number().int().nonnegative().optional()}).strict();
const policy=z.object({captureContent:z.boolean(),maxBytes:z.number().int().min(1).max(1048576).optional(),redactValues:z.array(z.string().min(1)).max(20).optional()}).strict();
const common={id:z.string().regex(/^[a-z0-9-]{1,64}$/),requirement:z.string().regex(/^[A-Z0-9.\/; -]{1,128}$/)};
const caseSchema=z.discriminatedUnion('kind',[
 z.object({...common,kind:z.literal('controls'),text:z.string().max(8000),expected:z.record(z.string(),z.unknown())}).strict(),
 z.object({...common,kind:z.literal('capture'),field,policy,expected:z.record(z.string(),z.unknown()),absent:z.array(z.string()).optional(),forbidden:z.array(z.string().min(1)).optional()}).strict(),
 z.object({...common,kind:z.literal('attempt'),input:field,system:field,output:field,policy,expected:z.record(z.string(),z.unknown()),absent:z.array(z.string()).optional(),forbidden:z.array(z.string().min(1)).optional()}).strict()
]);
const datasetSchema=z.object({schema_version:z.literal(1),synthetic:z.literal(true),layer:z.literal('deterministic-contract'),cases:z.array(caseSchema).min(1).max(1000)}).strict();
const controls:Controls={memory:'off',role:'active',direction:'unspecified',nickname:'',nicknameState:'none',revision:0,epoch:0,started:true};
const disabled:CapturedField={capture_status:'disabled'};
/** Values may contain JSON-encoded strings; inspect raw and decoded strings, bounded. */
function containsContent(value:unknown,secret:string,depth=0):boolean {
 if(depth>40)return true;
 if(typeof value==='string'){
  if(value.includes(secret))return true;
  try{const decoded:unknown=JSON.parse(value);if(decoded!==value)return containsContent(decoded,secret,depth+1);}catch{}
  return false;
 }
 if(value&&typeof value==='object')return Object.entries(value).some(([key,item])=>key.includes(secret)||containsContent(item,secret,depth+1));
 return false;
}
export type CaseResult={id:string;requirement:string;status:'passed'|'failed';failures:string[]};
/** Executes production functions, with no provider, HTTP, trace fabrication or model quality score. */
export function runDeterministicDataset(input:unknown){
 const data=datasetSchema.parse(input),seen=new Set<string>();
 for(const c of data.cases){if(seen.has(c.id))throw Error('DUPLICATE_EVALUATION_CASE');seen.add(c.id);if(c.kind!=='controls'&&!Object.keys(c.expected).length&&!c.absent?.length&&!c.forbidden?.length)throw Error('EVALUATION_ASSERTION_REQUIRED');}
 const cases:CaseResult[]=data.cases.map(c=>{
  const failures:string[]=[];
  try{
   let actual:Record<string,unknown>;
   if(c.kind==='controls')actual=parseControls(c.text,{...controls});
   else if(c.kind==='capture')actual=exportField(c.field,c.policy) as unknown as Record<string,unknown>;
   else {
    const attempt:NativeProviderAttempt={schema_version:1,sequence:1,event_id:c.id,phase:'finished',attempt_id:c.id,attempt_index:1,retry_index:0,exchange_id:'synthetic-exchange',attempt_reason:'initial',provider:'anthropic',correlation_status:'unmatched',trace_id:'0'.repeat(32),span_id:'0'.repeat(16),parent_span_id:'0'.repeat(16),started_at:'2026-10-04T00:00:00Z',ended_at:'2026-10-04T00:00:01Z',status:'success',response_complete:true,request:disabled,input:c.input,system:c.system,output:c.output,tools:disabled,usage:disabled};
    actual=normalizeAttempt(attempt,c.policy);
   }
   if(c.kind==='controls'){if(!isDeepStrictEqual(actual,c.expected))failures.push('control_delta_mismatch');}
   else for(const [key,value] of Object.entries(c.expected))if(!isDeepStrictEqual(actual[key],value))failures.push('expected_field_mismatch');
   if(c.kind!=='controls')for(const key of c.absent??[])if(Object.hasOwn(actual,key))failures.push('unexpected_field');
   if(c.kind!=='controls')for(const secret of c.forbidden??[])if(containsContent(actual,secret))failures.push('forbidden_content');
  }catch{failures.push('production_function_threw');}
  return {id:c.id,requirement:c.requirement,status:failures.length?'failed':'passed',failures};
 });
 return {schema_version:1,synthetic:true,layer:'deterministic-contract',real_model_calls:0,quality_scores:null,passed:cases.filter(c=>c.status==='passed').length,failed:cases.filter(c=>c.status==='failed').length,cases};
}
