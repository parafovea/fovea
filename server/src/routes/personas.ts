import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import { requireAuth, optionalAuth } from '@middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { NotFoundError, ForbiddenError } from '@lib/errors.js'
import { isDemoModeEnabled } from '../lib/demo-flags.js'
import { isSingleUserMode } from '@services/user-service.js'
import { personaOperationCounter } from '../metrics.js'
import {
  updateGlossesInTypes,
  countTypeRefsInGlosses,
  removeTypeAssignmentsFromEntities,
  removeEventInterpretationsFromEvents,
  countTypeAssignments,
  countEventInterpretations,
} from '@lib/reference-cleanup.js'
import {
  asTypesWithGloss,
  asEntities,
  asEvents,
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
 * Request body for ontology update endpoint.
 */
interface OntologyUpdateBody {
  entities?: unknown[];
  roles?: unknown[];
  events?: unknown[];
  relationTypes?: unknown[];
  relations?: unknown[];
}

/**
 * TypeBox schema for Persona response.
 * Defines the structure of persona data returned by the API.
 */
const PersonaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1 }),
  role: Type.String(),
  informationNeed: Type.String(),
  details: Type.Union([Type.String(), Type.Null()]),
  isSystemGenerated: Type.Boolean(),
  hidden: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/**
 * Zod schema for creating a new persona.
 * Validates request body for POST /api/personas.
 */
const createPersonaSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  informationNeed: z.string().min(1, 'Information need is required'),
  details: z.string().optional(),
  projectId: z.string().uuid().optional(),
  isSystemGenerated: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false)
})

/**
 * Zod schema for updating an existing persona.
 * All fields are optional for partial updates.
 */
const updatePersonaSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  informationNeed: z.string().min(1).optional(),
  details: z.string().optional(),
  isSystemGenerated: z.boolean().optional(),
  hidden: z.boolean().optional()
})

/**
 * Fastify plugin for persona-related routes.
 * Provides CRUD operations for personas using Prisma ORM.
 *
 * Routes:
 * - GET /api/personas - List all personas
 * - POST /api/personas - Create a new persona
 * - GET /api/personas/:id - Get a specific persona
 * - PUT /api/personas/:id - Update a persona
 * - DELETE /api/personas/:id - Delete a persona
 */
const personasRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List all personas.
   * In single-user mode, returns all personas.
   * In multi-user mode with authentication, returns current user's personas only.
   * Without authentication, returns public/system personas.
   *
   * @route GET /api/personas
   * @returns Array of personas
   */
  fastify.get('/api/personas', {
    onRequest: [optionalAuth, buildAbilities],
    schema: {
      description: 'Retrieve personas',
      tags: ['personas'],
      response: {
        200: Type.Array(PersonaSchema)
      }
    }
  }, async (request, reply) => {
    if (isSingleUserMode()) {
      // Single-user mode: return all non-hidden personas
      const personas = await fastify.prisma.persona.findMany({
        where: { hidden: false },
        orderBy: { createdAt: 'desc' }
      })
      return reply.send(personas)
    }

    if (!request.user || !request.ability) {
      // Unauthenticated: return only non-hidden system personas
      const personas = await fastify.prisma.persona.findMany({
        where: { isSystemGenerated: true, hidden: false },
        orderBy: { createdAt: 'desc' }
      })
      return reply.send(personas)
    }

    // FOVEA_DEMO_MODE override: the booth flow that ships on
    // demo.fovea.video auto-issues demo-anonymous-* sessions
    // (server/src/demo/anonymous-session.ts) so the visitor is
    // technically authenticated and the unauthenticated branch above
    // does not fire — but the auto-issued anon user has no CASL
    // grants of their own, so the per-user accessibleBy filter below
    // returns the empty set and the persona dropdown reads "No
    // personas found". The Persona Builder workspace and every tour
    // that drives a persona-rooted ontology (ontology-authoring,
    // wikidata-augmentation, world-layer, etc.) then has no anchor
    // to mount against because the workspace's tab list is gated on
    // persona selection. Inside FOVEA_DEMO_MODE we explicitly widen
    // the read scope to every non-hidden system-generated persona —
    // the seeded "Automated" persona plus any future
    // isSystemGenerated=true rows an admin promotes — so the tours
    // run end-to-end against the same seeded ontology a self-hosted
    // single-user deployment shows. This is gated on FOVEA_DEMO_MODE
    // so production multi-user deployments keep their per-user RBAC
    // intact.
    if (isDemoModeEnabled()) {
      // The seeded Automated persona ships with hidden=true so it
      // does not clutter a multi-user deployment's persona dropdown
      // for end users who do not need it. The tour flow that walks
      // visitors through the persona-rooted workspaces needs it
      // visible, so the override drops the hidden filter — the
      // visible result is every isSystemGenerated persona regardless
      // of the hidden flag. Production deployments without
      // FOVEA_DEMO_MODE keep their per-user RBAC + the hidden filter
      // exactly as before.
      const personas = await fastify.prisma.persona.findMany({
        where: { isSystemGenerated: true },
        orderBy: { createdAt: 'desc' }
      })
      return reply.send(personas)
    }

    // Authenticated: filter by CASL abilities
    const personas = await fastify.prisma.persona.findMany({
      where: {
        AND: [
          { hidden: false },
          accessibleBy(request.ability, 'read').Persona,
        ],
      },
      orderBy: { createdAt: 'desc' }
    })
    return reply.send(personas)
  })

  /**
   * Create a new persona.
   * Creates a persona and its associated ontology in the database.
   * In single-user mode, uses default user if not authenticated.
   * In multi-user mode, requires authentication.
   *
   * @route POST /api/personas
   * @param request.body - Persona data
   * @returns Created persona
   */
  fastify.post('/api/personas', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Create a new persona',
      tags: ['personas'],
      body: Type.Object({
        name: Type.String({ minLength: 1 }),
        role: Type.String(),
        informationNeed: Type.String(),
        details: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String({ format: 'uuid' })),
        isSystemGenerated: Type.Optional(Type.Boolean()),
        hidden: Type.Optional(Type.Boolean())
      }),
      response: {
        201: PersonaSchema,
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const userId = request.user!.id

    const validatedData = createPersonaSchema.parse(request.body)
    const projectId = validatedData.projectId || null

    // Pre-authorize: verify the caller can create a Persona in this scope
    const candidate = subject('Persona', {
      userId,
      projectId,
    })
    if (!request.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Persona in this scope')
    }

    // Only system_admin may flag a persona as system-generated, since
    // system personas are visible to unauthenticated visitors via the
    // unauthenticated GET /api/personas branch. A non-admin attempting
    // to set this flag has it silently coerced to false rather than 403
    // so legitimate clients that send the field unconditionally still
    // succeed.
    const isSystemGenerated = request.user?.systemRole === 'system_admin'
      ? validatedData.isSystemGenerated
      : false

    const persona = await fastify.prisma.persona.create({
      data: {
        name: validatedData.name,
        role: validatedData.role,
        informationNeed: validatedData.informationNeed,
        details: validatedData.details || null,
        isSystemGenerated,
        hidden: validatedData.hidden,
        userId,
        projectId,
        ontology: {
          create: {
            entityTypes: [],
            eventTypes: [],
            roleTypes: [],
            relationTypes: []
          }
        }
      }
    })

    personaOperationCounter.add(1, { operation: 'create', status: 'success' })
    return reply.code(201).send(persona)
  })

  /**
   * Get a specific persona by ID.
   * In multi-user mode, verifies user owns the persona or it's a system persona.
   *
   * @route GET /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Persona object
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [optionalAuth, buildAbilities],
    schema: {
      description: 'Get a specific persona by ID',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: PersonaSchema,
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    const persona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!persona) {
      throw new NotFoundError('Persona', id)
    }

    // Unauthenticated callers can only see public system personas
    if (!request.user || !request.ability) {
      if (!persona.isSystemGenerated || persona.hidden) {
        throw new NotFoundError('Persona', id)
      }
      return reply.send(persona)
    }

    // Authenticated: CASL instance-level check
    if (!request.ability.can('read', subject('Persona', persona))) {
      throw new ForbiddenError('Access denied')
    }

    return reply.send(persona)
  })

  /**
   * Update a persona.
   * Performs partial update of persona fields.
   * Requires authentication and ownership verification.
   *
   * @route PUT /api/personas/:id
   * @param request.params.id - Persona UUID
   * @param request.body - Fields to update
   * @returns Updated persona
   */
  fastify.put<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Update a persona',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        role: Type.Optional(Type.String()),
        informationNeed: Type.Optional(Type.String()),
        details: Type.Optional(Type.String()),
        isSystemGenerated: Type.Optional(Type.Boolean()),
        hidden: Type.Optional(Type.Boolean())
      }),
      response: {
        200: PersonaSchema,
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const validatedData = updatePersonaSchema.parse(request.body)

    const existingPersona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!existingPersona) {
      throw new NotFoundError('Persona', id)
    }

    if (!request.ability.can('update', subject('Persona', existingPersona))) {
      throw new ForbiddenError('Cannot update this Persona')
    }

    // Only system_admin may toggle isSystemGenerated; strip it from
    // non-admin updates so a regular user cannot publish their persona to
    // anonymous visitors via the unauthenticated GET /api/personas branch.
    const updatePayload = { ...validatedData }
    if (request.user?.systemRole !== 'system_admin') {
      delete (updatePayload as { isSystemGenerated?: boolean }).isSystemGenerated
    }

    try {
      const persona = await fastify.prisma.persona.update({
        where: { id },
        data: updatePayload
      })
      personaOperationCounter.add(1, { operation: 'update', status: 'success' })
      return reply.send(persona)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundError('Persona', id)
      }
      throw error
    }
  })

  /**
   * Get deletion preview for a persona.
   * Returns counts of items that will be affected when the persona is deleted.
   * Used to show a warning to the user before deletion.
   *
   * @route GET /api/personas/:id/deletion-preview
   * @param request.params.id - Persona UUID
   * @returns Counts of affected items
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id/deletion-preview', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Get deletion preview for a persona',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          typeCount: Type.Number(),
          annotationCount: Type.Number(),
          summaryCount: Type.Number(),
          worldAssignmentCount: Type.Number()
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
    const { id } = request.params
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const persona = await fastify.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })

    if (!persona) {
      throw new NotFoundError('Persona', id)
    }

    if (!request.ability.can('delete', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot access this Persona')
    }

    // Count types in ontology
    const entityTypes = Array.isArray(persona.ontology?.entityTypes) ? persona.ontology.entityTypes : []
    const roleTypes = Array.isArray(persona.ontology?.roleTypes) ? persona.ontology.roleTypes : []
    const eventTypes = Array.isArray(persona.ontology?.eventTypes) ? persona.ontology.eventTypes : []
    const relationTypes = Array.isArray(persona.ontology?.relationTypes) ? persona.ontology.relationTypes : []
    const typeCount = entityTypes.length + roleTypes.length + eventTypes.length + relationTypes.length

    // Count annotations with this personaId
    const annotationCount = await fastify.prisma.annotation.count({
      where: { personaId: id }
    })

    // Count video summaries for this persona
    const summaryCount = await fastify.prisma.videoSummary.count({
      where: { personaId: id }
    })

    // Count world state assignments for this persona
    let worldAssignmentCount = 0
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId: persona.userId, projectId: null }
    })

    if (worldState) {
      // Count Entity.typeAssignments with this personaId
      const entities = (worldState.entities as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const entity of entities) {
        worldAssignmentCount += (entity.typeAssignments || []).filter(a => a.personaId === id).length
      }

      // Count Event.personaInterpretations with this personaId
      const events = (worldState.events as Array<{ personaInterpretations?: Array<{ personaId: string }> }>) || []
      for (const event of events) {
        worldAssignmentCount += (event.personaInterpretations || []).filter(i => i.personaId === id).length
      }

      // Count EntityCollection.typeAssignments with this personaId
      const entityCollections = (worldState.entityCollections as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const collection of entityCollections) {
        worldAssignmentCount += (collection.typeAssignments || []).filter(a => a.personaId === id).length
      }

      // Count EventCollection.typeAssignments with this personaId
      const eventCollections = (worldState.eventCollections as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const collection of eventCollections) {
        worldAssignmentCount += (collection.typeAssignments || []).filter(a => a.personaId === id).length
      }
    }

    return reply.send({
      typeCount,
      annotationCount,
      summaryCount,
      worldAssignmentCount
    })
  })

  /**
   * Delete a persona.
   * Deletes the persona and its associated ontology (cascade).
   * Also cleans up orphaned type assignments in world state.
   * Requires authentication and ownership verification.
   *
   * @route DELETE /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Success message
   */
  fastify.delete<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Delete a persona',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          message: Type.String()
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
    const { id } = request.params
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const existingPersona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!existingPersona) {
      throw new NotFoundError('Persona', id)
    }

    if (!request.ability.can('delete', subject('Persona', existingPersona))) {
      throw new ForbiddenError('Cannot delete this Persona')
    }

    // Clean up world state: remove type assignments and interpretations for this persona
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId: existingPersona.userId, projectId: null }
    })

    if (worldState) {
      // Helper type definitions for world state items
      interface EntityWithAssignments {
        typeAssignments?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }
      interface EventWithInterpretations {
        personaInterpretations?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }
      interface CollectionWithAssignments {
        typeAssignments?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }

      // Clean Entity.typeAssignments
      const entities = (worldState.entities as EntityWithAssignments[]) || []
      const cleanedEntities = entities.map(entity => ({
        ...entity,
        typeAssignments: (entity.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      // Clean Event.personaInterpretations
      const events = (worldState.events as EventWithInterpretations[]) || []
      const cleanedEvents = events.map(event => ({
        ...event,
        personaInterpretations: (event.personaInterpretations || []).filter(i => i.personaId !== id)
      }))

      // Clean EntityCollection.typeAssignments
      const entityCollections = (worldState.entityCollections as CollectionWithAssignments[]) || []
      const cleanedEntityCollections = entityCollections.map(collection => ({
        ...collection,
        typeAssignments: (collection.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      // Clean EventCollection.typeAssignments
      const eventCollections = (worldState.eventCollections as CollectionWithAssignments[]) || []
      const cleanedEventCollections = eventCollections.map(collection => ({
        ...collection,
        typeAssignments: (collection.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      // Update world state with cleaned data
      await fastify.prisma.worldState.update({
        where: { id: worldState.id },
        data: {
          entities: toJson(cleanedEntities),
          events: toJson(cleanedEvents),
          entityCollections: toJson(cleanedEntityCollections),
          eventCollections: toJson(cleanedEventCollections)
        }
      })
    }

    try {
      await fastify.prisma.persona.delete({
        where: { id }
      })
      personaOperationCounter.add(1, { operation: 'delete', status: 'success' })
      return reply.send({ message: 'Persona deleted successfully' })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundError('Persona', id)
      }
      throw error
    }
  })

  /**
   * Get ontology for a specific persona.
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id/ontology', {
    onRequest: [optionalAuth, buildAbilities],
    schema: {
      description: 'Get ontology for a specific persona',
      tags: ['personas', 'ontology'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          entities: Type.Array(Type.Any()),
          roles: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          relationTypes: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String(),
          updatedAt: Type.String()
        }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    const persona = await fastify.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })

    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', id)
    }

    // Unauthenticated: only system personas are visible
    if (!request.user || !request.ability) {
      if (!persona.isSystemGenerated || persona.hidden) {
        throw new NotFoundError('Persona or ontology', id)
      }
    } else if (!request.ability.can('read', subject('Persona', persona))) {
      // FOVEA_DEMO_MODE override: in demo mode every system-
      // generated persona is part of the deployment's public
      // tour catalogue and must be readable by any caller whose
      // CASL ability is scoped to their own data (anonymous demo
      // sessions, non-admin users opening a tour). Without this
      // widening the VideoBrowser cannot fetch the seeded
      // persona's ontology and every video card renders blank.
      if (!isDemoModeEnabled() || !persona.isSystemGenerated) {
        throw new ForbiddenError('Access denied')
      }
    }

    // Map database field names to API field names
    return reply.send({
      id: persona.ontology.id,
      personaId: persona.ontology.personaId,
      entities: persona.ontology.entityTypes || [],
      roles: persona.ontology.roleTypes || [],
      events: persona.ontology.eventTypes || [],
      relationTypes: persona.ontology.relationTypes || [],
      relations: [],
      createdAt: persona.ontology.createdAt.toISOString(),
      updatedAt: persona.ontology.updatedAt.toISOString()
    })
  })

  /**
   * Batch-fetch ontologies for many personas in one round-trip.
   *
   * The VideoBrowser needs every visible persona's ontology on initial load.
   * Fetching them one at a time (GET /api/personas/:id/ontology per persona)
   * turns a single page load into one request per persona, which on a large
   * deployment fans out far enough to trip the rate limit. This endpoint
   * applies the same per-persona read-permission rules as the single GET and
   * returns only the ontologies the caller may read (personas that are missing,
   * have no ontology, or are not readable are simply omitted). Each entry
   * carries its `personaId` so the client can index the result.
   */
  fastify.post<{ Body: { personaIds: string[] } }>('/api/personas/ontologies', {
    onRequest: [optionalAuth, buildAbilities],
    schema: {
      description: 'Batch-fetch ontologies for multiple personas',
      tags: ['personas', 'ontology'],
      body: Type.Object({
        personaIds: Type.Array(Type.String({ format: 'uuid' }), { maxItems: 100000 })
      }),
      response: {
        200: Type.Array(Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          entities: Type.Array(Type.Any()),
          roles: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          relationTypes: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String(),
          updatedAt: Type.String()
        }))
      }
    }
  }, async (request, reply) => {
    const { personaIds } = request.body
    if (personaIds.length === 0) {
      return reply.send([])
    }

    const personas = await fastify.prisma.persona.findMany({
      where: { id: { in: personaIds } },
      include: { ontology: true }
    })

    const ontologies = []
    for (const persona of personas) {
      if (!persona.ontology) continue

      // Mirror the read checks from GET /api/personas/:id/ontology exactly.
      if (!request.user || !request.ability) {
        // Unauthenticated: only visible system personas.
        if (!persona.isSystemGenerated || persona.hidden) continue
      } else if (!request.ability.can('read', subject('Persona', persona))) {
        // Demo mode widens read to seeded system personas (see single GET).
        if (!isDemoModeEnabled() || !persona.isSystemGenerated) continue
      }

      ontologies.push({
        id: persona.ontology.id,
        personaId: persona.ontology.personaId,
        entities: persona.ontology.entityTypes || [],
        roles: persona.ontology.roleTypes || [],
        events: persona.ontology.eventTypes || [],
        relationTypes: persona.ontology.relationTypes || [],
        relations: [],
        createdAt: persona.ontology.createdAt.toISOString(),
        updatedAt: persona.ontology.updatedAt.toISOString()
      })
    }

    return reply.send(ontologies)
  })

  /**
   * Update ontology for a specific persona.
   */
  fastify.put<{ Params: { id: string }; Body: OntologyUpdateBody }>('/api/personas/:id/ontology', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Update ontology for a specific persona',
      tags: ['personas', 'ontology'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        entities: Type.Optional(Type.Array(Type.Any())),
        roles: Type.Optional(Type.Array(Type.Any())),
        events: Type.Optional(Type.Array(Type.Any())),
        relationTypes: Type.Optional(Type.Array(Type.Any())),
        relations: Type.Optional(Type.Array(Type.Any()))
      }),
      response: {
        200: Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          entities: Type.Array(Type.Any()),
          roles: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          relationTypes: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String(),
          updatedAt: Type.String()
        }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const updateData = request.body

    const persona = await fastify.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })

    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', id)
    }

    if (!request.ability.can('update', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot update this Persona')
    }

    // Map API field names to database field names
    const updatedOntology = await fastify.prisma.ontology.update({
      where: { personaId: id },
      data: {
        entityTypes: updateData.entities !== undefined ? (updateData.entities as Prisma.InputJsonValue) : (persona.ontology.entityTypes ?? undefined),
        roleTypes: updateData.roles !== undefined ? (updateData.roles as Prisma.InputJsonValue) : (persona.ontology.roleTypes ?? undefined),
        eventTypes: updateData.events !== undefined ? (updateData.events as Prisma.InputJsonValue) : (persona.ontology.eventTypes ?? undefined),
        relationTypes: updateData.relationTypes !== undefined ? (updateData.relationTypes as Prisma.InputJsonValue) : (persona.ontology.relationTypes ?? undefined)
      }
    })

    // Map database field names back to API field names in response
    return reply.send({
      id: updatedOntology.id,
      personaId: updatedOntology.personaId,
      entities: updatedOntology.entityTypes || [],
      roles: updatedOntology.roleTypes || [],
      events: updatedOntology.eventTypes || [],
      relationTypes: updatedOntology.relationTypes || [],
      relations: [],
      createdAt: updatedOntology.createdAt.toISOString(),
      updatedAt: updatedOntology.updatedAt.toISOString()
    })
  })

  // ==========================================================================
  // Type Deletion Endpoints with Reference Cleanup
  // ==========================================================================

  /**
   * Get deletion preview for an entity type.
   * Returns counts of items that will be affected.
   *
   * @route GET /api/personas/:personaId/ontology/entities/:typeId/deletion-preview
   */
  fastify.get<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/entities/:typeId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for an entity type',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            worldAssignmentCount: Type.Number()
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot access this Persona')
      }

      // Check if type exists
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const targetType = entityTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Entity type', typeId)
      }

      // Count gloss references across all types
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes.filter(t => t.id !== typeId), typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'entity')

      // Count annotations with this typeId
      const annotationCount = await fastify.prisma.annotation.count({
        where: {
          personaId,
          type: 'entity',
          label: typeId
        }
      })

      // Count world state type assignments
      let worldAssignmentCount = 0
      const worldState = await fastify.prisma.worldState.findFirst({
        where: { userId: persona.userId, projectId: null }
      })

      if (worldState) {
        const entities = asEntities(worldState.entities)
        worldAssignmentCount = countTypeAssignments(entities, typeId, personaId)
      }

      return reply.send({
        glossReferences,
        annotationCount,
        worldAssignmentCount
      })
    }
  )

  /**
   * Delete an entity type with reference cleanup.
   * Converts typeRef items in glosses to plain text and clears related annotations/assignments.
   *
   * @route DELETE /api/personas/:personaId/ontology/entities/:typeId
   */
  fastify.delete<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/entities/:typeId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete an entity type with reference cleanup',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              annotations: Type.Number(),
              worldAssignments: Type.Number()
            })
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('delete', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot modify this Persona')
      }

      // Find and remove the type
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const targetType = entityTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Entity type', typeId)
      }

      const typeName = targetType.name
      const updatedEntityTypes = entityTypes.filter(t => t.id !== typeId)

      // Convert typeRefs in glosses across all types
      let glossReferences = 0
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      // Count before updating
      glossReferences += countTypeRefsInGlosses(updatedEntityTypes, typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'entity')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'entity')

      // Update glosses
      const cleanedEntityTypes = updateGlossesInTypes(updatedEntityTypes, typeId, personaId, 'entity', typeName)
      const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'entity', typeName)
      const cleanedEventTypes = updateGlossesInTypes(eventTypes, typeId, personaId, 'entity', typeName)
      const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'entity', typeName)

      // Delete annotations with this type
      const deleteResult = await fastify.prisma.annotation.deleteMany({
        where: {
          personaId,
          type: 'entity',
          label: typeId
        }
      })

      // Clean up world state type assignments
      let worldAssignments = 0
      const worldState = await fastify.prisma.worldState.findFirst({
        where: { userId: persona.userId, projectId: null }
      })

      if (worldState) {
        const entities = asEntities(worldState.entities)
        worldAssignments = countTypeAssignments(entities, typeId, personaId)
        const cleanedEntities = removeTypeAssignmentsFromEntities(entities, typeId, personaId)

        await fastify.prisma.worldState.update({
          where: { id: worldState.id },
          data: {
            entities: toJson(cleanedEntities)
          }
        })
      }

      // Update ontology
      await fastify.prisma.ontology.update({
        where: { personaId },
        data: {
          entityTypes: toJson(cleanedEntityTypes),
          roleTypes: toJson(cleanedRoleTypes),
          eventTypes: toJson(cleanedEventTypes),
          relationTypes: toJson(cleanedRelationTypes)
        }
      })

      return reply.send({
        message: `Entity type "${typeName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          annotations: deleteResult.count,
          worldAssignments
        }
      })
    }
  )

  /**
   * Get deletion preview for a role type.
   */
  fastify.get<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/roles/:typeId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for a role type',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            eventRoleReferences: Type.Number()
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot access this Persona')
      }

      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const targetType = roleTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Role type', typeId)
      }

      // Count gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const eventTypesForGloss = asTypesWithGloss(persona.ontology.eventTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(roleTypes.filter(t => t.id !== typeId), typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(eventTypesForGloss, typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'role')

      // Count annotations with this role type
      const annotationCount = await fastify.prisma.annotation.count({
        where: {
          personaId,
          type: 'role',
          label: typeId
        }
      })

      // Count event types that use this role - need full EventType for roles property
      const eventTypesRaw = persona.ontology.eventTypes
      let eventRoleReferences = 0
      if (Array.isArray(eventTypesRaw)) {
        for (const eventType of eventTypesRaw) {
          if (eventType && typeof eventType === 'object' && 'roles' in eventType) {
            const roles = (eventType as { roles?: Array<{ roleTypeId: string }> }).roles
            if (roles) {
              eventRoleReferences += roles.filter(r => r.roleTypeId === typeId).length
            }
          }
        }
      }

      return reply.send({
        glossReferences,
        annotationCount,
        eventRoleReferences
      })
    }
  )

  /**
   * Delete a role type with reference cleanup.
   */
  fastify.delete<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/roles/:typeId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a role type with reference cleanup',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              annotations: Type.Number(),
              eventRoleReferences: Type.Number()
            })
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('delete', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot modify this Persona')
      }

      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const targetType = roleTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Role type', typeId)
      }

      const typeName = targetType.name
      const updatedRoleTypes = roleTypes.filter(t => t.id !== typeId)

      // Count and update gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const eventTypesForGloss = asTypesWithGloss(persona.ontology.eventTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(updatedRoleTypes, typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(eventTypesForGloss, typeId, personaId, 'role')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'role')

      const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'role', typeName)
      const cleanedRoleTypes = updateGlossesInTypes(updatedRoleTypes, typeId, personaId, 'role', typeName)
      const cleanedEventTypesGloss = updateGlossesInTypes(eventTypesForGloss, typeId, personaId, 'role', typeName)
      const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'role', typeName)

      // Remove role from event type role slots - need full EventType for roles property
      const eventTypesRaw = persona.ontology.eventTypes
      let eventRoleReferences = 0
      let cleanedEventTypes = cleanedEventTypesGloss
      if (Array.isArray(eventTypesRaw)) {
        for (const eventType of eventTypesRaw) {
          if (eventType && typeof eventType === 'object' && 'roles' in eventType) {
            const roles = (eventType as { roles?: Array<{ roleTypeId: string }> }).roles
            if (roles) {
              eventRoleReferences += roles.filter(r => r.roleTypeId === typeId).length
            }
          }
        }
        // Update cleanedEventTypes to also remove role references
        cleanedEventTypes = cleanedEventTypesGloss.map(et => {
          const rawEvent = eventTypesRaw.find(raw =>
            raw && typeof raw === 'object' && 'id' in raw && (raw as { id: string }).id === et.id
          )
          if (rawEvent && typeof rawEvent === 'object' && 'roles' in rawEvent) {
            const roles = (rawEvent as { roles?: Array<{ roleTypeId: string }> }).roles
            if (roles) {
              return { ...et, roles: roles.filter(r => r.roleTypeId !== typeId) }
            }
          }
          return et
        })
      }

      // Delete annotations
      const deleteResult = await fastify.prisma.annotation.deleteMany({
        where: {
          personaId,
          type: 'role',
          label: typeId
        }
      })

      // Update ontology
      await fastify.prisma.ontology.update({
        where: { personaId },
        data: {
          entityTypes: toJson(cleanedEntityTypes),
          roleTypes: toJson(cleanedRoleTypes),
          eventTypes: toJson(cleanedEventTypes),
          relationTypes: toJson(cleanedRelationTypes)
        }
      })

      return reply.send({
        message: `Role type "${typeName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          annotations: deleteResult.count,
          eventRoleReferences
        }
      })
    }
  )

  /**
   * Get deletion preview for an event type.
   */
  fastify.get<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/events/:typeId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for an event type',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            annotationCount: Type.Number(),
            worldInterpretationCount: Type.Number()
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot access this Persona')
      }

      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)
      const targetType = eventTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Event type', typeId)
      }

      // Count gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(eventTypes.filter(t => t.id !== typeId), typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'event')

      // Count annotations
      const annotationCount = await fastify.prisma.annotation.count({
        where: {
          personaId,
          type: 'event',
          label: typeId
        }
      })

      // Count world state event interpretations
      let worldInterpretationCount = 0
      const worldState = await fastify.prisma.worldState.findFirst({
        where: { userId: persona.userId, projectId: null }
      })

      if (worldState) {
        const events = asEvents(worldState.events)
        worldInterpretationCount = countEventInterpretations(events, typeId, personaId)
      }

      return reply.send({
        glossReferences,
        annotationCount,
        worldInterpretationCount
      })
    }
  )

  /**
   * Delete an event type with reference cleanup.
   */
  fastify.delete<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/events/:typeId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete an event type with reference cleanup',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number(),
              annotations: Type.Number(),
              worldInterpretations: Type.Number()
            })
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('delete', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot modify this Persona')
      }

      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)
      const targetType = eventTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Event type', typeId)
      }

      const typeName = targetType.name
      const updatedEventTypes = eventTypes.filter(t => t.id !== typeId)

      // Count and update gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(updatedEventTypes, typeId, personaId, 'event')
      glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'event')

      const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'event', typeName)
      const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'event', typeName)
      const cleanedEventTypes = updateGlossesInTypes(updatedEventTypes, typeId, personaId, 'event', typeName)
      const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'event', typeName)

      // Delete annotations
      const deleteResult = await fastify.prisma.annotation.deleteMany({
        where: {
          personaId,
          type: 'event',
          label: typeId
        }
      })

      // Clean up world state event interpretations
      let worldInterpretations = 0
      const worldState = await fastify.prisma.worldState.findFirst({
        where: { userId: persona.userId, projectId: null }
      })

      if (worldState) {
        const events = asEvents(worldState.events)
        worldInterpretations = countEventInterpretations(events, typeId, personaId)
        const cleanedEvents = removeEventInterpretationsFromEvents(events, typeId, personaId)

        await fastify.prisma.worldState.update({
          where: { id: worldState.id },
          data: {
            events: toJson(cleanedEvents)
          }
        })
      }

      // Update ontology
      await fastify.prisma.ontology.update({
        where: { personaId },
        data: {
          entityTypes: toJson(cleanedEntityTypes),
          roleTypes: toJson(cleanedRoleTypes),
          eventTypes: toJson(cleanedEventTypes),
          relationTypes: toJson(cleanedRelationTypes)
        }
      })

      return reply.send({
        message: `Event type "${typeName}" deleted successfully`,
        cleanedUp: {
          glossReferences,
          annotations: deleteResult.count,
          worldInterpretations
        }
      })
    }
  )

  /**
   * Get deletion preview for a relation type.
   */
  fastify.get<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/relation-types/:typeId/deletion-preview',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get deletion preview for a relation type',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            glossReferences: Type.Number(),
            relationInstanceCount: Type.Number()
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot access this Persona')
      }

      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)
      const targetType = relationTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Relation type', typeId)
      }

      // Count gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(relationTypes.filter(t => t.id !== typeId), typeId, personaId, 'relation')

      // Note: Relation instances would need to be stored somewhere to count them
      // For now, we return 0 as they're handled client-side
      const relationInstanceCount = 0

      return reply.send({
        glossReferences,
        relationInstanceCount
      })
    }
  )

  /**
   * Delete a relation type with reference cleanup.
   */
  fastify.delete<{ Params: { personaId: string; typeId: string } }>(
    '/api/personas/:personaId/ontology/relation-types/:typeId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a relation type with reference cleanup',
        tags: ['personas', 'ontology'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          typeId: Type.String()
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            cleanedUp: Type.Object({
              glossReferences: Type.Number()
            })
          }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { personaId, typeId } = request.params

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        include: { ontology: true }
      })

      if (!persona || !persona.ontology) {
        throw new NotFoundError('Persona or ontology', personaId)
      }

      if (!request.ability) throw new ForbiddenError('No abilities defined')
      if (!request.ability.can('delete', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot modify this Persona')
      }

      const relationTypes = asTypesWithGloss(persona.ontology.relationTypes)
      const targetType = relationTypes.find(t => t.id === typeId)
      if (!targetType) {
        throw new NotFoundError('Relation type', typeId)
      }

      const typeName = targetType.name
      const updatedRelationTypes = relationTypes.filter(t => t.id !== typeId)

      // Count and update gloss references
      const entityTypes = asTypesWithGloss(persona.ontology.entityTypes)
      const roleTypes = asTypesWithGloss(persona.ontology.roleTypes)
      const eventTypes = asTypesWithGloss(persona.ontology.eventTypes)

      let glossReferences = 0
      glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'relation')
      glossReferences += countTypeRefsInGlosses(updatedRelationTypes, typeId, personaId, 'relation')

      const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'relation', typeName)
      const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'relation', typeName)
      const cleanedEventTypes = updateGlossesInTypes(eventTypes, typeId, personaId, 'relation', typeName)
      const cleanedRelationTypes = updateGlossesInTypes(updatedRelationTypes, typeId, personaId, 'relation', typeName)

      // Update ontology
      await fastify.prisma.ontology.update({
        where: { personaId },
        data: {
          entityTypes: toJson(cleanedEntityTypes),
          roleTypes: toJson(cleanedRoleTypes),
          eventTypes: toJson(cleanedEventTypes),
          relationTypes: toJson(cleanedRelationTypes)
        }
      })

      return reply.send({
        message: `Relation type "${typeName}" deleted successfully`,
        cleanedUp: {
          glossReferences
        }
      })
    }
  )
}

export default personasRoute
