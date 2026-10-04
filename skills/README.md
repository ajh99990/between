# Between Skill content releases

Skills are versioned content assets, not npm packages. The CLI uses Node built-ins only, never executes files in an archive, and requires no credentials or network access. `relationship/SKILL.md` keeps the existing role behavior; `relationship/skill.json` records release identity, an explicit content-file allowlist, required/optional capabilities, and supported product schema versions.

## Validate and package

From the repository root:

```sh
node scripts/skills.mjs validate --source skills/relationship
node scripts/skills.mjs pack --source skills/relationship --out /absolute/path/to/new-release-dir
node --test tests/packaging/skills.test.mjs
```

After building the workspace, `pnpm test:skills` additionally checks the named schema version and declared tools against the public `@between/contracts/host` exports. Only that contract-alignment test uses a workspace package; the installer and standalone packaging tests do not.

`pack` prints JSON with the absolute artifact path, archive SHA256, and full manifest. Outputs are:

- `between-skill-relationship-0.1.0.tar`: deterministic, uncompressed USTAR content archive
- `between-skill-relationship-0.1.0.tar.sha256`: archive checksum for publishing through a trusted release channel

The archive contains `manifest.json`, `content/SKILL.md`, and the explicitly declared references. The manifest contains content version, format/schema version, supported product schema versions, capabilities, each file's size/SHA256, and a combined content-inventory hash. There is no `package.json`, installer code, credential, user memory, or runtime database in the content archive. Versions must be exact stable SemVer values; bump the descriptor version when content changes. Output files are never overwritten. Use a new release-output directory when rebuilding the same version for reproducibility checks.

The source allowlist is checked against the entire skill directory. Unlisted files, unsupported extensions, symlinks, hardlinks, special files, missing references, missing headings, and invalid metadata fail the build. Only Markdown, text, JSON, PNG, JPEG, and WebP assets are accepted. A source file named `skill.json` is metadata and is not shipped as content. `manifest.json` is reserved for the generated installation record.

## Install into an explicitly selected directory

The installer is the standalone, trusted `scripts/skills.mjs` file; it can be distributed separately alongside the release. Copy it and the archive outside this repository. It does not import any repository module, npm dependency, development source, or `cwd` resource.

```sh
node /path/to/trusted/skills.mjs inspect \
  --artifact /path/to/between-skill-relationship-0.1.0.tar \
  --sha256 <expected-sha256-from-trusted-release>

node /path/to/trusted/skills.mjs install \
  --artifact /path/to/between-skill-relationship-0.1.0.tar \
  --to /your/explicitly/selected/skills/relationship \
  --sha256 <expected-sha256-from-trusted-release> \
  --schema-version 1 \
  --capability relationship.read_context \
  --capability relationship.remember_user_report
```

The destination's parent directory must already exist, must have no symlink components, and should be writable only by the trusted installer user. The destination itself must not exist. Installation refuses overwrite, upgrade-in-place, existing links, or incompatible schemas/missing required capabilities. On a write failure, its newly created destination is removed. No default or global host directory is chosen, and no shell startup file, host configuration, permission, or credential is changed. To upgrade, install into a new versioned directory and explicitly select it in the host. Active host selection is outside this content installer.

`product_schema: "between.host-context"` names the neutral per-turn host-context/product-command contract. Its supported version is 1, matching the current contracts schema; this is separate from the internal database schema (currently 5). `schema_version: 1` on the manifest itself is the asset-metadata format version.

`--schema-version` and `--capability` describe the target host's already implemented contract. They do not create tools or grant consent. `relationship.read_context` is required. `relationship.remember_user_report` is optional and remains subject to current memory controls. The CLI cannot independently prove the truth of the target's declarations; perform the host's authorization/integration tests separately.

Installed resources live directly at `<destination>/SKILL.md` and `<destination>/references/compatibility.md`, with the verified `manifest.json` beside them. Resolve links relative to the installed Markdown file. Loading and any host-specific skill discovery belong to the host adapter. No untested generic host is claimed to discover or activate this skill automatically.

## Trust and format limits

SHA256 validates integrity only when the expected hash comes from an independently trusted release channel. A checksum supplied with an untrusted download is not an authenticity guarantee, and a signed release system is not implemented here. Installation requires the expected hash rather than treating an archive's own manifest as sufficient authority. Review skill text and the trusted installer before granting a host access to it.

This is a deliberately narrow USTAR subset, not a general `tar` replacement: regular-file entries only, with canonical relative portable paths; no symlinks, hardlinks, directories, device nodes, GNU/PAX extensions, compression, or nested extraction. Unknown/unlisted entries, duplicate/case-colliding paths, invalid TAR checksum/padding/end markers, hash mismatches, and path escapes are rejected before destination creation. Limits are 128 content files, 512 KiB per content file, 2 MiB total content, 64 KiB manifest, and 3 MiB archive. Asset extensions are allowlisted; nothing from the archive is executed.

Frontmatter intentionally supports exactly `name` and `description` as unique, nonempty, plain single-line scalar fields with LF newlines. Advanced YAML, duplicate/unknown properties, scalar ambiguity, and empty bodies are rejected rather than guessed. Markdown references support explicit links/images, defined reference-style links, and heading fragments. Unsupported complex link syntax and HTML links/assets fail validation. Relative links may move within the installed content tree but must resolve to an inventoried file and must never escape it. Remote HTTP(S) links are syntactically checked, never fetched, and cannot contain credentials.

Packaging tests exercise real packaged/installed relationship content plus synthetic attack fixtures. A separate isolation test copies the single-file CLI into a temporary directory, deletes the synthetic source, switches to an unrelated working directory, installs from the actual artifact, and reads every linked installed resource. These tests do not call Qwen, a model, the network, or a live MCP service; no live-host acceptance is implied.
