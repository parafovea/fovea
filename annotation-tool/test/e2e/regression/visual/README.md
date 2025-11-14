# Visual Regression Tests

Visual regression tests for UI components using Playwright's screenshot comparison.

## Running Visual Tests

Visual tests should **only** be run with the `visual` project:

```bash
npm run test:e2e -- --project=visual
```

**DO NOT** run with `--project=regression` as this creates duplicate snapshots with different naming.

## How It Works

- Playwright captures screenshots of components
- Compares against baseline snapshots in `*-snapshots/` directories
- Snapshots include platform suffix (`-visual-darwin.png` on macOS)
- Tests configured with:
  - `threshold: 0.2` (20% pixel difference tolerance)
  - `maxDiffPixels: 100-500` (absolute pixel limit)
  - `retries: 0` (no retries for consistency)

## Updating Snapshots

When intentional UI changes cause snapshot failures:

```bash
# Update all snapshots
npm run test:e2e -- --project=visual --update-snapshots

# Update specific test
npm run test:e2e -- --project=visual component-snapshots.spec.ts --update-snapshots
```

## CI Behavior

Visual tests **do not run in CI** because:
- Pixel-perfect rendering varies across environments
- Docker rendering may differ from local macOS
- These are developer-facing tests for catching unintended changes

CI runs only: `--project=smoke --project=functional`

## Snapshot Naming

**Correct:** `video-card-visual-darwin.png`
**Incorrect:** `video-card-regression-darwin.png`

The `regression` project excludes visual tests (`testIgnore: '**/visual/**'` in `playwright.config.ts`) to prevent duplicate snapshots.

## Adding New Visual Tests

1. Add test to appropriate spec file in this directory
2. Use `toHaveScreenshot('name.png', { threshold, maxDiffPixels })`
3. Run `npm run test:e2e -- --project=visual --update-snapshots`
4. Commit generated snapshots (`.png` files are tracked)
5. Verify snapshots in PR review

## Troubleshooting

**Snapshot naming wrong?**
- Ensure using `--project=visual` (not `regression`)

**Flaky tests?**
- Increase wait times for animations/content
- Add `await page.waitForLoadState('networkidle')`
- Increase `maxDiffPixels` if dynamic content varies

**Missing snapshots?**
- Run test with `--update-snapshots` to generate baseline
- Ensure test runs successfully before updating
