#!/bin/bash
set -e

echo "=================================================="
echo "Generating API Documentation for Fovea"
echo "=================================================="
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Project root: $PROJECT_ROOT"
echo ""

# ==============================================
# Frontend API Documentation (TypeDoc)
# ==============================================
# pnpm-workspace deps for both annotation-tool and server (typedoc and
# typedoc-plugin-markdown live in each package's devDependencies) are
# expected to be installed already via `pnpm install --frozen-lockfile`
# at the workspace root before invoking this script.
echo "==> Generating Frontend API documentation..."
cd "$PROJECT_ROOT"

if [ ! -f "annotation-tool/typedoc.json" ]; then
  echo "ERROR: annotation-tool/typedoc.json not found"
  exit 1
fi

pnpm --filter @fovea/annotation-tool docs
echo "✓ Frontend API documentation generated"
echo ""

# ==============================================
# Backend API Documentation (TypeDoc)
# ==============================================
echo "==> Generating Backend API documentation..."
cd "$PROJECT_ROOT"

if [ ! -f "server/typedoc.json" ]; then
  echo "ERROR: server/typedoc.json not found"
  exit 1
fi

pnpm --filter @fovea/server docs
echo "✓ Backend API documentation generated"
echo ""

# ==============================================
# Model Service API Documentation (pydoc-markdown)
# ==============================================
echo "==> Generating Model Service API documentation..."
cd "$PROJECT_ROOT/model-service"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
  echo "Activating Python virtual environment..."
  source venv/bin/activate
else
  echo "WARNING: venv not found. pydoc-markdown may fail if not installed globally."
fi

# Check if pydoc-markdown is installed
if ! python -c "import pydoc_markdown" &>/dev/null; then
  echo "Installing pydoc-markdown..."
  pip install "pydoc-markdown>=4.8.0"
fi

# Generate Markdown docs with pydoc-markdown
if [ -f "pydoc-markdown.yml" ]; then
  echo "Running pydoc-markdown..."
  pydoc-markdown pydoc-markdown.yml

  if [ $? -ne 0 ]; then
    echo "ERROR: pydoc-markdown generation failed"
    exit 1
  fi
else
  echo "ERROR: pydoc-markdown.yml not found"
  exit 1
fi

# Deactivate venv if it was activated
if [ -n "$VIRTUAL_ENV" ]; then
  deactivate
fi

echo "✓ Model Service API documentation generated"
echo ""

# ==============================================
# Summary
# ==============================================
echo "=================================================="
echo "✓ All API documentation generated successfully"
echo "=================================================="
echo ""
echo "Generated documentation:"
echo "  - Frontend:      docs/docs/api-reference/frontend/"
echo "  - Backend:       docs/docs/api-reference/backend/"
echo "  - Model Service: docs/docs/api-reference/model-service/"
echo ""
echo "To build the full documentation site:"
echo "  cd docs && npm run build"
echo ""
