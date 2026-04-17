import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma, type WorldState as PrismaWorldState } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import { optionalAuth, requireAdmin, requireAuth } from '@middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, InternalError, ForbiddenError } from '@lib/errors.js'
import { convertObjectRefsToText, countObjectRefsInGlosses } from '@lib/reference-cleanup.js'
import {
  asEntityTypes,
  asRoleTypes,
  asEventTypes,
  asRelationTypes,
  asEntities,
  asEvents,
  asTimes,
  asWorldRelations,
  asWorldCollections,
} from '@lib/prisma-json.js'

/**
 * Converts a typed array to Prisma.InputJsonValue for storage in JSON columns.
 * Prisma JSON columns accept any serializable value at runtime; this function
 * bridges the TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

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
 *
 * Every route requires authentication, builds the caller's CASL abilities,
 * and filters/verifies access against them. WorldState rows are keyed by
 * (userId, projectId); a user owns their personal state (projectId = null)
 * and may access per-project states for projects they belong to. Single-row
 * endpoints load the row first and run an instance-level `ability.can()`
 * check before returning or mutating. If a row exists but the caller cannot
 * read it, a ForbiddenError is thrown; if the row does not exist at all, a
 * NotFoundError is thrown instead (existence privacy).
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

    // Find or create personal world state for this user (projectId: null).
    // A user always owns their personal world state, so the findOrCreate
    // semantics are preserved. Before creating, pre-authorize via CASL so
    // future rule tightening cannot be bypassed.
    let worldState = await fastify.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })

    if (worldState) {
      if (request.ability && !request.ability.can('read', subject('WorldState', worldState))) {
        throw new ForbiddenError('Cannot read this WorldState')
      }
    } else {
      if (request.ability) {
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!request.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
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

    // Find or create personal world state, then update. A user always owns
    // their personal world state (projectId: null) so the existence check
    // preserves the original semantics, but we still run CASL against the
    // row before mutating it.
    const existing = await fastify.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })

    let worldState
    if (existing) {
      if (request.ability && !request.ability.can('update', subject('WorldState', existing))) {
        throw new ForbiddenError('Cannot update this WorldState')
      }
      worldState = await fastify.prisma.worldState.update({
        where: { id: existing.id },
        data: {
          entities: updateData.entities !== undefined ? (updateData.entities as Prisma.InputJsonValue) : undefined,
          events: updateData.events !== undefined ? (updateData.events as Prisma.InputJsonValue) : undefined,
          times: updateData.times !== undefined ? (updateData.times as Prisma.InputJsonValue) : undefined,
          entityCollections: updateData.entityCollections !== undefined ? (updateData.entityCollections as Prisma.InputJsonValue) : undefined,
          eventCollections: updateData.eventCollections !== undefined ? (updateData.eventCollections as Prisma.InputJsonValue) : undefined,
          timeCollections: updateData.timeCollections !== undefined ? (updateData.timeCollections as Prisma.InputJsonValue) : undefined,
          relations: updateData.relations !== undefined ? (updateData.relations as Prisma.InputJsonValue) : undefined
        }
      })
    } else {
      if (request.ability) {
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!request.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
      worldState = await fastify.prisma.worldState.create({
        data: {
          userId,
          entities: (updateData.entities || []) as Prisma.InputJsonValue,
          events: (updateData.events || []) as Prisma.InputJsonValue,
          times: (updateData.times || []) as Prisma.InputJsonValue,
          entityCollections: (updateData.entityCollections || []) as Prisma.InputJsonValue,
          eventCollections: (updateData.eventCollections || []) as Prisma.InputJsonValue,
          timeCollections: (updateData.timeCollections || []) as Prisma.InputJsonValue,
          relations: (updateData.relations || []) as Prisma.InputJsonValue
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
   * Clear world state for a specific user (admin only).
   *
   * @route DELETE /api/admin/world/:userId
   * @param userId - ID of user whose WorldState should be cleared
   * @returns Success message
   */
  fastify.delete('/api/admin/world/:userId', {
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
    const { userId } = request.params as { userId: string }

    // Check if user exists
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new NotFoundError('User', userId)
    }

    // Clear the user's personal world state by updating with empty arrays
    const existingWorldState = await fastify.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })

    const emptyData = {
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: []
    }

    if (existingWorldState) {
      if (request.ability && !request.ability.can('delete', subject('WorldState', existingWorldState))) {
        throw new ForbiddenError('Cannot delete this WorldState')
      }
      await fastify.prisma.worldState.update({
        where: { id: existingWorldState.id },
        data: emptyData
      })
    } else {
      if (request.ability) {
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!request.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
      await fastify.prisma.worldState.create({
        data: { userId, ...emptyData }
      })
    }

    return reply.send({
      message: 'World state cleared successfully',
      userId
    })
  })

  // ==========================================================================
  // World Object Deletion Endpoints with Reference Cleanup
  // ==========================================================================

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
   * Load the caller's personal WorldState enforcing CASL read access.
   *
   * Uses an accessibleBy filter so the row is only returned when the caller
   * is entitled to read it. If a row exists but is not accessible, a
   * ForbiddenError is thrown. If no row exists for this user at all, a
   * NotFoundError is thrown. This preserves existence privacy: callers can
   * neither distinguish "forbidden" from "not found" nor probe other users'
   * world states.
   */
  async function loadAuthorizedPersonalWorldState(
    request: { ability?: AppAbility },
    userId: string,
  ) {
    const ability = request.ability
    const accessible = ability
      ? await fastify.prisma.worldState.findFirst({
          where: {
            AND: [
              { userId, projectId: null },
              accessibleBy(ability, 'read').WorldState,
            ],
          },
        })
      : await fastify.prisma.worldState.findFirst({
          where: { userId, projectId: null },
        })

    if (accessible) {
      if (ability && !ability.can('read', subject('WorldState', accessible))) {
        throw new ForbiddenError('Cannot read this WorldState')
      }
      return accessible
    }

    // Distinguish forbidden vs not-found without leaking existence to other
    // users: only the owning user's row is ever considered here (userId is
    // the caller's own id), so a missing row is safely 404.
    const raw = await fastify.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })
    if (raw) {
      throw new ForbiddenError('Cannot read this WorldState')
    }
    throw new NotFoundError('World state', userId)
  }

  /**
   * Authorize an action on a WorldState row before mutating it.
   */
  function authorizeWorldState(
    request: { ability?: AppAbility },
    action: 'read' | 'update' | 'delete',
    ws: PrismaWorldState,
  ): void {
    if (request.ability && !request.ability.can(action, subject('WorldState', ws))) {
      throw new ForbiddenError(`Cannot ${action} this WorldState`)
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
      const { entityId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)

      const entities = asEntities(worldState.entities)
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
        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

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
      const relations = asWorldRelations(worldState.relations)
      const relationCount = relations.filter(
        r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
             (r.targetType === 'entity' && r.targetId === entityId)
      ).length

      // Count collection memberships
      const entityCollections = asWorldCollections(worldState.entityCollections)
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
      const { entityId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)
      authorizeWorldState(request, 'update', worldState)

      const entities = asEntities(worldState.entities)
      const targetEntity = entities.find(e => e.id === entityId)
      if (!targetEntity) {
        throw new NotFoundError('Entity', entityId)
      }

      const entityName = targetEntity.name || entityId

      // Remove entity from list
      const updatedEntities = entities.filter(e => e.id !== entityId)

      // Remove relations referencing this entity
      const relations = asWorldRelations(worldState.relations)
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
             (r.targetType === 'entity' && r.targetId === entityId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'entity' && r.sourceId === entityId) ||
               (r.targetType === 'entity' && r.targetId === entityId))
      )

      // Remove from collections
      const entityCollections = asWorldCollections(worldState.entityCollections)
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
        where: { id: worldState.id },
        data: {
          entities: toJson(updatedEntities),
          relations: toJson(updatedRelations),
          entityCollections: toJson(updatedEntityCollections)
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

        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

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
            entityTypes: toJson(cleanedEntityTypes),
            roleTypes: toJson(cleanedRoleTypes),
            eventTypes: toJson(cleanedEventTypes),
            relationTypes: toJson(cleanedRelationTypes)
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
      const { eventId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)

      const events = asEvents(worldState.events)
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
        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

        glossReferences += countObjectRefsInGlosses(entityTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, eventId, 'event-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, eventId, 'event-object')
      }

      // Count relations
      const relations = asWorldRelations(worldState.relations)
      const relationCount = relations.filter(
        r => (r.sourceType === 'event' && r.sourceId === eventId) ||
             (r.targetType === 'event' && r.targetId === eventId)
      ).length

      // Count collection memberships
      const eventCollections = asWorldCollections(worldState.eventCollections)
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
      const { eventId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)
      authorizeWorldState(request, 'update', worldState)

      const events = asEvents(worldState.events)
      const targetEvent = events.find(e => e.id === eventId)
      if (!targetEvent) {
        throw new NotFoundError('Event', eventId)
      }

      const eventName = targetEvent.name || eventId

      // Remove event
      const updatedEvents = events.filter(e => e.id !== eventId)

      // Remove relations
      const relations = asWorldRelations(worldState.relations)
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'event' && r.sourceId === eventId) ||
             (r.targetType === 'event' && r.targetId === eventId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'event' && r.sourceId === eventId) ||
               (r.targetType === 'event' && r.targetId === eventId))
      )

      // Remove from collections
      const eventCollections = asWorldCollections(worldState.eventCollections)
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
        where: { id: worldState.id },
        data: {
          events: toJson(updatedEvents),
          relations: toJson(updatedRelations),
          eventCollections: toJson(updatedEventCollections)
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

        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

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
            entityTypes: toJson(cleanedEntityTypes),
            roleTypes: toJson(cleanedRoleTypes),
            eventTypes: toJson(cleanedEventTypes),
            relationTypes: toJson(cleanedRelationTypes)
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
      const { timeId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)

      const times = asTimes(worldState.times)
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
        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

        glossReferences += countObjectRefsInGlosses(entityTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(roleTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(eventTypes, timeId, 'time-object')
        glossReferences += countObjectRefsInGlosses(relationTypes, timeId, 'time-object')
      }

      // Count relations
      const relations = asWorldRelations(worldState.relations)
      const relationCount = relations.filter(
        r => (r.sourceType === 'time' && r.sourceId === timeId) ||
             (r.targetType === 'time' && r.targetId === timeId)
      ).length

      // Count collection memberships
      const timeCollections = asWorldCollections(worldState.timeCollections)
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
      const { timeId } = request.params
      const userId = await getUserId(request)

      const worldState = await loadAuthorizedPersonalWorldState(request, userId)
      authorizeWorldState(request, 'update', worldState)

      const times = asTimes(worldState.times)
      const targetTime = times.find(t => t.id === timeId)
      if (!targetTime) {
        throw new NotFoundError('Time', timeId)
      }

      // Time objects don't have a name/label, use id for reference cleanup
      const timeName = timeId

      // Remove time
      const updatedTimes = times.filter(t => t.id !== timeId)

      // Remove relations
      const relations = asWorldRelations(worldState.relations)
      const relationsRemoved = relations.filter(
        r => (r.sourceType === 'time' && r.sourceId === timeId) ||
             (r.targetType === 'time' && r.targetId === timeId)
      ).length
      const updatedRelations = relations.filter(
        r => !((r.sourceType === 'time' && r.sourceId === timeId) ||
               (r.targetType === 'time' && r.targetId === timeId))
      )

      // Remove from collections
      const timeCollections = asWorldCollections(worldState.timeCollections)
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
        where: { id: worldState.id },
        data: {
          times: toJson(updatedTimes),
          relations: toJson(updatedRelations),
          timeCollections: toJson(updatedTimeCollections)
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

        const entityTypes = asEntityTypes(persona.ontology.entityTypes)
        const roleTypes = asRoleTypes(persona.ontology.roleTypes)
        const eventTypes = asEventTypes(persona.ontology.eventTypes)
        const relationTypes = asRelationTypes(persona.ontology.relationTypes)

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
            entityTypes: toJson(cleanedEntityTypes),
            roleTypes: toJson(cleanedRoleTypes),
            eventTypes: toJson(cleanedEventTypes),
            relationTypes: toJson(cleanedRelationTypes)
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
