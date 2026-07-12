import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { optionalAuth, requireAdmin, requireAuth } from '@middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { GraphRepository } from '../repositories/GraphRepository.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'
import { WorldStateService, WorldStateUpdateInput } from '../services/world-state-service.js'

/**
 * Fastify plugin for world state routes.
 *
 * Routes perform HTTP concerns only: schema validation, request parsing, and
 * dispatch to a per-request WorldStateService that reads and writes world
 * objects as layers GraphNode / GraphEdge rows scoped to the user. The response
 * and request shapes are unchanged; the store beneath them is the layers graph.
 *
 * World objects are keyed by scope (createdByUserId = the user, projectId = null
 * for personal state); a user only ever sees their own personal objects. Reads
 * reconstruct the aggregate from the scoped rows, returning an empty aggregate
 * when none exist. Deletion endpoints load the aggregate, remove the object with
 * its incident relations and collection memberships, and convert ontology gloss
 * references to text.
 *
 * Routes:
 * - GET /api/world - Get current user's world state
 * - PUT /api/world - Update current user's world state
 * - DELETE /api/admin/world/:userId - Clear specific user's world state (admin only)
 * - GET/DELETE /api/world/entities/:entityId[/deletion-preview]
 * - GET/DELETE /api/world/events/:eventId[/deletion-preview]
 * - GET/DELETE /api/world/times/:timeId[/deletion-preview]
 */
const worldRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: repositories for the plugin's lifetime.
  const graphRepo = new GraphRepository(fastify.prisma)
  const ontologyRepo = new LayersOntologyRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id.
   */
  const serviceFor = (request: FastifyRequest): WorldStateService =>
    new WorldStateService(
      graphRepo,
      ontologyRepo,
      fastify.prisma,
      request.ability ?? null,
      request.user?.id
    )

  /**
   * Get world state for the current authenticated user.
   * Creates an empty world state if one doesn't exist.
   * In single-user mode, uses default user if not authenticated.
   *
   * @route GET /api/world
   * @returns WorldState object with all entity, event, time, collection, and relation data
   */
  fastify.get('/api/world', {
    onRequest: [optionalAuth, buildAbilities],
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
        403: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const worldState = await service.getOrCreatePersonal()
    return reply.send(worldState)
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
  fastify.put<{ Body: WorldStateUpdateInput }>('/api/world', {
    onRequest: [optionalAuth, buildAbilities],
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
        403: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const worldState = await service.updatePersonal(request.body)
    return reply.send(worldState)
  })

  /**
   * Clear world state for a specific user (admin only).
   *
   * @route DELETE /api/admin/world/:userId
   * @param userId - ID of user whose WorldState should be cleared
   * @returns Success message
   */
  fastify.delete<{ Params: { userId: string } }>('/api/admin/world/:userId', {
    onRequest: [requireAdmin, buildAbilities],
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
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const result = await service.clearForUser(request.params.userId)
    return reply.send(result)
  })

  // ==========================================================================
  // World Object Deletion Endpoints with Reference Cleanup
  // ==========================================================================

  /**
   * Get deletion preview for a world entity.
   *
   * @route GET /api/world/entities/:entityId/deletion-preview
   */
  fastify.get<{ Params: { entityId: string } }>(
    '/api/world/entities/:entityId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for a world entity',
        tags: ['world'],
        params: Type.Object({
          entityId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            relationCount: Type.Number(),
            collectionMemberships: Type.Number()
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.getEntityDeletionPreview(request.params.entityId))
    }
  )

  /**
   * Delete a world entity with reference cleanup.
   *
   * @route DELETE /api/world/entities/:entityId
   */
  fastify.delete<{ Params: { entityId: string } }>(
    '/api/world/entities/:entityId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a world entity with reference cleanup',
        tags: ['world'],
        params: Type.Object({
          entityId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              relations: Type.Number(),
              collectionMemberships: Type.Number()
            })
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.deleteEntity(request.params.entityId))
    }
  )

  /**
   * Get deletion preview for a world event.
   *
   * @route GET /api/world/events/:eventId/deletion-preview
   */
  fastify.get<{ Params: { eventId: string } }>(
    '/api/world/events/:eventId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for a world event',
        tags: ['world'],
        params: Type.Object({
          eventId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            relationCount: Type.Number(),
            collectionMemberships: Type.Number()
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.getEventDeletionPreview(request.params.eventId))
    }
  )

  /**
   * Delete a world event with reference cleanup.
   *
   * @route DELETE /api/world/events/:eventId
   */
  fastify.delete<{ Params: { eventId: string } }>(
    '/api/world/events/:eventId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a world event with reference cleanup',
        tags: ['world'],
        params: Type.Object({
          eventId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              relations: Type.Number(),
              collectionMemberships: Type.Number()
            })
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.deleteEvent(request.params.eventId))
    }
  )

  /**
   * Get deletion preview for a world time.
   *
   * @route GET /api/world/times/:timeId/deletion-preview
   */
  fastify.get<{ Params: { timeId: string } }>(
    '/api/world/times/:timeId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for a world time',
        tags: ['world'],
        params: Type.Object({
          timeId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            relationCount: Type.Number(),
            collectionMemberships: Type.Number()
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.getTimeDeletionPreview(request.params.timeId))
    }
  )

  /**
   * Delete a world time with reference cleanup.
   *
   * @route DELETE /api/world/times/:timeId
   */
  fastify.delete<{ Params: { timeId: string } }>(
    '/api/world/times/:timeId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a world time with reference cleanup',
        tags: ['world'],
        params: Type.Object({
          timeId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              relations: Type.Number(),
              collectionMemberships: Type.Number()
            })
          }),
          403: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const service = serviceFor(request)
      return reply.send(await service.deleteTime(request.params.timeId))
    }
  )
}

export default worldRoute
