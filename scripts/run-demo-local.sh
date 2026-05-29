#!/usr/bin/env bash
# run-demo-local.sh — start the Fovea demo end-to-end on the local
# machine. Fetches the CC-licensed clip set, starts Postgres + Redis
# via docker compose, runs the migrations, kicks off the backend and
# frontend dev servers with the demo env flags wired, and opens the
# landing page.
#
# Idempotent: re-running picks up where it left off — cached source
# videos aren't re-downloaded, existing containers are reused.
#
# Usage:
#   ./scripts/run-demo-local.sh             # full bring-up
#   ./scripts/run-demo-local.sh --no-fetch  # skip the clip fetch step
#   ./scripts/run-demo-local.sh --stop      # tear down the stack
#
# Requirements:
#   docker (compose v2), node, pnpm, yt-dlp, ffmpeg, jq

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="${REPO_ROOT}/server"
FRONTEND_DIR="${REPO_ROOT}/annotation-tool"
CLIPS_DIR="${FRONTEND_DIR}/demo/clips"
PID_DIR="${REPO_ROOT}/.demo-local"

mkdir -p "$PID_DIR"

# Demo-mode env flags. Token is a stable dev-only value so the same
# fetch script + seeder + frontend agree without further config.
export FOVEA_DEMO_MODE=true
export FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH=true
export FOVEA_DEMO_SEED_TOKEN="dev-only-demo-seed-token-must-be-32-chars-or-more"
export STORAGE_PATH="$CLIPS_DIR"
# Frontend Vite env — read at build time so the demo router actually mounts.
export VITE_FOVEA_DEMO_MODE=true
# Model-service: CPU build by default so the demo runs without CUDA.
# `minimal` mode ships detection + tracking + audio (everything Tour 6
# and Tour 7 actually exercise) without pulling in vLLM, which is
# GPU-only and won't compile on a CPU image — `full` mode tries to and
# fails with "RuntimeError: Unknown runtime environment". Local-LLM
# claim extraction (Tour 7's downstream piece) falls back to the
# Anthropic / OpenAI / Google API key paths when configured via .env.
export MODEL_BUILD_MODE="${MODEL_BUILD_MODE:-minimal}"
export DEVICE="${DEVICE:-cpu}"
# PRELOAD_MODELS at build time hits an Ubuntu 24.04 / pip layout mismatch
# (preload_models.py tries to `import yaml` but the production stage's
# COPY --from=builder-base /usr/local/lib/python3.12 misses pyyaml's
# install location). Default off — models cold-start on first /detect
# or /thumbnail call (~10-30 s) but the build itself completes.
export PRELOAD_MODELS="${PRELOAD_MODELS:-false}"
export MODEL_SERVICE_URL="${MODEL_SERVICE_URL:-http://localhost:8000}"

usage() {
  cat <<EOF
$(basename "$0") — Fovea demo bring-up

  (no args)    Fetch clips, start the stack, open the landing page.
  --no-fetch   Skip the yt-dlp / ffmpeg fetch step (use cached clips).
  --stop       Tear down: stop dev servers, leave Postgres/Redis up.
  --reset      Stop dev servers AND drop the demo DB volume.
  --help       This message.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: $1 is required (install via brew install $1 or your package manager)" >&2
    exit 1
  fi
}

require_all() {
  for c in docker node pnpm yt-dlp ffmpeg jq curl; do require_cmd "$c"; done
}

stop_dev_servers() {
  for f in "$PID_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    local pid
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      echo "  stopping $(basename "$f" .pid) (pid $pid)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  done
}

start_infra() {
  echo "==> bringing up Postgres + Redis"
  (cd "$REPO_ROOT" && docker compose -f docker-compose.yml up -d postgres redis)
  # Wait for Postgres to accept connections — the migration step below
  # races otherwise on first boot.
  for _ in $(seq 1 30); do
    if (cd "$REPO_ROOT" && docker compose -f docker-compose.yml exec -T postgres pg_isready -U fovea >/dev/null 2>&1); then
      echo "  postgres ready"
      break
    fi
    sleep 1
  done

  echo "==> bringing up model-service (CPU, mode=$MODEL_BUILD_MODE, preload=$PRELOAD_MODELS)"
  echo "    first-time build can take ~10-15 min (downloading CV/audio model weights)"
  (cd "$REPO_ROOT" && docker compose -f docker-compose.yml up -d --build model-service)
  for i in $(seq 1 180); do
    if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
      echo "  model-service ready (took ${i}s)"
      return
    fi
    sleep 1
  done
  echo "warning: model-service didn't respond on :8000 within 3 min — continuing anyway." >&2
  echo "  check: docker compose -f docker-compose.yml logs model-service" >&2
}

run_migrations() {
  echo "==> running prisma migrations"
  (cd "$SERVER_DIR" && pnpm exec prisma migrate deploy)
}

fetch_clips() {
  echo "==> fetching demo clips (yt-dlp + ffmpeg)"
  "$FRONTEND_DIR/demo/scripts/fetch-demo-clips.sh"
}

start_backend() {
  echo "==> starting backend (server/dev) on :3001"
  (cd "$SERVER_DIR" && nohup pnpm dev >"$PID_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid")
  # Wait for /api/health to respond.
  for _ in $(seq 1 30); do
    if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
      echo "  backend ready"
      return
    fi
    sleep 1
  done
  echo "error: backend did not become ready within 30s — see $PID_DIR/backend.log" >&2
  exit 1
}

start_frontend() {
  echo "==> starting frontend (vite) on :5173"
  (cd "$FRONTEND_DIR" && nohup pnpm dev >"$PID_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid")
  for _ in $(seq 1 30); do
    if curl -sf http://localhost:5173 >/dev/null 2>&1; then
      echo "  frontend ready"
      return
    fi
    sleep 1
  done
  echo "error: frontend did not become ready within 30s — see $PID_DIR/frontend.log" >&2
  exit 1
}

open_browser() {
  local url="http://localhost:5173/"
  echo
  echo "==> demo is up at $url"
  echo "    tour menu, fixture seeder, and 10 tour scripts are live."
  echo "    logs: tail -f $PID_DIR/backend.log $PID_DIR/frontend.log"
  echo "    stop: $0 --stop"
  if command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url"
  fi
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --stop) stop_dev_servers; exit 0 ;;
  --reset)
    stop_dev_servers
    (cd "$REPO_ROOT" && docker compose -f docker-compose.yml down -v)
    rm -rf "$PID_DIR"
    echo "  demo stack torn down + DB volume dropped"
    exit 0
    ;;
esac

require_all
start_infra
run_migrations
if [[ "${1:-}" != "--no-fetch" ]]; then
  fetch_clips
else
  echo "==> skipping clip fetch (--no-fetch)"
fi
start_backend
start_frontend
open_browser
