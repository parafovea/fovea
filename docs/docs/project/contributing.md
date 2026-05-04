# Contributing

The repository accepts pull requests against `main` for new work
and against `release/0.1.x` for maintenance fixes. Both branches
require the test suite to pass before merge.

## Development setup

```bash
git clone https://github.com/aaronstevenwhite/fovea.git
cd fovea
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

The dev compose file binds the source directories into the
backend and frontend containers so a save triggers a rebuild.
The model service is built once and reused; re-build when its
Python dependencies change.

## Backend

The backend lives under `server/`. Run the test suite with:

```bash
cd server
npm install
npm test
```

Schema changes go through Prisma:

```bash
npx prisma migrate dev --name <migration_name>
```

Never edit a landed migration. Add a new migration that performs
the desired transformation; see
[Project > Stability](stability.md).

## Frontend

The frontend lives under `annotation-tool/`. Run:

```bash
cd annotation-tool
npm install
npm run dev    # vite dev server
npm test       # vitest unit tests
npm run lint   # eslint
```

End-to-end tests live under `annotation-tool/e2e/` and run via
Playwright against the e2e compose stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
npx playwright test
```

## Model service

The model service lives under `model-service/`. Use `uv`:

```bash
cd model-service
uv sync
uv run pytest
```

Tests live under `model-service/test/` (not `tests/`).
`pytest.ini` has coverage `addopts`; locally run with
`--override-ini="addopts="` to skip coverage.

## Commit messages

The convention is a single sentence with no conventional-commit
prefix. PR titles do use prefixes (`fix:`, `feat:`, `docs:`).
The PR template lives at `.github/PULL_REQUEST_TEMPLATE.md`; PR
bodies must keep every checkbox section, checked or unchecked.

## Type rules

The model-service Python code does not use `Any` or bare `object`
type annotations. Use Protocols, generics, or concrete types
instead. Never soften a type to silence a lint.

The backend and frontend TypeScript follow strict mode. Add a
TypeBox schema for every route; the request and response shapes
are part of the API contract.

## Filing issues

Bugs go to the GitHub issues tracker. Reproduction steps that
hit the actual stack (`docker compose up`, then a sequence of
curl commands) are easier to act on than UI-only descriptions.
Multi-user isolation regressions should reference
`test/integration/multi-user-isolation.test.ts` so the matrix
gains a new test for the affected route.
