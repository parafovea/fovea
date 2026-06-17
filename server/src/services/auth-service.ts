import crypto from 'crypto'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import { User, Session } from '@prisma/client'
import { AuthProvider, AuthCredentials, AuthResult } from './auth/types.js'
import { PasswordAuthProvider } from './auth/password-provider.js'

/**
 * Authentication service managing providers and sessions.
 * Handles user authentication, session creation, and validation.
 */
export class AuthService {
  private providers: Map<string, AuthProvider> = new Map()

  constructor() {
    // Register default provider
    this.registerProvider(new PasswordAuthProvider())
  }

  /**
   * Register a new authentication provider.
   *
   * @param provider - Authentication provider instance to register
   */
  registerProvider(provider: AuthProvider): void {
    this.providers.set(provider.name, provider)
  }

  /**
   * Authenticate user with specified provider.
   *
   * @param providerName - Name of the authentication provider to use
   * @param credentials - User credentials for authentication
   * @returns Authentication result with user data or error message
   * @throws Error if provider name is not registered
   */
  async authenticate(
    providerName: string,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    const provider = this.providers.get(providerName)
    if (!provider) {
      throw new Error(`Unknown auth provider: ${providerName}`)
    }
    return provider.authenticate(credentials)
  }

  /**
   * Create a new session for a user.
   *
   * @param userId - ID of the user to create session for
   * @param options - Session options including IP address, user agent, and expiration
   * @returns Object containing session token and expiration date
   */
  async createSession(
    userId: string,
    options: {
      ipAddress?: string
      userAgent?: string
      expiresInDays?: number
    } = {}
  ): Promise<{ token: string; expiresAt: Date }> {
    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex')

    // Calculate expiration
    const expiresInDays = options.expiresInDays || 7
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    // Store session in database
    await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    })

    return { token, expiresAt }
  }

  /**
   * Validate a session token.
   *
   * Checks both absolute expiration and idle timeout. Updates lastActivityAt
   * on each successful validation to implement a sliding window.
   *
   * @param token - Session token to validate
   * @returns User object if valid, null if expired or invalid
   */
  async validateSession(token: string): Promise<User | null> {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!session) {
      return null
    }

    const now = new Date()

    // Check absolute expiration
    if (session.expiresAt < now) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } })
      return null
    }

    // Check idle timeout
    const idleTimeoutMs = config.auth.sessionIdleTimeoutMinutes * 60 * 1000
    const lastActivity = session.lastActivityAt || session.createdAt
    if (now.getTime() - lastActivity.getTime() > idleTimeoutMs) {
      // Session has been idle too long
      await prisma.session.delete({ where: { id: session.id } })
      return null
    }

    // Update lastActivityAt (sliding window)
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: now },
    })

    return session.user
  }

  /**
   * Get session details without updating activity timestamp.
   *
   * @param token - Session token to retrieve
   * @returns Session with user, or null if not found
   */
  async getSession(token: string): Promise<(Session & { user: User }) | null> {
    return prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })
  }

  /**
   * Destroy a session (logout).
   *
   * @param token - Session token to destroy
   */
  async destroySession(token: string): Promise<void> {
    await prisma.session.delete({ where: { token } }).catch(() => {
      // Ignore if session doesn't exist
    })
  }

  /**
   * Clean up expired sessions.
   * Should be run periodically via cron job.
   *
   * @returns Count of deleted sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })
    return result.count
  }

  /**
   * Revoke all sessions for a user.
   * Useful for password changes or security incidents.
   *
   * @param userId - ID of the user whose sessions should be revoked
   * @returns Count of revoked sessions
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { userId },
    })
    return result.count
  }

  /**
   * Regenerate a session by creating a new one and invalidating the old one atomically.
   *
   * This is used on login to prevent session fixation attacks. The operation uses
   * a database transaction to ensure atomicity.
   *
   * @param oldToken - The old session token to invalidate
   * @param userId - ID of the user for the new session
   * @param options - Session options including IP address, user agent, and expiration
   * @returns Object containing new session token, expiration date, old session ID, and new session ID
   */
  async regenerateSession(
    oldToken: string,
    userId: string,
    options: {
      ipAddress?: string
      userAgent?: string
      expiresInDays?: number
    } = {}
  ): Promise<{
    token: string
    expiresAt: Date
    oldSessionId: string | null
    newSessionId: string
  }> {
    // Generate secure random token
    const newToken = crypto.randomBytes(32).toString('hex')

    // Calculate expiration
    const expiresInDays = options.expiresInDays || 7
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    // Use transaction to atomically delete old session and create new one
    const result = await prisma.$transaction(async (tx) => {
      // Find and delete the old session
      let oldSessionId: string | null = null
      const oldSession = await tx.session.findUnique({
        where: { token: oldToken },
      })

      if (oldSession) {
        oldSessionId = oldSession.id
        await tx.session.delete({ where: { id: oldSession.id } })
      }

      // Create new session
      const newSession = await tx.session.create({
        data: {
          userId,
          token: newToken,
          expiresAt,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
        },
      })

      return { oldSessionId, newSessionId: newSession.id }
    })

    return {
      token: newToken,
      expiresAt,
      oldSessionId: result.oldSessionId,
      newSessionId: result.newSessionId,
    }
  }

  /**
   * Extend a session's expiration time.
   *
   * @param token - Session token to extend
   * @param additionalMinutes - Minutes to add to the current expiration
   * @returns Updated expiration date, or null if session not found
   */
  async extendSession(
    token: string,
    additionalMinutes: number
  ): Promise<Date | null> {
    const session = await prisma.session.findUnique({
      where: { token },
    })

    if (!session) {
      return null
    }

    // Extend from the later of: current expiration or now
    const baseTime = session.expiresAt > new Date() ? session.expiresAt : new Date()
    const newExpiresAt = new Date(
      baseTime.getTime() + additionalMinutes * 60 * 1000
    )

    await prisma.session.update({
      where: { id: session.id },
      data: {
        expiresAt: newExpiresAt,
        lastActivityAt: new Date(),
      },
    })

    return newExpiresAt
  }
}

// Export singleton instance
export const authService = new AuthService()
