/**
 * API routes for claims and subclaims operations.
 *
 * This module provides endpoints for creating, retrieving, updating, and deleting
 * atomic claims extracted from video summaries. Supports hierarchical subclaims.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { PrismaClient } from '@prisma/client'

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
 * Claim schema (recursive for subclaims)
 */
const ClaimSchema: any = Type.Recursive(This => Type.Object({
  id: Type.String({ format: 'uuid' }),
  summaryId: Type.String(),
  summaryType: Type.String(),
  text: Type.String(),
  gloss: Type.Array(GlossItemSchema),
  parentClaimId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  textSpans: Type.Optional(Type.Array(ClaimTextSpanSchema)),
  claimerType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
  claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
  claimEventId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  claimTimeId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  claimLocationId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  confidence: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  modelUsed: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  extractionStrategy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdBy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
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
  claimerType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  claimerGloss: Type.Optional(Type.Array(GlossItemSchema)),
  claimRelation: Type.Optional(Type.Array(GlossItemSchema)),
  claimEventId: Type.Optional(Type.String({ format: 'uuid' })),
  claimTimeId: Type.Optional(Type.String({ format: 'uuid' })),
  claimLocationId: Type.Optional(Type.String({ format: 'uuid' })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
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
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const { summaryType = 'video', includeSubclaims = true, minConfidence } = request.query

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null // Future: Add collection summary support

      if (!summary) {
        return reply.status(404).send({ error: 'Summary not found' })
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
      schema: {
        description: 'Get specific claim with subclaims',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: ClaimSchema,
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params

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
        return reply.status(404).send({ error: 'Claim not found' })
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
          400: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const { text, gloss, parentClaimId, summaryType, ...rest } = request.body

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null

      if (!summary) {
        return reply.status(404).send({ error: 'Summary not found' })
      }

      // If parentClaimId provided, verify it exists and belongs to same summary
      if (parentClaimId) {
        const parentClaim = await fastify.prisma.claim.findUnique({
          where: { id: parentClaimId }
        })

        if (!parentClaim || parentClaim.summaryId !== summaryId) {
          return reply.status(400).send({ error: 'Invalid parent claim' })
        }
      }

      // Create claim
      await fastify.prisma.claim.create({
        data: {
          summaryId,
          summaryType,
          text,
          gloss: gloss || [],
          parentClaimId,
          extractionStrategy: 'manual',
          ...rest
        }
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const updateData = request.body

      // Verify claim exists and belongs to summary
      const existingClaim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!existingClaim || existingClaim.summaryId !== summaryId) {
        return reply.status(404).send({ error: 'Claim not found' })
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
      schema: {
        description: 'Delete claim and all subclaims',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          claimId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params

      // Verify claim exists and belongs to summary
      const claim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!claim || claim.summaryId !== summaryId) {
        return reply.status(404).send({ error: 'Claim not found' })
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
          404: Type.Object({ error: Type.String() }),
          400: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const config = request.body

      const summaryType = config.summaryType || 'video'

      // Verify summary exists
      const summary = summaryType === 'video'
        ? await fastify.prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null

      if (!summary) {
        return reply.status(404).send({ error: 'Summary not found' })
      }

      // TODO: Queue extraction job using BullMQ
      // For now, return placeholder response
      const jobId = `claims-${summaryId}-${Date.now()}`

      return reply.status(202).send({
        jobId,
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
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (_request, reply) => {
      // TODO: Implement job status checking with BullMQ
      // For now, return placeholder
      return reply.status(404).send({ error: 'Job not found' })
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
    relationTypeId: Type.String({ format: 'uuid' }),
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
    relationTypeId: Type.String({ format: 'uuid' }),
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
          400: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId, claimId } = request.params
      const { targetClaimId, relationTypeId, sourceSpans, targetSpans, confidence, notes } = request.body

      // Verify source claim exists
      const sourceClaim = await fastify.prisma.claim.findUnique({
        where: { id: claimId }
      })

      if (!sourceClaim || sourceClaim.summaryId !== summaryId) {
        return reply.status(404).send({ error: 'Source claim not found' })
      }

      // Verify target claim exists
      const targetClaim = await fastify.prisma.claim.findUnique({
        where: { id: targetClaimId }
      })

      if (!targetClaim) {
        return reply.status(404).send({ error: 'Target claim not found' })
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
          404: Type.Object({ error: Type.String() })
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
        return reply.status(404).send({ error: 'Claim not found' })
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
      schema: {
        description: 'Delete a claim relation',
        tags: ['claims'],
        params: Type.Object({
          summaryId: Type.String({ format: 'uuid' }),
          relationId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { summaryId, relationId } = request.params

      // Verify relation exists
      const relation = await fastify.prisma.claimRelation.findUnique({
        where: { id: relationId },
        include: {
          sourceClaim: true
        }
      })

      if (!relation || relation.sourceClaim.summaryId !== summaryId) {
        return reply.status(404).send({ error: 'Relation not found' })
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
          400: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { videoId, personaId } = request.params
      const { text, gloss, parentClaimId, ...rest } = request.body

      // Verify video exists
      const video = await fastify.prisma.video.findUnique({
        where: { id: videoId }
      })
      if (!video) {
        return reply.status(404).send({ error: 'Video not found' })
      }

      // Verify persona exists
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId }
      })
      if (!persona) {
        return reply.status(404).send({ error: 'Persona not found' })
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
          return reply.status(400).send({ error: 'Invalid parent claim' })
        }
      }

      // Create claim
      const claim = await fastify.prisma.claim.create({
        data: {
          summaryId: summary.id,
          summaryType: 'video',
          text,
          gloss: gloss || [],
          parentClaimId,
          extractionStrategy: 'manual',
          ...rest
        }
      })

      return reply.status(201).send({
        claim,
        summaryId: summary.id
      })
    }
  )
}

export default claimsRoute
