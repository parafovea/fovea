# Single entrypoint for installing, linting, type-checking, testing, and
# building every Fovea component: the Node packages (frontend, backend) via
# pnpm and the Python services (model-service, wikibase) via uv. CI mirrors
# these recipes, and README / CONTRIBUTING / DOCKER_QUICK_REFERENCE point
# here, so the build-and-test recipe lives in exactly one place.
#
# Run `make` or `make help` to list targets.

.DEFAULT_GOAL := help
.PHONY: help install generate \
	lint lint-frontend lint-backend lint-model-service lint-wikibase \
	typecheck test test-frontend test-backend test-model-service test-wikibase \
	build dev-infra stop

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (pnpm workspace + uv for the Python services)
	pnpm install --frozen-lockfile
	cd model-service && uv sync
	cd wikibase && uv sync

generate: ## Generate the Prisma client (needed before backend typecheck/test)
	pnpm --filter @fovea/server exec prisma generate

## --- Lint -----------------------------------------------------------------

lint: lint-frontend lint-backend lint-model-service lint-wikibase ## Lint every component

lint-frontend: ## Lint the frontend
	pnpm --filter @fovea/annotation-tool lint

lint-backend: ## Lint the backend and check the .env.example drift guard
	pnpm --filter @fovea/server lint
	pnpm run check:env

lint-model-service: ## Lint the model-service (ruff check + format)
	cd model-service && uv run ruff check . && uv run ruff format --check .

lint-wikibase: ## Lint the wikibase loader (ruff check + format)
	cd wikibase && uv run ruff check . && uv run ruff format --check .

## --- Typecheck ------------------------------------------------------------

typecheck: generate ## Type-check every component (tsc + mypy)
	pnpm --filter @fovea/annotation-tool exec tsc --noEmit
	pnpm --filter @fovea/server exec tsc --noEmit
	cd model-service && uv run mypy src/
	cd wikibase && uv run mypy scripts/

## --- Test -----------------------------------------------------------------

test: test-frontend test-backend test-model-service test-wikibase ## Run every test suite

test-frontend: ## Frontend unit tests
	pnpm --filter @fovea/annotation-tool test -- --run

test-backend: generate ## Backend unit + integration tests (needs Postgres + Redis: `make dev-infra`)
	pnpm --filter @fovea/server test -- --run

test-model-service: ## Model-service tests (excludes heavy model downloads)
	cd model-service && uv run pytest -m "not requires_models"

test-wikibase: ## Wikibase loader tests
	cd wikibase && uv run pytest

## --- Build / dev ----------------------------------------------------------

build: generate ## Build the frontend and backend
	pnpm --filter @fovea/annotation-tool build
	pnpm --filter @fovea/server build

dev-infra: ## Start local Postgres + Redis (for backend dev/tests)
	pnpm run dev:infra

stop: ## Stop the local dev stack
	pnpm run stop
