import { User } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Factory function to create test user objects.
 *
 * @param overrides - Partial user properties to override defaults
 * @returns A complete User object for testing
 *
 * @example
 * ```ts
 * const user = createUser({ username: 'testuser' })
 * ```
 */
export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-1',
    username: 'testuser',
    email: 'testuser@example.com',
    displayName: 'Test User',
    passwordHash: '$2b$12$KIXs.l9Z4K8n0UrN.ZZFqOz4z5s1VJQiNW5Y8zYQ0ZQ0ZQ0ZQ0ZQ0', // "password123"
    isAdmin: false,
    isSingleUser: false,
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Factory function to create an admin user.
 *
 * @param overrides - Partial user properties to override defaults
 * @returns An admin User object for testing
 *
 * @example
 * ```ts
 * const admin = createAdminUser({ username: 'admin' })
 * ```
 */
export function createAdminUser(overrides: Partial<User> = {}): User {
  return createUser({
    id: 'admin-user-1',
    username: 'admin',
    email: 'admin@example.com',
    displayName: 'Administrator',
    isAdmin: true,
    ...overrides,
  })
}

/**
 * Creates a user with a hashed password for authentication testing.
 * Use this when you need a real password hash for login tests.
 *
 * @param password - Plain text password to hash
 * @param overrides - Partial user properties to override defaults
 * @returns A User object with properly hashed password
 *
 * @example
 * ```ts
 * const user = await createUserWithPassword('mypassword123')
 * ```
 */
export async function createUserWithPassword(
  password: string,
  overrides: Partial<User> = {}
): Promise<User> {
  const passwordHash = await hashPassword(password)
  return createUser({
    passwordHash,
    ...overrides,
  })
}
