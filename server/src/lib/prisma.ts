import { PrismaClient } from '@prisma/client'

import { config } from '../config.js'

/**
 * Prisma Client singleton instance.
 * Ensures only one instance is created and reused across the application.
 */
export const prisma = new PrismaClient({
  log: config.server.isDevelopment
    ? ['query', 'error', 'warn']
    : ['error']
})
