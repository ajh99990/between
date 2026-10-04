/** Product-owned contract; the adapter consumes the existing Qwen agent loop. */
export const HOST_CONTEXT_SCHEMA_VERSION=1 as const;
export const SESSION_TOOLS = Object.freeze([
  'mcp__relationship__read_context',
  'mcp__relationship__remember_user_report',
]);
export type CaptureStatus = 'present'|'disabled'|'redacted'|'oversize'|'unavailable';
export type CapturedField = {capture_status:CaptureStatus; value?:unknown; bytes?:number; reason?:string;content_ref?:{id:string;expires_at:string};encoding?:'utf-8';normalization?:'semantic-json-v1'};
export type ExecutionContext = {
  schema_version:1; conversation_id:string; turn_id:string; execution_id:string;
  trace_id:string; traceparent:string; resumes_execution_id?:string;
};
export type HostTurn = ExecutionContext & {
  grant:string; input:string; memory:boolean;
  sessionToolAllowlist:readonly string[];
};
type EventBase = ExecutionContext & {event_id:string; sequence:number; occurred_at:number};
export type HostEvent = EventBase & (
  | {type:'policy'; sessionToolAllowlist:readonly string[]; hooks:'sdk_functions'; registeredTools:readonly string[]; managed_host_contract_version:1; cli_version:string; sdk_version:string; policy_source:'runtime_readback'}
  | {type:'attempt_started'; attempt_id:string; attempt_index:number; reason:string; provider:string; model:string; input:CapturedField; native_attempt?:NativeProviderAttempt}
  | {type:'attempt_finished'; attempt_id:string; response_complete:boolean; output:CapturedField; status:'succeeded'|'failed'|'cancelled'; usage?:{input_tokens?:number;output_tokens?:number}; native_attempt?:NativeProviderAttempt}
  | {type:'tool'; tool_call_id:string; operation_id?:string; tool:string; status:'started'|'succeeded'|'failed'; input:CapturedField; output?:CapturedField}
  | {type:'skill'; phase:'discovered'|'activated'|'read'|'injected'; resource_id:string; hash?:string; attempt_id?:string; capture:CapturedField}
  | {type:'approval'; approval_id:string; status:'pending'|'denied'}
  | {type:'result'; text:string; attempt_id:string; contributing_attempt_ids?:readonly string[]; response_complete:true}
  | {type:'failure'; code:string; retryable:boolean; outcome:'definite_failure'|'unknown_outcome'}
);
export interface HostAdapter {
  startTurn(input:HostTurn):AsyncIterable<HostEvent>;
  cancelTurn(execution_id:string):Promise<void>;
  resumeExecution(input:HostTurn):AsyncIterable<HostEvent>;
  close():Promise<void>;
}

export type NativeProviderAttempt = {schema_version:1; sequence:number; event_id:string; phase:'started'|'finished'; attempt_id:string; attempt_index:number; retry_index:number; exchange_id:string; attempt_reason:'initial'|'retry'|'fallback'; provider:'openai'|'anthropic'|'gemini'; model?:string; response_id?:string; correlation_status:'matched'|'unmatched'; trace_id:string; span_id:string; parent_span_id:string; started_at:string; ended_at?:string; status:'running'|'success'|'error'|'cancelled'|'incomplete'; response_complete:boolean; request:CapturedField; input:CapturedField; system:CapturedField; tools:CapturedField; output:CapturedField; usage:CapturedField; error?:{type:string;status?:number}};
