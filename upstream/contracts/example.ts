import { query, type QueryOptions, type ProviderAttemptEvent } from '@qwen-code/sdk';

// Synthetic fixture only. Credentials are supplied by the owning host, never this file.
const options: QueryOptions = {
  pathToQwenExecutable: '/absolute/path/to/patched/dist/cli.js',
  env: { HOME: '/private/synthetic/home', QWEN_HOME: '/private/synthetic/qwen', QWEN_RUNTIME_DIR: '/private/synthetic/runtime', PATH: '/usr/local/bin:/usr/bin:/bin' },
  sessionToolAllowlist: ['mcp__business__read_state'],
  captureProviderContent: false,
  providerCaptureMaxBytes: 16384,
  hooks: [{ event: 'PreToolUse', callback: () => ({ decision: 'allow' }) }],
};
export async function syntheticTurn() {
  for await (const message of query({ prompt: 'Synthetic fixture', options })) {
    if (message.type === 'system' && message.subtype === 'provider_attempt') {
      const event = message.data as ProviderAttemptEvent;
      // Validate schema_version at application boundary; dedupe by event_id.
      console.log(event.attempt_id, event.phase, event.response_complete);
    }
  }
}
