# Dependency notices

Generated with `node scripts/collect-licenses.mjs` from the installed exact pnpm graph. `dependency-manifest.json` records package versions and license declarations; notices present in each official archive are preserved byte-for-byte. This platform's optional binary packages are included; other-platform binaries retain the notices shipped with their own official distributions.

Three official archives in this installed graph do not contain a top-level notice file: `@electron-internal/extract-zip` declares BSD-2-Clause, `character-card-utils` declares ISC, and `@esbuild/linux-x64` declares MIT. Their manifest declarations are recorded without inventing author/copyright wording. The esbuild distribution's own MIT text is preserved separately. Review all target-platform notices before a signed/public binary release.

Qwen upstream is separately covered by `upstream/QWEN-LICENSE`. First-party Between has no selected license yet; these notices do not license first-party code.
