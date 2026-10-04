/** Readback emitted by the initialized managed CLI, not requested options. */
export interface ManagedHostPolicyReadback {
  schema_version: 1;
  managed_host_contract_version: 1;
  source: 'runtime_config';
  session_id: string;
  effective_session_tool_allowlist: string[];
  registered_tools: string[];
  hooks_status: 'present' | 'unavailable';
  unmanaged_hooks_blocked: boolean;
  sdk_hooks: Array<{
    event: string;
    matcher: string;
    name?: string;
    timeout_ms?: number;
  }>;
}
