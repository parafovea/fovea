import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

/**
 * TypeBox schema for Session response.
 * Includes masked token and session metadata.
 */
const SessionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  token: Type.String(),
  expiresAt: Type.String({ format: 'date-time' }),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  userAgent: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  isCurrent: Type.Optional(Type.Boolean())
})

/**
 * TypeBox schema for Session with user information.
 * Used in admin endpoints to show which user owns the session.
 */
const SessionWithUserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  token: Type.String(),
  expiresAt: Type.String({ format: 'date-time' }),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  userAgent: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  user: Type.Object({
    id: Type.String({ format: 'uuid' }),
    username: Type.String(),
    displayName: Type.String()
  })
})

/**
 * Fastify plugin for session management routes.
 * Provides endpoints for viewing and revoking sessions.
 *
 * Routes:
 * - GET /api/sessions - List current user's sessions
 * - DELETE /api/sessions/:sessionId - Revoke own session
 * - GET /api/admin/sessions - List all sessions (admin only)
 * - DELETE /api/admin/sessions/:sessionId - Revoke any session (admin only)
 */
const sessionsRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List current user's sessions.
   * Shows masked tokens and marks the current session.
   *
   * @returns Array of user's sessions
   */
  fastify.get('/api/sessions', {
    onRequest: [requireAuth],
    schema: {
      description: 'List current user\'s sessions',
      tags: ['sessions'],
      response: {
        200: Type.Array(SessionSchema)
      }
    }
  }, async (request, reply) => {
    const currentToken = request.cookies.session_token

    const sessions = await fastify.prisma.session.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true
      }
    })

    // Mask tokens and mark current session
    const maskedSessions = sessions.map(session => ({
      ...session,
      token: `...${session.token.slice(-8)}`,
      isCurrent: session.token === currentToken
    }))

    return reply.send(maskedSessions)
  })

  /**
   * Revoke own session.
   * Allows users to log out from specific sessions.
   *
   * @param request.params.sessionId - Session UUID to revoke
   * @returns Success message
   * @throws 403 if session does not belong to current user
   * @throws 404 if session not found
   */
  fastify.delete<{ Params: { sessionId: string } }>('/api/sessions/:sessionId', {
    onRequest: [requireAuth],
    schema: {
      description: 'Revoke own session',
      tags: ['sessions'],
      params: Type.Object({
        sessionId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean()
        }),
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { sessionId } = request.params

    // Verify session belongs to user
    const session = await fastify.prisma.session.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    if (session.userId !== request.user!.id) {
      return reply.code(403).send({ error: 'Cannot revoke another user\'s session' })
    }

    await fastify.prisma.session.delete({
      where: { id: sessionId }
    })

    return reply.send({ success: true })
  })

  /**
   * List all sessions (admin only).
   * Shows all sessions with user information and masked tokens.
   *
   * @returns Array of all sessions with user info
   */
  fastify.get('/api/admin/sessions', {
    onRequest: [requireAdmin],
    schema: {
      description: 'List all sessions',
      tags: ['admin', 'sessions'],
      response: {
        200: Type.Array(SessionWithUserSchema)
      }
    }
  }, async (_request, reply) => {
    const sessions = await fastify.prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })

    // Mask tokens
    const maskedSessions = sessions.map(session => ({
      ...session,
      token: `...${session.token.slice(-8)}`
    }))

    return reply.send(maskedSessions)
  })

  /**
   * Revoke any session (admin only).
   * Allows administrators to revoke any user's session.
   *
   * @param request.params.sessionId - Session UUID to revoke
   * @returns Success message
   * @throws 404 if session not found
   */
  fastify.delete<{ Params: { sessionId: string } }>('/api/admin/sessions/:sessionId', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Revoke any session',
      tags: ['admin', 'sessions'],
      params: Type.Object({
        sessionId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { sessionId } = request.params

    try {
      await fastify.prisma.session.delete({
        where: { id: sessionId }
      })
      return reply.send({ success: true })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        return reply.code(404).send({ error: 'Session not found' })
      }
      throw error
    }
  })
}

export default sessionsRoute
