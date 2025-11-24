---
title: Backend Development
---

# Backend Development

The backend service provides REST APIs for video annotation, ontology management, and world state persistence. Built with Node.js 22, Fastify 5, and TypeScript 5.3+, it uses Prisma 6 for PostgreSQL access and BullMQ 5 for job queues.

## Development Environment

### Prerequisites

- Node.js 22 LTS
- PostgreSQL 16
- Redis 7
- Docker (optional, for infrastructure)

### Initial Setup

```bash
cd server
npm install
npx prisma generate
```

### Configuration

Create `.env` file:

```bash
DATABASE_URL="postgresql://fovea:fovea_password@localhost:5432/fovea"
REDIS_URL="redis://localhost:6379"
PORT=3001
NODE_ENV=development
```

### Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3001` with hot reload via `tsx watch`.

## Project Structure

```
server/
├── src/
│   ├── index.ts           # Entry point, server initialization
│   ├── app.ts             # Fastify app configuration
│   ├── tracing.ts         # OpenTelemetry setup (must be first import)
│   ├── routes/            # API route handlers
│   │   ├── videos/        # Modular video routes (NEW)
│   │   │   ├── index.ts   # Route registration
│   │   │   ├── list.ts    # List and get video metadata
│   │   │   ├── stream.ts  # Video streaming
│   │   │   ├── thumbnail.ts
│   │   │   ├── detect.ts  # Object detection
│   │   │   ├── sync.ts    # Storage sync
│   │   │   ├── url.ts     # Get video URLs
│   │   │   └── schemas.ts # Shared schemas
│   │   ├── personas.ts
│   │   ├── ontology.ts
│   │   ├── world.ts
│   │   ├── annotations.ts
│   │   └── export.ts
│   ├── repositories/      # Data access layer (NEW)
│   │   └── VideoRepository.ts
│   ├── services/          # Business logic
│   │   ├── videoService.ts
│   │   ├── ontologyService.ts
│   │   ├── worldService.ts
│   │   └── importService.ts
│   ├── queues/            # BullMQ job processors
│   │   ├── videoQueue.ts
│   │   └── summarizationWorker.ts
│   ├── models/            # Prisma client, types
│   │   └── index.ts
│   ├── utils/             # Helper functions
│   │   ├── validation.ts
│   │   └── errors.ts
│   └── metrics.ts         # Custom metrics
├── prisma/
│   └── schema.prisma      # Database schema
└── test/                  # Test files
    ├── routes/
    └── services/
```

## Architecture Patterns

### Repository Pattern

The backend uses repository classes to encapsulate database queries and abstract data access from route handlers.

**Location**: `server/src/repositories/`

**Example**: `VideoRepository.ts`

```typescript
// Repository handles all video database queries
class VideoRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Video | null> {
    return this.prisma.video.findUnique({ where: { id } })
  }

  async findAll(filters?: VideoFilters): Promise<Video[]> {
    return this.prisma.video.findMany({ where: filters })
  }
}

// Route handler uses repository
fastify.get('/api/videos/:id', async (request, reply) => {
  const video = await videoRepository.findById(request.params.id)
  return video
})
```

**Benefits**:
- Testable database logic (mock repositories in tests)
- Reusable query methods across routes
- Clear separation between routes and data access
- Easier to refactor database schema

### Modular Route Organization

Complex route modules are split into separate files for maintainability. The videos API exemplifies this pattern:

```
routes/videos/
├── index.ts      # Registers all sub-routes
├── list.ts       # GET /api/videos, GET /api/videos/:id
├── stream.ts     # GET /api/videos/:id/stream
├── thumbnail.ts  # GET /api/videos/:id/thumbnail
├── detect.ts     # POST /api/videos/:id/detect
├── sync.ts       # POST /api/videos/sync
├── url.ts        # GET /api/videos/:id/url
└── schemas.ts    # Shared TypeBox schemas
```

Each file contains related endpoint logic, keeping route handlers focused and easy to test.

**When to modularize**: When a route file exceeds 300-400 lines or handles 5+ distinct operations.

## Running the Backend

### Development Mode

```bash
npm run dev
```

Uses `tsx watch` for automatic restart on file changes.

### Production Build

```bash
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled server
```

### Testing

```bash
npm run test              # Run all tests
npm run test:coverage     # Run with coverage
```

### Linting

```bash
npm run lint              # Check code style
```

## Database Workflow

### Schema Changes

1. Edit `prisma/schema.prisma`:

```prisma
model Annotation {
  id          String   @id @default(uuid())
  videoId     String
  personaId   String
  // Add new field
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

2. Create migration:

```bash
npx prisma migrate dev --name add_annotation_notes
```

3. Generate Prisma client:

```bash
npx prisma generate
```

### Database GUI

Open Prisma Studio:

```bash
npx prisma studio
```

Access at `http://localhost:5555` to browse and edit data.

### Reset Database

```bash
npx prisma migrate reset    # WARNING: Deletes all data
npx prisma migrate deploy    # Apply migrations only
```

## Adding New API Routes

### Step 1: Define Route Handler

Create `src/routes/myResource.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

const MyItemSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String())
});

export async function myResourceRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get('/api/my-resource', {
    schema: {
      response: {
        200: Type.Array(MyItemSchema)
      }
    }
  }, async (request, reply) => {
    const items = await fastify.prisma.myItem.findMany();
    return items;
  });

  server.post('/api/my-resource', {
    schema: {
      body: Type.Object({
        name: Type.String(),
        description: Type.Optional(Type.String())
      }),
      response: {
        201: MyItemSchema
      }
    }
  }, async (request, reply) => {
    const item = await fastify.prisma.myItem.create({
      data: request.body
    });
    reply.code(201);
    return item;
  });
}
```

### Step 2: Register Route

In `src/app.ts`:

```typescript
import { myResourceRoutes } from './routes/myResource.js';

export async function buildApp() {
  const app = fastify();

  // ... existing routes
  await app.register(myResourceRoutes);

  return app;
}
```

### Step 3: Add Tests

Create `test/routes/myResource.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('My Resource Routes', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/my-resource returns items', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/my-resource'
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });
});
```

## Background Jobs with BullMQ

### Step 1: Define Queue

Create `src/queues/myQueue.ts`:

```typescript
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const myQueue = new Queue('my-queue', { connection });

export async function addMyJob(data: { id: string; params: unknown }) {
  await myQueue.add('process-item', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });
}
```

### Step 2: Create Worker

Create `src/queues/myWorker.ts`:

```typescript
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const myWorker = new Worker('my-queue', async (job: Job) => {
  console.log(`Processing job ${job.id}`);

  // Job logic here
  const result = await processItem(job.data);

  return result;
}, { connection });

myWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

myWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

async function processItem(data: any) {
  // Implementation
  return { success: true };
}
```

### Step 3: Start Worker

In separate terminal:

```bash
node dist/queues/myWorker.js
```

Or add to `package.json`:

```json
{
  "scripts": {
    "worker": "tsx src/queues/myWorker.ts"
  }
}
```

## Error Handling

### Custom Error Classes

```typescript
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Error Handler

```typescript
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  if (error.statusCode) {
    reply.code(error.statusCode).send({
      error: error.name,
      message: error.message
    });
  } else {
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  }
});
```

## OpenTelemetry and Metrics

### Add Custom Metric

In `src/metrics.ts`:

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('fovea-backend');

export const myCounter = meter.createCounter('fovea_my_operation_total', {
  description: 'Total number of my operations',
  unit: '1'
});

export const myHistogram = meter.createHistogram('fovea_my_operation_duration', {
  description: 'Duration of my operations',
  unit: 'ms'
});
```

### Use in Route

```typescript
import { myCounter, myHistogram } from '../metrics.js';

server.post('/api/my-operation', async (request, reply) => {
  const start = Date.now();

  try {
    const result = await performOperation();
    myCounter.add(1, { status: 'success' });
    return result;
  } catch (error) {
    myCounter.add(1, { status: 'error' });
    throw error;
  } finally {
    myHistogram.record(Date.now() - start);
  }
});
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "envFile": "${workspaceFolder}/server/.env"
    }
  ]
}
```

### Logging

Use Fastify logger:

```typescript
fastify.log.info('Info message');
fastify.log.error({ err: error }, 'Error occurred');
fastify.log.debug({ data }, 'Debug data');
```

Logs include trace context automatically.

## Common Development Tasks

### Add New Prisma Model

1. Add to `schema.prisma`:

```prisma
model MyModel {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

2. Create migration:

```bash
npx prisma migrate dev --name add_my_model
```

3. Use in code:

```typescript
const items = await fastify.prisma.myModel.findMany();
```

### Add Request Validation

Use TypeBox schemas:

```typescript
import { Type } from '@sinclair/typebox';

const CreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  email: Type.String({ format: 'email' }),
  age: Type.Optional(Type.Integer({ minimum: 0, maximum: 120 }))
});

server.post('/api/users', {
  schema: {
    body: CreateSchema
  }
}, async (request, reply) => {
  // request.body is validated and typed
  const user = await createUser(request.body);
  return user;
});
```

### Add Middleware

```typescript
fastify.addHook('preHandler', async (request, reply) => {
  // Check authentication
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

## Troubleshooting

### Port Already in Use

```bash
lsof -i :3001              # Find process using port
kill -9 <PID>              # Kill process
```

Or change port in `.env`:

```bash
PORT=3002
```

### Database Connection Fails

Check PostgreSQL is running:

```bash
docker compose ps postgres
docker compose logs postgres
```

Verify connection string in `.env`.

### Prisma Client Not Found

Regenerate client:

```bash
npx prisma generate
```

### Hot Reload Not Working

Restart dev server:

```bash
npm run dev
```

Check `package.json` uses `tsx watch`.

## Testing Best Practices

### Test Structure

```typescript
describe('User Service', () => {
  describe('createUser', () => {
    it('creates user with valid data', async () => {
      const user = await createUser({ name: 'Test' });
      expect(user.name).toBe('Test');
    });

    it('throws error for invalid data', async () => {
      await expect(createUser({ name: '' }))
        .rejects.toThrow('Name required');
    });
  });
});
```

### Database in Tests

Use test database:

```typescript
beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Clean up test data
  await prisma.user.deleteMany();
});
```

## Next Steps

- [Frontend Development](./frontend-dev.md)
- [Python Development](./python-dev.md)
- [Testing Guide](./testing.md)
- [Code Style Guide](./code-style.md)
- [Contributing Guide](./contributing.md)
