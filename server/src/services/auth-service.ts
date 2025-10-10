import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { User } from '@prisma/client'
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

    // Check expiration
    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } })
      return null
    }

    return session.user
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
}

// Export singleton instance
export const authService = new AuthService()
