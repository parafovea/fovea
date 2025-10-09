# GitHub Actions Workflows

This directory contains CI/CD workflows organized by responsibility following industry best practices.

## Workflows

### ci.yml
**Primary CI pipeline** that runs on every push and PR to `main` and `develop` branches.

**Jobs:**
- **Frontend** (parallel execution):
  - `lint-frontend`: ESLint + TypeScript type checking
  - `test-frontend`: Unit tests with coverage (451 tests)
  - `build-frontend`: Production build validation

- **Backend** (parallel execution):
  - `lint-backend`: ESLint + TypeScript type checking
  - `test-backend`: Unit tests with PostgreSQL + Redis (130 tests)
  - `build-backend`: Production build validation

- **Model Service** (parallel execution):
  - `lint-model-service`: Ruff + mypy checks
  - `test-model-service`: pytest with coverage (288 tests)

- **Integration**:
  - `test-e2e`: Playwright E2E tests (runs after unit tests pass)

- **Quality Gate**:
  - Aggregates all results and enforces pass/fail
  - Provides summary of all check results

**Total duration:** ~5-8 minutes (with maximum parallelization)

### docker.yml
**Docker image builds** for all services.

**Jobs:**
- `build-frontend`: Builds frontend container image
- `build-backend`: Builds backend container image
- `build-model-service`: Matrix strategy builds both CPU and GPU variants
- `verify-compose`: Validates docker-compose.yml syntax

**Behavior:**
- **On PR**: Builds images for validation (no push)
- **On push to main/develop**: Builds and pushes to GitHub Container Registry

**Registry:** `ghcr.io/<owner>/<repo>/<service>:<tag>`

### security.yml
**Security scanning** pipeline.

**Jobs:**
- `dependency-scan-*`: npm audit / pip safety checks
- `codeql-analysis`: GitHub CodeQL for JavaScript and Python
- `secret-scan`: TruffleHog for exposed secrets

**Trigger:**
- Every push/PR
- Weekly scheduled scan (Sundays at 00:00 UTC)

### release.yml
**Release automation** for tagged versions.

**Jobs:**
- `create-release`: Generates changelog and creates GitHub release
- `build-and-push-images`: Multi-platform Docker images (amd64 + arm64)
- `update-deployment`: Updates deployment manifests

**Trigger:** Push to version tags (`v*.*.*`)

**Image tags:**
- `v1.2.3` (exact version)
- `v1.2` (minor version)
- `v1` (major version)
- `latest` (always latest release)

## Architecture Decisions

### Parallel Execution
All service jobs (lint, test, build) run in parallel for maximum speed. E2E tests run only after unit tests pass.

### Job Independence
Each job is independent and can be run in isolation. No hidden dependencies between jobs except explicit `needs:` declarations.

### Artifact Retention
- Coverage reports: 30 days
- Build artifacts: 7 days
- Docker images: Per registry policy

### Quality Gate Pattern
The `quality-gate` job aggregates all results and provides a single pass/fail status. This allows:
- Clear visibility into which checks failed
- Branch protection rules to require just one status check
- Detailed summary in GitHub UI

### Separated Workflows
Workflows are separated by concern:
- **ci.yml**: Fast feedback loop (tests, lints, builds)
- **docker.yml**: Container image management
- **security.yml**: Security posture
- **release.yml**: Release process

This separation allows:
- Independent triggering
- Clear responsibilities
- Easier maintenance
- Selective CI runs (e.g., skip Docker builds on draft PRs)

## Best Practices Implemented

1. ✅ **Caching**: npm and pip caching enabled
2. ✅ **Matrix builds**: Model service CPU/GPU variants
3. ✅ **Service containers**: PostgreSQL + Redis for backend tests
4. ✅ **Artifact uploads**: Coverage and build outputs preserved
5. ✅ **Conditional execution**: Docker pushes only on main/develop
6. ✅ **Health checks**: Database services wait for readiness
7. ✅ **Fail-fast disabled**: Security scans don't block CI
8. ✅ **Shellcheck validation**: All bash scripts validated
9. ✅ **Permissions**: Least-privilege GITHUB_TOKEN scopes
10. ✅ **Multi-platform builds**: amd64 + arm64 support

## Local Testing

Validate workflows locally:
```bash
# Install actionlint
brew install actionlint

# Validate all workflows
actionlint .github/workflows/*.yml

# Run tests locally (matches CI exactly)
cd annotation-tool && npm run test:coverage
cd server && npm run test:coverage
cd model-service && pytest --cov=src
```

## Monitoring

- **GitHub Actions UI**: View workflow runs and logs
- **Status badges**: Add to README for visibility
- **Branch protection**: Require `quality-gate` status check

## Future Enhancements

Potential improvements:
- [ ] Add performance benchmarking job
- [ ] Integrate Codecov/Coveralls for coverage tracking
- [ ] Add automatic dependency updates (Dependabot/Renovate)
- [ ] Implement canary deployments
- [ ] Add infrastructure-as-code validation
