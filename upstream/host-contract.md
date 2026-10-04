# Managed host capability and attempt contract

[中文](managed-host-contract.zh-CN.md)

## Purpose

A breaking, product-specific Qwen v0.24.7 patch: fail-closed exact session capabilities, SDK function hooks and per-provider-send observability. Existing auto-approval rules never grant capability. This patch is not an OS sandbox and does not claim production readiness.

## Policy and ownership

SDK query options carry a required exact-name list serialized as JSON through CLI. Config snapshots it; child overlays intersect it. Registry disclosure and execution gates independently enforce final tool names. Monotone private sidecars preserve restrictions across fresh-process resume/fork; old sessions without policy fail. In-process session transitions are rejected rather than reusing stale registries. Policy storage must reside outside model-writable directories under a controlled HOME. Managed CLI uses bare config. Generic daemon context execution without authenticated policy is denied, not silently granted.

## Hooks

SDK initialization registers typed callbacks. Config installs them immediately after HookSystem creation. The existing SDK control channel routes callbacks and cancellation; matcher/deadline and explicit blocking output preserve core semantics. Managed runtime refuses command/HTTP hooks, including dynamically registered skill hooks. Before-tool callback failure blocks. Bare mode keeps ambient configuration blocked while allowing managed SDK function hooks. Explicit `disableAllHooks`, initialization `skipHooks`, safe mode and shell sandboxing still disable hooks. Hook listings use actual runtime enablement for managed session function callbacks.

## Startup context and version

SDK `0.1.17` requires managed contract `2` without an older-contract fallback. `skipStartupContext?: boolean` defaults to `true` in the SDK, CLI and managed Config. The SDK sends an explicit `--skip-startup-context=true|false`; ambient model settings and `extraArgs` cannot override it. The existing initial-history composer skips only the startup user identity/environment prelude. Explicit `false` restores that prelude. Available skill/tool reminders and system safety instructions keep their existing semantics. An explicit system prompt remains byte-exact, including a Skill with YAML frontmatter: prompt values travel in a single `--system-prompt=...` or `--append-system-prompt=...` argument.

The CLI initialize response advertises `capabilities.managed_host_contract_version: 2` and `capabilities.can_skip_startup_context: true`. Both initialize and `system/host_policy` read `skip_startup_context` directly from the initialized Config. SDK initialization rejects missing or different capability/version and a readback unequal to the requested/default boolean. This is effective runtime state, not an echo of requested options.

## Upstream telemetry

The managed build hard-disables upstream usage statistics (Alibaba RUM) and upstream OpenTelemetry export. The CLI configuration, central telemetry resolver (including daemon startup), and core Config force both effective flags to `false`, even when arguments, environment, settings, or constructor parameters request `true`. This is a build invariant, not a new option or a bare-mode behavior change. Existing local provider-attempt events continue; the application owns Langfuse export.

Initialize and `system/host_policy` expose `upstream_usage_statistics_enabled` and `upstream_telemetry_enabled` from the real Config getters. SDK `0.1.17` contract `2` requires both initialize values to be exactly `false`; missing, enabled, and malformed values fail initialization. The application also checks the effective policy readback before use.

## Attempts

A context-local controller creates independent child spans and stable IDs at provider SDK sends, after adapter conversion. Provider internal retries are disabled so each attempted SDK send is observable. Semantic request, per-field capture state, partial output, usage and errors remain attached to the same attempt. Capture is disabled by default; sanitizer drops transport/auth fields and controlled oversize storage returns opaque expiry-bound references. This is not HTTP-byte capture or access to private model reasoning. SDK stream-json system/provider_attempt messages expose both phases.

## Verification and limits

Use official pinned dependencies and synthetic provider mocks. Test deny-all, future names, final MCP collision names, cached execution, child intersections, resume monotonicity, blocked hooks, retry/fallback pairing, cancellation and oversize state. Verify SDK argument serialization through the actual CLI parser, Config initialization, real prompt composer and OpenAI request pipeline with only the provider SDK send mocked. Cover default/true/false, exact Skill content, native system safety, reserved-argument bypasses and failed capability/readback handshakes. Real Config tests must also prove that enabling upstream telemetry through params, environment, settings, and CLI cannot create a RUM logger or enable OTel; local provider-attempt start/finish events must still arrive. Tests run behind a process preload that blocks network APIs before application imports and records zero network attempts. Run build/typecheck and record failures separately from passing focused tests. No real credential/model requests, socket listener or UI are part of cloud evidence. Product sandbox, allowlisted MCP startup, full controlled resource roots, Langfuse transport and UI are separate release gates.
