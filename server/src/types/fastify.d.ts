/**
 * Type augmentations for Fastify instance.
 * This file extends the Fastify types to include custom decorators and plugins.
 */

import { PrismaClient } from '@prisma/client'
import { FastifyInstance, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Prisma database client instance.
     * Provides type-safe access to the database through Prisma ORM.
     *
     * @example
     * ```typescript
     * const personas = await fastify.prisma.persona.findMany()
     * ```
     */
    prisma: PrismaClient
  }

  interface FastifyRequest {
    /**
     * Request start timestamp for metrics collection.
     * Set by onRequest hook, used by onResponse hook to calculate duration.
     */
    requestStartTime?: number
  }
}
