import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { optionalAuth } from '../middleware/auth.js'
import { NotFoundError, UnauthorizedError, InternalError } from '../lib/errors.js'

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
    onRequest: [optionalAuth],
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

    // Fetch personas for this user with their ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: { userId },
      include: {
        ontology: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Fetch world state for this user
    const worldState = await fastify.prisma.worldState.findUnique({
      where: { userId }
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
    onRequest: [optionalAuth],
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

    // Use a transaction to ensure atomicity - either all saves succeed or all fail
    try {
      const result = await fastify.prisma.$transaction(async (tx) => {
        const savedPersonas = []
        const savedOntologies = []

      // Save all personas for this user
      for (const persona of personas) {
        const savedPersona = await tx.persona.upsert({
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

      // Save all ontologies
      for (const ontology of personaOntologies) {
        const savedOntology = await tx.ontology.upsert({
          where: { personaId: ontology.personaId },
          update: {
            entityTypes: ontology.entities || [],
            roleTypes: ontology.roles || [],
            eventTypes: ontology.events || [],
            relationTypes: ontology.relationTypes || []
          },
          create: {
            personaId: ontology.personaId,
            entityTypes: ontology.entities || [],
            roleTypes: ontology.roles || [],
            eventTypes: ontology.events || [],
            relationTypes: ontology.relationTypes || []
          }
        })
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

      // Save world state if provided (for this user)
      let savedWorldState = null
      if (world) {
        savedWorldState = await tx.worldState.upsert({
          where: { userId },
          create: {
            userId,
            entities: world.entities || [],
            events: world.events || [],
            times: world.times || [],
            entityCollections: world.entityCollections || [],
            eventCollections: world.eventCollections || [],
            timeCollections: world.timeCollections || [],
            relations: world.relations || []
          },
          update: {
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

        return { savedPersonas, savedOntologies, savedWorldState }
      })

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
      fastify.log.error({ error }, 'Error saving ontology data')
      if (error instanceof Error) {
        fastify.log.error(`Error name: ${error.name}`)
        fastify.log.error(`Error message: ${error.message}`)
        // Log Prisma-specific error details if available
        if ('code' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error type requires any for dynamic properties
          fastify.log.error(`Prisma error code: ${(error as any).code}`)
        }
        if ('meta' in error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error type requires any for dynamic properties
          fastify.log.error(`Prisma error meta: ${JSON.stringify((error as any).meta)}`)
        }
      }
      return reply.code(500).send({
        error: 'Failed to save ontology data',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
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
    onRequest: [optionalAuth],
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
        500: Type.Object({ error: Type.String() })
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

      // Call model service
      const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'
      const response = await fetch(`${modelServiceUrl}/api/ontology/augment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: personaId,
          domain,
          existing_types: existingTypes,
          target_category: targetCategory,
          max_suggestions: maxSuggestions
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        fastify.log.error({ status: response.status, error: errorText }, 'Model service error')
        const statusCode = response.status === 400 ? 400 : 500
        return reply.code(statusCode).send({
          error: `Model service error: ${errorText}`
        })
      }

      const result = await response.json()

      return reply.send(result)
    } catch (error) {
      fastify.log.error(error, 'Error generating ontology suggestions')
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to generate suggestions'
      })
    }
  })
}

export default ontologyRoute
