#!/usr/bin/env bash
set -euo pipefail
cd "${1:?Pass the built Qwen root}"
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
HOME="$home" QWEN_HOME="$home" QWEN_RUNTIME_DIR="$home" node dist/cli.js --version
HOME="$home" QWEN_HOME="$home" QWEN_RUNTIME_DIR="$home" node dist/cli.js --help | grep -E 'session-tool-allowlist|capture-provider-content|provider-capture-max-bytes'
