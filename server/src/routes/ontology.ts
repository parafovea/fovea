import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { subject } from '@casl/ability'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'
import { buildAbilities } from '../middleware/abilities.js'
import { NotFoundError, ForbiddenError, AppError } from '../lib/errors.js'
import { GraphRepository } from '../repositories/GraphRepository.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'
import {
  OntologyLayersService,
  type OntologySaveInput,
} from '../services/ontology-layers-service.js'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../lib/fetchModelService.js'
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
  // Request-independent: repositories for the plugin's lifetime.
  const graphRepo = new GraphRepository(fastify.prisma)
  const ontologyRepo = new LayersOntologyRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id.
   */
  const serviceFor = (request: FastifyRequest): OntologyLayersService =>
    new OntologyLayersService(
      graphRepo,
      ontologyRepo,
      fastify.prisma,
      request.ability ?? null,
      request.user?.id
    )

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
    const service = serviceFor(request)
    const bundle = await service.getBundle()
    return reply.send(bundle)
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
    const service = serviceFor(request)
    try {
      const bundle = await service.saveBundle(request.body as OntologySaveInput)
      return reply.send(bundle)
    } catch (error: unknown) {
      // Re-throw AppError so the global handler returns the proper status
      // (403 for ability denials, 404 for not-found); without this the
      // catch collapsed every error including ForbiddenError into a 500.
      if (error instanceof AppError) throw error
      fastify.log.error({ error }, 'Error saving ontology data')
      return reply.code(500).send({
        error: 'Failed to save ontology data'
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
