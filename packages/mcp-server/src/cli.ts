#!/usr/bin/env node
import path from 'node:path';
import { ProductError } from '@between/core/store';
import { initializeTrustedData, openTrustedSession, type TrustedSession } from './trusted-host.js';
import { readBoundedFile } from './files.js';
import { runStdio } from './stdio.js';

const help = `Between MCP 0.1.0 (Node 24)\n\nTrusted operator initialization, a fresh empty private directory only:\n  between-mcp trusted-init --data-dir ABS --scope ID --character ABS_JSON --adult-confirmed --accept-virtual --memory on|off\n\nTrusted host user-turn hook, one grant until EOF/SIGINT/SIGTERM:\n  between-mcp trusted-turn --data-dir ABS --input-file ABS_TEXT --event-id UUID\n\nDiscovery-only standard MCP stdio (no grants or business authorization):\n  between-mcp serve [--data-dir ABS]\n\nFor a persistent trusted host connection use @between/mcp-server/trusted-host.\nOnly a trusted operator/host hook may run trusted-init or trusted-turn. Never\nexpose them as model tools. A static MCP configuration cannot authenticate\ncurrent-user text or grant memory consent. No network listener is created.\n`;
function argumentsFor(command: string, args: string[]): Map<string, string | true> {
  const allowed: Record<string, string[]> = {
    'trusted-init': ['data-dir', 'scope', 'character', 'adult-confirmed', 'accept-virtual', 'memory'],
    'trusted-turn': ['data-dir', 'input-file', 'event-id'],
    'serve': ['data-dir'],
  };
  if (!allowed[command]) throw new ProductError('INVALID_COMMAND');
  const parsed = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!allowed[command].includes(key) || parsed.has(key)) throw new ProductError('INVALID_ARGUMENTS');
    if (['adult-confirmed', 'accept-virtual'].includes(key)) parsed.set(key, true);
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new ProductError('INVALID_ARGUMENTS');
      parsed.set(key, value);
    }
  }
  return parsed;
}
function required(options: Map<string, string | true>, name: string): string {
  const value = options.get(name);
  if (typeof value !== 'string') throw new ProductError('MISSING_ARGUMENT');
  return value;
}
let session: TrustedSession | undefined;
try {
  const [command = 'serve', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) process.stderr.write(help);
  else {
    const options = argumentsFor(command, args);
    if (command === 'trusted-init') {
      initializeTrustedData({ dataDir: required(options, 'data-dir'), scope: required(options, 'scope'), characterFile: required(options, 'character'),
        adultConfirmed: options.get('adult-confirmed') === true, virtualIdentityAccepted: options.get('accept-virtual') === true,
        memory: required(options, 'memory') as 'on' | 'off' });
      process.stderr.write('INITIALIZED\n');
    } else if (command === 'trusted-turn') {
      const inputFile = required(options, 'input-file');
      if (!path.isAbsolute(inputFile)) throw new ProductError('INPUT_PATH_INVALID');
      const text = readBoundedFile(inputFile, 32000);
      session = openTrustedSession({ dataDir: required(options, 'data-dir') });
      session.beginTurn({ eventId: required(options, 'event-id'), text });
      await runStdio(session.binding, () => session?.close());
    } else {
      // REL_* inherited variables and --data-dir cannot turn discovery into
      // consent. Even an initialized directory supplies no current-turn proof.
      await runStdio();
    }
  }
} catch (error) {
  try { session?.close(); } catch { /* Retain original generic failure. */ }
  process.stderr.write((error instanceof ProductError ? error.code : 'MCP_START_FAILED') + '\n');
  process.exitCode = 1;
}
