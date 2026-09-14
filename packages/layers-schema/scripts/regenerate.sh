#!/usr/bin/env bash
# Regenerate the vendored pub.layers.* TypeScript types and JSON Schema from the
# layers lexicons. The lexicons are the single source of truth; this script
# copies the layers-codegen output into this package so Fovea's CI never needs a
# Rust toolchain. Run it when the layers schema version is bumped.
#
# Prerequisite: a checkout of the layers repo with a Rust toolchain. Point
# LAYERS_REPO at it (default: a sibling checkout).
#
# Before first regeneration, reconcile the panproto pin: the layers
# Cargo.toml pins panproto to a git tag that must match the runtime panproto
# used by didactic/lairs on the Python side (currently 0.56.x). See the plan's
# Workstream 1.
set -euo pipefail

LAYERS_REPO="${LAYERS_REPO:-/Users/awhite48/Projects/layers-pub/layers}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$LAYERS_REPO" ]; then
  echo "layers repo not found at $LAYERS_REPO (set LAYERS_REPO)" >&2
  exit 1
fi

echo "Generating layers-codegen output in $LAYERS_REPO ..."
( cd "$LAYERS_REPO" && cargo run -p layers-codegen -- generate && cargo run -p layers-codegen -- openapi )

echo "Vendoring TypeScript types ..."
rm -rf "$HERE/src/generated"
cp -R "$LAYERS_REPO/packages/schema/src/generated" "$HERE/src/generated"

echo "Vendoring JSON Schema / OpenAPI components ..."
cp "$LAYERS_REPO/web/lib/api/openapi.json" "$HERE/json-schema/openapi.json"
node "$HERE/scripts/extract-components.mjs"

( cd "$LAYERS_REPO" && git rev-parse HEAD ) > "$HERE/json-schema/.source-commit"
echo "Done. Source commit: $(cat "$HERE/json-schema/.source-commit")"
echo "Review the diff and run 'pnpm --filter @fovea/layers-schema typecheck'."
