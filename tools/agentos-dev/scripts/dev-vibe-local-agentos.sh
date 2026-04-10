#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
AGENTOS_PORT="${AGENTOS_PORT:-6420}"
VIBE_LOCAL_PORT="${VIBE_LOCAL_PORT:-5274}"

is_listening() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${AGENTOS_PID:-}" ]]; then
    kill "$AGENTOS_PID" 2>/dev/null || true
  fi

  if [[ -n "${VIBE_LOCAL_PID:-}" ]]; then
    kill "$VIBE_LOCAL_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

if is_listening "$AGENTOS_PORT"; then
  echo "Reusing existing agentOS manager on port ${AGENTOS_PORT}"
else
  pnpm --filter @kazuph/agentos-dev run dev &
  AGENTOS_PID=$!
fi

if is_listening "$VIBE_LOCAL_PORT"; then
  echo "Reusing existing vibe-local dev server on port ${VIBE_LOCAL_PORT}"
else
  pnpm --filter @kazuph/vibe-local-pyodide run dev -- --host 127.0.0.1 &
  VIBE_LOCAL_PID=$!
fi

if [[ -n "${AGENTOS_PID:-}" || -n "${VIBE_LOCAL_PID:-}" ]]; then
  wait -n ${AGENTOS_PID:-} ${VIBE_LOCAL_PID:-}
else
  echo "agentOS manager and vibe-local dev server are already running."
  echo "Open http://localhost:${VIBE_LOCAL_PORT}/"
fi
