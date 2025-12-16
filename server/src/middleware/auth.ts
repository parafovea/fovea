import { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../services/auth-service.js'
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js'

/**
 * Extend Fastify request type to include user.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string
      username: string
      email: string | null
      displayName: string
      isAdmin: boolean
    }
  }
}

/**
 * Authentication middleware.
 * Requires valid session token in cookie and attaches user to request object.
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws 401 if session token is missing or invalid
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies.session_token

  if (!token) {
    throw new UnauthorizedError('Authentication required')
  }

  const user = await authService.validateSession(token)

  if (!user) {
    reply.clearCookie('session_token', { path: '/' })
    throw new UnauthorizedError('Session expired')
  }

  // Attach user to request
  request.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  }
}

/**
 * Admin authorization middleware.
 * Requires authentication and admin role.
 *
 * Test Mode Bypass:
 * When NODE_ENV=test and ALLOW_TEST_ADMIN_BYPASS=true,
 * automatically grants admin access without authentication.
 * This enables E2E tests to create worker-specific users via admin API.
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws 401 if not authenticated, 403 if not admin
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Test mode bypass for E2E tests
  // Allows admin API access without authentication in isolated test environment
  if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_ADMIN_BYPASS === 'true') {
    // Auto-authenticate as test admin user
    request.user = {
      id: 'test-admin',
      username: 'test-admin',
      email: null,
      displayName: 'Test Admin',
      isAdmin: true
    }
    return
  }

  // First check authentication
  await requireAuth(request, reply)

  // Then check admin role
  if (!request.user?.isAdmin) {
    throw new ForbiddenError('Admin access required')
  }
}

/**
 * Optional authentication middleware.
 * Attaches user to request if authenticated, but does not reject unauthenticated requests.
 * Useful for routes that behave differently based on auth status.
 *
 * @param request - Fastify request object
 * @param _reply - Fastify reply object (unused)
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.cookies.session_token

  if (!token) {
    return
  }

  const user = await authService.validateSession(token)

  if (user) {
    request.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
    }
  }
}
