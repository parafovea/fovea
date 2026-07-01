import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { subject } from '@casl/ability'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'
import { buildAbilities } from '../middleware/abilities.js'
import { NotFoundError, UnauthorizedError, InternalError, ForbiddenError, AppError } from '../lib/errors.js'
import { isSingleUserMode } from '../services/user-service.js'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../lib/fetchModelService.js'
import { mergeById } from '../services/world-state-service.js'
import { PersonaRepository } from '../repositories/PersonaRepository.js'
import { WorldStateRepository } from '../repositories/WorldStateRepository.js'
import camelcaseKeys from 'camelcase-keys'

/**
 * TypeBox schemas for ontology responses.
 */
const PersonaSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  role: Type.String(),
  informationNeed: Type.String(),
  details: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

const PersonaOntologySchema = Type.Object({
  id: Type.String(),
  personaId: Type.String(),
  entities: Type.Array(Type.Unknown()),
  roles: Type.Array(Type.Unknown()),
  events: Type.Array(Type.Unknown()),
  relationTypes: Type.Array(Type.Unknown()),
  relations: Type.Array(Type.Unknown()),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

const WorldSchema = Type.Object({
  entities: Type.Array(Type.Unknown()),
  events: Type.Array(Type.Unknown()),
  times: Type.Array(Type.Unknown()),
  entityCollections: Type.Array(Type.Unknown()),
  eventCollections: Type.Array(Type.Unknown()),
  timeCollections: Type.Array(Type.Unknown()),
  relations: Type.Array(Type.Unknown())
})

/**
 * Fastify plugin for ontology-related routes.
 * Provides endpoints for retrieving and saving ontology data in a format compatible with the frontend.
 *
 * Routes:
 * - GET /api/ontology - Get all personas and their ontologies
 * - PUT /api/ontology - Save ontology data (personas and ontologies)
 * - POST /api/ontology/augment - Generate AI-powered type suggestions
 */
const ontologyRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: one repository each for the plugin's lifetime. These
  // own the updatedAt-guarded optimistic merges the combined save routes
  // through so concurrent edits do not clobber each other.
  const personaRepository = new PersonaRepository(fastify.prisma)
  const worldStateRepository = new WorldStateRepository(fastify.prisma)

  /**
   * Get all personas, their ontologies, and world state.
   * Returns data in the multi-persona format expected by the frontend.
   * In multi-user mode, filters personas and world state by authenticated user.
   * In single-user mode, uses default user.
   *
   * @route GET /api/ontology
   * @returns Object with personas, personaOntologies, and world state
   */
  fastify.get('/api/ontology', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Retrieve all personas, their ontologies, and world state',
      tags: ['ontology'],
      response: {
        200: Type.Object({
          personas: Type.Array(PersonaSchema),
          personaOntologies: Type.Array(PersonaOntologySchema),
          world: Type.Optional(WorldSchema)
        }),
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    // Get user ID: use authenticated user or find default user in single-user mode
    let userId: string
    if (request.user) {
      userId = request.user.id
    } else if (isSingleUserMode()) {
      // Find default user
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: config.defaultUser.username }
      })
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      userId = defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }

    // Fetch personas for this user with their ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: { userId },
      include: {
        ontology: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Fetch personal world state for this user (projectId: null)
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })

    // Transform to frontend format
    const personasData = personas.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      informationNeed: p.informationNeed,
      details: p.details,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }))

    const ontologiesData = personas
      .filter(p => p.ontology)
      .map(p => ({
        id: p.ontology!.id,
        personaId: p.id,
        entities: p.ontology!.entityTypes || [],
        roles: p.ontology!.roleTypes || [],
        events: p.ontology!.eventTypes || [],
        relationTypes: p.ontology!.relationTypes || [],
        relations: [],
        createdAt: p.ontology!.createdAt.toISOString(),
        updatedAt: p.ontology!.updatedAt.toISOString()
      }))

    const worldData = worldState ? {
      entities: (worldState.entities as Prisma.JsonArray) || [],
      events: (worldState.events as Prisma.JsonArray) || [],
      times: (worldState.times as Prisma.JsonArray) || [],
      entityCollections: (worldState.entityCollections as Prisma.JsonArray) || [],
      eventCollections: (worldState.eventCollections as Prisma.JsonArray) || [],
      timeCollections: (worldState.timeCollections as Prisma.JsonArray) || [],
      relations: (worldState.relations as Prisma.JsonArray) || []
    } : {
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: []
    }

    return reply.send({
      personas: personasData,
      personaOntologies: ontologiesData,
      world: worldData
    })
  })

  /**
   * Save ontology data (personas, ontologies, and world state).
   * Creates or updates personas, their associated ontologies, and world state.
   * In multi-user mode, saves to authenticated user's data.
   * In single-user mode, uses default user.
   *
   * @route PUT /api/ontology
   * @param ontology - Ontology data with personas, personaOntologies, and world state
   * @returns Saved ontology data
   */
  fastify.put('/api/ontology', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Save ontology data including world state',
      tags: ['ontology'],
      body: Type.Object({
        personas: Type.Array(Type.Unknown()),
        personaOntologies: Type.Array(Type.Unknown()),
        world: Type.Optional(WorldSchema)
      }),
      response: {
        200: Type.Object({
          personas: Type.Array(PersonaSchema),
          personaOntologies: Type.Array(PersonaOntologySchema),
          world: Type.Optional(WorldSchema)
        }),
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    // Get user ID: use authenticated user or find default user in single-user mode
    let userId: string
    if (request.user) {
      userId = request.user.id
    } else if (isSingleUserMode()) {
      // Find default user
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: config.defaultUser.username }
      })
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      userId = defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }

    interface PersonaInput {
      id: string
      name: string
      role: string
      informationNeed: string
      details?: string
    }

    interface OntologyInput {
      personaId: string
      entities?: Prisma.InputJsonValue[]
      roles?: Prisma.InputJsonValue[]
      events?: Prisma.InputJsonValue[]
      relationTypes?: Prisma.InputJsonValue[]
    }

    interface WorldInput {
      entities: Prisma.InputJsonValue[]
      events: Prisma.InputJsonValue[]
      times: Prisma.InputJsonValue[]
      entityCollections: Prisma.InputJsonValue[]
      eventCollections: Prisma.InputJsonValue[]
      timeCollections: Prisma.InputJsonValue[]
      relations: Prisma.InputJsonValue[]
    }

    const { personas, personaOntologies, world } = request.body as {
      personas: PersonaInput[]
      personaOntologies: OntologyInput[]
      world?: WorldInput
    }

    // This multi-entity save merges ontology types and personal world state by
    // id instead of overwriting whole columns, under optimistic concurrency, so
    // concurrent edits (rapid edits, an AI augmentation, or a second tab) do not
    // clobber each other. Removals go through the explicit type/object deletion
    // routes, never omission. Personas carry only scalar fields and so are safe
    // to upsert directly. The ontology and world writes each self-retry on an
    // updatedAt-guarded conflict, which is why a single raw transaction is no
    // longer used: correctness (no lost updates) takes priority over wrapping
    // all writes in one atomic statement.
    try {
      const savedPersonas = []
      const savedOntologies = []

      // Save all personas for this user, verifying RBAC on existing ones
      for (const persona of personas) {
        const existing = await fastify.prisma.persona.findUnique({ where: { id: persona.id } })
        if (existing) {
          if (!request.ability!.can('update', subject('Persona', existing))) {
            throw new ForbiddenError('Cannot update persona ' + persona.id)
          }
        }
        const savedPersona = await fastify.prisma.persona.upsert({
          where: { id: persona.id },
          update: {
            name: persona.name,
            role: persona.role,
            informationNeed: persona.informationNeed,
            details: persona.details
          },
          create: {
            id: persona.id,
            name: persona.name,
            role: persona.role,
            informationNeed: persona.informationNeed,
            details: persona.details,
            userId: userId
          }
        })
        savedPersonas.push(savedPersona)
      }

      // Save all ontologies, verifying the caller can update the owning persona.
      // Each provided array is merged into the current row by id under
      // optimistic concurrency; a row that does not exist yet is created.
      for (const ontology of personaOntologies) {
        const owningPersona = await fastify.prisma.persona.findUnique({ where: { id: ontology.personaId } })
        if (!owningPersona) {
          throw new NotFoundError('Persona', ontology.personaId)
        }
        if (!request.ability!.can('update', subject('Persona', owningPersona))) {
          throw new ForbiddenError('Cannot modify ontology for persona ' + ontology.personaId)
        }

        let savedOntology
        const existingOntology = await fastify.prisma.ontology.findUnique({
          where: { personaId: ontology.personaId }
        })
        if (existingOntology) {
          savedOntology = await personaRepository.updateOntologyOptimistic(ontology.personaId, (current) => ({
            entityTypes: ontology.entities !== undefined ? mergeById(current.entityTypes, ontology.entities) : undefined,
            roleTypes: ontology.roles !== undefined ? mergeById(current.roleTypes, ontology.roles) : undefined,
            eventTypes: ontology.events !== undefined ? mergeById(current.eventTypes, ontology.events) : undefined,
            relationTypes: ontology.relationTypes !== undefined ? mergeById(current.relationTypes, ontology.relationTypes) : undefined,
          }))
        } else {
          savedOntology = await fastify.prisma.ontology.create({
            data: {
              personaId: ontology.personaId,
              entityTypes: ontology.entities || [],
              roleTypes: ontology.roles || [],
              eventTypes: ontology.events || [],
              relationTypes: ontology.relationTypes || []
            }
          })
        }
        savedOntologies.push({
          id: savedOntology.id,
          personaId: savedOntology.personaId,
          entities: savedOntology.entityTypes,
          roles: savedOntology.roleTypes,
          events: savedOntology.eventTypes,
          relationTypes: savedOntology.relationTypes,
          relations: [],
          createdAt: savedOntology.createdAt.toISOString(),
          updatedAt: savedOntology.updatedAt.toISOString()
        })
      }

      // Save world state if provided (for this user). Merge each array by id
      // under optimistic concurrency; create an empty-seeded row if none exists.
      let savedWorldState = null
      if (world) {
        const existingWorld = await fastify.prisma.worldState.findFirst({
          where: { userId, projectId: null }
        })

        if (existingWorld) {
          savedWorldState = await worldStateRepository.updatePersonalWorldStateOptimistic(userId, (current) => ({
            entities: world.entities !== undefined ? mergeById(current.entities, world.entities) : undefined,
            events: world.events !== undefined ? mergeById(current.events, world.events) : undefined,
            times: world.times !== undefined ? mergeById(current.times, world.times) : undefined,
            entityCollections: world.entityCollections !== undefined ? mergeById(current.entityCollections, world.entityCollections) : undefined,
            eventCollections: world.eventCollections !== undefined ? mergeById(current.eventCollections, world.eventCollections) : undefined,
            timeCollections: world.timeCollections !== undefined ? mergeById(current.timeCollections, world.timeCollections) : undefined,
            relations: world.relations !== undefined ? mergeById(current.relations, world.relations) : undefined,
          }))
        } else {
          savedWorldState = await fastify.prisma.worldState.create({
            data: {
              userId,
              entities: world.entities || [],
              events: world.events || [],
              times: world.times || [],
              entityCollections: world.entityCollections || [],
              eventCollections: world.eventCollections || [],
              timeCollections: world.timeCollections || [],
              relations: world.relations || []
            }
          })
        }
      }

      const result = { savedPersonas, savedOntologies, savedWorldState }

      const worldData = result.savedWorldState ? {
        entities: (result.savedWorldState.entities as Prisma.JsonArray) || [],
        events: (result.savedWorldState.events as Prisma.JsonArray) || [],
        times: (result.savedWorldState.times as Prisma.JsonArray) || [],
        entityCollections: (result.savedWorldState.entityCollections as Prisma.JsonArray) || [],
        eventCollections: (result.savedWorldState.eventCollections as Prisma.JsonArray) || [],
        timeCollections: (result.savedWorldState.timeCollections as Prisma.JsonArray) || [],
        relations: (result.savedWorldState.relations as Prisma.JsonArray) || []
      } : undefined

      return reply.send({
        personas: result.savedPersonas.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          informationNeed: p.informationNeed,
          details: p.details,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString()
        })),
        personaOntologies: result.savedOntologies,
        world: worldData
      })
    } catch (error: unknown) {
      // Re-throw AppError so the global handler returns the proper status
      // (403 for ability denials, 404 for not-found); without this the
      // catch collapsed every error including ForbiddenError into a 500.
      if (error instanceof AppError) throw error
      fastify.log.error({ error }, 'Error saving ontology data')
      if (error instanceof Error) {
        fastify.log.error(`Error name: ${error.name}`)
        fastify.log.error(`Error message: ${error.message}`)
        // Log Prisma-specific error details if available
        if ('code' in error) {
          fastify.log.error(`Prisma error code: ${(error as Record<string, unknown>).code}`)
        }
        if ('meta' in error) {
          fastify.log.error(`Prisma error meta: ${JSON.stringify((error as Record<string, unknown>).meta)}`)
        }
      }
      // Re-throw to the global handler, which returns a safe generic 500. The
      // raw error message (which can carry DB/internal detail) is logged above
      // but never sent to the client.
      throw new InternalError('Failed to save ontology data')
    }
  })

  /**
   * Generate AI-powered type suggestions for ontology augmentation.
   *
   * @route POST /api/ontology/augment
   * @body AugmentRequest - Augmentation parameters
   * @returns Suggested ontology types with reasoning
   */
  fastify.post('/api/ontology/augment', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Generate AI-powered ontology type suggestions',
      tags: ['ontology'],
      body: Type.Object({
        personaId: Type.String({ format: 'uuid' }),
        domain: Type.String({ minLength: 1 }),
        existingTypes: Type.Optional(Type.Array(Type.String())),
        targetCategory: Type.Union([
          Type.Literal('entity'),
          Type.Literal('event'),
          Type.Literal('role'),
          Type.Literal('relation')
        ]),
        maxSuggestions: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
      }),
      response: {
        200: Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          targetCategory: Type.String(),
          suggestions: Type.Array(Type.Object({
            name: Type.String(),
            description: Type.String(),
            parent: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            confidence: Type.Number(),
            examples: Type.Array(Type.String())
          })),
          reasoning: Type.String()
        }),
        400: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() }),
        502: Type.Object({ error: Type.String(), message: Type.Optional(Type.String()) }),
        504: Type.Object({ error: Type.String(), message: Type.Optional(Type.String()) })
      }
    }
  }, async (request, reply) => {
    try {
      const { personaId, domain, existingTypes = [], targetCategory, maxSuggestions = 10 } = request.body as {
        personaId: string
        domain: string
        existingTypes?: string[]
        targetCategory: 'entity' | 'event' | 'role' | 'relation'
        maxSuggestions?: number
      }

      // Verify persona exists
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId }
      })

      if (!persona) {
        throw new NotFoundError('Persona', personaId)
      }

      if (!request.ability!.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot access persona ' + personaId)
      }

      // Call model service
      const modelServiceUrl = config.modelService.url
      const response = await fetchModelService(`${modelServiceUrl}/api/ontology/augment`, {
        method: 'POST',
        timeoutMs: MODEL_SERVICE_TIMEOUTS.ontologyAugment,
        body: {
          persona_id: personaId,
          domain,
          existing_types: existingTypes,
          target_category: targetCategory,
          max_suggestions: maxSuggestions,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        fastify.log.error({ status: response.status, error: errorText }, 'Model service error')
        const statusCode = response.status === 400 ? 400 : 500
        return reply.code(statusCode).send({
          error: `Model service error: ${errorText}`
        })
      }

      // Model-service responses are snake_case (Pydantic default) but this
      // route's response schema is camelCase (e.g. `personaId`, `targetCategory`).
      // Without this transform, fast-json-stringify's response serialization
      // throws "personaId is required" because the model-service body carries
      // `persona_id` and the schema validator can't find the camelCase key.
      // Surfaces as a 500 INTERNAL_ERROR to the frontend with no useful
      // payload, which is exactly the regression model-service-coverage.spec.ts
      // is now locked down to catch.
      const rawResult = (await response.json()) as Record<string, unknown>
      const result = camelcaseKeys(rawResult, { deep: true })

      return reply.send(result)
    } catch (error) {
      // Re-throw AppError so authorization checks (NotFoundError /
      // ForbiddenError from ability gates) surface as their proper status
      // rather than 500.
      if (error instanceof AppError) throw error
      if (error instanceof ModelServiceTimeoutError) {
        fastify.log.error({ endpoint: error.endpoint, timeoutMs: error.timeoutMs }, 'Model service ontology augment timed out')
        return reply.code(504).send({ error: 'MODEL_SERVICE_TIMEOUT', message: error.message })
      }
      if (error instanceof ModelServiceUnreachableError) {
        fastify.log.error({ endpoint: error.endpoint, cause: error.cause.message }, 'Model service ontology augment unreachable')
        return reply.code(502).send({ error: 'MODEL_SERVICE_UNREACHABLE', message: error.message })
      }
      fastify.log.error(error, 'Error generating ontology suggestions')
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to generate suggestions'
      })
    }
  })
}

export default ontologyRoute
