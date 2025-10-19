# End-to-End Tests for Annotation Timeline

This directory contains E2E tests for the video annotation workflow using Playwright with Page Object Model architecture.

## Architecture: Page Object Model

Tests use the Page Object Model pattern for maintainability and reusability:

```
test/e2e/
├── page-objects/           # Page object classes
│   ├── base/
│   │   └── BasePage.ts    # Base class with common functionality
│   ├── AnnotationWorkspacePage.ts
│   ├── VideoBrowserPage.ts
│   └── components/        # Reusable component objects
│       ├── VideoPlayerComponent.ts
│       └── TimelineComponent.ts
├── fixtures/              # Test fixtures with dependency injection
│   └── test-context.ts   # Extended Playwright test with fixtures
└── utils/                # Test utilities
    └── database-helpers.ts
```

### Using Page Objects in Tests

```typescript
import { test, expect } from './fixtures/test-context.js'

test('example test', async ({ annotationWorkspace, videoBrowser }) => {
  await videoBrowser.navigateToHome()
  await videoBrowser.selectFirstVideo()

  await annotationWorkspace.drawSimpleBoundingBox()
  await annotationWorkspace.timeline.show()
  await annotationWorkspace.timeline.addKeyframe()

  await annotationWorkspace.expectBoundingBoxVisible()
})
```

### Available Page Objects

**AnnotationWorkspacePage**
- Video navigation and workspace actions
- Bounding box creation and manipulation
- Keyframe management via timeline component
- Annotation saving and persistence

**VideoBrowserPage**
- Home page navigation
- Video selection and search
- Authentication state checks

**VideoPlayerComponent**
- Playback controls (play, pause, seek)
- Frame navigation (arrows, Home, End)
- Current time and frame queries

**TimelineComponent**
- Timeline visibility toggle
- Keyframe operations (add, delete, copy)
- Visibility toggling
- Zoom controls
- High-DPI rendering verification

## Test Files

### `annotation-timeline.spec.ts`
Complete annotation workflow tests covering:
- Video loading and workspace navigation
- Bounding box creation and manipulation
- Keyframe creation with keyboard shortcuts (K, C, V, Delete)
- Timeline visibility and rendering
- Playhead movement during video playback
- Frame navigation (Arrow keys, Shift+Arrow, Home, End)
- Keyframe deletion and copying
- Visibility toggling
- Interpolation between keyframes
- Zoom controls
- Annotation persistence (save/load)

**Test count**: 14 comprehensive tests

### `timeline-rendering.spec.ts`
Timeline rendering quality and visual tests focusing on:
- High-DPI (Retina) canvas rendering quality
- Playhead position and movement visualization
- Keyframe circle rendering
- Interpolation segment line rendering
- Frame ruler with tick marks and numbers
- Zoom level rendering quality
- Window resize handling
- Selected keyframe highlighting
- Ghost box rendering for out-of-range annotations

**Test count**: 10 visual rendering tests

### `auth-single-user.spec.ts`
Authentication tests for single-user mode (existing file)

## Running E2E Tests

### Prerequisites

1. Docker and Docker Compose installed
2. Test videos in `/test-data` directory
3. Playwright installed (`npm install` in annotation-tool)

### Running with Docker Compose (Recommended)

This approach starts all required services (frontend, backend, postgres, redis) in isolated containers:

```bash
# From project root (/Users/awhite48/Projects/multivent)

# 1. Start E2E services
docker compose -f docker-compose.e2e.yml up -d

# 2. Wait for services to be healthy (check logs)
docker compose -f docker-compose.e2e.yml logs -f

# 3. Run E2E tests
cd annotation-tool
npm run test:e2e

# 4. Clean up
cd ..
docker compose -f docker-compose.e2e.yml down -v
```

### Running Specific Test Files

```bash
# Run only annotation timeline tests
npx playwright test annotation-timeline.spec.ts

# Run only rendering tests
npx playwright test timeline-rendering.spec.ts

# Run with UI mode for debugging
npx playwright test --ui

# Run with headed browser (see what's happening)
npx playwright test --headed

# Run specific test
npx playwright test -g "adds keyframe with K shortcut"
```

### Running Locally (Without Docker)

If you have services running locally:

```bash
# Terminal 1: Start backend
cd server
npm run dev

# Terminal 2: Start frontend
cd annotation-tool
npm run dev

# Terminal 3: Run E2E tests
cd annotation-tool
BASE_URL=http://localhost:5173 npm run test:e2e
```

## Test Coverage

### Keyboard Shortcuts Tested
- **Space**: Play/pause video
- **K**: Add keyframe at current frame
- **C**: Copy previous keyframe to current frame
- **V**: Toggle visibility at current frame
- **Delete**: Remove keyframe at current frame
- **T**: Toggle timeline visibility
- **ArrowLeft/Right**: Navigate frames (1 frame)
- **Shift+ArrowLeft/Right**: Navigate frames (10 frames)
- **Home**: Jump to start
- **End**: Jump to end

### User Flows Tested
1. Video selection and loading
2. Annotation creation (draw bounding box)
3. Keyframe creation and management
4. Timeline interaction and visualization
5. Video playback with timeline sync
6. Annotation saving and persistence
7. Interpolation between keyframes
8. Zoom and viewport management

### Visual Quality Tests
1. Canvas high-DPI rendering (no graininess)
2. Playhead position accuracy
3. Keyframe visibility and highlighting
4. Interpolation segment rendering
5. Frame ruler rendering
6. Window resize handling

## Debugging Failed Tests

### View Test Report
```bash
# After running tests, open HTML report
npx playwright show-report
```

### Examine Screenshots and Videos
Failed tests automatically capture:
- Screenshots (on failure)
- Videos (on failure)
- Traces (on first retry)

Located in: `test-results/`

### Run with Debug Mode
```bash
# Step through tests with Playwright Inspector
npx playwright test --debug

# Run specific test in debug mode
npx playwright test --debug -g "playhead moves"
```

### Check Docker Logs
If tests fail due to service issues:
```bash
# View all service logs
docker compose -f docker-compose.e2e.yml logs

# View specific service
docker compose -f docker-compose.e2e.yml logs frontend
docker compose -f docker-compose.e2e.yml logs backend

# Follow logs in real-time
docker compose -f docker-compose.e2e.yml logs -f
```

## Known Issues and Limitations

### Browser Support
- Currently configured for Chromium only (CI performance)
- Firefox and WebKit can be enabled in `playwright.config.ts`

### Timing Sensitivity
- Some tests use `waitForTimeout()` for animation/render completion
- May need adjustment on slower machines
- Video loading times vary by file size

### Docker Startup Time
- First run may be slow (building images)
- Subsequent runs use cached images
- Health checks ensure services are ready before tests

### Canvas Screenshot Comparison
- Exact pixel matching can be flaky
- Tests use screenshot inequality to detect changes
- For production, consider visual regression tools (Percy, Applitools)

## Adding New Tests

### Test Structure Template
```typescript
test('test description', async ({ page }) => {
  // 1. Navigate to annotation workspace
  await navigateToAnnotationWorkspace(page)

  // 2. Create initial annotation
  await createAnnotation(page)

  // 3. Perform actions
  await page.keyboard.press('k')

  // 4. Assert expectations
  await expect(page.locator('...')).toBeVisible()
})
```

### Helper Functions
Use provided helpers for common tasks:
- `navigateToAnnotationWorkspace(page)` - Load video and enter workspace
- `createAnnotation(page)` - Draw initial bounding box
- `getCurrentFrame(page, video)` - Get current video frame number

### Best Practices
1. Use data-testid attributes for reliable selectors
2. Wait for elements before interacting
3. Avoid hard-coded timeouts when possible
4. Use meaningful test descriptions
5. Group related tests in describe blocks
6. Clean up state between tests with beforeEach

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Start E2E services
  run: docker compose -f docker-compose.e2e.yml up -d

- name: Wait for services
  run: docker compose -f docker-compose.e2e.yml logs --follow --until=5m

- name: Run E2E tests
  run: |
    cd annotation-tool
    npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: annotation-tool/playwright-report/

- name: Cleanup
  if: always()
  run: docker compose -f docker-compose.e2e.yml down -v
```

## Performance Benchmarks

Timeline rendering targets:
- 60 FPS during video playback
- <50ms frame duration for smooth playhead
- <100ms keyframe operation response
- <200ms zoom level changes

These are tested in `test/integration/timeline-performance.test.ts` (unit tests)

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)
- [CI/CD Integration](https://playwright.dev/docs/ci)
