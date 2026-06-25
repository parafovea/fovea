/**
 * API routes for claims and subclaims operations.
 *
 * Routes perform HTTP concerns only: schema validation, request parsing, and
 * dispatch to a per-request ClaimService that owns business rules and CASL
 * authorization. The ClaimRepository owns all Prisma access.
 *
 * Endpoints for creating, retrieving, updating, and deleting atomic claims
 * extracted from video summaries, queueing extraction and synthesis jobs, and
 * managing typed relations between claims. Supports hierarchical subclaims.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { ErrorResponseSchema } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { ClaimRepository } from '../repositories/ClaimRepository.js'
import { ClaimService } from '../services/claim-service.js'

/**
 * Gloss item schema
 */
const GlossItemSchema = Type.Object({
  type: Type.Union([
    Type.Literal('text'),
    Type.Literal('typeRef'),
    Type.Literal('objectRef'),
    Type.Literal('annotationRef'),
    Type.Literal('claimRef')
  ]),
  content: Type.String(),
  refType: Type.Optional(Type.String()),
  refPersonaId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  refClaimId: Type.Optional(Type.String({ format: 'uuid' }))
})

/**
 * Text span schema
 */
const ClaimTextSpanSchema = Type.Object({
  sentenceIndex: Type.Optional(Type.Number()),
  charStart: Type.Number(),
  charEnd: Type.Number()
})

/**
 * Video time span (seconds) a claim is grounded in. A claim may carry several
 * (discontiguous) spans. Each records its provenance: `scrub` for spans set by
 * scrubbing the video, `annotation` for spans derived from object annotations
 * (with the contributing annotation ids).
 */
const ClaimTimeSpanSchema = Type.Object({
  start: Type.Number({ minimum: 0 }),
  end: Type.Number({ minimum: 0 }),
  source: Type.Union([Type.Literal('scrub'), Type.Literal('annotation')]),
  annotationIds: Type.Optional(Type.Array(Type.String()))
})

/**
 * Nullable type helpers for fast-json-stringify compatibility.
 *
 * TypeBox's Type.Union([Type.String(), Type.Null()]) generates anyOf in JSON Schema,
 * but fast-json-stringify requires type: ['string', 'null'] format to properly
 * serialize null values (otherwise null is coerced to empty string).
 *
 * See: https://github.com/fastify/fast-json-stringify/issues/152
 */
const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })
const NullableNumber = Type.Unsafe<number | null>({ type: ['number', 'null'] })

/**
 * Claim schema (recursive for subclaims)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeBox recursive types require any
const ClaimSchema: any = Type.Recursive(This => Type.Object({
  id: Type.String({ format: 'uuid' }),
  summaryId: Type.String(),
  summaryType: Type.String(),
  text: Type.String(),
  gloss: Type.Array(GlossItemSchema),
  parentClaimId: Type.Optional(NullableString),
  textSpans: Type.Optional(Type.Array(ClaimTextSpanSchema)),
  timeSpans: Type.Optional(Type.Array(ClaimTimeSpanSchema)),
  claimerType: Type.Optional(NullableString),
  claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
  claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
  claimEventId: Type.Optional(NullableString),
  claimTimeId: Type.Optional(NullableString),
  claimLocationId: Type.Optional(NullableString),
  confidence: Type.Optional(NullableNumber),
  modelUsed: Type.Optional(NullableString),
  extractionStrategy: Type.Optional(NullableString),
  audio: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('speech'), Type.Literal('non-speech')])),
    Type.Null()
  ])),
  video: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  metadata: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  comment: Type.Optional(NullableString),
  createdBy: Type.Optional(NullableString),
  // The project the claim is scoped to (inherited from its summary; null for
  // personal personas). Exposed so project scope is observable on the API.
  projectId: Type.Optional(NullableString),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  subclaims: Type.Optional(Type.Array(This))
}))

/**
 * Create claim request schema
 */
const CreateClaimSchema = Type.Object({
  summaryType: Type.Union([Type.Literal('video'), Type.Literal('collection')]),
  text: Type.String({ minLength: 1 }),
  gloss: Type.Optional(Type.Array(GlossItemSchema)),
  parentClaimId: Type.Optional(Type.String({ format: 'uuid' })),
  textSpans: Type.Optional(Type.Array(ClaimTextSpanSchema)),
  timeSpans: Type.Optional(Type.Array(ClaimTimeSpanSchema)),
  claimerType: Type.Optional(NullableString),
  claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
  claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
  claimEventId: Type.Optional(Type.String({ format: 'uuid' })),
  claimTimeId: Type.Optional(Type.String({ format: 'uuid' })),
  claimLocationId: Type.Optional(Type.String({ format: 'uuid' })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  audio: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('speech'), Type.Literal('non-speech')])),
    Type.Null()
  ])),
  video: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  metadata: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  comment: Type.Optional(NullableString)
})

/**
 * Update claim request schema
 */
const UpdateClaimSchema = Type.Object({
  text: Type.Optional(Type.String({ minLength: 1 })),
  gloss: Type.Optional(Type.Array(GlossItemSchema)),
  textSpans: Type.Optional(Type.Array(ClaimTextSpanSchema)),
  timeSpans: Type.Optional(Type.Array(ClaimTimeSpanSchema)),
  claimerType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
  claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
  claimEventId: Type.Optional(Type.String({ format: 'uuid' })),
  claimTimeId: Type.Optional(Type.String({ format: 'uuid' })),
  claimLocationId: Type.Optional(Type.String({ format: 'uuid' })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  audio: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('speech'), Type.Literal('non-speech')])),
    Type.Null()
  ])),
  video: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  metadata: Type.Optional(Type.Union([
    Type.Array(Type.Union([Type.Literal('text'), Type.Literal('non-text')])),
    Type.Null()
  ])),
  comment: Type.Optional(NullableString)
})

/**
 * Claim extraction config schema
 */
const ClaimExtractionConfigSchema = Type.Object({
  summaryType: Type.Optional(Type.Union([Type.Literal('video'), Type.Literal('collection')])),
  inputSources: Type.Object({
    includeSummaryText: Type.Boolean(),
    includeAnnotations: Type.Boolean(),
    includeOntology: Type.Boolean(),
    ontologyDepth: Type.Union([
      Type.Literal('names-only'),
      Type.Literal('names-and-glosses'),
      Type.Literal('full-definitions')
    ])
  }),
  extractionStrategy: Type.Union([
    Type.Literal('sentence-based'),
    Type.Literal('semantic-units'),
    Type.Literal('hierarchical'),
    Type.Literal('manual')
  ]),
  maxClaimsPerSummary: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
  maxSubclaimDepth: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
  minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  modelId: Type.Optional(Type.String()),
  deduplicateClaims: Type.Optional(Type.Boolean()),
  mergeSimilarClaims: Type.Optional(Type.Boolean())
})

/**
 * Claim relation schemas
 */
const ClaimSpanSchema = Type.Object({
  charStart: Type.Number(),
  charEnd: Type.Number()
})

const ClaimRelationSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  sourceClaimId: Type.String({ format: 'uuid' }),
  targetClaimId: Type.String({ format: 'uuid' }),
  relationTypeId: Type.String(),
  sourceSpans: Type.Optional(Type.Array(ClaimSpanSchema)),
  targetSpans: Type.Optional(Type.Array(ClaimSpanSchema)),
  confidence: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdBy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

const CreateClaimRelationSchema = Type.Object({
  targetClaimId: Type.String({ format: 'uuid' }),
  relationTypeId: Type.String(),
  sourceSpans: Type.Optional(Type.Array(ClaimSpanSchema)),
  targetSpans: Type.Optional(Type.Array(ClaimSpanSchema)),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  notes: Type.Optional(Type.String())
})

const claimsRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: one repository for the plugin's lifetime.
  const repository = new ClaimRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id and system role.
   */
  const serviceFor = (request: FastifyRequest): ClaimService =>
    new ClaimService(
      repository,
      request.ability ?? null,
      request.user?.id,
      request.user?.systemRole ?? undefined
    )

  /**
   * Get all claims for a summary
   *
   * @route GET /api/summaries/:summaryId/claims
   * @param summaryId - UUID of the summary
   * @query summaryType - Type of summary ("video" or "collection")
   * @query includeSubclaims - Include nested subclaims (default: true)
   * @query minConfidence - Filter by minimum confidence
   * @returns Array of claims with optional nested subclaims
   */
  fastify.get<{
    Params: { summaryId: string }
    Querystring: {
      summaryType?: 'video' | 'collection'
      includeSubclaims?: boolean
      minConfidence?: number
    }
  }>(
    '/api/summaries/:summaryId/claims',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Retrieve all claims for a summary',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' })
        }),
        querystring: Type.Object({
          summaryType: Type.Optional(Type.Union([
            Type.Literal('video'),
            Type.Literal('collection')
          ])),
          includeSubclaims: Type.Optional(Type.Boolean()),
          minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
        }),
        response: {
          200: Type.Array(ClaimSchema),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const service = serviceFor(request)
      const claims = await service.listClaims(summaryId, request.query)
      return reply.send(claims)
    }
  )

  /**
   * Get specific claim by ID
   *
   * @route GET /api/summaries/:summaryId/claims/:claimId
   * @param summaryId - UUID of the summary
   * @param claimId - UUID of the claim
   * @returns Claim with all subclaims and parent
   */
  fastify.get<{ Params: { summaryId: string; claimId: string } }>(
    '/api/summaries/:summaryId/claims/:claimId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get specific claim with subclaims',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: ClaimSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const service = serviceFor(request)
      const claim = await service.getClaim(summaryId, claimId)
      return reply.send(claim)
    }
  )

  /**
   * Create a new claim manually
   *
   * @route POST /api/summaries/:summaryId/claims
   * @param summaryId - UUID of the summary
   * @body CreateClaimRequest
   * @returns Created claim
   */
  fastify.post<{
    Params: { summaryId: string }
    Body: Static<typeof CreateClaimSchema>
  }>(
    '/api/summaries/:summaryId/claims',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Create a new manual claim',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' })
        }),
        body: CreateClaimSchema,
        response: {
          201: Type.Object({
            claims: Type.Array(ClaimSchema)
          }),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const service = serviceFor(request)
      const claims = await service.createClaim(summaryId, request.body)
      return reply.status(201).send({ claims })
    }
  )

  /**
   * Update an existing claim
   *
   * @route PUT /api/summaries/:summaryId/claims/:claimId
   * @param summaryId - UUID of the summary
   * @param claimId - UUID of the claim
   * @body UpdateClaimRequest
   * @returns Updated claim
   */
  fastify.put<{
    Params: { summaryId: string; claimId: string }
    Body: Static<typeof UpdateClaimSchema>
  }>(
    '/api/summaries/:summaryId/claims/:claimId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Update an existing claim',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        body: UpdateClaimSchema,
        response: {
          200: Type.Object({
            claims: Type.Array(ClaimSchema)
          }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const service = serviceFor(request)
      const claims = await service.updateClaim(summaryId, claimId, request.body)
      return reply.send({ claims })
    }
  )

  /**
   * Delete a claim (cascades to subclaims)
   *
   * @route DELETE /api/summaries/:summaryId/claims/:claimId
   * @param summaryId - UUID of the summary
   * @param claimId - UUID of the claim
   * @returns Success status
   */
  fastify.delete<{ Params: { summaryId: string; claimId: string } }>(
    '/api/summaries/:summaryId/claims/:claimId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete claim and all subclaims',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const service = serviceFor(request)
      await service.deleteClaim(summaryId, claimId)
      return reply.send({ success: true })
    }
  )

  /**
   * Queue claim extraction job
   *
   * @route POST /api/summaries/:summaryId/claims/generate
   * @param summaryId - UUID of the summary
   * @body ClaimExtractionConfig
   * @returns Job status
   */
  fastify.post<{
    Params: { summaryId: string }
    Body: Static<typeof ClaimExtractionConfigSchema>
  }>(
    '/api/summaries/:summaryId/claims/generate',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Queue claim extraction job',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' })
        }),
        body: ClaimExtractionConfigSchema,
        response: {
          202: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            summaryId: Type.String()
          }),
          404: ErrorResponseSchema,
          400: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const service = serviceFor(request)
      const result = await service.generateClaims(summaryId, request.body)
      return reply.status(202).send(result)
    }
  )

  /**
   * Check claim extraction job status
   *
   * @route GET /api/jobs/claims/:jobId
   * @param jobId - Job identifier
   * @returns Job status and result
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/api/jobs/claims/:jobId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Check claim extraction job status',
        tags: ['claims'],
        params: Type.Object({
          jobId: Type.String()
        }),
        response: {
          200: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            progress: Type.Union([Type.Number(), Type.Null()]),
            result: Type.Union([Type.Any(), Type.Null()]),
            error: Type.Union([Type.String(), Type.Null()])
          }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { jobId } = request.params
      const service = serviceFor(request)
      const status = await service.getExtractionJobStatus(jobId)
      return reply.send(status)
    }
  )

  /**
   * Queue claim synthesis job
   *
   * @route POST /api/summaries/:summaryId/synthesize
   * @param summaryId - Summary identifier
   * @body Synthesis configuration
   * @returns Job status with job ID
   */
  fastify.post<{
    Params: { summaryId: string }
    Body: {
      synthesisStrategy?: 'hierarchical' | 'chronological' | 'narrative' | 'analytical'
      maxLength?: number
      includeConflicts?: boolean
      includeCitations?: boolean
    }
  }>(
    '/api/summaries/:summaryId/synthesize',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Queue claim synthesis job to generate summary from claims',
        tags: ['claims', 'synthesis'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' })
        }),
        body: Type.Object({
          synthesisStrategy: Type.Optional(
            Type.Union([
              Type.Literal('hierarchical'),
              Type.Literal('chronological'),
              Type.Literal('narrative'),
              Type.Literal('analytical')
            ])
          ),
          maxLength: Type.Optional(Type.Number({ minimum: 100, maximum: 2000 })),
          includeConflicts: Type.Optional(Type.Boolean()),
          includeCitations: Type.Optional(Type.Boolean())
        }),
        response: {
          202: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            summaryId: Type.String()
          }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const service = serviceFor(request)
      const result = await service.synthesize(summaryId, request.body)
      return reply.status(202).send(result)
    }
  )

  /**
   * Check claim synthesis job status
   *
   * @route GET /api/jobs/synthesis/:jobId
   * @param jobId - Job identifier
   * @returns Job status and result
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/api/jobs/synthesis/:jobId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Check claim synthesis job status',
        tags: ['claims', 'synthesis'],
        params: Type.Object({
          jobId: Type.String()
        }),
        response: {
          200: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            progress: Type.Union([Type.Number(), Type.Null()]),
            result: Type.Union([Type.Any(), Type.Null()]),
            error: Type.Union([Type.String(), Type.Null()])
          }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { jobId } = request.params
      const service = serviceFor(request)
      const status = await service.getSynthesisJobStatus(jobId)
      return reply.send(status)
    }
  )

  // Claim Relations Endpoints

  /**
   * Create a relation between claims
   *
   * @route POST /api/summaries/:summaryId/claims/:claimId/relations
   * @param summaryId - UUID of the summary
   * @param claimId - UUID of the source claim
   * @body CreateClaimRelationRequest
   * @returns Created claim relation
   */
  fastify.post<{
    Params: { summaryId: string; claimId: string }
    Body: Static<typeof CreateClaimRelationSchema>
  }>(
    '/api/summaries/:summaryId/claims/:claimId/relations',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Create a relation between claims',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        body: CreateClaimRelationSchema,
        response: {
          201: ClaimRelationSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const service = serviceFor(request)
      const relation = await service.createRelation(summaryId, claimId, request.body)
      return reply.status(201).send(relation)
    }
  )

  /**
   * Get all relations for a claim
   *
   * @route GET /api/summaries/:summaryId/claims/:claimId/relations
   * @param summaryId - UUID of the summary
   * @param claimId - UUID of the claim
   * @returns Array of claim relations (both as source and target)
   */
  fastify.get<{ Params: { summaryId: string; claimId: string } }>(
    '/api/summaries/:summaryId/claims/:claimId/relations',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get all relations for a claim',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({
            asSource: Type.Array(ClaimRelationSchema),
            asTarget: Type.Array(ClaimRelationSchema)
          }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const service = serviceFor(request)
      const relations = await service.getRelations(summaryId, claimId)
      return reply.send(relations)
    }
  )

  /**
   * Delete a claim relation
   *
   * @route DELETE /api/summaries/:summaryId/claims/relations/:relationId
   * @param summaryId - UUID of the summary
   * @param relationId - UUID of the relation
   * @returns Success status
   */
  fastify.delete<{ Params: { summaryId: string; relationId: string } }>(
    '/api/summaries/:summaryId/claims/relations/:relationId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a claim relation',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          relationId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { summaryId, relationId } = request.params
      const service = serviceFor(request)
      await service.deleteRelation(summaryId, relationId)
      return reply.send({ success: true })
    }
  )

  /**
   * Create claim with videoId + personaId (auto-creates VideoSummary if needed)
   *
   * @route POST /api/videos/:videoId/personas/:personaId/claims
   * @param videoId - ID of the video
   * @param personaId - UUID of the persona
   * @body CreateClaimSchema (without summaryType, assumed 'video')
   * @returns Created claim with summaryId
   */
  fastify.post<{
    Params: { videoId: string; personaId: string }
    Body: Omit<Static<typeof CreateClaimSchema>, 'summaryType'>
  }>(
    '/api/videos/:videoId/personas/:personaId/claims',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Create claim for video + persona (auto-creates summary if needed)',
        tags: ['claims'],
        params: Type.Object({
          videoId: Type.String(),
          personaId: Type.String({ format: 'uuid' })
        }),
        body: Type.Object({
          text: Type.String({ minLength: 1 }),
          gloss: Type.Optional(Type.Array(GlossItemSchema)),
          parentClaimId: Type.Optional(Type.String({ format: 'uuid' })),
          textSpans: Type.Optional(Type.Array(ClaimTextSpanSchema)),
          claimerType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
          claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
          claimEventId: Type.Optional(Type.String({ format: 'uuid' })),
          claimTimeId: Type.Optional(Type.String({ format: 'uuid' })),
          claimLocationId: Type.Optional(Type.String({ format: 'uuid' })),
          confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
        }),
        response: {
          201: Type.Object({
            claim: ClaimSchema,
            summaryId: Type.String({ format: 'uuid' })
          }),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, personaId } = request.params
      const service = serviceFor(request)
      const result = await service.createVideoPersonaClaim(videoId, personaId, request.body)
      return reply.status(201).send(result)
    }
  )
}

export default claimsRoute
