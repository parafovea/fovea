# Backend Test Suite

This directory contains the test suite for the fovea backend server.

## Structure

```
test/
├── routes/                 # API route tests
│   ├── api-keys.test.ts    # API key CRUD and admin operations (31 tests)
│   ├── auth.test.ts        # Login, logout, registration (23 tests)
│   ├── sessions.test.ts    # Session management (19 tests)
│   ├── users.test.ts       # User CRUD and admin operations (29 tests)
│   └── ...                 # Other route tests
├── models/                 # Data model tests
├── queues/                 # Job queue tests
├── services/               # Service layer tests
│   └── auth-service.test.ts # Auth service unit tests (30 tests)
├── integration/            # Integration tests
│   ├── auth-flow.test.ts   # Complete authentication workflows (7 tests)
│   └── api-key-resolution.test.ts # API key precedence testing (16 tests)
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

# Run authentication tests
npm run test test/routes/auth.test.ts
npm run test test/routes/api-keys.test.ts
npm run test test/services/auth-service.test.ts

# Run integration tests
npm run test test/integration/

# Run with coverage
npm run test:coverage
```

## Authentication Testing

The authentication system has comprehensive test coverage across multiple layers:

### Route Tests (102 tests)
- **api-keys.test.ts** (31 tests): User and admin API key CRUD operations
  - User key operations (GET, POST, PUT, DELETE)
  - Admin key operations (global keys with userId: null)
  - Authorization and validation
  - Encryption verification

- **auth.test.ts** (23 tests): Login, logout, registration, and me endpoint
  - Password authentication
  - Session cookie management
  - Registration flows (when enabled)
  - Current user retrieval

- **sessions.test.ts** (19 tests): Session management
  - User session listing and deletion
  - Admin session operations (view all, delete any)
  - Session expiration handling

- **users.test.ts** (29 tests): User CRUD and admin operations
  - User creation, update, deletion
  - Admin-only operations
  - User filtering and pagination

### Service Tests (30 tests)
- **auth-service.test.ts**: Unit tests for AuthService methods
  - Authentication with password provider
  - Session creation (token generation, expiration)
  - Session validation and cleanup
  - Token security verification

### Integration Tests (23 tests)
- **auth-flow.test.ts** (7 tests): Complete authentication workflows
  - Registration → login → protected resource → logout
  - Session expiration handling
  - Password changes and session validity
  - User deletion cascade effects

- **api-key-resolution.test.ts** (16 tests): API key precedence chain
  - User keys → Admin keys → Environment variables
  - Key updates and immediate reflection
  - Usage statistics tracking
  - Multi-user scenarios

**Total Authentication Tests: 155 tests**

### Running Authentication Tests

```bash
# Run all authentication tests
npm run test test/routes/auth.test.ts test/routes/api-keys.test.ts test/routes/sessions.test.ts test/routes/users.test.ts test/services/auth-service.test.ts test/integration/

# Run specific authentication test suite
npm run test test/services/auth-service.test.ts

# Run integration tests only
npm run test test/integration/auth-flow.test.ts
npm run test test/integration/api-key-resolution.test.ts
```

### Special Setup Notes

**Multi-user vs Single-user Mode:**
Some integration tests create separate app instances to test mode-specific behavior:
- `FOVEA_MODE=multi-user`: Full authentication required
- `FOVEA_MODE=single-user`: Auto-authentication with default user

**Database Cleanup:**
All authentication tests clean the database in dependency order during `beforeEach`:
```typescript
await prisma.apiKey.deleteMany()
await prisma.session.deleteMany()
await prisma.annotation.deleteMany()
await prisma.videoSummary.deleteMany()
await prisma.ontology.deleteMany()
await prisma.persona.deleteMany()
await prisma.user.deleteMany()
```

**Session Token Handling:**
Tests extract session tokens from cookies after login:
```typescript
const loginResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { username: 'admin', password: 'adminpass123' }
})
const sessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
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
- `createUser()` - User objects with hashed passwords
- `createAdminUser()` - Admin user objects
- `createPersona()` - Persona objects
- `createOntology()` - Ontology objects
- `createAnnotation()` - Annotation objects
- `createAnnotationBatch()` - Multiple annotations

**Usage:**
```typescript
import { createUser, createAdminUser } from '@test/fixtures/users'
import { createPersona, createAnnotation } from '@test/fixtures'

const user = await createUser({ username: 'testuser' })
const admin = await createAdminUser()
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

### Authentication Coverage

The authentication system has comprehensive test coverage:

**Files Covered:**
- `src/routes/auth.ts` - Login, logout, registration endpoints
- `src/routes/api-keys.ts` - User and admin API key management
- `src/routes/sessions.ts` - Session management endpoints
- `src/routes/users.ts` - User CRUD operations
- `src/services/auth-service.ts` - Authentication service layer
- `src/services/api-key-service.ts` - API key resolution logic
- `src/middleware/auth.ts` - Authentication middleware
- `src/lib/password.ts` - Password hashing utilities
- `src/lib/session.ts` - Session token generation
- `src/lib/encryption.ts` - API key encryption

**Test Statistics:**
- 155 total authentication tests
- 102 route tests (auth, api-keys, sessions, users)
- 30 service layer unit tests
- 23 integration tests (flows + API key resolution)

The authentication system exceeds the 80% coverage threshold across all critical paths including error handling, authorization checks, and edge cases.

## Configuration

- `vitest.config.ts` - Vitest configuration
- `setup.ts` - Global test setup
- `tsconfig.json` - TypeScript configuration (includes test files)
