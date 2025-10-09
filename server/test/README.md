# Backend Test Suite

This directory contains the test suite for the fovea backend server.

## Structure

```
test/
├── routes/                 # API route tests
├── models/                 # Data model tests
├── queues/                 # Job queue tests
├── services/               # Service layer tests
├── fixtures/               # Test data factories
├── utils/                  # Shared test utilities
├── setup.ts               # Global test setup
├── app.test.ts            # App initialization tests
├── database.test.ts       # Database tests
├── observability.test.ts  # Tracing/metrics tests
└── queryBuilder.test.ts   # Query builder tests
```

## Test Organization

Tests are organized to **mirror the `src/` directory structure**:
- `src/routes/personas.ts` → `test/routes/personas.test.ts`
- `src/models/` → `test/models/`
- `src/queues/` → `test/queues/`

## Running Tests

```bash
npm run test                # Run all tests
npm run test:coverage       # Run with coverage report
npm run test -- <file>      # Run specific test file
```

### Examples

```bash
# Run all route tests
npm run test test/routes/

# Run specific test file
npm run test test/routes/personas.test.ts

# Run with coverage
npm run test:coverage
```

## Shared Resources

### Test Server (`utils/test-server.ts`)
Creates a configured Fastify server instance for testing.

**Usage:**
```typescript
import { createTestServer } from '@test/utils/test-server'

test('GET /api/personas', async () => {
  const server = await createTestServer()

  const response = await server.inject({
    method: 'GET',
    url: '/api/personas'
  })

  expect(response.statusCode).toBe(200)
  await server.close()
})
```

**Helper for JSON responses:**
```typescript
import { createTestServer, injectJSON } from '@test/utils/test-server'

test('POST /api/personas', async () => {
  const server = await createTestServer()

  const { json, statusCode } = await injectJSON(server, 'POST', '/api/personas', {
    name: 'Test Persona'
  })

  expect(statusCode).toBe(201)
  expect(json.id).toBeDefined()
  await server.close()
})
```

### Test Fixtures (`fixtures/`)
Factory functions for creating test data. Prefer using fixtures over inline test data.

**Available fixtures:**
- `createPersona()` - Persona objects
- `createOntology()` - Ontology objects
- `createAnnotation()` - Annotation objects
- `createAnnotationBatch()` - Multiple annotations

**Usage:**
```typescript
import { createPersona, createAnnotation } from '@test/fixtures'

const persona = createPersona({ name: 'Baseball Scout' })
const annotation = createAnnotation({ videoId: 'video-1' })
```

## Writing Tests

### Best Practices

1. **Use test server factory** - Don't manually configure Fastify
2. **Use fixtures for test data** - Don't create inline objects
3. **Close server after tests** - Always call `server.close()`
4. **Test API contracts** - Validate response schemas with TypeBox
5. **Mock external services** - Don't make real HTTP calls to model service

### Example Test

```typescript
import { describe, test, expect, afterAll } from 'vitest'
import { createTestServer, injectJSON } from '@test/utils/test-server'
import { createPersona } from '@test/fixtures'

describe('Personas API', () => {
  const server = await createTestServer()

  afterAll(async () => {
    await server.close()
  })

  test('creates persona', async () => {
    const payload = createPersona({ name: 'Test Scout' })

    const { json, statusCode } = await injectJSON(
      server,
      'POST',
      '/api/personas',
      payload
    )

    expect(statusCode).toBe(201)
    expect(json.name).toBe('Test Scout')
  })
})
```

## Database Testing

Tests use an in-memory SQLite database by default. See `database.test.ts` for examples of database-specific testing.

**Prisma considerations:**
- Database is reset between tests
- Use transactions for isolated tests
- Don't test Prisma itself, test your data access logic

## Coverage

Coverage thresholds are set at 80% for:
- Statements
- Branches
- Functions
- Lines

Run `npm run test:coverage` to generate a coverage report.

## Configuration

- `vitest.config.ts` - Vitest configuration
- `setup.ts` - Global test setup
- `tsconfig.json` - TypeScript configuration (includes test files)
