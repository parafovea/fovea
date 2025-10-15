import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AuthService } from '../../src/services/auth-service.js'
import { prisma } from '../../src/lib/prisma.js'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Unit tests for AuthService.
 * Tests authentication, session creation, validation, and cleanup methods.
 */
describe('AuthService', () => {
  let authService: AuthService
  let testUserId: string

  beforeAll(async () => {
    authService = new AuthService()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean database
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false
      }
    })
    testUserId = user.id
  })

  describe('Authentication', () => {
    it('authenticates user with valid credentials', async () => {
      const result = await authService.authenticate('password', {
        username: 'testuser',
        password: 'testpass123'
      })

      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user!.username).toBe('testuser')
      expect(result.user!.email).toBe('test@example.com')
      expect(result.error).toBeUndefined()
    })

    it('returns error with invalid username', async () => {
      const result = await authService.authenticate('password', {
        username: 'wronguser',
        password: 'testpass123'
      })

      expect(result.success).toBe(false)
      expect(result.user).toBeUndefined()
      expect(result.error).toBe('Invalid credentials')
    })

    it('returns error with invalid password', async () => {
      const result = await authService.authenticate('password', {
        username: 'testuser',
        password: 'wrongpassword'
      })

      expect(result.success).toBe(false)
      expect(result.user).toBeUndefined()
      expect(result.error).toBe('Invalid credentials')
    })

    it('throws error for unknown provider', async () => {
      await expect(
        authService.authenticate('unknown-provider', {
          username: 'testuser',
          password: 'testpass123'
        })
      ).rejects.toThrow('Unknown auth provider: unknown-provider')
    })

    it('returns error when username is missing', async () => {
      const result = await authService.authenticate('password', {
        password: 'testpass123'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Username and password required')
    })

    it('returns error when password is missing', async () => {
      const result = await authService.authenticate('password', {
        username: 'testuser'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Username and password required')
    })
  })

  describe('Session Creation', () => {
    it('creates session with secure 64-character token', async () => {
      const { token, expiresAt } = await authService.createSession(testUserId)

      expect(token).toBeDefined()
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(expiresAt).toBeInstanceOf(Date)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('sets 7-day expiration by default', async () => {
      const { expiresAt } = await authService.createSession(testUserId)

      const sevenDaysFromNow = new Date()
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

      const diffMs = Math.abs(expiresAt.getTime() - sevenDaysFromNow.getTime())
      expect(diffMs).toBeLessThan(5000) // Within 5 seconds
    })

    it('sets 30-day expiration with rememberMe', async () => {
      const { expiresAt } = await authService.createSession(testUserId, {
        expiresInDays: 30
      })

      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const diffMs = Math.abs(expiresAt.getTime() - thirtyDaysFromNow.getTime())
      expect(diffMs).toBeLessThan(5000) // Within 5 seconds
    })

    it('stores IP address in session', async () => {
      const { token } = await authService.createSession(testUserId, {
        ipAddress: '192.168.1.1'
      })

      const session = await prisma.session.findUnique({
        where: { token }
      })

      expect(session).toBeDefined()
      expect(session!.ipAddress).toBe('192.168.1.1')
    })

    it('stores user agent in session', async () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      const { token } = await authService.createSession(testUserId, {
        userAgent
      })

      const session = await prisma.session.findUnique({
        where: { token }
      })

      expect(session).toBeDefined()
      expect(session!.userAgent).toBe(userAgent)
    })

    it('creates session in database', async () => {
      const { token } = await authService.createSession(testUserId)

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true }
      })

      expect(session).toBeDefined()
      expect(session!.userId).toBe(testUserId)
      expect(session!.token).toBe(token)
      expect(session!.user.username).toBe('testuser')
    })
  })

  describe('Session Validation', () => {
    it('validates active session token', async () => {
      const { token } = await authService.createSession(testUserId)

      const user = await authService.validateSession(token)

      expect(user).toBeDefined()
      expect(user!.id).toBe(testUserId)
      expect(user!.username).toBe('testuser')
    })

    it('returns null for invalid token', async () => {
      const user = await authService.validateSession('invalid-token-12345')

      expect(user).toBeNull()
    })

    it('returns null for expired session', async () => {
      // Create expired session manually
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1) // Yesterday

      const session = await prisma.session.create({
        data: {
          userId: testUserId,
          token: 'expired-token-test',
          expiresAt: expiredDate
        }
      })

      const user = await authService.validateSession(session.token)

      expect(user).toBeNull()
    })

    it('deletes expired session from database', async () => {
      // Create expired session
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      const session = await prisma.session.create({
        data: {
          userId: testUserId,
          token: 'expired-token-cleanup',
          expiresAt: expiredDate
        }
      })

      await authService.validateSession(session.token)

      // Verify session was deleted
      const sessionInDb = await prisma.session.findUnique({
        where: { id: session.id }
      })
      expect(sessionInDb).toBeNull()
    })

    it('does not delete active sessions', async () => {
      const { token } = await authService.createSession(testUserId)

      await authService.validateSession(token)

      // Verify session still exists
      const session = await prisma.session.findUnique({
        where: { token }
      })
      expect(session).toBeDefined()
    })
  })

  describe('Session Destruction', () => {
    it('removes session by token', async () => {
      const { token } = await authService.createSession(testUserId)

      await authService.destroySession(token)

      const session = await prisma.session.findUnique({
        where: { token }
      })
      expect(session).toBeNull()
    })

    it('handles non-existent token gracefully', async () => {
      await expect(
        authService.destroySession('non-existent-token')
      ).resolves.not.toThrow()
    })

    it('removes session from database', async () => {
      const { token } = await authService.createSession(testUserId)

      // Verify session exists
      let session = await prisma.session.findUnique({
        where: { token }
      })
      expect(session).toBeDefined()

      await authService.destroySession(token)

      // Verify session removed
      session = await prisma.session.findUnique({
        where: { token }
      })
      expect(session).toBeNull()
    })
  })

  describe('Session Cleanup', () => {
    it('removes expired sessions', async () => {
      // Create expired session
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      await prisma.session.create({
        data: {
          userId: testUserId,
          token: 'expired-session-1',
          expiresAt: expiredDate
        }
      })

      const count = await authService.cleanupExpiredSessions()

      expect(count).toBe(1)

      const sessions = await prisma.session.findMany()
      expect(sessions).toHaveLength(0)
    })

    it('returns count of deleted sessions', async () => {
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      // Create multiple expired sessions
      await prisma.session.createMany({
        data: [
          {
            userId: testUserId,
            token: 'expired-1',
            expiresAt: expiredDate
          },
          {
            userId: testUserId,
            token: 'expired-2',
            expiresAt: expiredDate
          },
          {
            userId: testUserId,
            token: 'expired-3',
            expiresAt: expiredDate
          }
        ]
      })

      const count = await authService.cleanupExpiredSessions()

      expect(count).toBe(3)
    })

    it('does not affect active sessions', async () => {
      // Create expired session
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      await prisma.session.create({
        data: {
          userId: testUserId,
          token: 'expired-session',
          expiresAt: expiredDate
        }
      })

      // Create active session
      const { token: activeToken } = await authService.createSession(testUserId)

      await authService.cleanupExpiredSessions()

      // Verify active session still exists
      const activeSession = await prisma.session.findUnique({
        where: { token: activeToken }
      })
      expect(activeSession).toBeDefined()
    })

    it('returns 0 when no expired sessions exist', async () => {
      const count = await authService.cleanupExpiredSessions()

      expect(count).toBe(0)
    })
  })

  describe('Revoke All User Sessions', () => {
    it('removes all user sessions', async () => {
      // Create multiple sessions for the user
      await authService.createSession(testUserId)
      await authService.createSession(testUserId)
      await authService.createSession(testUserId)

      const count = await authService.revokeAllUserSessions(testUserId)

      expect(count).toBe(3)

      const sessions = await prisma.session.findMany({
        where: { userId: testUserId }
      })
      expect(sessions).toHaveLength(0)
    })

    it('returns count of revoked sessions', async () => {
      await authService.createSession(testUserId)
      await authService.createSession(testUserId)

      const count = await authService.revokeAllUserSessions(testUserId)

      expect(count).toBe(2)
    })

    it('returns 0 when user has no sessions', async () => {
      const count = await authService.revokeAllUserSessions(testUserId)

      expect(count).toBe(0)
    })

    it('does not affect other user sessions', async () => {
      // Create another user
      const passwordHash = await hashPassword('otherpass123')
      const otherUser = await prisma.user.create({
        data: {
          username: 'otheruser',
          email: 'other@example.com',
          passwordHash,
          displayName: 'Other User',
          isAdmin: false
        }
      })

      // Create sessions for both users
      await authService.createSession(testUserId)
      await authService.createSession(testUserId)
      const { token: otherToken } = await authService.createSession(otherUser.id)

      // Revoke test user sessions
      await authService.revokeAllUserSessions(testUserId)

      // Verify test user sessions removed
      const testUserSessions = await prisma.session.findMany({
        where: { userId: testUserId }
      })
      expect(testUserSessions).toHaveLength(0)

      // Verify other user session still exists
      const otherSession = await prisma.session.findUnique({
        where: { token: otherToken }
      })
      expect(otherSession).toBeDefined()
    })
  })

  describe('Token Security', () => {
    it('generates unique tokens for each session', async () => {
      const session1 = await authService.createSession(testUserId)
      const session2 = await authService.createSession(testUserId)
      const session3 = await authService.createSession(testUserId)

      expect(session1.token).not.toBe(session2.token)
      expect(session2.token).not.toBe(session3.token)
      expect(session1.token).not.toBe(session3.token)
    })

    it('generates cryptographically secure random tokens', async () => {
      const { token } = await authService.createSession(testUserId)

      // Check token is 64 hex characters (32 random bytes)
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })
  })
})
