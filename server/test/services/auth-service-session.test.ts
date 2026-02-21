import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for AuthService session security features.
 * Tests session regeneration, idle timeout, and extension.
 *
 * These tests mock the Prisma client to avoid database dependencies.
 */

// Mock the Prisma client
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock the password provider
vi.mock('../../src/services/auth/password-provider.js', () => ({
  PasswordAuthProvider: vi.fn().mockImplementation(() => ({
    name: 'password',
    authenticate: vi.fn().mockResolvedValue({ success: false }),
  })),
}))

import { AuthService } from '../../src/services/auth-service.js'
import { prisma } from '../../src/lib/prisma.js'

describe('AuthService - Session Security', () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('validateSession with idle timeout', () => {
    it('returns null for non-existent session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

      const user = await service.validateSession('invalid-token')

      expect(user).toBeNull()
    })

    it('deletes and returns null for expired session', async () => {
      const expiredSession = {
        id: 'session-id',
        userId: 'user-id',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          passwordHash: 'hash',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(expiredSession)

      const user = await service.validateSession('expired-token')

      expect(user).toBeNull()
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-id' },
      })
    })

    it('deletes and returns null for idle session', async () => {
      // Session not expired but idle for over 60 minutes
      const idleSession = {
        id: 'session-id',
        userId: 'user-id',
        token: 'idle-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Not expired
        lastActivityAt: new Date(Date.now() - 61 * 60 * 1000), // 61 minutes ago
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        ipAddress: null,
        userAgent: null,
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          passwordHash: 'hash',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(idleSession)

      const user = await service.validateSession('idle-token')

      expect(user).toBeNull()
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-id' },
      })
    })

    it('updates lastActivityAt and returns user for active session', async () => {
      const activeSession = {
        id: 'session-id',
        userId: 'user-id',
        token: 'active-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        lastActivityAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          passwordHash: 'hash',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(activeSession)

      const user = await service.validateSession('active-token')

      expect(user).not.toBeNull()
      expect(user?.id).toBe('user-id')
      expect(user?.username).toBe('testuser')
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-id' },
        data: { lastActivityAt: expect.any(Date) },
      })
    })

    it('uses createdAt when lastActivityAt is null', async () => {
      // Session with no lastActivityAt (created but never validated before)
      const newSession = {
        id: 'session-id',
        userId: 'user-id',
        token: 'new-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastActivityAt: null,
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // Created 30 minutes ago
        ipAddress: null,
        userAgent: null,
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          passwordHash: 'hash',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(newSession)

      const user = await service.validateSession('new-token')

      expect(user).not.toBeNull()
      expect(prisma.session.update).toHaveBeenCalled()
    })
  })

  describe('getSession', () => {
    it('returns session without updating lastActivityAt', async () => {
      const session = {
        id: 'session-id',
        userId: 'user-id',
        token: 'test-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
        user: {
          id: 'user-id',
          username: 'testuser',
          email: 'test@example.com',
          passwordHash: 'hash',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(session)

      const result = await service.getSession('test-token')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('session-id')
      expect(prisma.session.update).not.toHaveBeenCalled()
    })

    it('returns null for non-existent session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

      const result = await service.getSession('invalid-token')

      expect(result).toBeNull()
    })
  })

  describe('regenerateSession', () => {
    it('creates new session and deletes old one atomically', async () => {
      const oldSession = {
        id: 'old-session-id',
        userId: 'user-id',
        token: 'old-token',
        expiresAt: new Date(),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }

      const newSession = {
        id: 'new-session-id',
        userId: 'user-id',
        token: 'new-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          session: {
            findUnique: vi.fn().mockResolvedValue(oldSession),
            delete: vi.fn().mockResolvedValue(oldSession),
            create: vi.fn().mockResolvedValue(newSession),
          },
        }
        return callback(tx as unknown as typeof prisma)
      })

      const result = await service.regenerateSession('old-token', 'user-id', {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })

      expect(result.token).toHaveLength(64) // 32 bytes = 64 hex chars
      expect(result.expiresAt).toBeInstanceOf(Date)
      expect(result.oldSessionId).toBe('old-session-id')
      expect(result.newSessionId).toBe('new-session-id')
    })

    it('creates new session when no old session exists', async () => {
      const newSession = {
        id: 'new-session-id',
        userId: 'user-id',
        token: 'new-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          session: {
            findUnique: vi.fn().mockResolvedValue(null),
            delete: vi.fn(),
            create: vi.fn().mockResolvedValue(newSession),
          },
        }
        return callback(tx as unknown as typeof prisma)
      })

      const result = await service.regenerateSession('', 'user-id')

      expect(result.oldSessionId).toBeNull()
      expect(result.newSessionId).toBe('new-session-id')
    })

    it('uses custom expiration days', async () => {
      const newSession = {
        id: 'new-session-id',
        userId: 'user-id',
        token: 'new-token',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          session: {
            findUnique: vi.fn().mockResolvedValue(null),
            delete: vi.fn(),
            create: vi.fn().mockResolvedValue(newSession),
          },
        }
        return callback(tx as unknown as typeof prisma)
      })

      const result = await service.regenerateSession('', 'user-id', {
        expiresInDays: 30,
      })

      // Check expiration is approximately 30 days from now
      const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000
      const diff = Math.abs(result.expiresAt.getTime() - thirtyDaysFromNow)
      expect(diff).toBeLessThan(5000) // Within 5 seconds
    })
  })

  describe('extendSession', () => {
    it('extends session expiration by specified minutes', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      const session = {
        id: 'session-id',
        userId: 'user-id',
        token: 'test-token',
        expiresAt: futureExpiry,
        lastActivityAt: new Date(),
        createdAt: new Date(),
        ipAddress: null,
        userAgent: null,
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(session)
      vi.mocked(prisma.session.update).mockResolvedValue({
        ...session,
        expiresAt: new Date(futureExpiry.getTime() + 30 * 60 * 1000),
      })

      const newExpiresAt = await service.extendSession('test-token', 30)

      expect(newExpiresAt).not.toBeNull()
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-id' },
        data: {
          expiresAt: expect.any(Date),
          lastActivityAt: expect.any(Date),
        },
      })
    })

    it('returns null for non-existent session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

      const result = await service.extendSession('invalid-token', 30)

      expect(result).toBeNull()
      expect(prisma.session.update).not.toHaveBeenCalled()
    })

    it('extends from current time when session is already expired', async () => {
      const expiredSession = {
        id: 'session-id',
        userId: 'user-id',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        ipAddress: null,
        userAgent: null,
      }

      vi.mocked(prisma.session.findUnique).mockResolvedValue(expiredSession)

      await service.extendSession('expired-token', 30)

      const updateCall = vi.mocked(prisma.session.update).mock.calls[0][0]
      const newExpiresAt = (updateCall.data as { expiresAt: Date }).expiresAt

      // Should extend from now, not from the expired time
      const expectedMinTime = Date.now() + 29 * 60 * 1000 // At least 29 minutes from now
      expect(newExpiresAt.getTime()).toBeGreaterThan(expectedMinTime)
    })
  })
})
