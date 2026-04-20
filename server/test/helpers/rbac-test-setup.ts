/**
 * Shared RBAC setup helper for E2E tests.
 *
 * E2E route tests run against real Fastify + Prisma. The RBAC hardening
 * requires every request to carry a CASL ability (via buildAbilities
 * middleware). This helper ensures the test user has `systemRole:
 * 'system_admin'` so abilities resolve to `manage all` and the tests
 * exercise route logic rather than permission rules.
 *
 * RBAC rule logic itself is covered by the unit tests in
 * test/security/rbac-enforcement.test.ts.
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Seeds the minimum RolePermission rows so the default `user` system role
 * can perform basic operations (create/read/update/delete own personas,
 * annotations, summaries, claims, and world state). Call this in beforeEach
 * after cleaning the database.
 */
export async function seedBaselinePermissions(prisma: PrismaClient): Promise<void> {
  const resources = ['persona', 'annotation', 'summary', 'claim', 'world_state']
  const actions = ['create', 'read', 'update', 'delete']

  const rows = resources.flatMap(resourceType =>
    actions.map(action => ({
      scope: 'system',
      role: 'user',
      resourceType,
      action,
      ownOnly: true,
    }))
  )

  // Add video read (not ownOnly) so users can see videos
  rows.push({ scope: 'system', role: 'user', resourceType: 'video', action: 'read', ownOnly: false })

  await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true })
}

interface TestUser {
  id: string
  username: string
  email: string
  sessionToken: string
}

/**
 * Creates a test user with system_admin privileges and an active session.
 * Returns the user ID and a session token for authenticated requests.
 */
export async function createAdminTestUser(
  prisma: PrismaClient,
  overrides: {
    username?: string
    email?: string
    password?: string
    isAdmin?: boolean
  } = {}
): Promise<TestUser> {
  const username = overrides.username ?? 'testuser'
  const email = overrides.email ?? 'test@example.com'
  const password = overrides.password ?? 'testpass123'

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      displayName: username,
      isAdmin: overrides.isAdmin ?? true,
      systemRole: 'system_admin',
    }
  })

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: `test-session-${user.id}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }
  })

  return {
    id: user.id,
    username,
    email,
    sessionToken: session.token,
  }
}

/**
 * Creates a second test user (non-admin by default) for cross-user tests.
 */
export async function createRegularTestUser(
  prisma: PrismaClient,
  overrides: {
    username?: string
    email?: string
    password?: string
  } = {}
): Promise<TestUser> {
  const username = overrides.username ?? 'testuser2'
  const email = overrides.email ?? 'test2@example.com'
  const password = overrides.password ?? 'testpass456'

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      displayName: username,
      isAdmin: false,
      systemRole: 'user',
    }
  })

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: `test-session-${user.id}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }
  })

  return {
    id: user.id,
    username,
    email,
    sessionToken: session.token,
  }
}
