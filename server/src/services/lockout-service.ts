/**
 * Lockout service for tracking failed login attempts and implementing progressive delays.
 *
 * Implements a lockout mechanism that tracks failed login attempts per username and
 * enforces progressive delays based on the number of recent failures.
 *
 * @module
 */

import { prisma } from '../lib/prisma.js'
import { recordLockout } from '../lib/authMetrics.js'

/**
 * Result of checking lockout status for a username.
 */
export interface LockoutStatus {
  /** Whether the user is currently locked out */
  locked: boolean
  /** Seconds until lockout expires (0 if not locked) */
  retryAfterSeconds: number
  /** Number of failed attempts in the last 24 hours */
  attemptCount: number
}

/**
 * Progressive lockout thresholds.
 * Maps attempt ranges to lockout durations in seconds.
 */
const LOCKOUT_THRESHOLDS = [
  { minAttempts: 1, maxAttempts: 3, lockoutSeconds: 0 },
  { minAttempts: 4, maxAttempts: 6, lockoutSeconds: 30 },
  { minAttempts: 7, maxAttempts: 9, lockoutSeconds: 300 }, // 5 minutes
  { minAttempts: 10, maxAttempts: Infinity, lockoutSeconds: 900 }, // 15 minutes
]

/**
 * Time window for counting failed attempts (24 hours in milliseconds).
 */
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Service for managing login attempt tracking and lockouts.
 */
export class LockoutService {
  /**
   * Checks if a username is currently locked out.
   *
   * @param username - Username to check
   * @returns Lockout status including whether locked, retry time, and attempt count
   */
  async checkLockout(username: string): Promise<LockoutStatus> {
    const attemptCount = await this.getFailedAttemptCount(username)

    // Find applicable lockout threshold
    const threshold = LOCKOUT_THRESHOLDS.find(
      (t) => attemptCount >= t.minAttempts && attemptCount <= t.maxAttempts
    )

    if (!threshold || threshold.lockoutSeconds === 0) {
      return { locked: false, retryAfterSeconds: 0, attemptCount }
    }

    // Get the most recent failed attempt
    const lastAttempt = await prisma.loginAttempt.findFirst({
      where: {
        username,
        success: false,
        failedAt: {
          gte: new Date(Date.now() - ATTEMPT_WINDOW_MS),
        },
      },
      orderBy: { failedAt: 'desc' },
    })

    if (!lastAttempt) {
      return { locked: false, retryAfterSeconds: 0, attemptCount }
    }

    // Calculate remaining lockout time
    const lockoutEndsAt = new Date(
      lastAttempt.failedAt.getTime() + threshold.lockoutSeconds * 1000
    )
    const remainingSeconds = Math.ceil(
      (lockoutEndsAt.getTime() - Date.now()) / 1000
    )

    if (remainingSeconds <= 0) {
      return { locked: false, retryAfterSeconds: 0, attemptCount }
    }

    // Record lockout metric when user is locked out
    recordLockout(username, attemptCount)

    return {
      locked: true,
      retryAfterSeconds: remainingSeconds,
      attemptCount,
    }
  }

  /**
   * Records a failed login attempt.
   *
   * @param username - Username that failed to authenticate
   * @param ipAddress - Optional IP address of the request
   */
  async recordFailedAttempt(
    username: string,
    ipAddress?: string
  ): Promise<void> {
    await prisma.loginAttempt.create({
      data: {
        username,
        ipAddress,
        success: false,
      },
    })
  }

  /**
   * Clears failed login attempts for a username on successful login.
   *
   * @param username - Username that successfully authenticated
   */
  async recordSuccessfulLogin(username: string): Promise<void> {
    await prisma.loginAttempt.deleteMany({
      where: {
        username,
        success: false,
      },
    })
  }

  /**
   * Gets the count of failed login attempts for a username in the last 24 hours.
   *
   * @param username - Username to check
   * @returns Number of failed attempts
   */
  async getFailedAttemptCount(username: string): Promise<number> {
    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MS)

    return prisma.loginAttempt.count({
      where: {
        username,
        success: false,
        failedAt: {
          gte: windowStart,
        },
      },
    })
  }
}

/** Singleton instance of the lockout service */
export const lockoutService = new LockoutService()
