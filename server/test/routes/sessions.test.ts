import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Integration tests for Session Management API.
 * Tests session viewing and revocation for users and admins.
 */
describe('Session Management Routes', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let adminSessionToken: string
  let regularSessionToken: string
  let adminUserId: string
  let regularUserId: string
  let regularSessionId: string

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

    // Get regular user's session ID
    const regularSession = await prisma.session.findFirst({
      where: { token: regularSessionToken },
    })
    regularSessionId = regularSession!.id
  })

  describe('GET /api/sessions', () => {
    it('returns current user\'s sessions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions).toHaveLength(1)
      expect(sessions[0]).toHaveProperty('id')
      expect(sessions[0]).toHaveProperty('token')
      expect(sessions[0]).toHaveProperty('expiresAt')
      expect(sessions[0]).toHaveProperty('createdAt')
    })

    it('masks session tokens for security', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions[0].token).toMatch(/^\.\.\./) // Starts with "..."
      expect(sessions[0].token.length).toBe(11) // "..." + 8 chars
      expect(sessions[0].token).not.toBe(regularSessionToken)
    })

    it('marks the current session with isCurrent flag', async () => {
      // Create second session for same user
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'regularuser',
          password: 'user123',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions).toHaveLength(2)

      const currentSessions = sessions.filter((s: { isCurrent: boolean }) => s.isCurrent)
      expect(currentSessions).toHaveLength(1)
    })

    it('returns sessions sorted by creation date (newest first)', async () => {
      // Create second session
      await new Promise(resolve => setTimeout(resolve, 10))
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'regularuser',
          password: 'user123',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions).toHaveLength(2)

      const dates = sessions.map((s: { createdAt: string }) => new Date(s.createdAt).getTime())
      expect(dates[0]).toBeGreaterThan(dates[1])
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toHaveProperty('error')
    })

    it('returns only user\'s own sessions', async () => {
      // Admin should not see regular user's session
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions).toHaveLength(1)
      expect(sessions.every((s: { isCurrent: boolean }) => s.isCurrent || !s.isCurrent)).toBe(true)
    })
  })

  describe('DELETE /api/sessions/:sessionId', () => {
    it('allows user to revoke own session', async () => {
      // Create second session to revoke
      const secondLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'regularuser',
          password: 'user123',
        },
      })
      const secondCookies = secondLoginResponse.cookies
      const secondSessionToken = secondCookies.find((c) => c.name === 'session_token')!.value
      const secondSession = await prisma.session.findFirst({
        where: { token: secondSessionToken },
      })

      // Revoke the second session using first session
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${secondSession!.id}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ success: true })

      // Verify session deleted
      const deletedSession = await prisma.session.findUnique({
        where: { id: secondSession!.id },
      })
      expect(deletedSession).toBeNull()
    })

    it('prevents revoking another user\'s session', async () => {
      // Try to revoke admin's session with regular user's token
      const adminSession = await prisma.session.findFirst({
        where: { token: adminSessionToken },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${adminSession!.id}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'Cannot revoke another user\'s session' })

      // Verify admin session still exists
      const adminSessionStillExists = await prisma.session.findUnique({
        where: { id: adminSession!.id },
      })
      expect(adminSessionStillExists).not.toBeNull()
    })

    it('returns 404 for non-existent session', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${fakeId}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'Session not found' })
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/sessions/not-a-uuid',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${regularSessionId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/admin/sessions', () => {
    it('returns all sessions with user info as admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      expect(sessions).toHaveLength(2) // Admin and regular user sessions
      expect(sessions[0]).toHaveProperty('user')
      expect(sessions[0].user).toHaveProperty('username')
      expect(sessions[0].user).toHaveProperty('displayName')
    })

    it('masks tokens in admin view', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      const sessions = response.json()
      sessions.forEach((session: { token: string }) => {
        expect(session.token).toMatch(/^\.\.\./)
        expect(session.token.length).toBe(11)
      })
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'Admin access required' })
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/sessions',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('DELETE /api/admin/sessions/:sessionId', () => {
    it('allows admin to revoke any session', async () => {
      // Admin revokes regular user's session
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/sessions/${regularSessionId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ success: true })

      // Verify session deleted
      const deletedSession = await prisma.session.findUnique({
        where: { id: regularSessionId },
      })
      expect(deletedSession).toBeNull()
    })

    it('returns 404 for non-existent session', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/sessions/${fakeId}`,
        cookies: {
          session_token: adminSessionToken,
        },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'Session not found' })
    })

    it('returns 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/sessions/${regularSessionId}`,
        cookies: {
          session_token: regularSessionToken,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/sessions/${regularSessionId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
