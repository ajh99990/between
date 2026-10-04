# Between development candidate

TypeScript + Electron relationship-chat prototype with one fictional AI character, adult/AI disclosure, memory off by default, a durable SQLite coordinator, restricted Qwen host and relationship MCP. This is an implementation candidate; real model replies remain zero and the complete roadmap/release gates have not passed.

## Build and test

Use Node24 and the exact package lock. Install official dependencies in a normal supported environment:

```sh
npm ci --ignore-scripts
npm test
node scripts/evaluate.mjs /absolute/path/to/a-new-evaluation-result.json
```

The evaluation runner performs a clean build and refuses to overwrite an existing output. It executes18 synthetic production-function fixtures; it does not score model quality. Clean builds remove dist so deleted legacy files cannot survive. If the platform needs a native SQLite rebuild, use a writable node-gyp cache and the normal official toolchain; do not disable security features.

To run the desktop, install the pinned Electron binary with its official installer (`node node_modules/electron/install.js`) in a supported graphical environment, then `npm start`. Do not use no-sandbox or a network tunnel to bypass an environment denial. Linux basic_text is not an accepted secure key store: when protected encryption is unavailable, memory-off receipt ingestion fails closed rather than persisting plaintext.

## Rebuild the host from public source

See [vendor/qwen-managed-host/README.md](vendor/qwen-managed-host/README.md). The exact public upstream archive, checksum, maintained patch, source manifest, build and runtime-binding scripts are included. No private Library artifact is needed. Keep the full CLI/SDK distributions and their official fixed-lockfile dependencies; a loader alone is insufficient.

The generated runtime configuration contains only paths, hashes, provider and explicitly selected environment variable names. No credential values belong in this repository. Missing configuration/authorization returns a system error and never a fake character reply or a fallback to an old host.

## Data safety and scope

Schema4 uses a separate current privacy authority. Old schemas are rejected, not migrated. Full-relationship deletion supports immediate suppression, a separate ten-minute one-use confirmation, cancellation, crash-resumable cleanup, scoped indexes/cache removal and old-grant rejection. See [privacy and backups](docs/privacy-and-backups.md).

The encrypted backup API currently validates only into disposable staging. It does not activate a restored database, recover a corrupt current authority, schedule automatic backups or offer a backup UI. Any deleted scope currently blocks subsequent whole-database backups. Partial-range deletion, full user export and new-relationship creation UI remain unimplemented. These are development gaps, not environment limitations.

Observation capture is disabled by default. Normalization, omission states and business-independent gap recording are implemented; the collector configuration is a candidate, not proof of a working Langfuse deployment, absolute queue TTL or physical disk cap. See [observability](docs/observability.md).

## Evidence and limits

The reviewed app candidate passed137 Node tests and independent hash checks, plus18 deterministic evaluation cases. Test layers include real SQLite/Node subprocesses, synthetic host contracts and mock-DOM renderer checks. Actual Electron onboarding/start/close has been observed in a cloud GUI; settings/deletion GUI interactions were not permitted, and the reference-size visual comparison has not passed. No real model, platform HTTP/API/DB/UI, complete packaging or release-quality claim is made.

Third-party WeChat reference screenshots and derived image crops are intentionally absent from this public repository. They are optional local visual-QA inputs, not required for the normal interface or npm test. The normal UI uses text avatars. REL_VISUAL and the visual preparation scripts require separately supplied reference assets; they are not real conversation evidence.

## Licensing

Third-party license notices are retained in licenses/ and the Qwen patch subtree. No license has been selected for the original application code yet; public availability alone does not grant an open-source license. A license decision and full release review remain required before describing this as an open-source release.
