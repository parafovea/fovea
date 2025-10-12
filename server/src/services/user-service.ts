import { prisma } from '../lib/prisma.js'
import type { User } from '@prisma/client'

/**
 * Ensures the default user exists for single-user mode.
 * Creates the user if it doesn't exist, returns existing user otherwise.
 *
 * The default user:
 * - Has ID: "default-user"
 * - Username: "user"
 * - No password (passwordHash: null)
 * - Admin privileges
 *
 * @returns Default user record
 */
export async function ensureDefaultUser(): Promise<User> {
  const mode = process.env.FOVEA_MODE || 'multi-user'

  // Only relevant for single-user mode
  if (mode !== 'single-user') {
    throw new Error('ensureDefaultUser should only be called in single-user mode')
  }

  // Check if default user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: 'default-user' }
  })

  if (existingUser) {
    return existingUser
  }

  // Create default user
  const defaultUser = await prisma.user.create({
    data: {
      id: 'default-user',
      username: 'user',
      displayName: 'Default User',
      email: null,
      passwordHash: null, // No password in single-user mode
      isAdmin: true
    }
  })

  return defaultUser
}

/**
 * Gets the default user for single-user mode.
 *
 * @returns Default user or null if not found
 */
export async function getDefaultUser(): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: 'default-user' }
  })
}

/**
 * Checks if the application is running in single-user mode.
 *
 * @returns True if single-user mode, false otherwise
 */
export function isSingleUserMode(): boolean {
  const mode = process.env.FOVEA_MODE || 'multi-user'
  return mode === 'single-user'
}
