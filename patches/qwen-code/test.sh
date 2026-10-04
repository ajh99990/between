#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$1" && pwd)
export QWEN_TEST_NETWORK_LOG="${QWEN_TEST_NETWORK_LOG:-$repo/managed-test-network.jsonl}"
(set -o noclobber; : > "$QWEN_TEST_NETWORK_LOG")
export NODE_OPTIONS="--require=\"$root/network-deny.cjs\" --max-old-space-size=2048"
export QWEN_USAGE_STATISTICS_ENABLED=false
export QWEN_CODE_TELEMETRY_ENABLED=false
export OTEL_SDK_DISABLED=true
verify_network() {
  status=$?
  python3 - "$QWEN_TEST_NETWORK_LOG" <<'PY_CHECK'
import json, pathlib, sys
rows = [json.loads(line) for line in pathlib.Path(sys.argv[1]).read_text().splitlines()]
assert any(row['event'] == 'ready' for row in rows), 'Network preload was not installed'
blocked = [row for row in rows if row['event'] == 'blocked']
assert not blocked, f'Unexpected blocked network attempts: {blocked}'
print('Pre-import network guards active; zero network attempts')
PY_CHECK
  guard_status=$?
  if [ "$guard_status" -ne 0 ]; then status=$guard_status; fi
  exit "$status"
}
trap verify_network EXIT
cd "$repo/packages/sdk-typescript"
../../node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1 --coverage.enabled=false test/managed-*.test.ts test/version-contract.test.ts test/unit/hooks.test.ts test/unit/Query.test.ts test/query.test.ts
../../node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1 --coverage.enabled=false test/unit/ProcessTransport.test.ts -t 'systemPrompt|appendSystemPrompt'
cd "$repo/packages/core"
../../node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1 --coverage.enabled=false --config ../../runtime-contract-vitest.config.ts
../../node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1 --coverage.enabled=false src/config/session-tool-policy.test.ts src/observability/provider-attempt.test.ts src/core/environmentContext.test.ts src/hooks/managed-hooks.test.ts src/hooks/hooks-listing.test.ts src/telemetry/config.test.ts
cd "$repo/packages/cli"
../../node_modules/.bin/vitest run --maxWorkers=1 --minWorkers=1 --coverage.enabled=false src/config/managed-startup-context.integration.test.ts src/nonInteractive/control/controllers/managed-bare-hooks.integration.test.ts src/nonInteractive/control/controllers/hook-controller.test.ts src/nonInteractive/control/controllers/systemController.test.ts src/nonInteractive/managed-host-policy.test.ts src/nonInteractive/io/provider-result-provenance.test.ts src/acp-integration/session/session.alternate-strict-policy.test.ts src/serve/managed-runtime-tool-executor.alternate-strict-policy.test.ts
