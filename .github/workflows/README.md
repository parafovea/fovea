# GitHub Actions Workflows

This file describes what each workflow actually does. The workflows are the
source of truth; keep this in sync when you change them. Local equivalents of
the CI recipes live in the root `Makefile` (`make lint`, `make typecheck`,
`make test`, `make build`).

## CI and quality gate

### ci.yml — primary lint/test/build gate
Runs on push and PR to `main`, `develop`, and `release/**`.

Jobs (all run in parallel; service containers `pgvector/pgvector:pg16` + `redis:7-alpine` back the backend tests):
- Frontend: `lint-frontend` (ESLint + `tsc --noEmit`), `test-frontend` (Vitest + coverage), `build-frontend`.
- Backend: `lint-backend` (ESLint + `tsc --noEmit` + the `.env.example` drift guard `check:env`), `test-backend` (Vitest with Postgres + Redis), `build-backend`.
- Model service: `lint-model-service` (`ruff check` + `ruff format --check` + `mypy src/`), `test-model-service` (`pytest -m "not requires_models"`).
- Wikibase loader: `lint-wikibase` (ruff + mypy), `test-wikibase` (pytest).
- `verify-compose`: validates every committed docker compose configuration with its override chain.
- `quality-gate`: aggregates results into one required status check.

The quality gate requires: the frontend lint/test/build, backend lint/test/build, model-service lint, wikibase lint/test, and `verify-compose`. **`test-model-service` runs but is advisory** (not required) — its `pip install -e ".[dev]"` pulls the full ML stack and is disk-sensitive on shared runners, so a failure is surfaced but does not block the gate. There is no in-CI `test-e2e` job; end-to-end tests live in the dedicated e2e workflows below.

## Image builds

### docker.yml — dev image builds
Runs on push and PR to `main`/`develop`. Builds the `frontend`, `backend`, `model-service` (CPU, `minimal`), and `wikibase-loader` images (all `linux/amd64`). On `push` to `main`/`develop` it pushes to `ghcr.io/<owner>/<repo>/<service>`; on PRs it builds without pushing.

### release.yml — tag-driven release images + GitHub Release
Runs on `v*.*.*` tag push. `build-and-push-images` builds and pushes four images (`frontend`, `backend`, `model-service-cpu`, `model-service-gpu`), all `linux/amd64` (no arm64 emulation), tagged by `docker/metadata-action` semver. `create-release` extracts the matching `CHANGELOG.md` section and publishes the GitHub Release, independent of the image build (so a Release publishes even if the heavy GPU image times out).

## Security

### security.yml
Runs on push/PR to `main`/`develop` and weekly. `pnpm audit` (frontend/backend), `pip`/`safety` (model service), CodeQL (JavaScript + Python), and TruffleHog secret scanning. Findings are surfaced but `continue-on-error`, so they do not block CI.

## End-to-end tests

### e2e-mock.yml / e2e-real-models.yml
Label-gated and nightly (not part of the per-PR gate). `e2e-mock` runs the Playwright smoke/functional/regression/accessibility suites against a mock model-service when a PR carries the `e2e-mock` label (or nightly / `workflow_dispatch`). `e2e-real-models` runs the `integration-models` suite against a real CPU model-service under the `e2e-models` label.

## Docs and ops

- **docs.yml** — builds and deploys the Docusaurus site (push to `main`, paths-filtered; PRs build only).
- **docs-links.yml** — markdown link checker on PRs touching docs and weekly.
- **dev-build.yml** — brings up the dev compose stack and verifies frontend↔backend connectivity (push/PR to `main`/`develop`).
- **deploy.yml** — deploys demo.fovea.video over SSH on push to `main` (and `workflow_dispatch`).
- **rollback.yml** — `workflow_dispatch` rollback to a given commit.
- **health-check.yml** — cron health/SSL checks of the live sites every 15 minutes.

## Validating workflow changes

```bash
# Lint the workflow YAML (optional)
actionlint .github/workflows/*.yml

# Reproduce the CI recipes locally
make lint
make typecheck
make test
```
