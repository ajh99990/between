/** Managed host wire contract v1. Keep aligned with core observability/provider-attempt.ts. */
export type CaptureStatus =
  | 'present'
  | 'disabled'
  | 'redacted'
  | 'oversize'
  | 'unavailable';
export type ProviderName = 'openai' | 'anthropic' | 'gemini';
export interface ContentReference {
  id: string;
  expires_at: string;
}
export interface CapturedValue {
  capture_status: CaptureStatus;
  reason?: string;
  encoding?: 'utf-8';
  normalization?: 'semantic-json-v1';
  bytes?: number;
  value?: unknown;
  content_ref?: ContentReference;
}
export interface ProviderAttemptEvent {
  schema_version: 1;
  sequence: number;
  event_id: string;
  phase: 'started' | 'finished';
  attempt_id: string;
  attempt_index: number;
  retry_index: number;
  exchange_id: string;
  attempt_reason: 'initial' | 'retry' | 'fallback';
  provider: ProviderName;
  model?: string;
  response_id?: string;
  correlation_status: 'matched' | 'unmatched';
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  started_at: string;
  ended_at?: string;
  status: 'running' | 'success' | 'error' | 'cancelled' | 'incomplete';
  response_complete: boolean;
  request: CapturedValue;
  input: CapturedValue;
  system: CapturedValue;
  tools: CapturedValue;
  output: CapturedValue;
  usage: CapturedValue;
  error?: { type: string; status?: number };
}
