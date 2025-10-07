---
title: Testing Guide
---

# Testing Guide

The FOVEA project uses a multi-layered testing approach across all three services. The frontend uses Vitest for unit tests and Playwright for end-to-end tests. The backend uses Vitest with supertest for API testing. The model service uses pytest with httpx for async API testing. All services maintain test coverage above 80% to ensure code quality and prevent regressions.

## Testing Philosophy

Tests serve as executable documentation and regression prevention. Each test should verify a single behavior or contract. Test names describe what the code does, not how it works. Tests run in isolation without shared state. Mock external dependencies at service boundaries to keep tests fast and reliable. Integration tests verify that components work together correctly while unit tests validate individual functions and classes.

## Frontend Testing

### Unit Tests with Vitest

The frontend uses Vitest as the test runner with Testing Library for component testing. Vitest provides fast execution with native ESM support and TypeScript integration. Tests live in `annotation-tool/test/unit/` organized to mirror the source structure.

Run unit tests:

```bash
cd annotation-tool
npm run test              # Run all tests
npm run test:ui           # Run with UI
npm run test:coverage     # Generate coverage report
npm run test -- MyComponent.test.tsx  # Run specific file
```

Example component test:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { EntityEditor } from '../../src/components/world/EntityEditor';
import worldReducer from '../../src/store/worldSlice';

describe('EntityEditor', () => {
  const createTestStore = () => {
    return configureStore({
      reducer: {
        world: worldReducer
      }
    });
  };

  it('renders entity form fields', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <EntityEditor entityId={null} />
      </Provider>
    );

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('calls onSave when form submitted', async () => {
    const store = createTestStore();
    const handleSave = vi.fn();

    render(
      <Provider store={store}>
        <EntityEditor entityId={null} onSave={handleSave} />
      </Provider>
    );

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Test Entity' }
    });
    fireEvent.click(screen.getByText(/save/i));

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Entity' })
    );
  });
});
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

Configure MSW in test setup:

```typescript
import { beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
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

### API Tests with Vitest

The backend uses Vitest with Fastify's injection API for testing routes without starting a server. Tests verify request handling, validation, and database operations.

Run backend tests:

```bash
cd server
npm run test                    # Run all tests
npm run test:coverage           # Generate coverage
npm run test -- models.test.ts  # Run specific file
```

Example API test:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Video Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/videos returns video list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/videos'
    });

    expect(response.statusCode).toBe(200);
    const videos = response.json();
    expect(Array.isArray(videos)).toBe(true);
  });

  it('POST /api/videos validates request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/videos',
      payload: {
        // Missing required filename field
        duration: 120
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/videos/:id returns single video', async () => {
    // First create a video
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/videos',
      payload: {
        filename: 'test.mp4',
        duration: 120
      }
    });

    const { id } = createResponse.json();

    // Then fetch it
    const response = await app.inject({
      method: 'GET',
      url: `/api/videos/${id}`
    });

    expect(response.statusCode).toBe(200);
    const video = response.json();
    expect(video.id).toBe(id);
    expect(video.filename).toBe('test.mp4');
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

### Async API Tests with pytest

The model service uses pytest with httpx for async API testing. Tests mock model inference to avoid loading large models during tests.

Run model service tests:

```bash
cd model-service
pytest                                    # Run all tests
pytest --cov=src                          # Run with coverage
pytest test/test_routes.py -v             # Run specific file with verbose output
pytest -k "test_summarize" -v             # Run tests matching pattern
pytest test/test_routes.py::TestSummarizeEndpoint::test_summarize_video_success -v  # Run single test
```

Example async test:

```python
import pytest
from httpx import AsyncClient
from src.main import app

@pytest.mark.asyncio
async def test_summarize_video_success():
    """Test video summarization endpoint with valid input."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/summarize",
            json={
                "video_path": "/data/test.mp4",
                "persona_context": "Security analyst",
                "sample_rate": 30
            }
        )

    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "frame_count" in data
    assert data["frame_count"] > 0

@pytest.mark.asyncio
async def test_summarize_missing_video():
    """Test summarization with non-existent video."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/summarize",
            json={
                "video_path": "/data/nonexistent.mp4",
                "persona_context": "Analyst"
            }
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
