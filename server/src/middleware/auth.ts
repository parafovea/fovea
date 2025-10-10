import { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../services/auth-service.js'

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
    reply.code(401).send({ error: 'Authentication required' })
    return
  }

  const user = await authService.validateSession(token)

  if (!user) {
    reply.clearCookie('session_token', { path: '/' })
    reply.code(401).send({ error: 'Session expired' })
    return
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
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws 401 if not authenticated, 403 if not admin
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First check authentication
  await requireAuth(request, reply)

  // Then check admin role
  if (!request.user?.isAdmin) {
    reply.code(403).send({ error: 'Admin access required' })
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
