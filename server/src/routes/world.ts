import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js'
import { NotFoundError, UnauthorizedError, InternalError } from '../lib/errors.js'
import { convertObjectRefsToText, countObjectRefsInGlosses } from '../lib/reference-cleanup.js'

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

  // ==========================================================================
  // World Object Deletion Endpoints with Reference Cleanup
  // ==========================================================================

  /**
   * Helper interfaces for world objects.
   */
  interface WorldEntity {
    id: string
    name?: string
    typeAssignments?: Array<{ personaId: string; typeId: string }>
    [key: string]: unknown
  }

  interface WorldEvent {
    id: string
    name?: string
    personaInterpretations?: Array<{ personaId: string; eventTypeId: string }>
    [key: string]: unknown
  }

  interface WorldTime {
    id: string
    label?: string
    [key: string]: unknown
  }

  interface WorldRelation {
    id: string
    sourceType: string
    sourceId: string
    targetType: string
    targetId: string
    [key: string]: unknown
  }

  interface WorldCollection {
    id: string
    members?: string[]
    [key: string]: unknown
  }

  interface TypeWithGloss {
    id: string
    name: string
    gloss?: Array<{ type: string; content: string; refType?: string }>
    [key: string]: unknown
  }

  /**
   * Helper to get user ID from request or default user.
   */
  async function getUserId(request: { user?: { id: string } }): Promise<string> {
    const mode = process.env.FOVEA_MODE || 'multi-user'

    if (request.user) {
      return request.user.id
    } else if (mode === 'single-user') {
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: process.env.DEFAULT_USER_USERNAME || 'default-user' }
      })
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      return defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }
  }

  /**
   * Get deletion preview for a world entity.
   *
   * @route GET /api/world/entities/:entityId/deletion-preview
   */
  fastify.get<{ Params: { entityId: string } }>(
    '/api/world/entities/:entityId/deletion-preview',
    {
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { entityId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const entities = (worldState.entities as WorldEntity[]) || []
      const targetEntity = entities.find(e => e.id === entityId)
      if (!targetEntity) {
        throw new NotFoundError('Entity', entityId)
      }

      // Count gloss references in all personas' ontologies
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue
        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        glossReferences += countObjectRefsInGlosses(entityTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, entityId, 'entity-object')
      }

      // Count annotations linking to this entity
      // Note: Annotations use JSON frames field, need raw query or scan
      // For simplicity, count annotations that might reference this entity
      const annotationCount = 0 // Would need to scan frames JSON field

      // Count relations referencing this entity
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationCount = relations.filter(
        r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
             (r.targetType === 'entity' && r.targetId === entityId)
      ).length

      // Count collection memberships
      const entityCollections = (worldState.entityCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      for (const collection of entityCollections) {
        if (collection.members?.includes(entityId)) {
          collectionMemberships++
        }
      }

      return reply.send({
        glossReferences,
        annotationCount,
        relationCount,
        collectionMemberships
      })
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
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { entityId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const entities = (worldState.entities as WorldEntity[]) || []
      const targetEntity = entities.find(e => e.id === entityId)
      if (!targetEntity) {
        throw new NotFoundError('Entity', entityId)
      }

      const entityName = targetEntity.name || entityId

      // Remove entity from list
      const updatedEntities = entities.filter(e => e.id !== entityId)

      // Remove relations referencing this entity
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
             (r.targetType === 'entity' && r.targetId === entityId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'entity' && r.sourceId === entityId) ||
               (r.targetType === 'entity' && r.targetId === entityId))
      )

      // Remove from collections
      const entityCollections = (worldState.entityCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      const updatedEntityCollections = entityCollections.map(collection => {
        if (collection.members?.includes(entityId)) {
          collectionMemberships++
          return {
            ...collection,
            members: collection.members.filter(id => id !== entityId)
          }
        }
        return collection
      })

      // Update world state
      await fastify.prisma.worldState.update({
        where: { userId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entities: updatedEntities as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          relations: updatedRelations as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entityCollections: updatedEntityCollections as any
        }
      })

      // Convert objectRefs in glosses
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue

        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        // Count references
        glossReferences += countObjectRefsInGlosses(entityTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, entityId, 'entity-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, entityId, 'entity-object')

        // Convert references to text
        const cleanedEntityTypes = entityTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, entityId, 'entity-object', entityName) : type.gloss
        }))
        const cleanedRoleTypes = roleTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, entityId, 'entity-object', entityName) : type.gloss
        }))
        const cleanedEventTypes = eventTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, entityId, 'entity-object', entityName) : type.gloss
        }))
        const cleanedRelationTypes = relationTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, entityId, 'entity-object', entityName) : type.gloss
        }))

        // Update ontology
        await fastify.prisma.ontology.update({
          where: { personaId: persona.id },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entityTypes: cleanedEntityTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roleTypes: cleanedRoleTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            eventTypes: cleanedEventTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            relationTypes: cleanedRelationTypes as any
          }
        })
      }

      return reply.send({
        message: `Entity "${entityName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          relations: relationsRemoved,
          collectionMemberships
        }
      })
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
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { eventId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const events = (worldState.events as WorldEvent[]) || []
      const targetEvent = events.find(e => e.id === eventId)
      if (!targetEvent) {
        throw new NotFoundError('Event', eventId)
      }

      // Count gloss references
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue
        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        glossReferences += countObjectRefsInGlosses(entityTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, eventId, 'event-object')
      }

      // Count relations
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationCount = relations.filter(
        r => (r.sourceType === 'event' && r.sourceId === eventId) ||
             (r.targetType === 'event' && r.targetId === eventId)
      ).length

      // Count collection memberships
      const eventCollections = (worldState.eventCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      for (const collection of eventCollections) {
        if (collection.members?.includes(eventId)) {
          collectionMemberships++
        }
      }

      return reply.send({
        glossReferences,
        annotationCount: 0,
        relationCount,
        collectionMemberships
      })
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
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { eventId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const events = (worldState.events as WorldEvent[]) || []
      const targetEvent = events.find(e => e.id === eventId)
      if (!targetEvent) {
        throw new NotFoundError('Event', eventId)
      }

      const eventName = targetEvent.name || eventId

      // Remove event
      const updatedEvents = events.filter(e => e.id !== eventId)

      // Remove relations
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'event' && r.sourceId === eventId) ||
             (r.targetType === 'event' && r.targetId === eventId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'event' && r.sourceId === eventId) ||
               (r.targetType === 'event' && r.targetId === eventId))
      )

      // Remove from collections
      const eventCollections = (worldState.eventCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      const updatedEventCollections = eventCollections.map(collection => {
        if (collection.members?.includes(eventId)) {
          collectionMemberships++
          return {
            ...collection,
            members: collection.members.filter(id => id !== eventId)
          }
        }
        return collection
      })

      // Update world state
      await fastify.prisma.worldState.update({
        where: { userId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          events: updatedEvents as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          relations: updatedRelations as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eventCollections: updatedEventCollections as any
        }
      })

      // Convert objectRefs in glosses
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue

        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        glossReferences += countObjectRefsInGlosses(entityTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, eventId, 'event-object')

        const cleanedEntityTypes = entityTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, eventId, 'event-object', eventName) : type.gloss
        }))
        const cleanedRoleTypes = roleTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, eventId, 'event-object', eventName) : type.gloss
        }))
        const cleanedEventTypes = eventTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, eventId, 'event-object', eventName) : type.gloss
        }))
        const cleanedRelationTypes = relationTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, eventId, 'event-object', eventName) : type.gloss
        }))

        await fastify.prisma.ontology.update({
          where: { personaId: persona.id },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entityTypes: cleanedEntityTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roleTypes: cleanedRoleTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            eventTypes: cleanedEventTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            relationTypes: cleanedRelationTypes as any
          }
        })
      }

      return reply.send({
        message: `Event "${eventName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          relations: relationsRemoved,
          collectionMemberships
        }
      })
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
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { timeId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const times = (worldState.times as WorldTime[]) || []
      const targetTime = times.find(t => t.id === timeId)
      if (!targetTime) {
        throw new NotFoundError('Time', timeId)
      }

      // Count gloss references
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue
        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        glossReferences += countObjectRefsInGlosses(entityTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, timeId, 'time-object')
      }

      // Count relations
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationCount = relations.filter(
        r => (r.sourceType === 'time' && r.sourceId === timeId) ||
             (r.targetType === 'time' && r.targetId === timeId)
      ).length

      // Count collection memberships
      const timeCollections = (worldState.timeCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      for (const collection of timeCollections) {
        if (collection.members?.includes(timeId)) {
          collectionMemberships++
        }
      }

      return reply.send({
        glossReferences,
        annotationCount: 0,
        relationCount,
        collectionMemberships
      })
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
      onRequest: [requireAuth],
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { timeId } = request.params
      const userId = await getUserId(request)

      const worldState = await fastify.prisma.worldState.findUnique({
        where: { userId }
      })

      if (!worldState) {
        throw new NotFoundError('World state', userId)
      }

      const times = (worldState.times as WorldTime[]) || []
      const targetTime = times.find(t => t.id === timeId)
      if (!targetTime) {
        throw new NotFoundError('Time', timeId)
      }

      const timeName = targetTime.label || timeId

      // Remove time
      const updatedTimes = times.filter(t => t.id !== timeId)

      // Remove relations
      const relations = (worldState.relations as WorldRelation[]) || []
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'time' && r.sourceId === timeId) ||
             (r.targetType === 'time' && r.targetId === timeId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'time' && r.sourceId === timeId) ||
               (r.targetType === 'time' && r.targetId === timeId))
      )

      // Remove from collections
      const timeCollections = (worldState.timeCollections as WorldCollection[]) || []
      let collectionMemberships = 0
      const updatedTimeCollections = timeCollections.map(collection => {
        if (collection.members?.includes(timeId)) {
          collectionMemberships++
          return {
            ...collection,
            members: collection.members.filter(id => id !== timeId)
          }
        }
        return collection
      })

      // Update world state
      await fastify.prisma.worldState.update({
        where: { userId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          times: updatedTimes as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          relations: updatedRelations as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          timeCollections: updatedTimeCollections as any
        }
      })

      // Convert objectRefs in glosses
      let glossReferences = 0
      const personas = await fastify.prisma.persona.findMany({
        where: { userId },
        include: { ontology: true }
      })

      for (const persona of personas) {
        if (!persona.ontology) continue

        const entityTypes = (persona.ontology.entityTypes as TypeWithGloss[]) || []
        const roleTypes = (persona.ontology.roleTypes as TypeWithGloss[]) || []
        const eventTypes = (persona.ontology.eventTypes as TypeWithGloss[]) || []
        const relationTypes = (persona.ontology.relationTypes as TypeWithGloss[]) || []

        glossReferences += countObjectRefsInGlosses(entityTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, timeId, 'time-object')

        const cleanedEntityTypes = entityTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, timeId, 'time-object', timeName) : type.gloss
        }))
        const cleanedRoleTypes = roleTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, timeId, 'time-object', timeName) : type.gloss
        }))
        const cleanedEventTypes = eventTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, timeId, 'time-object', timeName) : type.gloss
        }))
        const cleanedRelationTypes = relationTypes.map(type => ({
          ...type,
          gloss: type.gloss ? convertObjectRefsToText(type.gloss, timeId, 'time-object', timeName) : type.gloss
        }))

        await fastify.prisma.ontology.update({
          where: { personaId: persona.id },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entityTypes: cleanedEntityTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roleTypes: cleanedRoleTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            eventTypes: cleanedEventTypes as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            relationTypes: cleanedRelationTypes as any
          }
        })
      }

      return reply.send({
        message: `Time "${timeName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          relations: relationsRemoved,
          collectionMemberships
        }
      })
    }
  )
}

export default worldRoute
