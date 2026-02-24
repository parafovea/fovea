import { PrismaClient } from '@prisma/client'

/**
 * Prisma Client singleton instance.
 * Ensures only one instance is created and reused across the application.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error']
})
