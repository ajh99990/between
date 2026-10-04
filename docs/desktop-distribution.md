# Between desktop portable distribution

## What is delivered

A versioned Linux portable application directory and deterministic `.tar.gz`, with a SHA-256 sidecar and `distribution-manifest.json` inventory. Main, preload and broker are compiled and bundled from current TypeScript sources. Private workspace packages are inlined. Renderer, character, Skills and the standalone MCP's generated publish output are copied into the directory. Nothing loads the old root `dist`, a pnpm workspace link, the source checkout, or the caller's working directory.

This is a dependency-installable directory distribution, not an offline self-contained executable, signed macOS application, DMG, Windows installer or production release. Its complete public dependency closure is pinned with official registry URLs and integrity values in the generated `package-lock.json`. The source of that deployment-only lock is the public `config/desktop-install-lock.json`; it is pruned and checked against the artifact manifest at packaging time. First-party development retains its single root pnpm lock.

## Build in the monorepo

Use Node.js 24 and the repository's pinned pnpm. Build the MCP publish output first, then package. The packaging command reads main/broker/workspace TypeScript sources directly, not their previous `dist` files.

```sh
pnpm run build
node scripts/package-desktop.mjs --out artifacts/desktop
node --test tests/packaging/desktop.test.mjs
```

Existing version directories are never overwritten. Use a fresh output directory for a repeated build. The archive is deterministic for identical source, dependency, asset and documentation bytes. Only allowlisted product directories are included; databases, credentials, local runtime config, vendor runtime trees, tests and workspace `node_modules` are excluded.

## Install outside the checkout

Extract into a user-owned writable directory on Linux, with no inherited workspace `node_modules`. Verify the tarball hash against the supplied checksum before extracting. The directory is writable because the current desktop stores its synthetic/new local data and Electron profile under `.runtime` beside the application; do not install it into a read-only system location.

```sh
sha256sum -c between-desktop-0.1.0.tar.gz.sha256
tar -xzf between-desktop-0.1.0.tar.gz
cd between-desktop-0.1.0
npm ci --omit=dev
npm start
```

Installation requires official public npm packages and the official Electron binary. `better-sqlite3` installs or builds for the external Node.js 24 ABI. A C/C++ toolchain may be needed if no matching native prebuild is available. A working supported Linux desktop/display and Electron sandbox are required for the GUI. Do not use `--no-sandbox`, change OS security settings or open a network listener to get this candidate to launch.

`npm start` runs `launch.mjs` using Node.js 24, first checks native SQLite with that interpreter, then launches the official pinned Electron binary. It sets `REL_NODE` to that Node interpreter's absolute path. Electron main starts the broker with that external executable. SQLite is never loaded by Electron main, and must not be rebuilt for the Electron ABI. Preload is a CommonJS bundle requiring only Electron. Renderer retains sandbox, context isolation and the narrow preload API.

A broker-only verification uses ordinary JSON-lines stdin/stdout, without Electron, providers or a listener:

```sh
REL_DB=/absolute/new-test-directory/relationship.db node /absolute/between-desktop-0.1.0/broker.mjs
```

Send a line such as `{"schema_version":1,"id":"bbdd7b9e-9b69-4890-936f-1b19a5bc78b8","action":"snapshot"}`. End stdin or send SIGTERM for clean shutdown. Both launchers derive product assets from their own location; an unrelated current working directory is supported. The test must use a new synthetic database and must never point at a real user database.

## Separate Qwen runtime and consent

The frozen Qwen runtime is deliberately not in this application tarball. Follow the repository's independently versioned, verified Qwen preparation procedure and put an explicit `runtime-config.json` beside this installed app. The included example contains paths and hash placeholders only. Recompute configuration paths for the installed runtime; do not copy a developer's absolute paths. The complete runtime tree and SDK/CLI entry hashes must pass the existing adapter's verification. Provider values stay outside configuration; only selected provider environment names are forwarded. No credential, model request, successful provider turn, or Langfuse connection is implied by packaging.

Memory remains off by default. Linux Electron `basic_text` is not accepted as a secure receipt key backend; without a suitable secure backend the off-memory send path fails closed. Packaging must not switch memory on or introduce a plaintext fallback.

## Verification layers

`desktop.test.mjs` checks private dependency elimination, executable/source independence, exact assets, archive reproducibility, no symlinks, no stale desktop output and safe repeat behavior. `desktop-install.test.mjs` is the opt-in network/native integration test:

```sh
BETWEEN_DESKTOP_INSTALL_TEST=1 node --test tests/packaging/desktop-install.test.mjs
```

That test extracts a fresh artifact under `/tmp`, installs the manifest's public dependencies without workspace links, resolves and exercises native SQLite using Node.js 24, checks the official Electron binary separately with `--version`, and runs the packaged broker twice from an unrelated working directory. It checks snapshot IPC, input validation, persisted controls, clean shutdown and installed assets. It does not launch an interactive Electron window, use provider credentials, or prove a model reply. Actual sandboxed Electron UI verification is a separate acceptance step and must report its own evidence or blocker.

When an authorized official npm/Electron cache is already available, the same integration test supports `BETWEEN_DESKTOP_OFFLINE_INSTALL=1`, `BETWEEN_DESKTOP_NPM_CACHE=/absolute/npm-cache`, and `BETWEEN_DESKTOP_ELECTRON_CACHE=/absolute/electron-cache`. It performs a real `npm ci --offline --ignore-scripts` into the fresh directory, then runs Electron's official installer against that binary cache. The cache contains package bytes, never workspace links; a missing cache entry is a failure, not permission to change registry or bypass network controls. Native SQLite must still load successfully from the installed package. The verification report records which install mode ran.

The optional visual fixture is synthetic original text/geometric artwork; it is not a reproduction or visual acceptance result for the privately supplied screenshot. Third-party screenshot crops and historical evidence are excluded by the renderer asset allowlist.
