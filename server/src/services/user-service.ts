import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import type { User } from '@prisma/client'

/**
 * Ensures the default user exists for single-user mode.
 * Creates the user if it doesn't exist, returns existing user otherwise.
 *
 * The default user:
 * - Has ID: "default-user"
 * - Username: from DEFAULT_USER_USERNAME env var (defaults to "default-user")
 * - No password (passwordHash: null)
 * - Admin privileges
 *
 * @returns Default user record
 */
export async function ensureDefaultUser(): Promise<User> {
  // Only relevant for single-user mode
  if (!isSingleUserMode()) {
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
      username: config.defaultUser.username,
      displayName: config.defaultUser.displayName,
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
  return config.mode.isSingleUser
}
