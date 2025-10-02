# CI/CD Pipeline Documentation

## Overview

The fovea project uses GitHub Actions for continuous integration and continuous deployment. The pipeline tests, lints, and builds all three services (frontend, backend, and model service) on every push and pull request.

## Branch Strategy

Following git-flow conventions:

### main branch
- Production-ready code only
- Always deployable to production
- Source for versioned releases (tags)
- Docker images built and optionally deployed

### develop branch
- Integration branch for ongoing development
- Feature branches merge here first
- Deploys to staging/dev environments
- Docker images built for testing

### Workflow
```
feature/xyz → develop (staging) → main (production)
```

## Workflow Structure

### Main CI/CD Workflow (`ci.yml`)

The workflow runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### Jobs

#### 1. Frontend Jobs

**lint-frontend**
- Runs ESLint on TypeScript/TSX files
- Performs TypeScript type checking with `tsc --noEmit`
- Uses Node.js 22

**test-frontend**
- Runs Vitest unit tests with coverage
- Uploads coverage artifacts to GitHub
- Depends on successful linting

**build-frontend**
- Compiles TypeScript and builds production bundle with Vite
- Uploads build artifacts to GitHub
- Depends on successful tests

#### 2. Backend Jobs

**lint-backend**
- Runs ESLint on TypeScript files
- Performs TypeScript type checking with `tsc --noEmit`
- Uses Node.js 22

**test-backend**
- Runs Vitest tests with coverage
- Uses PostgreSQL 16 and Redis 7 service containers
- Tests database integration
- Uploads coverage artifacts to GitHub
- Depends on successful linting

**build-backend**
- Compiles TypeScript to JavaScript
- Outputs to `dist/` directory
- Uploads build artifacts to GitHub
- Depends on successful tests

#### 3. Model Service Jobs

**lint-model-service**
- Runs `ruff check` for code quality
- Runs `ruff format --check` for formatting
- Runs `mypy` for type checking
- Uses Python 3.12

**test-model-service**
- Runs pytest with coverage reporting
- Generates JSON, HTML, and terminal coverage reports
- Uploads coverage artifacts to GitHub
- Depends on successful linting

#### 4. End-to-End Tests

**test-e2e**
- Runs Playwright E2E tests
- Tests frontend and backend integration
- Only runs on Chromium browser in CI
- Uploads test results and Playwright HTML report
- Depends on frontend and backend tests passing

#### 5. Docker Image Builds

**build-docker-images**
- Only runs on push to `main` or `develop` branches
- Builds Docker images for all three services
- Uses BuildKit cache for faster builds
- Exports images as tar files
- Uploads images as artifacts for 7 days
- Model service built in CPU-only minimal mode for CI

#### 6. Summary

**summary**
- Runs after all jobs complete
- Generates a summary report in GitHub Actions UI
- Shows pass/fail status for all jobs
- Always runs even if previous jobs fail

## Artifacts

The workflow uploads several types of artifacts:

1. **Coverage Reports** (30 days retention)
   - `frontend-coverage`: HTML and JSON coverage for React components
   - `backend-coverage`: HTML and JSON coverage for Node.js backend
   - `model-service-coverage`: JSON and HTML coverage for Python code

2. **Build Artifacts** (30 days retention)
   - `frontend-build`: Production-ready Vite bundle
   - `backend-build`: Compiled TypeScript output

3. **Test Reports** (30 days retention)
   - `playwright-report`: Interactive HTML report for E2E tests
   - `e2e-test-results`: Raw Playwright test results

4. **Docker Images** (7 days retention)
   - `docker-images`: Tar archives of built Docker images

## Service Dependencies

The workflow sets up service containers for backend tests:

- **PostgreSQL 16**: Database with health checks
- **Redis 7**: Cache and queue with health checks

## Environment Variables

- `NODE_VERSION`: 22 (Node.js LTS)
- `PYTHON_VERSION`: 3.12

## Caching

The workflow uses caching to speed up builds:

- **Node.js**: npm cache based on `package-lock.json`
- **Python**: pip cache based on `pyproject.toml`
- **Docker**: GitHub Actions cache for layer caching

## Triggering the Workflow

The workflow runs automatically on:
- Any push to tracked branches
- Any pull request to `main` or `develop`

To skip the workflow, add `[skip ci]` or `[ci skip]` to your commit message.

## Local Testing

To test the same checks locally before pushing:

### Frontend
```bash
cd annotation-tool
npm run lint
npx tsc --noEmit
npm run test:coverage
npm run build
```

### Backend
```bash
cd server
npm run lint
npx tsc --noEmit
npm run test:coverage
npm run build
```

### Model Service
```bash
cd model-service
ruff check .
ruff format --check .
mypy src/
pytest --cov=src --cov-report=term
```

### E2E Tests
```bash
cd annotation-tool
npx playwright install chromium
npm run test:e2e
```

## Troubleshooting

### Failed Linting
- Run `npm run lint` locally to see detailed error messages
- For Python, run `ruff check .` and `mypy src/`

### Failed Tests
- Check the test logs in GitHub Actions
- Download coverage artifacts to see which tests failed
- Run tests locally with the same environment variables

### Failed Docker Builds
- Check the Docker build logs for errors
- Verify Dockerfile syntax
- Test locally with `docker build`

### Service Container Issues
- Ensure PostgreSQL and Redis services are healthy
- Check health check commands in the workflow
- Verify connection strings in test environment

## Future Improvements

Planned enhancements to the CI/CD pipeline:

1. Deploy stage for staging/production environments
2. Integration with AWS ECR for Docker registry
3. ECS deployment automation
4. Performance benchmarking
5. Security scanning with Snyk or Trivy
6. Dependency updates with Dependabot
7. Code quality metrics with SonarCloud
