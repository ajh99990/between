# Fixed Qwen managed host

CLI v0.24.7 / SDK 0.1.17 / managed host contract 2. The official tag commit is `b12edec1401a28fc53cd9e714d5928b285071fc8`. `qwen-code.lock.json` pins the archive, complete product patch and 123-file changed-source manifest. The canonical patch/build/test subtree is [`../patches/qwen-code`](../patches/qwen-code/README.md). It includes the official fixed dependency lock and Apache-2.0 license. Between uses pnpm 11.19.0; the upstream build remains a separate pnpm 11.24.0 dependency graph.

From the Between repository root, with official Node 24.19.0 and the prerequisites listed in that subtree:

```sh
bash patches/qwen-code/build.sh "$PWD/.runtime/qwen-build"
python3 patches/qwen-code/smoke.py "$PWD/.runtime/qwen-build/qwen-code-0.24.7"
python3 patches/qwen-code/run-tests.py "$PWD/.runtime/qwen-build/qwen-code-0.24.7" "$PWD/.runtime/qwen-test-evidence"
pnpm build
node scripts/prepare-qwen-runtime.mjs .runtime/qwen-build/qwen-code-0.24.7 .runtime/host-binding
```

The work directory must be new. The build verifies the official archive, applies the complete patch, verifies all changed files, compares the pinned upstream lock, installs fixed dependencies, runs the required generation step, serially builds and generates a new full runtime manifest. Keep several GiB of memory available and use disk-backed temporary directories. The source-only `scripts/prepare-qwen-source.mjs <official archive> <new output>` also validates the exact lock/patch/source hashes; it does not claim a production build.

The smoke and regression wrappers use a minimal environment with a network-denying preload before imports. A passing regression requires no external networking attempt. No provider credentials, listener or real model call is needed. Focused tests do not represent the entire upstream suite; the source subtree documents the exact coverage and explicit filtered cases.

The [host contract](host-contract.md) describes trusted SDK hooks in managed bare mode, exact tools, provenance and startup control. The SDK handshake requires contract 2 and explicit startup-suppression support. Between requires actual post-initialization `host_policy.data.skip_startup_context === true`, `upstream_usage_statistics_enabled === false` and `upstream_telemetry_enabled === false`, in addition to effective tools/hooks. Missing or mismatched readback fails closed. Local provider-attempt events remain available; this does not promise enabled application Langfuse export or complete traces.

`prepare-qwen-runtime` validates the current source manifest and every file of both runtime trees including chunks/assets, imports the actual SDK without invoking a query, and rejects unsupported contracts or missing SDK dependencies. Its output binds the existing complete build directory, including installed dependencies; it is not a standalone copy. A rebuilt bundle can have a different hash. Never copy only a loader or reuse an older manifest. Review the generated machine-local configuration before placing it at the desktop package root; do not commit it or provider credentials.

## Upgrade rule

Change the explicit upstream lock, review the full patch, build the pinned official source, validate all source and runtime hashes, run focused SDK/CLI/Config/policy/provenance tests and application compatibility gates. Source verification, build, no-network smoke, synthetic pipeline, real provider and UI are separate gates. Do not use fallback compatibility or requested-policy echoes as actual runtime evidence.

The current app revision is still awaiting its final independent acceptance. Historical contract-1 publication evidence must not be used as evidence for this contract-2 candidate. No private Library artifact is required to reproduce this build.
