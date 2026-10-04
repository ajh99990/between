import { z } from 'zod';

/** Stream-json callbacks supported by this managed CLI. SessionEnd is not
 * emitted on this transport; use the host coordinator's finally/flush path. */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Notification',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'SessionStart',
  'Stop',
  'MessageDisplay',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'SessionDelete',
  'PermissionRequest',
  'PermissionDenied',
  'StopFailure',
  'TodoCreated',
  'TodoCompleted',
  'InstructionsLoaded',
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEventName;
  timestamp: string;
  source_type?: string;
  source_id?: string;
  permission_mode?: string;
  agent_id?: string;
  prompt_id?: string;
  /** Event-specific fields retain the core hook wire format. */
  [key: string]: unknown;
}

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  terminalSequence?: string;
  decision?: 'ask' | 'block' | 'deny' | 'approve' | 'allow';
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}

export interface HookCallbackContext {
  /** Cooperative cancellation; callbacks must stop their own side effects. */
  signal: AbortSignal;
  toolUseId: string | null;
}

/** False blocks a blocking-capable event; undefined and true allow it.
 * Observational events retain the core's no-control-effect semantics.
 * Exceptions/timeouts block blocking-capable events in the managed CLI.
 */
export type HookCallback = (
  input: HookInput,
  context: HookCallbackContext,
) => HookOutput | boolean | void | Promise<HookOutput | boolean | void>;

export interface SDKHook {
  event: HookEventName;
  callback: HookCallback;
  /** Uses the core hook matcher syntax; defaults to all matches. */
  matcher?: string;
  /** Per-invocation deadline in milliseconds; defaults to 60 seconds. */
  timeoutMs?: number;
}

export const SDKHookSchema = z
  .object({
    event: z.enum(HOOK_EVENTS),
    callback: z.custom<HookCallback>((value) => typeof value === 'function', {
      message: 'Hook callback must be a function',
    }),
    matcher: z.string().optional(),
    timeoutMs: z.number().finite().int().positive().max(600_000).optional(),
  })
  .strict();

export const HookOutputSchema = z
  .object({
    continue: z.boolean().optional(),
    stopReason: z.string().optional(),
    suppressOutput: z.boolean().optional(),
    systemMessage: z.string().optional(),
    terminalSequence: z.string().optional(),
    decision: z.enum(['ask', 'block', 'deny', 'approve', 'allow']).optional(),
    reason: z.string().optional(),
    hookSpecificOutput: z.record(z.unknown()).optional(),
  })
  .strict();

export const HookInputSchema = z
  .object({
    session_id: z.string(),
    transcript_path: z.string(),
    cwd: z.string(),
    hook_event_name: z.enum(HOOK_EVENTS),
    timestamp: z.string(),
  })
  .passthrough();
