import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { optionalAuth, requireAdmin } from '../middleware/auth.js'
import { NotFoundError, UnauthorizedError, InternalError } from '../lib/errors.js'

/**
 * Request body for world state update endpoint.
 */
interface WorldStateUpdateBody {
  entities?: unknown[];
  events?: unknown[];
  times?: unknown[];
  entityCollections?: unknown[];
  eventCollections?: unknown[];
  timeCollections?: unknown[];
  relations?: unknown[];
}

/**
 * Fastify plugin for world state routes.
 * Provides GET and PUT operations for user's world state (entities, events, times, collections, relations).
 * World state is user-scoped and shared across all personas.
 * In single-user mode, uses the default user automatically.
 *
 * Routes:
 * - GET /api/world - Get current user's world state
 * - PUT /api/world - Update current user's world state
 * - DELETE /api/admin/world/:userId - Clear specific user's world state (admin only, test mode)
 */
const worldRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get world state for the current authenticated user.
   * Creates an empty world state if one doesn't exist.
   * In single-user mode, uses default user if not authenticated.
   *
   * @route GET /api/world
   * @returns WorldState object with all entity, event, time, collection, and relation data
   */
  fastify.get('/api/world', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Get world state for current user',
      tags: ['world'],
      response: {
        200: Type.Object({
          id: Type.String({ format: 'uuid' }),
          userId: Type.String({ format: 'uuid' }),
          entities: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          times: Type.Array(Type.Any()),
          entityCollections: Type.Array(Type.Any()),
          eventCollections: Type.Array(Type.Any()),
          timeCollections: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String({ format: 'date-time' }),
          updatedAt: Type.String({ format: 'date-time' })
        }),
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const mode = process.env.FOVEA_MODE || 'multi-user'

    // Get user ID: use authenticated user or find default user in single-user mode
    let userId: string
    if (request.user) {
      userId = request.user.id
    } else if (mode === 'single-user') {
      // Find default user
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: process.env.DEFAULT_USER_USERNAME || 'default-user' }
      })
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      userId = defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }

    // Find or create world state for this user
    let worldState = await fastify.prisma.worldState.findUnique({
      where: { userId }
    })

    if (!worldState) {
      // Create empty world state for new user
      worldState = await fastify.prisma.worldState.create({
        data: {
          userId,
          entities: [],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })
    }

    return reply.send({
      id: worldState.id,
      userId: worldState.userId,
      entities: worldState.entities || [],
      events: worldState.events || [],
      times: worldState.times || [],
      entityCollections: worldState.entityCollections || [],
      eventCollections: worldState.eventCollections || [],
      timeCollections: worldState.timeCollections || [],
      relations: worldState.relations || [],
      createdAt: worldState.createdAt.toISOString(),
      updatedAt: worldState.updatedAt.toISOString()
    })
  })

  /**
   * Update world state for the current authenticated user.
   * All fields are optional. Only provided fields will be updated.
   * In single-user mode, uses default user if not authenticated.
   *
   * @route PUT /api/world
   * @body Partial world state with any combination of entities, events, times, collections, relations
   * @returns Updated WorldState object
   */
  fastify.put('/api/world', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Update world state for current user',
      tags: ['world'],
      body: Type.Object({
        entities: Type.Optional(Type.Array(Type.Any())),
        events: Type.Optional(Type.Array(Type.Any())),
        times: Type.Optional(Type.Array(Type.Any())),
        entityCollections: Type.Optional(Type.Array(Type.Any())),
        eventCollections: Type.Optional(Type.Array(Type.Any())),
        timeCollections: Type.Optional(Type.Array(Type.Any())),
        relations: Type.Optional(Type.Array(Type.Any()))
      }),
      response: {
        200: Type.Object({
          id: Type.String({ format: 'uuid' }),
          userId: Type.String({ format: 'uuid' }),
          entities: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          times: Type.Array(Type.Any()),
          entityCollections: Type.Array(Type.Any()),
          eventCollections: Type.Array(Type.Any()),
          timeCollections: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String({ format: 'date-time' }),
          updatedAt: Type.String({ format: 'date-time' })
        }),
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const mode = process.env.FOVEA_MODE || 'multi-user'

    // Get user ID: use authenticated user or find default user in single-user mode
    let userId: string
    if (request.user) {
      userId = request.user.id
    } else if (mode === 'single-user') {
      // Find default user
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: process.env.DEFAULT_USER_USERNAME || 'default-user' }
      })
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      userId = defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }

    const updateData = request.body as WorldStateUpdateBody

    // Upsert world state (create if doesn't exist, update if it does)
    const worldState = await fastify.prisma.worldState.upsert({
      where: { userId },
      create: {
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        entities: (updateData.entities || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        events: (updateData.events || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        times: (updateData.times || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        entityCollections: (updateData.entityCollections || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        eventCollections: (updateData.eventCollections || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        timeCollections: (updateData.timeCollections || []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        relations: (updateData.relations || []) as any
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        entities: updateData.entities !== undefined ? (updateData.entities as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        events: updateData.events !== undefined ? (updateData.events as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        times: updateData.times !== undefined ? (updateData.times as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        entityCollections: updateData.entityCollections !== undefined ? (updateData.entityCollections as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        eventCollections: updateData.eventCollections !== undefined ? (updateData.eventCollections as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        timeCollections: updateData.timeCollections !== undefined ? (updateData.timeCollections as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        relations: updateData.relations !== undefined ? (updateData.relations as any) : undefined
      }
    })

    return reply.send({
      id: worldState.id,
      userId: worldState.userId,
      entities: worldState.entities || [],
      events: worldState.events || [],
      times: worldState.times || [],
      entityCollections: worldState.entityCollections || [],
      eventCollections: worldState.eventCollections || [],
      timeCollections: worldState.timeCollections || [],
      relations: worldState.relations || [],
      createdAt: worldState.createdAt.toISOString(),
      updatedAt: worldState.updatedAt.toISOString()
    })
  })

  /**
   * Clear world state for a specific user (admin only).
   *
   * Use cases:
   * - User support: Reset corrupted or problematic world state
   * - Account management: User requests fresh start without account deletion
   * - Demo accounts: Periodic cleanup of training/demo user data
   * - Privacy compliance: Clear user's annotation data while preserving account
   * - Troubleshooting: Admin needs to reset state for debugging
   *
   * @route DELETE /api/admin/world/:userId
   * @param userId - ID of user whose WorldState should be cleared
   * @returns Success message
   */
  fastify.delete('/api/admin/world/:userId', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Clear world state for specific user (admin only)',
      tags: ['admin', 'world'],
      params: Type.Object({
        userId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          message: Type.String(),
          userId: Type.String({ format: 'uuid' })
        }),
        404: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string }

    // Check if user exists
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new NotFoundError('User', userId)
    }

    // Clear the user's world state by updating with empty arrays
    await fastify.prisma.worldState.upsert({
      where: { userId },
      create: {
        userId,
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: []
      },
      update: {
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: []
      }
    })

    return reply.send({
      message: 'World state cleared successfully',
      userId
    })
  })
}

export default worldRoute
