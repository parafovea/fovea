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
import { videoSummarizationQueue, closeQueues } from './queues/setup.js'
import { apiRequestCounter, apiRequestDuration } from './metrics.js'

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

  await app.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute'
  })

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
    queues: [new BullMQAdapter(videoSummarizationQueue)],
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
   * Health check endpoint.
   * Returns server status and current timestamp.
   *
   * @route GET /health
   * @returns Health status object
   */
  app.get('/health', {
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

  const summariesRoute = await import('./routes/summaries.js')
  await app.register(summariesRoute.default)

  const videosRoute = await import('./routes/videos.js')
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
