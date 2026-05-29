#!/usr/bin/env bash
# Fetch + transcode the CC-BY-NC-SA demo clips listed in clips.json.
#
# This script materializes the demo clips locally; the clip media files
# are NOT committed to the repository (see ../clips/.gitignore). Run as
# part of the demo deployment build so the booth laptop / demo CDN has
# the actual files; the source repo just carries the manifest + the
# fetch instructions.
#
# Why this approach: the CC-BY-NC-SA license covers the clips, but we
# don't need to redistribute KEXP's bytes ourselves — the script is the
# documentation of what we're using, the manifest is the citation, and
# the runtime fetch keeps the license trail attached to the original
# uploader.
#
# Requirements: yt-dlp, ffmpeg, jq.
#
# Usage:
#   ./fetch-demo-clips.sh                  # fetch everything in clips.json
#   ./fetch-demo-clips.sh frahm-2015-cu-keys  # fetch one clip by id
#   FOVEA_DEMO_CLIPS_DIR=/some/path ./fetch-demo-clips.sh  # custom output dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/clips.json"
OUTPUT_DIR="${FOVEA_DEMO_CLIPS_DIR:-${SCRIPT_DIR}/../clips}"
CACHE_DIR="${FOVEA_DEMO_CACHE_DIR:-${SCRIPT_DIR}/../.cache/sources}"

# Per-clip target size — plan §7 caps at ≤ 5 MB / ≤ 30 s. CRF 30 + 96k
# audio + 720p ceiling lands well under for a 25 s clip; we re-check
# the output size afterward and warn if anything slipped past 5 MB.
VIDEO_CRF=30
VIDEO_MAX_HEIGHT=720
AUDIO_BITRATE=96k
MAX_BYTES=$((5 * 1024 * 1024))

mkdir -p "$OUTPUT_DIR" "$CACHE_DIR"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: $1 is required (install via brew install $1 or your package manager)" >&2
    exit 1
  fi
}
require yt-dlp
require ffmpeg
require jq

fetch_source() {
  local source_id="$1"
  local source_url="$2"
  local cache_file="${CACHE_DIR}/${source_id}.mp4"

  # Diagnostic messages must go to stderr — the caller does
  # `source_file=$(fetch_source ...)` which captures stdout, so any
  # human-readable status that lands on stdout becomes part of the
  # returned path and makes ffmpeg open a multi-line filename. Only
  # the final cache_file path is allowed on stdout.
  if [[ -f "$cache_file" ]]; then
    echo "  source cached: $cache_file" >&2
  else
    echo "  fetching source: $source_url" >&2
    # 720p ceiling keeps the source manageable; ffmpeg downscales as
    # needed during the clip extraction below. yt-dlp's progress bar
    # also goes to stderr by default but we route stdout explicitly
    # just in case any future yt-dlp version starts emitting status.
    yt-dlp \
      -f "bv*[height<=${VIDEO_MAX_HEIGHT}]+ba/b[height<=${VIDEO_MAX_HEIGHT}]" \
      --merge-output-format mp4 \
      -o "$cache_file" \
      "$source_url" >&2
  fi
  echo "$cache_file"
}

clip_one() {
  local clip_id="$1"
  local source_file="$2"
  local start_sec="$3"
  local duration_sec="$4"
  local out_file="${OUTPUT_DIR}/${clip_id}.mp4"

  echo "  extracting clip: $clip_id (start=${start_sec}s, dur=${duration_sec}s)"
  # Scale to fit inside VIDEO_MAX_HEIGHT on whichever dimension is
  # smaller. Width=-2 forces even number divisible by 2 (libx264 yuv420p
  # requires it). Keeps aspect ratio; clips that are already smaller
  # pass through untouched.
  # Critical: ffmpeg's stdin MUST be redirected (</dev/null) because
  # this function runs inside a `while read clip_json; done < <(jq ...)`
  # loop and ffmpeg would otherwise consume the next clip's JSON line
  # from the loop's stdin pipe, treating it as keyboard input ("Enter
  # command: ..."), then jq errors when the truncated stream loops
  # back into a partial JSON object on the next read.
  ffmpeg -hide_banner -loglevel error -y \
    -ss "$start_sec" -i "$source_file" -t "$duration_sec" \
    -c:v libx264 -crf "$VIDEO_CRF" -preset slow \
    -vf "scale=-2:${VIDEO_MAX_HEIGHT}" \
    -c:a aac -b:a "$AUDIO_BITRATE" \
    -movflags +faststart \
    "$out_file" </dev/null

  local size
  size=$(stat -f%z "$out_file" 2>/dev/null || stat -c%s "$out_file")
  if (( size > MAX_BYTES )); then
    echo "  warning: $out_file is $size bytes (> ${MAX_BYTES} cap) — consider raising CRF or lowering height" >&2
  fi
  echo "  wrote: $out_file ($size bytes)"
}

main() {
  local target_clip_id="${1:-}"
  local clip_count=0

  # Walk every clip in the manifest. jq -c emits one JSON object per
  # line, which the read loop can pull apart with jq's -r per-field
  # without losing strings that contain shell metacharacters.
  while read -r clip_json; do
    local clip_id source_id start_sec duration_sec
    clip_id=$(jq -r '.id' <<<"$clip_json")
    source_id=$(jq -r '.sourceId' <<<"$clip_json")
    start_sec=$(jq -r '.startSec' <<<"$clip_json")
    duration_sec=$(jq -r '.durationSec' <<<"$clip_json")

    if [[ -n "$target_clip_id" && "$clip_id" != "$target_clip_id" ]]; then
      continue
    fi

    local source_url
    source_url=$(jq -r --arg sid "$source_id" '.sources[] | select(.id == $sid) | .sourceUrl' "$MANIFEST")
    if [[ -z "$source_url" || "$source_url" == "null" ]]; then
      echo "error: clip $clip_id references unknown sourceId $source_id" >&2
      exit 1
    fi

    echo "=== $clip_id ==="
    local source_file
    source_file=$(fetch_source "$source_id" "$source_url")
    clip_one "$clip_id" "$source_file" "$start_sec" "$duration_sec"
    clip_count=$((clip_count + 1))
  done < <(jq -c '.clips[]' "$MANIFEST")

  if (( clip_count == 0 )); then
    if [[ -n "$target_clip_id" ]]; then
      echo "error: no clip with id '$target_clip_id' in $MANIFEST" >&2
      exit 1
    else
      echo "no clips defined in $MANIFEST" >&2
      exit 1
    fi
  fi

  echo
  echo "fetched $clip_count clip(s) to $OUTPUT_DIR"
  echo "remember to ship docs/demo-attribution.md alongside the clips at the demo deployment."
}

main "$@"
