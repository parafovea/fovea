#!/usr/bin/env bash
# Regenerate the vendored pub.layers.* TypeScript types under src/generated from
# the layers lexicons under lexicons/pub/layers. The lexicons are the single
# source of truth; scripts/gen-types.mjs emits the types directly from them (a
# faithful port of the upstream idiolect-codegen TypeScript target), so
# regeneration needs only Node — no Rust toolchain and no layers checkout.
#
# Run it after re-vendoring the lexicons to a new layers schema version, then
# review the diff and typecheck.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$HERE/scripts/gen-types.mjs"

SOURCE_COMMIT="$(cat "$HERE/lexicons/.source-commit" 2>/dev/null || echo 'unknown')"
echo "Generated src/generated from lexicons at source commit $SOURCE_COMMIT."
echo "Review the diff and run 'pnpm --filter @fovea/layers-schema typecheck'."
