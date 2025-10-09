---
title: Testing Guide
---

# Testing Guide

The FOVEA project uses a multi-layered testing approach across all three services. The frontend uses Vitest for unit tests and Playwright for end-to-end tests. The backend uses Vitest with supertest for API testing. The model service uses pytest with httpx for async API testing. All services maintain test coverage above 80% to ensure code quality and prevent regressions.

## Testing Philosophy

Tests serve as executable documentation and regression prevention. Each test should verify a single behavior or contract. Test names describe what the code does, not how it works. Tests run in isolation without shared state. Mock external dependencies at service boundaries to keep tests fast and reliable. Integration tests verify that components work together correctly while unit tests validate individual functions and classes.

## Frontend Testing

The frontend test suite is organized with unit tests co-located with source files, E2E tests in a separate directory, and shared test utilities for fixtures, mocks, and helpers. See `annotation-tool/test/README.md` for complete documentation.

### Test Organization

```
annotation-tool/
├── src/
│   └── components/
│       └── MyComponent.tsx
│       └── MyComponent.test.tsx    # Unit tests co-located
├── test/
│   ├── e2e/                        # Playwright E2E tests
│   ├── integration/                # Integration tests
│   ├── mocks/
│   │   └── handlers.ts            # MSW mock handlers
│   ├── fixtures/
│   │   ├── annotations.ts         # Test data factories
│   │   └── personas.ts
│   └── utils/
│       └── test-utils.tsx         # Render helpers
```

### Unit Tests with Vitest

Unit tests are co-located with source files (e.g., `Component.tsx` → `Component.test.tsx`). Use the `renderWithProviders()` helper to wrap components with Redux, React Query, and MUI providers.

Run unit tests:

```bash
cd annotation-tool
npm run test              # Run all tests
npm run test:ui           # Run with UI
npm run test:coverage     # Generate coverage report
npm run test -- MyComponent.test.tsx  # Run specific file
```

Example component test using test utilities:

```typescript
import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, fireEvent } from '@test/utils/test-utils';
import { createAnnotation } from '@test/fixtures';
import { AnnotationCard } from './AnnotationCard';

describe('AnnotationCard', () => {
  it('displays annotation details', () => {
    const annotation = createAnnotation({
      entityTypeId: 'player'
    });

    renderWithProviders(<AnnotationCard annotation={annotation} />);

    expect(screen.getByText(/player/i)).toBeInTheDocument();
  });

  it('handles delete action', () => {
    const annotation = createAnnotation();
    const onDelete = vi.fn();

    renderWithProviders(
      <AnnotationCard annotation={annotation} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByLabelText(/delete/i));
    expect(onDelete).toHaveBeenCalledWith(annotation.id);
  });
});
```

### Test Fixtures

Use fixture factories from `test/fixtures/` to create consistent test data:

```typescript
import {
  createAnnotation,
  createKeyframeSequence,
  createPersona
} from '@test/fixtures';

// Create annotation with defaults
const annotation = createAnnotation();

// Override specific properties
const customAnnotation = createAnnotation({
  videoId: 'my-video',
  keyframes: createKeyframeSequence(5, 0, 10)
});

// Create persona
const persona = createPersona({ name: 'Baseball Scout' });
```

### Redux Store Testing

Test Redux slices in isolation by creating test stores with only the required reducers:

```typescript
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import worldReducer, { addEntity, updateEntity } from '../../src/store/worldSlice';

describe('worldSlice', () => {
  const createStore = () => {
    return configureStore({
      reducer: { world: worldReducer }
    });
  };

  it('adds entity to state', () => {
    const store = createStore();
    const entity = {
      id: '123',
      name: 'Test Entity',
      description: 'Test description'
    };

    store.dispatch(addEntity(entity));

    const state = store.getState();
    expect(state.world.entities).toContainEqual(entity);
  });

  it('updates existing entity', () => {
    const store = createStore();
    const entity = { id: '123', name: 'Original' };

    store.dispatch(addEntity(entity));
    store.dispatch(updateEntity({ id: '123', updates: { name: 'Updated' } }));

    const state = store.getState();
    const updated = state.world.entities.find(e => e.id === '123');
    expect(updated?.name).toBe('Updated');
  });
});
```

### API Mocking with MSW

Mock Service Worker (MSW) intercepts HTTP requests for predictable API testing. Define handlers in `test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/videos', () => {
    return HttpResponse.json([
      { id: '1', filename: 'test.mp4', duration: 120 }
    ]);
  }),

  http.post('/api/annotations', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: '123',
      ...body
    }, { status: 201 });
  }),

  http.get('/api/annotations/:id', ({ params }) => {
    const { id } = params;
    if (id === '404') {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ id, type: 'entity' });
  })
];
```

MSW handlers are centralized in `test/mocks/handlers.ts` and configured in `test/setup.ts`. Override handlers in specific tests:

```typescript
import { server } from '@test/setup';
import { http, HttpResponse } from 'msw';

test('handles API error', () => {
  server.use(
    http.get('/api/personas', () => {
      return new HttpResponse(null, { status: 500 })
    })
  );

  // Test error handling...
});
```

### E2E Tests with Playwright

Playwright provides browser automation for end-to-end testing. Tests live in `annotation-tool/test/e2e/` and verify complete user workflows.

Run E2E tests:

```bash
cd annotation-tool
npm run test:e2e           # Run headless
npm run test:e2e:ui        # Run with UI
```

Example E2E test:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Annotation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('create bounding box annotation', async ({ page }) => {
    // Select video
    await page.click('[data-testid="video-selector"]');
    await page.click('text=example.mp4');

    // Wait for video to load
    await page.waitForSelector('video');

    // Enter draw mode
    await page.click('[data-testid="draw-mode-btn"]');

    // Draw bounding box
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 300, y: 300 } });

    // Select entity type
    await page.click('[data-testid="type-selector"]');
    await page.click('text=Person');

    // Save annotation
    await page.click('[data-testid="save-btn"]');

    // Verify annotation appears in list
    await expect(page.locator('[data-testid="annotation-list"]'))
      .toContainText('Person');
  });

  test('keyframe annotation workflow', async ({ page }) => {
    await page.click('[data-testid="video-selector"]');
    await page.click('text=example.mp4');

    // Draw initial box at frame 0
    await page.click('[data-testid="draw-mode-btn"]');
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });

    // Advance 10 frames
    await page.keyboard.press('Shift+ArrowRight');

    // Add keyframe at new position
    await page.keyboard.press('k');
    await canvas.click({ position: { x: 150, y: 150 } });
    await canvas.click({ position: { x: 250, y: 250 } });

    // Verify keyframe indicator
    await expect(page.locator('[data-testid="keyframe-indicator"]'))
      .toHaveCount(2);
  });
});
```

## Backend Testing

The backend test suite mirrors the `src/` directory structure with tests organized by domain (routes, models, queues, services). Shared test utilities and fixtures reduce duplication. See `server/test/README.md` for complete documentation.

### Test Organization

```
server/
├── src/
│   ├── routes/
│   │   └── personas.ts
│   ├── models/
│   └── queues/
└── test/
    ├── routes/
    │   ├── personas.test.ts     # Mirrors src structure
    │   └── videos.test.ts
    ├── models/
    ├── queues/
    ├── fixtures/
    │   ├── personas.ts          # Test data factories
    │   └── annotations.ts
    └── utils/
        └── test-server.ts       # Server factory
```

### API Tests with Vitest

The backend uses Vitest with Fastify's injection API. Use the `createTestServer()` helper and fixture factories for consistent tests.

Run backend tests:

```bash
cd server
npm run test                    # Run all tests
npm run test:coverage           # Generate coverage
npm run test test/routes/       # Run route tests
npm run test test/routes/personas.test.ts  # Run specific file
```

Example API test using test utilities:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { createTestServer, injectJSON } from '@test/utils/test-server';
import { createPersona } from '@test/fixtures';

describe('Personas API', () => {
  const server = await createTestServer();

  afterAll(async () => {
    await server.close();
  });

  it('creates persona', async () => {
    const payload = createPersona({ name: 'Test Scout' });

    const { json, statusCode } = await injectJSON(
      server,
      'POST',
      '/api/personas',
      payload
    );

    expect(statusCode).toBe(201);
    expect(json.name).toBe('Test Scout');
  });

  it('validates required fields', async () => {
    const { statusCode } = await injectJSON(
      server,
      'POST',
      '/api/personas',
      { name: 'Test' } // Missing required fields
    );

    expect(statusCode).toBe(400);
  });
});
```

### Database Testing

Use a test database to isolate test data from development. Configure `TEST_DATABASE_URL` in environment and clean up after each test:

```typescript
import { beforeEach, afterEach } from 'vitest';
import { prisma } from '../src/models';

beforeEach(async () => {
  // Ensure clean state
  await prisma.annotation.deleteMany();
  await prisma.video.deleteMany();
  await prisma.persona.deleteMany();
});

afterEach(async () => {
  // Clean up test data
  await prisma.annotation.deleteMany();
  await prisma.video.deleteMany();
  await prisma.persona.deleteMany();
});
```

## Model Service Testing

The model service test suite mirrors the `src/` directory structure with tests organized by domain (routes, loaders, utils). Pytest fixtures in `conftest.py` provide shared test resources. See `model-service/test/README.md` for complete documentation.

### Test Organization

```
model-service/
├── src/
│   ├── routes.py
│   ├── detection_loader.py
│   └── video_utils.py
└── test/
    ├── routes/
    │   └── test_routes.py       # Mirrors src structure
    ├── loaders/
    │   └── test_detection_loader.py
    ├── utils/
    │   └── test_video_utils.py
    ├── fixtures/
    │   └── personas.py          # Test data factories
    └── conftest.py              # Pytest fixtures
```

### Async API Tests with pytest

The model service uses pytest with httpx and FastAPI TestClient. Use fixtures from `conftest.py` and test data factories for consistent tests.

Run model service tests:

```bash
cd model-service
pytest                                    # Run all tests
pytest --cov=src --cov-report=term-missing  # Run with coverage
pytest test/routes/ -v                    # Run route tests
pytest test/routes/test_routes.py::TestSummarizeEndpoint -v  # Run specific test class
```

Example async test using fixtures:

```python
import pytest
from test.fixtures import create_persona

class TestSummarizeEndpoint:
    """Tests for video summarization endpoint."""

    def test_summarize_video_success(self, client, mock_video_id):
        """Test successful video summarization request."""
        persona = create_persona({"name": "Baseball Scout"})

        response = client.post(
            f"/api/videos/{mock_video_id}/summarize",
            json={"persona_id": persona["id"]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == mock_video_id
        assert data["persona_id"] == persona["id"]

    def test_summarize_missing_video(self, client):
        """Test summarization with invalid video ID."""
        response = client.post(
            "/api/videos/invalid-id/summarize",
            json={"persona_id": "persona-1"}
        )

        assert response.status_code == 404
```

### Mocking Model Inference

Mock model loaders to avoid loading multi-gigabyte models in tests:

```python
import pytest
from unittest.mock import Mock, patch

@pytest.fixture
def mock_vlm_loader():
    """Mock VLM loader to skip model loading."""
    with patch('src.vlm_loader.VLMLoader') as mock:
        loader = Mock()
        loader.load.return_value = (Mock(), Mock())
        mock.return_value = loader
        yield mock

@pytest.mark.asyncio
async def test_summarize_with_mocked_model(mock_vlm_loader):
    """Test summarization logic without loading real model."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/summarize",
            json={
                "video_path": "/data/test.mp4",
                "persona_context": "Analyst"
            }
        )

    assert response.status_code == 200
    mock_vlm_loader.return_value.load.assert_called_once()
```

## Test Coverage

All services target minimum 80% code coverage. Coverage reports identify untested code paths and help maintain quality.

Generate coverage reports:

```bash
# Frontend
cd annotation-tool
npm run test:coverage
open coverage/index.html

# Backend
cd server
npm run test:coverage
open coverage/index.html

# Model service
cd model-service
pytest --cov=src --cov-report=html
open htmlcov/index.html
```

Coverage reports show line coverage, branch coverage, and function coverage. Focus on critical paths like API endpoints, business logic, and error handling. Skip coverage for generated code, type definitions, and trivial getters/setters.

## Continuous Integration

GitHub Actions runs tests on every pull request. The workflow runs linting, type checking, unit tests, and E2E tests. All checks must pass before merging.

CI workflow stages:

1. Lint check (ESLint, ruff)
2. Type check (TypeScript, mypy)
3. Unit tests with coverage
4. E2E tests (frontend only)
5. Build verification

Fix failing tests before pushing. Run the full test suite locally before opening a pull request to catch issues early.

## Testing Best Practices

Write descriptive test names that explain the expected behavior. Use arrange-act-assert pattern to structure tests clearly. Test error cases and edge cases alongside happy paths. Keep tests independent so they can run in any order. Avoid testing implementation details and focus on public APIs and user-visible behavior.

Mock external dependencies like HTTP requests, file system access, and third-party services. Use fixtures to share common test setup across multiple tests. Clean up resources in teardown hooks to prevent test pollution. Run tests in watch mode during development to get immediate feedback on code changes.

## Next Steps

- [Frontend Development](./frontend-dev.md)
- [Backend Development](./backend-dev.md)
- [Python Development](./python-dev.md)
- [Code Style Guide](./code-style.md)
- [Contributing Guide](./contributing.md)
