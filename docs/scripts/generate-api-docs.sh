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
echo "==> Generating Frontend API documentation..."
cd "$PROJECT_ROOT/annotation-tool"

if [ ! -f "package.json" ]; then
  echo "ERROR: annotation-tool/package.json not found"
  exit 1
fi

if [ ! -f "typedoc.json" ]; then
  echo "ERROR: annotation-tool/typedoc.json not found"
  echo "Run: npm install --save-dev typedoc typedoc-plugin-markdown"
  exit 1
fi

# Check if TypeDoc is installed
if ! npm list typedoc &>/dev/null; then
  echo "Installing TypeDoc dependencies..."
  npm install --save-dev typedoc typedoc-plugin-markdown
fi

npm run docs
echo "✓ Frontend API documentation generated"
echo ""

# ==============================================
# Backend API Documentation (TypeDoc)
# ==============================================
echo "==> Generating Backend API documentation..."
cd "$PROJECT_ROOT/server"

if [ ! -f "package.json" ]; then
  echo "ERROR: server/package.json not found"
  exit 1
fi

if [ ! -f "typedoc.json" ]; then
  echo "ERROR: server/typedoc.json not found"
  exit 1
fi

# Check if TypeDoc is installed
if ! npm list typedoc &>/dev/null; then
  echo "Installing TypeDoc dependencies..."
  npm install --save-dev typedoc typedoc-plugin-markdown
fi

npm run docs
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
