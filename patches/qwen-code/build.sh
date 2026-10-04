#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
work=${1:-"$root/work"}
mkdir -p "$work"
work=$(cd "$work" && pwd)
archive="$work/qwen-v0.24.7.tar.gz"
if [ ! -f "$archive" ]; then
  curl --fail --location --output "$archive" https://codeload.github.com/QwenLM/qwen-code/tar.gz/refs/tags/v0.24.7
fi
printf '%s  %s\n' aa7082cbf80590dbc481209f49402b369879868302dda2836f8ae0a1329120d3 "$archive" | sha256sum --check
repo="$work/qwen-code-0.24.7"
if [ -e "$repo" ]; then
  echo 'Use a fresh work directory; existing source is not overwritten.' >&2
  exit 1
fi
tar -xzf "$archive" -C "$work"
cd "$repo"
git apply --check "$root/qwen-v0.24.7-managed-host.patch"
git apply "$root/qwen-v0.24.7-managed-host.patch"
python3 "$root/verify-source.py" "$repo"
cmp pnpm-lock.yaml "$root/pnpm-lock.yaml"
export COREPACK_HOME="$work/corepack-cache"
corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir "$work/pnpm-store"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
npm run generate
npm run build:managed-host
python3 "$root/generate-runtime-manifest.py" "$repo" "$work/runtime-manifest.json"
printf 'Built runtime: %s\nManifest: %s\n' "$repo" "$work/runtime-manifest.json"
