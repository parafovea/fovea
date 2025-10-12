import crypto from 'crypto'
import { prisma } from './prisma.js'

const SESSION_TIMEOUT_DAYS = parseInt(process.env.SESSION_TIMEOUT_DAYS || '7', 10)

/**
 * Generates a secure random session token.
 * @returns 32-byte hex string (64 characters)
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Creates a new session for a user.
 * @param userId - User ID to create session for
 * @param rememberMe - Whether to extend session lifetime (default: 7 days, extended: 30 days)
 * @param ipAddress - Optional IP address of client
 * @param userAgent - Optional user agent string
 * @returns Session record with token
 */
export async function createSession(
  userId: string,
  rememberMe = false,
  ipAddress?: string,
  userAgent?: string
) {
  const token = generateSessionToken()
  const daysToExpire = rememberMe ? 30 : SESSION_TIMEOUT_DAYS
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + daysToExpire)

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
    include: {
      user: true,
    },
  })

  return session
}

/**
 * Validates a session token and returns the associated user.
 * @param token - Session token to validate
 * @returns Session with user, or null if invalid/expired
 */
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session) {
    return null
  }

  if (session.expiresAt < new Date()) {
    // Session expired, delete it
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return session
}

/**
 * Destroys a session by token.
 * @param token - Session token to destroy
 */
export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } })
}

/**
 * Destroys all sessions for a user.
 * @param userId - User ID to destroy sessions for
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

/**
 * Cleans up expired sessions from the database.
 * Should be run periodically (e.g., daily cron job).
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })

  return result.count
}
