import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Integration tests for User Management API.
 * Tests admin CRUD operations for users.
 */
describe('User Management Routes', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let adminSessionToken: string
  let regularSessionToken: string
  let adminUserId: string
  let regularUserId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean up database
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create admin user
    const adminPasswordHash = await hashPassword('admin123')
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: adminPasswordHash,
        displayName: 'Administrator',
        isAdmin: true,
      },
    })
    adminUserId = admin.id

    // Create regular user
    const regularPasswordHash = await hashPassword('user123')
    const regular = await prisma.user.create({
      data: {
        username: 'regularuser',
        email: 'regular@example.com',
        passwordHash: regularPasswordHash,
        displayName: 'Regular User',
        isAdmin: false,
      },
    })
    regularUserId = regular.id

    // Login as admin
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'admin123',
      },
    })
    const adminCookies = adminLoginResponse.cookies
    adminSessionToken = adminCookies.find((c) => c.name === 'session_token')!.value

    // Login as regular user
    const regularLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'regularuser',
        password: 'user123',
      },
    })
    const regularCookies = regularLoginResponse.cookies
    regularSessionToken = regularCookies.find((c) => c.name === 'session_token')!.value
  })

  describe('GET /api/admin/users', () => {
    it('returns all users with counts when authenticated as admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const users = response.json()
      expect(users).toHaveLength(2)
      expect(users[0]).toHaveProperty('_count')
      expect(users[0]._count).toHaveProperty('personas')
      expect(users[0]._count).toHaveProperty('sessions')
      expect(users[0]._count).toHaveProperty('apiKeys')
      expect(users[0]).not.toHaveProperty('passwordHash')
    })

    it('returns users sorted by creation date (newest first)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const users = response.json()
      expect(users[0].username).toBe('regularuser') // Created second
      expect(users[1].username).toBe('admin') // Created first
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toHaveProperty('error')
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('FORBIDDEN')
    })
  })

  describe('POST /api/admin/users', () => {
    it('creates a new user as admin', async () => {
      const newUser = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'newpass123',
        displayName: 'New User',
        isAdmin: false,
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: newUser,
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.username).toBe('newuser')
      expect(created.email).toBe('newuser@example.com')
      expect(created.displayName).toBe('New User')
      expect(created.isAdmin).toBe(false)
      expect(created).toHaveProperty('id')
      expect(created).not.toHaveProperty('passwordHash')

      // Verify in database
      const dbUser = await prisma.user.findUnique({
        where: { username: 'newuser' },
      })
      expect(dbUser).toBeDefined()
      expect(dbUser!.passwordHash).toBeDefined()
      expect(dbUser!.passwordHash).not.toBe('newpass123') // Should be hashed
    })

    it('creates an admin user when isAdmin is true', async () => {
      const newAdmin = {
        username: 'newadmin',
        email: 'newadmin@example.com',
        password: 'adminpass123',
        displayName: 'New Admin',
        isAdmin: true,
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: newAdmin,
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.isAdmin).toBe(true)
    })

    it('creates user without email when not provided', async () => {
      const newUser = {
        username: 'nonemailuser',
        password: 'pass123456',
        displayName: 'No Email User',
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: newUser,
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.email).toBeNull()
    })

    it('returns 409 for duplicate username', async () => {
      const duplicateUser = {
        username: 'admin', // Already exists
        email: 'different@example.com',
        password: 'pass123456',
        displayName: 'Different Display Name',
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: duplicateUser,
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error).toBe('CONFLICT')
    })

    it('validates password minimum length', async () => {
      const invalidUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'short', // Too short (< 6 chars)
        displayName: 'Test User',
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: invalidUser,
      })

      expect(response.statusCode).toBe(400)
    })

    it('validates required fields', async () => {
      const invalidUser = {
        username: '',
        password: 'pass123456',
        displayName: 'Test User',
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: adminSessionToken,
        },
        payload: invalidUser,
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 403 for non-admin users', async () => {
      const newUser = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'newpass123',
        displayName: 'New User',
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: {
          session_token: regularSessionToken,
        },
        payload: newUser,
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /api/admin/users/:userId', () => {
    it('returns a specific user by ID as admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const user = response.json()
      expect(user.id).toBe(regularUserId)
      expect(user.username).toBe('regularuser')
      expect(user.displayName).toBe('Regular User')
      expect(user).not.toHaveProperty('passwordHash')
    })

    it('returns 404 for non-existent user', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${fakeId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NOT_FOUND')
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/users/not-a-uuid',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/users/${adminUserId}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('PUT /api/admin/users/:userId', () => {
    it('updates user fields as admin', async () => {
      const updates = {
        displayName: 'Updated Display Name',
        email: 'updated@example.com',
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: updates,
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.displayName).toBe('Updated Display Name')
      expect(updated.email).toBe('updated@example.com')
      expect(updated.username).toBe('regularuser') // Unchanged
    })

    it('updates isAdmin flag', async () => {
      const updates = {
        isAdmin: true,
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: updates,
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.isAdmin).toBe(true)

      // Verify in database
      const dbUser = await prisma.user.findUnique({
        where: { id: regularUserId },
      })
      expect(dbUser!.isAdmin).toBe(true)
    })

    it('updates password and hashes it', async () => {
      const updates = {
        password: 'newpassword123',
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: updates,
      })

      expect(response.statusCode).toBe(200)

      // Verify password was hashed in database
      const dbUser = await prisma.user.findUnique({
        where: { id: regularUserId },
      })
      expect(dbUser!.passwordHash).not.toBe('newpassword123')
      expect(dbUser!.passwordHash).toMatch(/^\$2[aby]\$\d+\$/) // bcrypt format

      // Verify can login with new password
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'regularuser',
          password: 'newpassword123',
        },
      })
      expect(loginResponse.statusCode).toBe(200)
    })

    it('performs partial update without changing other fields', async () => {
      const updates = {
        displayName: 'Only Updated Display',
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: updates,
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.displayName).toBe('Only Updated Display')
      expect(updated.username).toBe('regularuser') // Unchanged
      expect(updated.email).toBe('regular@example.com') // Unchanged
    })

    it('returns 404 for non-existent user', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${fakeId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: {
          displayName: 'Updated',
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NOT_FOUND')
    })

    it('validates password minimum length', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
        payload: {
          password: 'short',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: regularSessionToken,
        },
        payload: {
          displayName: 'Hacked',
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/admin/users/:userId', () => {
    it('deletes a user as admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ success: true })

      // Verify user deleted
      const dbUser = await prisma.user.findUnique({
        where: { id: regularUserId },
      })
      expect(dbUser).toBeNull()
    })

    it('prevents admin from deleting themselves', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${adminUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('FORBIDDEN')

      // Verify admin still exists
      const dbUser = await prisma.user.findUnique({
        where: { id: adminUserId },
      })
      expect(dbUser).not.toBeNull()
    })

    it('cascades deletion to sessions', async () => {
      // Verify sessions exist for regular user
      const sessionsBefore = await prisma.session.findMany({
        where: { userId: regularUserId },
      })
      expect(sessionsBefore.length).toBeGreaterThan(0)

      // Delete user
      await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      // Verify sessions deleted
      const sessionsAfter = await prisma.session.findMany({
        where: { userId: regularUserId },
      })
      expect(sessionsAfter).toHaveLength(0)
    })

    it('cascades deletion to personas', async () => {
      // Create persona for regular user
      await prisma.persona.create({
        data: {
          userId: regularUserId,
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
        },
      })

      // Delete user
      await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      // Verify personas deleted
      const personas = await prisma.persona.findMany({
        where: { userId: regularUserId },
      })
      expect(personas).toHaveLength(0)
    })

    it('cascades deletion to API keys', async () => {
      // Create API key for regular user
      await prisma.apiKey.create({
        data: {
          userId: regularUserId,
          provider: 'anthropic',
          keyName: 'Test Key',
          encryptedKey: 'encrypted-test-key-value',
          keyMask: '...test',
        },
      })

      // Delete user
      await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${regularUserId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      // Verify API keys deleted
      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: regularUserId },
      })
      expect(apiKeys).toHaveLength(0)
    })

    it('returns 404 for non-existent user', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${fakeId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NOT_FOUND')
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${adminUserId}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
