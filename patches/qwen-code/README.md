# Qwen managed host source build

This subtree builds the managed host from the official Qwen Code v0.24.7 source archive plus the complete product patch. It needs Node.js 24, Python 3, curl, tar, git, sha256sum, corepack and access to the official npm registry. It does not need a Library download or prebuilt private runtime.

The upstream source URL is https://codeload.github.com/QwenLM/qwen-code/tar.gz/refs/tags/v0.24.7. Its SHA256 is aa7082cbf80590dbc481209f49402b369879868302dda2836f8ae0a1329120d3. The serial build defaults Node heap to 2 GiB (caller NODE_OPTIONS can override it); keep several GiB of system memory available and avoid filling memory-backed temporary storage. The source is Apache-2.0; LICENSE is included. The exact upstream dependency lock is included and compared before the frozen installation. Third-party dependencies retain their own licenses.

Run `bash build.sh /absolute/new-work-directory`. The script refuses an existing checkout, verifies the baseline, applies the full patch, validates every changed source file, installs pinned dependencies, runs the required official generation step, builds the host, and generates a complete local runtime manifest. `npm run generate` must precede the managed build on a pristine archive. The old candidate's omission of that prerequisite was corrected in this build procedure.

Run `python3 smoke.py /absolute/new-work-directory/qwen-code-0.24.7` for built SDK identity/schema and CLI help/version checks in a minimal environment. No provider query or listener is invoked. Run `python3 run-tests.py <built-Qwen-root> <NEW-evidence-directory>` for the named source-level gates. This wrapper supplies a clean environment without inherited credentials; test.sh installs the network-denying preload before any test application imports and requires zero network attempts. Smoke success does not establish provider, MCP, UI or Langfuse integration.

## Bind the application to this build

Build hashes can change across clean builds. Do not reuse a historical CLI SHA or copy a loader alone. Keep both complete dist trees with their dependencies. The generated runtime-manifest.json contains all runtime paths, sizes and hashes relative to the built Qwen root.

After the application's matching source manifest has been updated, invoke its existing binding helper:

    node <app-root>/scripts/prepare-qwen-runtime.mjs <built-Qwen-root> <NEW-output-dir> <app-root>

The helper verifies the patched source against the application's source manifest, hashes the complete installed runtime, imports the built SDK to check the contract without constructing a query, invokes the application's managed-runtime verifier, and writes runtime-config.json with an empty providerEnvironment. Its runtime root remains the supplied build root with its installed dependencies; it does not create a standalone dist copy. It binds absolute local SDK/CLI paths and hashes plus runtimeRootPath, runtimeManifestPath and runtimeManifestSha256. Never commit a generated machine-specific runtime config or credentials. Only the host application should supply explicitly approved provider environment values.

## Contract revision

Managed bare mode keeps filesystem/ambient hooks disabled while permitting explicit trusted SDK function hooks. Explicit disableAllHooks, safe mode and shell-execution sandbox restrictions remain effective. The regression exercises real Config initialization, SystemController, HookSystem registration, callback blocking and actual readback.

skipStartupContext defaults to true in managed use. Explicit false retains the original startup user prelude; true omits that prelude while preserving the system safety instructions and original application Skill content. SDK/CLI contract negotiation and runtime readback must agree. See the source manifest and patched public SDK types for the exact revision.

This is a product-specific candidate, not a claim that the complete upstream suite or production deployment has passed. Real models, credentials, network services, UI, OS sandbox and retention need their respective integration acceptance.

The regression script intentionally runs focused suites. Its ProcessTransport invocation selects the three system-prompt argument cases and skips the other legacy fixtures; this is not a full upstream test-suite pass. The initialize control response reads the already-constructed Config value before the later Config.initialize lifecycle completes; system/host_policy is the post-initialization hook/tool registration readback.

Upstream RUM usage statistics and OTel export are hard-disabled in this managed build, including enabled values in environment, settings, CLI or Config parameters. Both initialize and host_policy read back upstream_usage_statistics_enabled=false and upstream_telemetry_enabled=false; the SDK rejects anything else. Local provider-attempt events remain available for the application's explicit observability exporter. The test-only preload blocks outgoing Node network APIs before imports and substitutes a deterministic localhost DNS answer without real DNS. It is not an OS sandbox.
