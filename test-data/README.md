# Test Data for E2E Tests

This directory contains a small subset of video files used for E2E testing in CI.

## Contents

- Two small video files (~4MB total) with metadata
- Used by `docker-compose.e2e.yml` for Playwright E2E tests
- Videos are read-only mounted in the backend container

## Usage

E2E tests run against this test data in CI:

```bash
# Start E2E stack locally
docker compose -f docker-compose.e2e.yml up -d

# Run E2E tests
cd annotation-tool
npm run test:e2e

# Clean up
docker compose -f docker-compose.e2e.yml down -v
```

## Updating Test Data

To add or replace test videos:

1. Copy small video files (<1MB each) from `../data/`
2. Include both `.mp4` and `.info.json` files
3. Commit to git (these files are tracked)
4. Update E2E tests if needed
