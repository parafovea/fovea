import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireAuth, optionalAuth } from '@middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { personaOperationCounter } from '../metrics.js'
import { PersonaRepository } from '../repositories/PersonaRepository.js'
import { PersonaService } from '../services/persona-service.js'

/**
 * Nullable-string helper for response schemas. Using Type.Unsafe with the
 * array type form keeps null values from being coerced to "" by
 * fast-json-stringify.
 */
const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })

/**
 * TypeBox schema for Persona response.
 * Defines the structure of persona data returned by the API.
 */
const PersonaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1 }),
  role: Type.String(),
  informationNeed: Type.String(),
  details: NullableString,
  projectId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  isSystemGenerated: Type.Boolean(),
  hidden: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/** TypeBox schema for the API ontology response shape. */
const OntologyResponseSchema = Type.Object({
  id: Type.String(),
  personaId: Type.String(),
  entities: Type.Array(Type.Any()),
  roles: Type.Array(Type.Any()),
  events: Type.Array(Type.Any()),
  relationTypes: Type.Array(Type.Any()),
  relations: Type.Array(Type.Any()),
  createdAt: Type.String(),
  updatedAt: Type.String()
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
 *
 * Routes perform HTTP concerns only: schema validation, request parsing, and
 * dispatch to a per-request PersonaService that owns business rules and RBAC.
 * The PersonaRepository owns all Prisma access.
 *
 * Routes:
 * - GET /api/personas - List personas
 * - POST /api/personas - Create a persona with an empty ontology
 * - GET /api/personas/:id - Get a persona
 * - PUT /api/personas/:id - Update a persona
 * - GET /api/personas/:id/deletion-preview - Preview a persona deletion
 * - DELETE /api/personas/:id - Delete a persona
 * - GET /api/personas/:id/ontology - Get a persona's ontology
 * - POST /api/personas/ontologies - Batch-fetch ontologies
 * - PUT /api/personas/:id/ontology - Update a persona's ontology
 * - GET/DELETE the entity/role/event/relation-type endpoints with cleanup
 */
const personasRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: one repository for the plugin's lifetime.
  const repository = new PersonaRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id and system role.
   */
  const serviceFor = (request: FastifyRequest): PersonaService =>
    new PersonaService(
      repository,
      request.ability ?? null,
      request.user?.id,
      request.user?.systemRole ?? undefined
    )

  /**
   * List personas visible to the caller.
   *
   * @route GET /api/personas
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
    const service = serviceFor(request)
    const personas = await service.list()
    return reply.send(personas)
  })

  /**
   * Create a persona and its empty ontology in one call.
   *
   * @route POST /api/personas
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
    const validatedData = createPersonaSchema.parse(request.body)
    const service = serviceFor(request)
    const persona = await service.create(validatedData)
    personaOperationCounter.add(1, { operation: 'create', status: 'success' })
    return reply.code(201).send(persona)
  })

  /**
   * Get a persona by ID.
   *
   * @route GET /api/personas/:id
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
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const persona = await service.getById(request.params.id)
    return reply.send(persona)
  })

  /**
   * Update a persona.
   *
   * @route PUT /api/personas/:id
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
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const validatedData = updatePersonaSchema.parse(request.body)
    const service = serviceFor(request)
    const persona = await service.update(request.params.id, validatedData)
    personaOperationCounter.add(1, { operation: 'update', status: 'success' })
    return reply.send(persona)
  })

  /**
   * Get a deletion preview for a persona.
   *
   * @route GET /api/personas/:id/deletion-preview
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
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const preview = await service.getDeletionPreview(request.params.id)
    return reply.send(preview)
  })

  /**
   * Delete a persona and clean its world-state references.
   *
   * @route DELETE /api/personas/:id
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
        200: Type.Object({ message: Type.String() }),
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    await service.delete(request.params.id)
    personaOperationCounter.add(1, { operation: 'delete', status: 'success' })
    return reply.send({ message: 'Persona deleted successfully' })
  })

  /**
   * Get a persona's ontology.
   *
   * @route GET /api/personas/:id/ontology
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
        200: OntologyResponseSchema,
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const ontology = await service.getOntology(request.params.id)
    return reply.send(ontology)
  })

  /**
   * Batch-fetch ontologies for many personas in one round-trip.
   *
   * @route POST /api/personas/ontologies
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
        200: Type.Array(OntologyResponseSchema)
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const ontologies = await service.getOntologies(request.body.personaIds)
    return reply.send(ontologies)
  })

  /**
   * Update a persona's ontology.
   *
   * @route PUT /api/personas/:id/ontology
   */
  fastify.put<{ Params: { id: string }; Body: {
    entities?: unknown[]
    roles?: unknown[]
    events?: unknown[]
    relationTypes?: unknown[]
    relations?: unknown[]
  } }>('/api/personas/:id/ontology', {
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
        200: OntologyResponseSchema,
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const ontology = await service.updateOntology(request.params.id, request.body)
    return reply.send(ontology)
  })

  // ==========================================================================
  // Type Deletion Endpoints with Reference Cleanup
  // ==========================================================================

  /**
   * Deletion preview for an entity type.
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.getEntityTypeDeletionPreview(personaId, typeId))
    }
  )

  /**
   * Delete an entity type with reference cleanup.
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.deleteEntityType(personaId, typeId))
    }
  )

  /**
   * Deletion preview for a role type.
   *
   * @route GET /api/personas/:personaId/ontology/roles/:typeId/deletion-preview
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.getRoleTypeDeletionPreview(personaId, typeId))
    }
  )

  /**
   * Delete a role type with reference cleanup.
   *
   * @route DELETE /api/personas/:personaId/ontology/roles/:typeId
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.deleteRoleType(personaId, typeId))
    }
  )

  /**
   * Deletion preview for an event type.
   *
   * @route GET /api/personas/:personaId/ontology/events/:typeId/deletion-preview
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.getEventTypeDeletionPreview(personaId, typeId))
    }
  )

  /**
   * Delete an event type with reference cleanup.
   *
   * @route DELETE /api/personas/:personaId/ontology/events/:typeId
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.deleteEventType(personaId, typeId))
    }
  )

  /**
   * Deletion preview for a relation type.
   *
   * @route GET /api/personas/:personaId/ontology/relation-types/:typeId/deletion-preview
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.getRelationTypeDeletionPreview(personaId, typeId))
    }
  )

  /**
   * Delete a relation type with reference cleanup.
   *
   * @route DELETE /api/personas/:personaId/ontology/relation-types/:typeId
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
      const service = serviceFor(request)
      const { personaId, typeId } = request.params
      return reply.send(await service.deleteRelationType(personaId, typeId))
    }
  )
}

export default personasRoute
