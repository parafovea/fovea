/**
 * API routes for claims and subclaims operations.
 *
 * This module provides endpoints for creating, retrieving, updating, and deleting
 * atomic claims extracted from video summaries. Supports hierarchical subclaims.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { PrismaClient, Prisma } from '@prisma/client'
import {
  claimExtractionQueue,
  ClaimExtractionJobData,
  claimSynthesisQueue,
  ClaimSynthesisJobData
} from '../queues/setup.js'
import { NotFoundError, ValidationError, ErrorResponseSchema } from '../lib/errors.js'
import { assertSummaryOwned, assertClaimOwned, assertClaimRelationOwned, assertPersonaOwned } from '../lib/ownership.js'
import { requireAuth } from '../middleware/auth.js'

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
 * Helper: Update denormalized claimsJson field in summary
 */
async function updateSummaryClaimsJson(
  prisma: PrismaClient,
  summaryId: string,
  summaryType: string
): Promise<void> {
  // Fetch all root claims with nested subclaims (up to 3 levels deep)
  const claims = await prisma.claim.findMany({
    where: {
      summaryId,
      summaryType,
      parentClaimId: null
    },
    include: {
      subclaims: {
        include: {
          subclaims: {
            include: {
              subclaims: true
            }
          }
        }
      }
    },
    orderBy: [
      { createdAt: 'asc' }
    ]
  })

  // Calculate metadata
  const totalClaims = countAllClaims(claims)
  const maxDepth = calculateMaxDepth(claims)

  const claimsJson = {
    version: '1.0',
    claims,
    metadata: {
      extractedAt: new Date().toISOString(),
      totalClaims,
      totalSubclaims: totalClaims - claims.length,
      maxDepth
    }
  }

  // Update summary based on type
  if (summaryType === 'video') {
    await prisma.videoSummary.update({
      where: { id: summaryId },
      data: {
        claimsJson,
        claimsExtractedAt: new Date()
      }
    })
  }
  // Future: Add collection summary support
}

/**
 * Helper: Count all claims recursively
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recursive claim structure requires any
function countAllClaims(claims: any[]): number {
  let count = claims.length
  for (const claim of claims) {
    if (claim.subclaims && claim.subclaims.length > 0) {
      count += countAllClaims(claim.subclaims)
    }
  }
  return count
}

/**
 * Helper: Calculate maximum depth recursively
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recursive claim structure requires any
function calculateMaxDepth(claims: any[], currentDepth: number = 0): number {
  let maxDepth = currentDepth
  for (const claim of claims) {
    if (claim.subclaims && claim.subclaims.length > 0) {
      const depth = calculateMaxDepth(claim.subclaims, currentDepth + 1)
      maxDepth = Math.max(maxDepth, depth)
    }
  }
  return maxDepth
}

const claimsRoute: FastifyPluginAsync = async (fastify) => {
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
      onRequest: [requireAuth],
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
      const { summaryType = 'video', includeSubclaims = true, minConfidence } = request.query

      // The summary the requester is reading claims under must belong to
      // them. Without this defense-in-depth check, knowing a summaryId is
      // enough to read every claim under it.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null // Future: Add collection summary support

      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

      // Build include object for nested subclaims
      const includeConfig = includeSubclaims ? {
        subclaims: {
          include: {
            subclaims: {
              include: {
                subclaims: true  // Support up to 3 levels
              }
            }
          }
        }
      } : undefined

      // Query root claims
      const claims = await fastify.prisma.claim.findMany({
        where: {
          summaryId,
          summaryType,
          parentClaimId: null,
          ...(minConfidence && { confidence: { gte: minConfidence } })
        },
        include: includeConfig,
        orderBy: [
          { createdAt: 'asc' }
        ]
      })

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
      onRequest: [requireAuth],
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

      await assertClaimOwned(fastify.prisma, claimId, request.user!.id)

      const claim = await fastify.prisma.claim.findUnique({
        where: { id: claimId },
        include: {
          subclaims: {
            include: {
              subclaims: {
                include: {
                  subclaims: true
                }
              }
            }
          },
          parentClaim: true
        }
      })

      if (!claim || claim.summaryId !== summaryId) {
        throw new NotFoundError('Claim', claimId)
      }

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
      onRequest: [requireAuth],
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
      const { text, gloss, parentClaimId, summaryType, audio, video, metadata, comment, ...rest } = request.body

      // The summary must belong to the requesting user; otherwise A could
      // create claims under B's summary.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null

      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

      // If parentClaimId provided, verify it exists and belongs to same summary
      if (parentClaimId) {
        const parentClaim = await fastify.prisma.claim.findUnique({
          where: { id: parentClaimId }
        })

        if (!parentClaim || parentClaim.summaryId !== summaryId) {
          throw new ValidationError('Invalid parent claim')
        }
      }

      // Convert null JSON fields to Prisma.JsonNull
      const claimData: Prisma.ClaimUncheckedCreateInput = {
        summaryId,
        summaryType,
        text,
        gloss: gloss || [],
        parentClaimId: parentClaimId || undefined,
        extractionStrategy: 'manual',
        audio: audio === null ? Prisma.JsonNull : (audio ?? Prisma.JsonNull),
        video: video === null ? Prisma.JsonNull : (video ?? Prisma.JsonNull),
        metadata: metadata === null ? Prisma.JsonNull : (metadata ?? Prisma.JsonNull),
        comment: comment || undefined,
        ...rest
      }

      // Create claim
      await fastify.prisma.claim.create({
        data: claimData
      })

      // Update denormalized claimsJson
      await updateSummaryClaimsJson(fastify.prisma, summaryId, summaryType)

      // Fetch and return complete claims tree
      const claims = await fastify.prisma.claim.findMany({
        where: {
          summaryId,
          summaryType,
          parentClaimId: null
        },
        include: {
          subclaims: {
            include: {
              subclaims: {
                include: {
                  subclaims: true
                }
              }
            }
          }
        },
        orderBy: [{ createdAt: 'asc' }]
      })

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
      onRequest: [requireAuth],
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
      const { audio, video, metadata, comment, ...rest } = request.body

      // The claim's parent summary must belong to the requesting user.
      await assertClaimOwned(fastify.prisma, claimId, request.user!.id)

      // Verify claim exists and belongs to summary
      const existingClaim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!existingClaim || existingClaim.summaryId !== summaryId) {
        throw new NotFoundError('Claim', claimId)
      }

      // Convert null JSON fields to Prisma.JsonNull
      const updateData: Prisma.ClaimUpdateInput = {
        ...rest,
        ...(audio !== undefined && { audio: audio === null ? Prisma.JsonNull : audio }),
        ...(video !== undefined && { video: video === null ? Prisma.JsonNull : video }),
        ...(metadata !== undefined && { metadata: metadata === null ? Prisma.JsonNull : metadata }),
        ...(comment !== undefined && { comment })
      }

      // Update claim
      await fastify.prisma.claim.update({
        where: { id: claimId },
        data: updateData
      })

      // Update denormalized claimsJson
      await updateSummaryClaimsJson(fastify.prisma, summaryId, existingClaim.summaryType)

      // Fetch and return complete claims tree
      const claims = await fastify.prisma.claim.findMany({
        where: {
          summaryId,
          summaryType: existingClaim.summaryType,
          parentClaimId: null
        },
        include: {
          subclaims: {
            include: {
              subclaims: {
                include: {
                  subclaims: true
                }
              }
            }
          }
        },
        orderBy: [{ createdAt: 'asc' }]
      })

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
      onRequest: [requireAuth],
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

      await assertClaimOwned(fastify.prisma, claimId, request.user!.id)

      // Verify claim exists and belongs to summary
      const claim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!claim || claim.summaryId !== summaryId) {
        throw new NotFoundError('Claim', claimId)
      }

      // Delete claim (cascades to subclaims via onDelete: Cascade)
      await fastify.prisma.claim.delete({
        where: { id: claimId }
      })

      // Update denormalized claimsJson
      await updateSummaryClaimsJson(fastify.prisma, summaryId, claim.summaryType)

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
      onRequest: [requireAuth],
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
      const config = request.body

      const summaryType = config.summaryType || 'video'

      // Block A from queuing claim extraction against B's summary, which
      // would otherwise write claims under B's persona.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null

      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

      // Queue extraction job using BullMQ
      const jobData: ClaimExtractionJobData = {
        summaryId,
        summaryType,
        config: {
          inputSources: config.inputSources,
          extractionStrategy: config.extractionStrategy,
          maxClaimsPerSummary: config.maxClaimsPerSummary,
          maxSubclaimDepth: config.maxSubclaimDepth,
          minConfidence: config.minConfidence,
          modelId: config.modelId,
          deduplicateClaims: config.deduplicateClaims,
          mergeSimilarClaims: config.mergeSimilarClaims
        }
      }

      const job = await claimExtractionQueue.add(
        'extract-claims',
        jobData,
        {
          jobId: `claims-${summaryId}-${Date.now()}`
        }
      )

      return reply.status(202).send({
        jobId: job.id as string,
        status: 'queued',
        summaryId
      })
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
      onRequest: [requireAuth],
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

      // Get job from queue
      const job = await claimExtractionQueue.getJob(jobId)

      if (!job) {
        throw new NotFoundError('Job', jobId)
      }

      // The job is bound to a summary via its data; the requester must own
      // that summary to read job status. Without this, A could poll for the
      // result of B's claim extraction (which contains B's claim text).
      const jobSummaryId = (job.data as { summaryId?: string })?.summaryId
      if (jobSummaryId) {
        await assertSummaryOwned(fastify.prisma, jobSummaryId, request.user!.id)
      }

      // Get job state
      const state = await job.getState()
      const progress = typeof job.progress === 'number' ? job.progress : null

      // Map BullMQ states to API states
      let status: string
      if (state === 'completed') {
        status = 'completed'
      } else if (state === 'failed') {
        status = 'failed'
      } else if (state === 'active') {
        status = 'processing'
      } else {
        status = 'queued'
      }

      // Get result or error
      let result = null
      let error = null

      if (state === 'completed') {
        result = job.returnvalue
      } else if (state === 'failed') {
        error = job.failedReason || 'Job failed'
      }

      return reply.send({
        jobId: job.id as string,
        status,
        progress,
        result,
        error
      })
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
      onRequest: [requireAuth],
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
      const config = request.body

      // Block A from queuing synthesis (which overwrites the visualAnalysis
      // text) against B's summary.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)

      // Verify summary exists and has claims
      const summary = await fastify.prisma.videoSummary.findUnique({
        where: { id: summaryId },
        include: {
          claims: {
            where: { parentClaimId: null },
            take: 1
          }
        }
      })

      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

      if (!summary.claims || summary.claims.length === 0) {
        throw new ValidationError('Summary has no claims to synthesize')
      }

      const jobData: ClaimSynthesisJobData = {
        summaryId,
        summaryType: 'video',
        config: {
          synthesisStrategy: config.synthesisStrategy || 'hierarchical',
          maxLength: config.maxLength,
          includeConflicts: config.includeConflicts,
          includeCitations: config.includeCitations
        }
      }

      const job = await claimSynthesisQueue.add(
        'synthesize-summary',
        jobData,
        {
          jobId: `synthesis-${summaryId}-${Date.now()}`
        }
      )

      return reply.status(202).send({
        jobId: job.id as string,
        status: 'queued',
        summaryId
      })
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
      onRequest: [requireAuth],
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

      // Get job from queue
      const job = await claimSynthesisQueue.getJob(jobId)

      if (!job) {
        throw new NotFoundError('Job', jobId)
      }

      // The job is bound to a summary; the requester must own it to read
      // status (and the synthesized text result).
      const jobSummaryId = (job.data as { summaryId?: string })?.summaryId
      if (jobSummaryId) {
        await assertSummaryOwned(fastify.prisma, jobSummaryId, request.user!.id)
      }

      // Get job state
      const state = await job.getState()
      const progress = typeof job.progress === 'number' ? job.progress : null

      // Map BullMQ states to API states
      let status: string
      if (state === 'completed') {
        status = 'completed'
      } else if (state === 'failed') {
        status = 'failed'
      } else if (state === 'active') {
        status = 'processing'
      } else {
        status = 'queued'
      }

      // Get result or error
      let result = null
      let error = null

      if (state === 'completed') {
        result = job.returnvalue
      } else if (state === 'failed') {
        error = job.failedReason || 'Job failed'
      }

      return reply.send({
        jobId: job.id as string,
        status,
        progress,
        result,
        error
      })
    }
  )

  // Claim Relations Endpoints

  /**
   * Claim relation schema
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
      onRequest: [requireAuth],
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
      const { targetClaimId, relationTypeId, sourceSpans, targetSpans, confidence, notes } = request.body

      // The summary that owns the source claim must belong to the requester.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)

      // Verify source claim exists
      const sourceClaim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!sourceClaim || sourceClaim.summaryId !== summaryId) {
        throw new NotFoundError('Source claim', claimId)
      }

      // Verify target claim exists
      const targetClaim = await fastify.prisma.claim.findUnique({
        where: { id: targetClaimId }
      })

      if (!targetClaim) {
        throw new NotFoundError('Target claim', targetClaimId)
      }

      // Get summary to find persona and ontology
      const summary = await fastify.prisma.videoSummary.findUnique({
        where: { id: summaryId },
        include: {
          persona: {
            include: {
              ontology: true
            }
          }
        }
      })

      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

      // Validate relationTypeId against ontology
      if (summary.persona.ontology) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        const relationTypes = summary.persona.ontology.relationTypes as any[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
        const relationType = relationTypes.find((rt: any) => rt.id === relationTypeId)

        if (!relationType) {
          throw new ValidationError(`Invalid relation type: ${relationTypeId}. Must be defined in persona's ontology.`)
        }

        // Check that this relation type allows claim→claim relations
        const sourceTypes = relationType.sourceTypes as string[]
        const targetTypes = relationType.targetTypes as string[]

        if (!sourceTypes.includes('claim') || !targetTypes.includes('claim')) {
          throw new ValidationError(`Relation type '${relationType.name}' does not support claim-to-claim relations. Source types: [${sourceTypes.join(', ')}], Target types: [${targetTypes.join(', ')}]`)
        }
      }

      // Create relation
      const relation = await fastify.prisma.claimRelation.create({
        data: {
          sourceClaimId: claimId,
          targetClaimId,
          relationTypeId,
          sourceSpans: sourceSpans || undefined,
          targetSpans: targetSpans || undefined,
          confidence,
          notes
        }
      })

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
      onRequest: [requireAuth],
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

      // Verify claim exists
      const claim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!claim || claim.summaryId !== summaryId) {
        throw new NotFoundError('Claim', claimId)
      }

      // Get relations where this claim is the source
      const asSource = await fastify.prisma.claimRelation.findMany({
        where: { sourceClaimId: claimId }
      })

      // Get relations where this claim is the target
      const asTarget = await fastify.prisma.claimRelation.findMany({
        where: { targetClaimId: claimId }
      })

      return reply.send({ asSource, asTarget })
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
      onRequest: [requireAuth],
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

      // The summary the relation lives under must belong to the requester.
      await assertSummaryOwned(fastify.prisma, summaryId, request.user!.id)
      await assertClaimRelationOwned(fastify.prisma, relationId, request.user!.id)

      // Verify relation exists
      const relation = await fastify.prisma.claimRelation.findUnique({
        where: { id: relationId },
        include: {
          sourceClaim: true
        }
      })

      if (!relation || relation.sourceClaim.summaryId !== summaryId) {
        throw new NotFoundError('Relation', relationId)
      }

      // Delete relation
      await fastify.prisma.claimRelation.delete({
        where: { id: relationId }
      })

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
      onRequest: [requireAuth],
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
      const { text, gloss, parentClaimId, audio, video: videoModality, metadata, comment, ...rest } = request.body

      // The persona must belong to the requester; otherwise A could create
      // claims (and auto-create a VideoSummary) on B's persona via this route.
      await assertPersonaOwned(fastify.prisma, personaId, request.user!.id)

      // Verify video exists
      const video = await fastify.prisma.video.findUnique({
        where: { id: videoId }
      })
      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      // Verify persona exists
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId }
      })
      if (!persona) {
        throw new NotFoundError('Persona', personaId)
      }

      // Find or create VideoSummary
      const summary = await fastify.prisma.videoSummary.upsert({
        where: {
          videoId_personaId: {
            videoId,
            personaId
          }
        },
        create: {
          videoId,
          personaId,
          summary: [] // Empty summary initially
        },
        update: {} // No updates if exists
      })

      // If parentClaimId provided, verify it exists and belongs to same summary
      if (parentClaimId) {
        const parentClaim = await fastify.prisma.claim.findUnique({
          where: { id: parentClaimId }
        })

        if (!parentClaim || parentClaim.summaryId !== summary.id) {
          throw new ValidationError('Invalid parent claim')
        }
      }

      // Convert null JSON fields to Prisma.JsonNull
      const claimData: Prisma.ClaimUncheckedCreateInput = {
        summaryId: summary.id,
        summaryType: 'video',
        text,
        gloss: gloss || [],
        parentClaimId: parentClaimId || undefined,
        extractionStrategy: 'manual',
        audio: audio === null ? Prisma.JsonNull : (audio ?? Prisma.JsonNull),
        video: videoModality === null ? Prisma.JsonNull : (videoModality ?? Prisma.JsonNull),
        metadata: metadata === null ? Prisma.JsonNull : (metadata ?? Prisma.JsonNull),
        comment: comment || undefined,
        ...rest
      }

      // Create claim
      const claim = await fastify.prisma.claim.create({
        data: claimData
      })

      return reply.status(201).send({
        claim,
        summaryId: summary.id
      })
    }
  )
}

export default claimsRoute
