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
# Model Service API Documentation (Sphinx)
# ==============================================
echo "==> Generating Model Service API documentation..."
cd "$PROJECT_ROOT/model-service"

if [ ! -d "docs" ]; then
  echo "ERROR: model-service/docs directory not found"
  echo "Run: cd model-service/docs && sphinx-quickstart"
  exit 1
fi

# Activate virtual environment if it exists
if [ -d "venv" ]; then
  echo "Activating Python virtual environment..."
  source venv/bin/activate
else
  echo "WARNING: venv not found. Sphinx may fail if not installed globally."
fi

# Check if Sphinx is installed
if ! python -c "import sphinx" &>/dev/null; then
  echo "ERROR: Sphinx not installed"
  echo "Run: pip install sphinx sphinx-rtd-theme sphinx-autodoc-typehints"
  exit 1
fi

cd docs
make clean
make html

if [ $? -ne 0 ]; then
  echo "ERROR: Sphinx build failed"
  exit 1
fi

# Copy Sphinx HTML output to Docusaurus static directory
echo "Copying Sphinx output to Docusaurus static directory..."
mkdir -p "$PROJECT_ROOT/docs/static/api-reference/model-service"
cp -r _build/html/* "$PROJECT_ROOT/docs/static/api-reference/model-service/"

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
echo "  - Model Service: docs/static/api-reference/model-service/"
echo ""
echo "To build the full documentation site:"
echo "  cd docs && npm run build"
echo ""
