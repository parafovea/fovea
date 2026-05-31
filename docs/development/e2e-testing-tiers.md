# E2E testing tiers

Fovea ships two parallel E2E test surfaces, each with its own CI workflow, docker-compose configuration, and Playwright project layout. They answer different questions, and a passing run of one is not a substitute for the other.

| | Tier 1 (mock) | Tier 2 (real model-service) |
|---|---|---|
| **Question answered** | Does the frontend + backend + database wiring work end-to-end against the documented response shapes? | Is the real model-service container actually configured correctly: can it boot, load each task type, and return model-shaped outputs? |
| **Model surface** | `test-utils/mock-model-service.js` (Node, deterministic, 0 ms inference) | `model-service/` container in CPU mode (Python + real models, seconds to minutes per call) |
| **Compose stack** | `docker-compose.e2e.yml` | `docker-compose.e2e.yml` + `docker-compose.e2e.real-models.yml` (override) + `--profile with-models` |
| **Playwright projects** | `smoke`, `functional`, `regression`, `accessibility` (and `visual` when baselines align with the platform) | `integration-models` |
| **Assertion style** | Exact-match: every documented field, every numeric range, every shape | Tolerance-based: response shape and value ranges, never specific values |
| **Runtime** | ~16 minutes | ~30-60 minutes (dominated by CPU model load and first inference) |
| **CI workflow** | `.github/workflows/e2e-mock.yml` | `.github/workflows/e2e-real-models.yml` |
| **CI trigger** | `workflow_dispatch`, label `e2e-mock`, nightly at 01:00 UTC | `workflow_dispatch`, label `e2e-models`, nightly at 02:00 UTC |
| **When to add a test here** | Every new feature surface, every new API contract, every new UI flow | Every new model-service task type, every new model-service env contract |

## Why two tiers

The mock model-service exists so the contract layer can be exercised in roughly 16 minutes with full determinism. Every endpoint the production server hits at `MODEL_SERVICE_URL` is implemented in `test-utils/mock-model-service.js` with responses that match the Pydantic schemas under `model-service/src/.../schemas/`. When that mock drifts from the real schema the backend crashes during serialization, which is precisely the regression the mock is designed to catch rather than mask.

What the mock cannot catch:

- The real model-service failing to start because of a missing model weight, a config file path that diverged between `model-service/config/models.yaml` and the model-service code, or a Python dependency mismatch.
- The real model-service starting but returning a response shape that no longer matches its own Pydantic schema after a model-service-side refactor (the mock is updated to match the documented schema, not necessarily what the real service emits).
- The real model-service returning the correct shape but with values that fail the implicit invariants the frontend assumes (negative bounding-box coords, confidence > 1, empty `frameResults` for queries that should always match something).

The real-model integration tier catches those. It runs on demand and nightly rather than on every PR because the runtime budget is incompatible with per-PR gating, and because most PRs touch the frontend or backend layer rather than the model-service layer.

## When to run each tier

**On every PR**: nothing automatic today. The CI workflows in `ci.yml` cover lint, type-check, frontend unit, backend unit, and build. E2E is opt-in via label or workflow_dispatch.

**On a PR that touches frontend or backend code**: label `e2e-mock`. The contract layer should be verified before merge if the change touches a route handler, an API client method, a UI flow, or a fixture.

**On a PR that touches model-service code, the model-service Dockerfile, `MODEL_SERVICE_URL` consumers, or the snake_case to camelCase backend transforms**: label both `e2e-mock` and `e2e-models`. The first verifies the documented contract still holds; the second verifies the real service still satisfies it.

**Nightly**: both run automatically against the default branch so a regression on either tier surfaces within one day even if no PR happens to opt in.

**Locally**: prefer the mock tier for fast iteration. The compose file is `docker-compose.e2e.yml`; run with:

```bash
docker compose -f docker-compose.e2e.yml up -d --build
cd annotation-tool
E2E_BASE_URL=http://localhost:3000 npx playwright test \
  --project=smoke --project=functional --project=regression --project=accessibility
```

To run the real tier locally:

```bash
docker compose \
  -f docker-compose.e2e.yml \
  -f docker-compose.e2e.real-models.yml \
  --profile with-models \
  up -d --build
cd annotation-tool
E2E_BASE_URL=http://localhost:3000 npx playwright test --project=integration-models
```

The real model-service container ships with `BUILD_MODE=minimal` and `DEVICE=cpu` so it runs without CUDA, at the cost of slower first-inference. The healthcheck on the override allots a 120-second start period to let the CPU model load before the backend's `depends_on: model-service: condition: service_healthy` gate releases.

## Adding a test

### To Tier 1 (mock)

1. Find or create a spec under `annotation-tool/test/e2e/{smoke,functional,regression,accessibility}/<surface>.spec.ts`.
2. Use the `test` fixture from `test/e2e/fixtures/test-context.ts` for authentication and seeded data.
3. Assert exact values where the mock returns deterministic data, including specific status codes, specific numeric values, and specific string contents.
4. If you find a real bug while writing this test (a route returns 500 because of a missing camelcaseKeys, a Pydantic schema field name drifted, etc.), fix the bug, do not weaken the assertion.

### To Tier 2 (real)

1. Add the spec under `annotation-tool/test/e2e/integration/model-service/<surface>.spec.ts`.
2. Use the same `test` fixture.
3. Assert tolerance properties only: response shape, top-level field types, numeric ranges, list non-emptiness for queries that must produce results.
4. Set per-call `timeout` parameters to at least 120 seconds for the first call into a task type. CPU first-inference latency can run into tens of seconds.

## Failure attribution

| Tier 1 fails | Tier 2 fails | What it means |
|---|---|---|
| Yes | No | Frontend, backend, or mock-model-service is broken. The real service is irrelevant; look at the failing spec's stack. |
| No | Yes | The real model-service is misconfigured. The frontend and backend are fine. Look at model-service container logs, `model-service/config/models.yaml`, and the model weights. |
| Yes | Yes | A backend transform (snake_case to camelCase, error mapping, status code propagation) is broken in a way that affects both tiers identically. Look at the route handler the failing spec exercises. |
| No | No | Ship it. |

The CI workflows upload Playwright reports as artifacts (`playwright-report-mock` and `playwright-report-real-models`) on every run; the failure case is also documented in those artifacts.
