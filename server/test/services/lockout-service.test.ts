import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for LockoutService.
 * Tests lockout checking, progressive delays, and attempt tracking.
 *
 * These tests mock the Prisma client to avoid database dependencies.
 */

// Mock the Prisma client
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { LockoutService } from '../../src/services/lockout-service.js'
import { prisma } from '../../src/lib/prisma.js'

describe('LockoutService', () => {
  let service: LockoutService

  beforeEach(() => {
    service = new LockoutService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('checkLockout', () => {
    it('returns not locked with 0 failed attempts', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(0)

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(false)
      expect(status.retryAfterSeconds).toBe(0)
      expect(status.attemptCount).toBe(0)
    })

    it('returns not locked with 1-3 failed attempts (no delay tier)', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(3)

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(false)
      expect(status.retryAfterSeconds).toBe(0)
      expect(status.attemptCount).toBe(3)
    })

    it('returns locked with 4-6 failed attempts (30s tier)', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(5)
      vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue({
        id: 'test-id',
        username: 'testuser',
        ipAddress: null,
        success: false,
        failedAt: new Date(), // Just failed now
      })

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(true)
      expect(status.retryAfterSeconds).toBeGreaterThan(0)
      expect(status.retryAfterSeconds).toBeLessThanOrEqual(30)
      expect(status.attemptCount).toBe(5)
    })

    it('returns locked with 7-9 failed attempts (5min tier)', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(8)
      vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue({
        id: 'test-id',
        username: 'testuser',
        ipAddress: null,
        success: false,
        failedAt: new Date(), // Just failed now
      })

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(true)
      expect(status.retryAfterSeconds).toBeGreaterThan(0)
      expect(status.retryAfterSeconds).toBeLessThanOrEqual(300) // 5 minutes
      expect(status.attemptCount).toBe(8)
    })

    it('returns locked with 10+ failed attempts (15min tier)', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(15)
      vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue({
        id: 'test-id',
        username: 'testuser',
        ipAddress: null,
        success: false,
        failedAt: new Date(), // Just failed now
      })

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(true)
      expect(status.retryAfterSeconds).toBeGreaterThan(0)
      expect(status.retryAfterSeconds).toBeLessThanOrEqual(900) // 15 minutes
      expect(status.attemptCount).toBe(15)
    })

    it('returns not locked when lockout period has expired', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(5)
      vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue({
        id: 'test-id',
        username: 'testuser',
        ipAddress: null,
        success: false,
        // Failed 2 minutes ago (30s lockout should be expired)
        failedAt: new Date(Date.now() - 2 * 60 * 1000),
      })

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(false)
      expect(status.retryAfterSeconds).toBe(0)
      expect(status.attemptCount).toBe(5)
    })

    it('returns not locked when no recent failed attempt found', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(5)
      vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue(null)

      const status = await service.checkLockout('testuser')

      expect(status.locked).toBe(false)
      expect(status.retryAfterSeconds).toBe(0)
      expect(status.attemptCount).toBe(5)
    })
  })

  describe('recordFailedAttempt', () => {
    it('creates a new login attempt record', async () => {
      vi.mocked(prisma.loginAttempt.create).mockResolvedValue({
        id: 'new-id',
        username: 'testuser',
        ipAddress: '192.168.1.1',
        success: false,
        failedAt: new Date(),
      })

      await service.recordFailedAttempt('testuser', '192.168.1.1')

      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          username: 'testuser',
          ipAddress: '192.168.1.1',
          success: false,
        },
      })
    })

    it('creates record without IP address when not provided', async () => {
      vi.mocked(prisma.loginAttempt.create).mockResolvedValue({
        id: 'new-id',
        username: 'testuser',
        ipAddress: null,
        success: false,
        failedAt: new Date(),
      })

      await service.recordFailedAttempt('testuser')

      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          username: 'testuser',
          ipAddress: undefined,
          success: false,
        },
      })
    })
  })

  describe('recordSuccessfulLogin', () => {
    it('deletes all failed attempts for the username', async () => {
      vi.mocked(prisma.loginAttempt.deleteMany).mockResolvedValue({ count: 5 })

      await service.recordSuccessfulLogin('testuser')

      expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
        where: {
          username: 'testuser',
          success: false,
        },
      })
    })
  })

  describe('getFailedAttemptCount', () => {
    it('returns count of failed attempts within 24 hours', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(7)

      const count = await service.getFailedAttemptCount('testuser')

      expect(count).toBe(7)
      expect(prisma.loginAttempt.count).toHaveBeenCalledWith({
        where: {
          username: 'testuser',
          success: false,
          failedAt: {
            gte: expect.any(Date),
          },
        },
      })
    })

    it('queries with correct 24-hour window', async () => {
      vi.mocked(prisma.loginAttempt.count).mockResolvedValue(0)

      await service.getFailedAttemptCount('testuser')

      const call = vi.mocked(prisma.loginAttempt.count).mock.calls[0][0]
      const windowStart = (call?.where as { failedAt: { gte: Date } }).failedAt.gte

      const expectedWindowStart = Date.now() - 24 * 60 * 60 * 1000
      const diff = Math.abs(windowStart.getTime() - expectedWindowStart)

      // Allow 1 second tolerance
      expect(diff).toBeLessThan(1000)
    })
  })

  describe('Progressive Delays', () => {
    it('applies correct lockout duration for each tier', async () => {
      const testCases = [
        { attempts: 1, expectedMaxSeconds: 0 },
        { attempts: 3, expectedMaxSeconds: 0 },
        { attempts: 4, expectedMaxSeconds: 30 },
        { attempts: 6, expectedMaxSeconds: 30 },
        { attempts: 7, expectedMaxSeconds: 300 },
        { attempts: 9, expectedMaxSeconds: 300 },
        { attempts: 10, expectedMaxSeconds: 900 },
        { attempts: 20, expectedMaxSeconds: 900 },
      ]

      for (const { attempts, expectedMaxSeconds } of testCases) {
        vi.mocked(prisma.loginAttempt.count).mockResolvedValue(attempts)
        vi.mocked(prisma.loginAttempt.findFirst).mockResolvedValue({
          id: 'test-id',
          username: 'testuser',
          ipAddress: null,
          success: false,
          failedAt: new Date(),
        })

        const status = await service.checkLockout('testuser')

        if (expectedMaxSeconds === 0) {
          expect(status.locked).toBe(false)
          expect(status.retryAfterSeconds).toBe(0)
        } else {
          expect(status.locked).toBe(true)
          expect(status.retryAfterSeconds).toBeLessThanOrEqual(expectedMaxSeconds)
        }
      }
    })
  })
})
