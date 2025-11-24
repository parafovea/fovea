import Fastify from 'fastify'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyCookie from '@fastify/cookie'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { PrismaClient } from '@prisma/client'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'
import { videoSummarizationQueue, claimExtractionQueue, closeQueues } from './queues/setup.js'
import { apiRequestCounter, apiRequestDuration } from './metrics.js'
import { AppError } from './lib/errors.js'

/**
 * Builds and configures the Fastify application instance.
 *
 * This function creates a Fastify server with the following features:
 * - Type-safe request/response validation using TypeBox
 * - Structured logging with pino
 * - Security headers via helmet
 * - CORS configuration
 * - Rate limiting protection
 * - OpenAPI documentation with Swagger UI
 * - Bull Board queue monitoring dashboard
 * - Health check endpoint
 *
 * @returns Configured Fastify instance ready to be started
 *
 * @example
 * ```typescript
 * const app = await buildApp()
 * await app.listen({ port: 3001 })
 * ```
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    }
  }).withTypeProvider<TypeBoxTypeProvider>()

  // Security plugins
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'"]
      }
    }
  })

  // Disable rate limiting in test environment to prevent E2E test failures
  if (process.env.NODE_ENV !== 'test') {
    await app.register(fastifyRateLimit, {
      max: 1000,
      timeWindow: '1 minute'
    })
  }

  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
  })

  // Cookie support for session management
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'dev-secret-change-in-production',
  })

  // OpenAPI documentation
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Fovea API',
        description: 'Video annotation tool API for persona-based ontology development',
        version: '1.0.0'
      },
      servers: [
        { url: 'http://localhost:3001', description: 'Development' }
      ]
    }
  })

  await app.register(fastifySwaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  })

  // Bull Board queue monitoring
  const serverAdapter = new FastifyAdapter()
  createBullBoard({
    queues: [
      new BullMQAdapter(videoSummarizationQueue),
      new BullMQAdapter(claimExtractionQueue)
    ],
    serverAdapter,
  })
  serverAdapter.setBasePath('/admin/queues')
  await app.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' })

  // Database connection
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error']
  })

  // Decorate Fastify instance with Prisma client
  app.decorate('prisma', prisma)

  // Metrics collection hooks
  app.addHook('onRequest', async (request, _reply) => {
    // Store start time for duration calculation
    request.requestStartTime = Date.now()
  })

  app.addHook('onResponse', async (request, reply) => {
    // Record API request metrics
    const duration = Date.now() - (request.requestStartTime || Date.now())
    const route = request.routeOptions.url || request.url
    const method = request.method
    const statusCode = reply.statusCode

    apiRequestCounter.add(1, {
      method,
      route,
      status: statusCode
    })

    apiRequestDuration.record(duration, {
      method,
      route,
      status: statusCode
    })
  })

  // Graceful shutdown - disconnect Prisma and close queues
  app.addHook('onClose', async (instance) => {
    await closeQueues()
    instance.log.info('Queue connections closed')
    await instance.prisma.$disconnect()
    instance.log.info('Prisma client disconnected')
  })

  /**
   * Global error handler.
   * Catches all errors thrown in route handlers and converts them to appropriate HTTP responses.
   * - AppError instances: Returns structured error response with status code
   * - Fastify validation errors: Returns 400 with validation details
   * - Unknown errors: Logs full error and returns safe generic 500 response
   */
  app.setErrorHandler((error, request, reply) => {
    // Handle known AppError instances
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toJSON())
    }

    // Handle Fastify validation errors (schema validation failures)
    if (error.validation) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
        details: error.validation
      })
    }

    // Log unexpected errors with full context
    request.log.error({
      err: error,
      url: request.url,
      method: request.method,
      params: request.params,
      query: request.query
    }, 'Unexpected error occurred')

    // Return safe generic error response (don't leak implementation details)
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    })
  })

  /**
   * Health check endpoint.
   * Returns server status and current timestamp.
   *
   * @route GET /api/health
   * @returns Health status object
   */
  app.get('/api/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() }
  })

  // Register routes
  const authRoute = await import('./routes/auth.js')
  await app.register(authRoute.default)

  const usersRoute = await import('./routes/users.js')
  await app.register(usersRoute.default)

  const sessionsRoute = await import('./routes/sessions.js')
  await app.register(sessionsRoute.default)

  const apiKeysRoute = await import('./routes/api-keys.js')
  await app.register(apiKeysRoute.default)

  const configRoute = await import('./routes/config.js')
  await app.register(configRoute.default)

  const ontologyRoute = await import('./routes/ontology.js')
  await app.register(ontologyRoute.default)

  const personasRoute = await import('./routes/personas.js')
  await app.register(personasRoute.default)

  const worldRoute = await import('./routes/world.js')
  await app.register(worldRoute.default)

  const summariesRoute = await import('./routes/summaries.js')
  await app.register(summariesRoute.default)

  const claimsRoute = await import('./routes/claims.js')
  await app.register(claimsRoute.default)

  const videosRoute = await import('./routes/videos/index.js')
  await app.register(videosRoute.default)

  const modelsRoute = await import('./routes/models.js')
  await app.register(modelsRoute.default)

  const annotationsRoute = await import('./routes/annotations.js')
  await app.register(annotationsRoute.default)

  const exportRoute = await import('./routes/export.js')
  await app.register(exportRoute.default)

  const importRoute = await import('./routes/import.js')
  await app.register(importRoute.default)

  return app
}
