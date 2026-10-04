# Fixed Qwen managed host

CLI v0.24.7 / SDK0.1.16 / managed host contract1. Official tag commit `b12edec1401a28fc53cd9e714d5928b285071fc8`, verified from official `git ls-remote`. `qwen-code.lock.json` pins the official archive, ordered patch and110-file changed-source manifest. Qwen upstream has its own pnpm11.24.0 lock/tool pin; Between first-party uses pnpm11.19.0. Do not merge those graphs or expand upstream into first-party packages.

From the Between repository root, using official Node24.19.0 and Corepack:

```sh
mkdir -p .runtime
curl -fL https://github.com/QwenLM/qwen-code/archive/refs/tags/v0.24.7.tar.gz -o .runtime/qwen-v0.24.7.tar.gz
node scripts/prepare-qwen-source.mjs .runtime/qwen-v0.24.7.tar.gz .runtime/qwen-build
(cd .runtime/qwen-build/qwen-code-0.24.7 && corepack pnpm install --frozen-lockfile --ignore-scripts && npm run generate && npm run build:managed-host)
node upstream/checks/sdk-build-smoke.mjs .runtime/qwen-build/qwen-code-0.24.7
node upstream/checks/config-smoke.mjs "$PWD/.runtime/qwen-build/qwen-code-0.24.7"
bash upstream/checks/cli-smoke.sh .runtime/qwen-build/qwen-code-0.24.7
pnpm build
node scripts/prepare-qwen-runtime.mjs .runtime/qwen-build/qwen-code-0.24.7 .runtime/host-binding
```

`prepare-qwen-source` requires a NEW output parent, verifies archive/patch/manifest hashes before extraction, checks patch application and verifies all110 changed source files. The explicit `npm run generate` is necessary on the pristine official archive; do not omit it. Standard writable caches may be selected through Corepack/pnpm's documented cache/store parameters without changing OS security.

`prepare-qwen-runtime` refuses symlink runtime entries and validates every file in both full dist trees including chunks/vendor/assets. A rebuild may change bundle hashes; the helper creates a new full manifest and config and invokes Between's real runtime verifier. It never reads provider secrets or starts a model. Review its output and copy the generated configuration into `apps/desktop/runtime-config.json` or the corresponding installed desktop package root. Runtime directories and dependencies must remain available outside the source tree, with all relative chunks/assets and official fixed dependency closure preserved. Do not copy just the CLI loader.

Source compatibility, production build, compiled SDK/Config checks, CLI help and provider/MCP/Langfuse integration are different gates. Reusing a byte-identical upstream build is allowed only with exact source delta and runtime manifest verification; record its original build time and the new adapter compatibility test time. This migration reuses the unchanged host production build actually completed in the same cloud environment on2026-10-04, and independently reruns the new layout's source-prepare/runtime-binding/smokes. It does not claim a new full rebuild or real provider turn.

## Upgrade rule

A new upstream version must change the lock explicitly, rebase and review the complete patch, build from a clean official archive, validate changed-source hashes, run host-owned policy/provenance/SDK hooks/readback/session tests, generate a fresh full runtime manifest and rerun the app adapter and independent artifact gates. A permissive fallback, requested-policy echo or unchecked loader is not a compatibility strategy.

The patch and upstream retain Apache-2.0 notices in `QWEN-LICENSE`; first-party Between licensing is separate. No private Library artifact is needed to reproduce this source build.
