# GitHub Actions Workflows

This directory contains CI/CD workflows for the fovea project.

## Workflows

### `ci.yml` - Main CI Pipeline

Runs on every push to `main`, `develop`, or `feat/*` branches and all pull requests.

**Jobs:**
1. **test-frontend** - Frontend linting, type checking, and unit tests (~5 min)
2. **test-backend** - Backend linting and unit tests with PostgreSQL/Redis (~5 min)  
3. **test-model-service** - Python linting, type checking, and tests (~3 min)
4. **e2e** - End-to-end tests with parallel execution (~5 min)

**Total Duration:** ~15 minutes (jobs run in parallel where possible)

**E2E Test Configuration:**
- Uses 5 parallel workers for 4x faster execution
- Each worker creates isolated test user with separate WorldState  
- Runs in Docker Compose environment (docker-compose.e2e.yml)
- Tests: 60 regression tests covering entities, events, locations, times, collections

## Running Workflows Locally

See individual test directories for detailed instructions:
- Frontend: `annotation-tool/test/README.md`
- Backend: `server/test/README.md`
- Model Service: `model-service/test/README.md`
- E2E: `annotation-tool/test/e2e/README.md`

## Artifacts

Workflows upload artifacts on test failures:
- **playwright-report** - HTML report with test results, traces, and screenshots (7 days)
- **test-results** - Raw test results and videos (7 days)
- **coverage reports** - Uploaded to Codecov (if configured)

## Performance Benchmarks

- Frontend tests: ~5 minutes
- Backend tests: ~5 minutes
- Model service tests: ~3 minutes
- E2E tests: ~5 minutes (parallel with 5 workers)
- **Total CI**: ~15 minutes
