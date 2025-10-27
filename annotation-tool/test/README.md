# Frontend Test Suite

This directory contains the test suite for the fovea annotation tool frontend.

## Structure

```
test/
├── e2e/                    # End-to-end tests (Playwright)
├── integration/            # Integration tests (Vitest)
├── mocks/                  # MSW mock handlers
├── fixtures/               # Test data factories
├── utils/                  # Shared test utilities
└── setup.ts               # Global test setup
```

## Test Types

### Unit Tests
Unit tests are **co-located** with source files in `src/`:
- `Component.tsx` → `Component.test.tsx`
- `hook.ts` → `hook.test.ts`

**Running unit tests:**
```bash
npm run test                # Run all unit tests
npm run test:ui             # Run with UI
npm run test:coverage       # Run with coverage report
npm run test -- <file>      # Run specific test file
```

### Integration Tests
Integration tests are in `test/integration/` and test interactions between multiple components or state management flows.

**Running integration tests:**
```bash
npm run test test/integration/
```

### E2E Tests
E2E tests are in `test/e2e/` and use Playwright to test complete user workflows.

**Current E2E Coverage:**
- **Authentication:** Single-user mode authentication (auto-login, no auth UI)
- **Object Management:** 60 tests covering entities, events, locations, times, collections
- **Annotation Workflow:** Timeline-based video annotation with keyframes
- **Persistence:** Cross-reload data persistence tests

**Running E2E tests:**
```bash
# Start E2E infrastructure (Docker Compose)
docker compose -f docker-compose.e2e.yml up -d

# Run E2E tests (uses workers: 1 for test isolation)
npm run test:e2e

# Run with Playwright UI
npm run test:e2e:ui

# Clean up
docker compose -f docker-compose.e2e.yml down -v
```

**E2E Infrastructure:**
E2E tests run against a Docker Compose stack (`docker-compose.e2e.yml`) that includes:
- Frontend (production build)
- Backend (with FOVEA_MODE=single-user)
- PostgreSQL (with tmpfs for speed)
- Redis (with tmpfs for speed)

Database migrations run automatically via `npx prisma migrate deploy` before tests.

**Important:** E2E tests currently run with `workers: 1` (serial execution) to avoid race conditions in single-user mode. This is a temporary workaround. See `test/e2e/README.md` for details on test isolation and the planned migration to worker-specific test users for parallel execution.

## Shared Resources

### Mock Handlers (`mocks/handlers.ts`)
Centralized MSW handlers for API mocking. The MSW server is configured in `setup.ts` and intercepts all HTTP requests during tests.

**Usage:**
```typescript
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

test('custom handler', () => {
  server.use(
    http.get('/api/custom', () => HttpResponse.json({ data: 'test' }))
  )
  // ... test code
})
```

### Test Fixtures (`fixtures/`)
Factory functions for creating test data. Prefer using fixtures over inline test data for consistency.

**Available fixtures:**
- `createAnnotation()` - Annotation objects with keyframes
- `createPersona()` - Persona objects
- `createEntityType()` - Entity type objects
- `createKeyframe()` - Individual keyframe objects
- Many more specialized factories

**Usage:**
```typescript
import { createAnnotation, createPersona } from '@test/fixtures'

const annotation = createAnnotation({
  videoId: 'my-video',
  keyframes: createKeyframeSequence(5)
})
```

### Test Utilities (`utils/test-utils.tsx`)
Helper functions for testing React components with all required providers.

**Available utilities:**
- `renderWithProviders()` - Render with Redux, React Query, and MUI theme
- `createTestQueryClient()` - Create QueryClient for testing
- `waitForCondition()` - Wait for async conditions

**Usage:**
```typescript
import { renderWithProviders } from '@test/utils/test-utils'

test('renders component', () => {
  const { getByText } = renderWithProviders(<MyComponent />)
  expect(getByText('Hello')).toBeInTheDocument()
})
```

## Writing Tests

### Best Practices

1. **Use fixtures for test data** - Don't create inline objects
2. **Use renderWithProviders** - Don't render without providers
3. **Test user behavior, not implementation** - Use Testing Library queries
4. **Clean up after tests** - Handled automatically by setup.ts
5. **Mock external APIs** - Use MSW handlers, not manual mocks

### Example Test

```typescript
import { renderWithProviders, screen } from '@test/utils/test-utils'
import { createAnnotation } from '@test/fixtures'
import { AnnotationCard } from './AnnotationCard'

describe('AnnotationCard', () => {
  it('displays annotation details', () => {
    const annotation = createAnnotation({
      entityTypeId: 'player'
    })

    renderWithProviders(<AnnotationCard annotation={annotation} />)

    expect(screen.getByText(/player/i)).toBeInTheDocument()
  })
})
```

## Coverage

Coverage thresholds are set at 80% for:
- Statements
- Branches
- Functions
- Lines

Run `npm run test:coverage` to generate a coverage report.

## Configuration

- `vitest.config.ts` - Vitest configuration
- `playwright.config.ts` - Playwright configuration
- `setup.ts` - Global test setup (MSW, browser APIs)
