import Fastify from 'fastify'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { PrismaClient } from '@prisma/client'

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
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute'
  })

  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
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

  // Database connection
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error']
  })

  // Decorate Fastify instance with Prisma client
  app.decorate('prisma', prisma)

  // Graceful shutdown - disconnect Prisma on close
  app.addHook('onClose', async (instance) => {
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

  return app
}
