#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"

DEFAULT_OUTPUT_DIR="/Users/kevinrochowski/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Core/Integrations/Luma"
OUTPUT_DIR="${LUMA_OUTPUT_DIR:-$DEFAULT_OUTPUT_DIR}"

RUNTIME_ROOT="$REPO_ROOT/.runtime"
RUNTIME_TMP="$RUNTIME_ROOT/tmp"
RUNTIME_CACHE="$RUNTIME_ROOT/cache"
RUNTIME_HOME="$RUNTIME_ROOT/home"
RUNTIME_LOGS="$RUNTIME_ROOT/logs"
RUNTIME_PLAYWRIGHT="$RUNTIME_ROOT/playwright-browsers"

mkdir -p "$OUTPUT_DIR" "$RUNTIME_TMP" "$RUNTIME_CACHE" "$RUNTIME_HOME" "$RUNTIME_LOGS" "$RUNTIME_PLAYWRIGHT"

export LUMA_REPO_ROOT="$REPO_ROOT"
export LUMA_OUTPUT_DIR="$OUTPUT_DIR"
export LUMA_HEADLESS="true"
export HOME="$RUNTIME_HOME"
export TMPDIR="$RUNTIME_TMP"
export XDG_CACHE_HOME="$RUNTIME_CACHE"
export PLAYWRIGHT_BROWSERS_PATH="$RUNTIME_PLAYWRIGHT"

TSC_BIN="$REPO_ROOT/node_modules/.bin/tsc"
CLI_ENTRY="$REPO_ROOT/dist/src/cli/index.js"
NODE_BIN="$(command -v node)"

if [[ ! -x "$TSC_BIN" ]]; then
  echo "Missing tsc at $TSC_BIN. Run npm install first." >&2
  exit 1
fi

PROFILE_PATH="$RUNTIME_TMP/luma-agent.sb"

"$TSC_BIN" -p "$REPO_ROOT/tsconfig.json"

cat > "$PROFILE_PATH" <<PROFILE
(version 1)
(deny default)
(import "system.sb")

(allow process*)
(allow network-outbound)

(allow file-read* (subpath "/System"))
(allow file-read* (subpath "/Library"))
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/private"))
(allow file-read* (subpath "/dev"))
(allow file-read* (subpath "/etc"))
(allow file-read* (subpath "/opt"))

(allow file-read* (subpath "$REPO_ROOT"))
(allow file-read* (subpath "$OUTPUT_DIR"))

(allow file-write* (subpath "$REPO_ROOT"))
(allow file-write* (subpath "$OUTPUT_DIR"))
PROFILE

if command -v sandbox-exec >/dev/null 2>&1; then
  exec sandbox-exec -f "$PROFILE_PATH" "$NODE_BIN" "$CLI_ENTRY" run-daily
fi

if [[ "${LUMA_ALLOW_UNSAFE_NO_SANDBOX:-0}" != "1" ]]; then
  echo "sandbox-exec is unavailable. Refusing to run unsandboxed." >&2
  echo "Set LUMA_ALLOW_UNSAFE_NO_SANDBOX=1 only if you explicitly accept this risk." >&2
  exit 1
fi

echo "WARNING: running without OS sandbox because LUMA_ALLOW_UNSAFE_NO_SANDBOX=1" >&2
exec "$NODE_BIN" "$CLI_ENTRY" run-daily
