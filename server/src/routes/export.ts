import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { AnnotationExporter } from '../services/export-handler.js'
import { requireAuth } from '../middleware/auth.js'

/**
 * TypeBox schema for validation errors.
 */
const ValidationErrorSchema = Type.Object({
  annotationId: Type.String(),
  errors: Type.Array(Type.String())
})

/**
 * Fastify plugin for export-related routes.
 * Provides endpoints for exporting all user data.
 *
 * Routes:
 * - GET /api/export - Export all user data in JSON Lines format
 */
const exportRoute: FastifyPluginAsync = async (fastify) => {
  const exporter = new AnnotationExporter()

  /**
   * Export all user data including personas, ontologies, world state,
   * summaries, claims, and annotations.
   * Exports in dependency order to ensure proper import.
   *
   * @route GET /api/export
   * @queryparam format - Export format (default: jsonl)
   * @queryparam includeInterpolated - Include all interpolated frames for annotations (default: false)
   * @queryparam personaIds - Comma-separated list of persona IDs to filter annotations
   * @queryparam videoIds - Comma-separated list of video IDs to filter annotations
   * @queryparam annotationTypes - Comma-separated list of annotation types (type, object)
   * @returns JSON Lines file with all user data
   */
  fastify.get('/api/export', {
    onRequest: [requireAuth],
    schema: {
      description: 'Export all user data',
      tags: ['export'],
      querystring: Type.Object({
        format: Type.Optional(Type.Union([
          Type.Literal('jsonl'),
          Type.Literal('json')
        ])),
        includeInterpolated: Type.Optional(Type.Boolean()),
        personaIds: Type.Optional(Type.String()),
        videoIds: Type.Optional(Type.String()),
        annotationTypes: Type.Optional(Type.String())
      }),
      response: {
        200: Type.String(),
        400: Type.Object({
          error: Type.String(),
          message: Type.String(),
          validationErrors: Type.Array(ValidationErrorSchema)
        })
      }
    }
  }, async (request, reply) => {
    const {
      format = 'jsonl',
      includeInterpolated = false,
      personaIds,
      videoIds,
      annotationTypes
    } = request.query as {
      format?: 'jsonl' | 'json'
      includeInterpolated?: boolean
      personaIds?: string
      videoIds?: string
      annotationTypes?: string
    }

    // Parse filter parameters for annotations
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : undefined
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    const lines: string[] = []

    // 1. Export personas with ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'asc' }
    })
    const userPersonaIds = personas.map(p => p.id)
    const ontologies = await fastify.prisma.ontology.findMany({
      where: { personaId: { in: userPersonaIds } },
      orderBy: { createdAt: 'asc' }
    })
    if (personas.length > 0) {
      lines.push(exporter.exportPersonasWithOntologies(personas, ontologies))
    }

    // 2. Export world state
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId: request.user!.id }
    })
    if (worldState) {
      const worldLines = exporter.exportWorldState(worldState)
      if (worldLines) {
        lines.push(worldLines)
      }
    }

    // 3. Export summaries with claims
    const summaries = await fastify.prisma.videoSummary.findMany({
      where: { personaId: { in: userPersonaIds } },
      orderBy: { createdAt: 'asc' }
    })
    const summaryIds = summaries.map(s => s.id)
    const claims = summaryIds.length > 0 ? await fastify.prisma.claim.findMany({
      where: { summaryId: { in: summaryIds } },
      orderBy: { createdAt: 'asc' }
    }) : []
    const claimIds = claims.map(c => c.id)
    const claimRelations = claimIds.length > 0 ? await fastify.prisma.claimRelation.findMany({
      where: {
        OR: [
          { sourceClaimId: { in: claimIds } },
          { targetClaimId: { in: claimIds } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    }) : []
    if (summaries.length > 0 || claims.length > 0) {
      lines.push(exporter.exportSummariesWithClaims(summaries, claims, claimRelations))
    }

    // 4. Export annotations with optional filtering
    const annotationWhere: {
      personaId?: { in: string[] }
      videoId?: { in: string[] }
    } = {}

    if (personaIdArray && personaIdArray.length > 0) {
      annotationWhere.personaId = { in: personaIdArray }
    }
    if (videoIdArray && videoIdArray.length > 0) {
      annotationWhere.videoId = { in: videoIdArray }
    }

    const prismaAnnotations = await fastify.prisma.annotation.findMany({
      where: Object.keys(annotationWhere).length > 0 ? annotationWhere : undefined,
      orderBy: { createdAt: 'asc' }
    })

    let convertedAnnotations = prismaAnnotations
      .map(a => exporter.convertPrismaAnnotation(a))
      .filter((a): a is NonNullable<typeof a> => a !== null)

    // Filter by annotation type if specified
    if (annotationTypeArray && annotationTypeArray.length > 0) {
      convertedAnnotations = convertedAnnotations.filter(a =>
        annotationTypeArray.includes(a.annotationType)
      )
    }

    // Validate all sequences before export
    const validationErrors: Array<{ annotationId: string; errors: string[] }> = []
    for (const annotation of convertedAnnotations) {
      const validation = exporter.validateSequence(annotation.boundingBoxSequence)
      if (!validation.valid) {
        validationErrors.push({
          annotationId: annotation.id,
          errors: validation.errors
        })
      }
    }

    // If there are validation errors, return 400
    if (validationErrors.length > 0) {
      reply.code(400)
      return reply.send({
        error: 'Validation failed',
        message: 'Some annotations have invalid sequences',
        validationErrors
      })
    }

    if (convertedAnnotations.length > 0) {
      lines.push(exporter.exportAnnotations(convertedAnnotations, { includeInterpolated }))
    }

    const exportData = lines.filter(Boolean).join('\n')

    // Get world state counts for headers
    const worldCounts = worldState ? {
      entities: Array.isArray(worldState.entities) ? (worldState.entities as unknown[]).length : 0,
      events: Array.isArray(worldState.events) ? (worldState.events as unknown[]).length : 0,
      times: Array.isArray(worldState.times) ? (worldState.times as unknown[]).length : 0,
    } : { entities: 0, events: 0, times: 0 }

    // Set headers with export stats
    reply.header('X-Export-Personas', personas.length.toString())
    reply.header('X-Export-Ontologies', ontologies.length.toString())
    reply.header('X-Export-Entities', worldCounts.entities.toString())
    reply.header('X-Export-Events', worldCounts.events.toString())
    reply.header('X-Export-Times', worldCounts.times.toString())
    reply.header('X-Export-Summaries', summaries.length.toString())
    reply.header('X-Export-Claims', claims.length.toString())
    reply.header('X-Export-ClaimRelations', claimRelations.length.toString())
    reply.header('X-Export-Annotations', convertedAnnotations.length.toString())

    // Set content type and disposition
    if (format === 'jsonl') {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Content-Disposition', 'attachment; filename="fovea-export.jsonl"')
      return reply.send(exportData)
    } else {
      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', 'attachment; filename="fovea-export.json"')
      const jsonLines = exportData.split('\n').filter(Boolean)
      const jsonArray = jsonLines.map(line => JSON.parse(line))
      return reply.send(JSON.stringify(jsonArray, null, 2))
    }
  })

  /**
   * Get export statistics without performing the export.
   * Returns counts for all data types that will be exported.
   *
   * @route GET /api/export/stats
   * @queryparam includeInterpolated - Include all interpolated frames (default: false)
   * @queryparam personaIds - Comma-separated list of persona IDs to filter annotations
   * @queryparam videoIds - Comma-separated list of video IDs to filter annotations
   * @queryparam annotationTypes - Comma-separated list of annotation types (type, object)
   * @returns Export statistics for all data types
   */
  fastify.get('/api/export/stats', {
    onRequest: [requireAuth],
    schema: {
      description: 'Get export statistics for all data types',
      tags: ['export'],
      querystring: Type.Object({
        includeInterpolated: Type.Optional(Type.Boolean()),
        personaIds: Type.Optional(Type.String()),
        videoIds: Type.Optional(Type.String()),
        annotationTypes: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Object({
          // Personas & Ontologies
          personaCount: Type.Number(),
          systemPersonaCount: Type.Number(),
          ontologyCount: Type.Number(),
          entityTypeCount: Type.Number(),
          eventTypeCount: Type.Number(),
          roleTypeCount: Type.Number(),
          relationTypeCount: Type.Number(),
          // World State
          entityCount: Type.Number(),
          eventCount: Type.Number(),
          timeCount: Type.Number(),
          entityCollectionCount: Type.Number(),
          eventCollectionCount: Type.Number(),
          timeCollectionCount: Type.Number(),
          worldRelationCount: Type.Number(),
          // Summaries & Claims
          summaryCount: Type.Number(),
          claimCount: Type.Number(),
          claimRelationCount: Type.Number(),
          // Annotations
          annotationCount: Type.Number(),
          sequenceCount: Type.Number(),
          keyframeCount: Type.Number(),
          interpolatedFrameCount: Type.Number(),
          // Total
          totalSize: Type.Number(),
          totalSizeMB: Type.String(),
          warning: Type.Optional(Type.String())
        })
      }
    }
  }, async (request, reply) => {
    const {
      includeInterpolated = false,
      personaIds,
      videoIds,
      annotationTypes
    } = request.query as {
      includeInterpolated?: boolean
      personaIds?: string
      videoIds?: string
      annotationTypes?: string
    }

    // Parse filter parameters for annotations
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : undefined
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    // 1. Count personas and ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'asc' }
    })
    const systemPersonaCount = personas.filter(p => p.isSystemGenerated).length
    const userPersonaIds = personas.map(p => p.id)
    const ontologies = await fastify.prisma.ontology.findMany({
      where: { personaId: { in: userPersonaIds } },
      orderBy: { createdAt: 'asc' }
    })

    // Count ontology types
    let entityTypeCount = 0
    let eventTypeCount = 0
    let roleTypeCount = 0
    let relationTypeCount = 0
    for (const ontology of ontologies) {
      entityTypeCount += Array.isArray(ontology.entityTypes) ? (ontology.entityTypes as unknown[]).length : 0
      eventTypeCount += Array.isArray(ontology.eventTypes) ? (ontology.eventTypes as unknown[]).length : 0
      roleTypeCount += Array.isArray(ontology.roleTypes) ? (ontology.roleTypes as unknown[]).length : 0
      relationTypeCount += Array.isArray(ontology.relationTypes) ? (ontology.relationTypes as unknown[]).length : 0
    }

    // 2. Count world state objects
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId: request.user!.id }
    })
    const worldCounts = worldState ? {
      entities: Array.isArray(worldState.entities) ? (worldState.entities as unknown[]).length : 0,
      events: Array.isArray(worldState.events) ? (worldState.events as unknown[]).length : 0,
      times: Array.isArray(worldState.times) ? (worldState.times as unknown[]).length : 0,
      entityCollections: Array.isArray(worldState.entityCollections) ? (worldState.entityCollections as unknown[]).length : 0,
      eventCollections: Array.isArray(worldState.eventCollections) ? (worldState.eventCollections as unknown[]).length : 0,
      timeCollections: Array.isArray(worldState.timeCollections) ? (worldState.timeCollections as unknown[]).length : 0,
      relations: Array.isArray(worldState.relations) ? (worldState.relations as unknown[]).length : 0,
    } : { entities: 0, events: 0, times: 0, entityCollections: 0, eventCollections: 0, timeCollections: 0, relations: 0 }

    // 3. Count summaries and claims (scoped to user's personas)
    const summaryCount = await fastify.prisma.videoSummary.count({
      where: { personaId: { in: userPersonaIds } }
    })
    const userSummaries = await fastify.prisma.videoSummary.findMany({
      where: { personaId: { in: userPersonaIds } },
      select: { id: true }
    })
    const userSummaryIds = userSummaries.map(s => s.id)
    const claimCount = await fastify.prisma.claim.count({
      where: { summaryId: { in: userSummaryIds } }
    })
    const userClaims = await fastify.prisma.claim.findMany({
      where: { summaryId: { in: userSummaryIds } },
      select: { id: true }
    })
    const userClaimIds = userClaims.map(c => c.id)
    const claimRelationCount = await fastify.prisma.claimRelation.count({
      where: {
        OR: [
          { sourceClaimId: { in: userClaimIds } },
          { targetClaimId: { in: userClaimIds } }
        ]
      }
    })

    // 4. Count and analyze annotations (with optional filtering)
    const annotationWhere: {
      personaId?: { in: string[] }
      videoId?: { in: string[] }
    } = {}

    if (personaIdArray && personaIdArray.length > 0) {
      annotationWhere.personaId = { in: personaIdArray }
    }
    if (videoIdArray && videoIdArray.length > 0) {
      annotationWhere.videoId = { in: videoIdArray }
    }

    const prismaAnnotations = await fastify.prisma.annotation.findMany({
      where: Object.keys(annotationWhere).length > 0 ? annotationWhere : undefined,
      orderBy: { createdAt: 'asc' }
    })

    let annotations = prismaAnnotations
      .map(a => exporter.convertPrismaAnnotation(a))
      .filter((a): a is NonNullable<typeof a> => a !== null)

    if (annotationTypeArray && annotationTypeArray.length > 0) {
      annotations = annotations.filter(a =>
        annotationTypeArray.includes(a.annotationType)
      )
    }

    // Get annotation export statistics
    const annotationStats = exporter.getExportStats(annotations, includeInterpolated)

    // Estimate total size (rough estimate: 200 bytes per object on average)
    const baseObjectCount = personas.length + ontologies.length +
      worldCounts.entities + worldCounts.events + worldCounts.times +
      worldCounts.entityCollections + worldCounts.eventCollections + worldCounts.timeCollections +
      worldCounts.relations + summaryCount + claimCount + claimRelationCount
    const estimatedBaseSize = baseObjectCount * 200
    const totalSize = estimatedBaseSize + annotationStats.totalSize

    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2)

    const response: {
      personaCount: number
      systemPersonaCount: number
      ontologyCount: number
      entityTypeCount: number
      eventTypeCount: number
      roleTypeCount: number
      relationTypeCount: number
      entityCount: number
      eventCount: number
      timeCount: number
      entityCollectionCount: number
      eventCollectionCount: number
      timeCollectionCount: number
      worldRelationCount: number
      summaryCount: number
      claimCount: number
      claimRelationCount: number
      annotationCount: number
      sequenceCount: number
      keyframeCount: number
      interpolatedFrameCount: number
      totalSize: number
      totalSizeMB: string
      warning?: string
    } = {
      personaCount: personas.length,
      systemPersonaCount,
      ontologyCount: ontologies.length,
      entityTypeCount,
      eventTypeCount,
      roleTypeCount,
      relationTypeCount,
      entityCount: worldCounts.entities,
      eventCount: worldCounts.events,
      timeCount: worldCounts.times,
      entityCollectionCount: worldCounts.entityCollections,
      eventCollectionCount: worldCounts.eventCollections,
      timeCollectionCount: worldCounts.timeCollections,
      worldRelationCount: worldCounts.relations,
      summaryCount,
      claimCount,
      claimRelationCount,
      annotationCount: annotationStats.annotationCount,
      sequenceCount: annotationStats.sequenceCount,
      keyframeCount: annotationStats.keyframeCount,
      interpolatedFrameCount: annotationStats.interpolatedFrameCount,
      totalSize,
      totalSizeMB: `${sizeInMB}MB`
    }

    if (totalSize > 100 * 1024 * 1024) {
      response.warning = 'Large export. Consider filtering annotations by persona or video.'
    }

    return reply.send(response)
  })

  /**
   * Export personas with their ontologies.
   *
   * @route GET /api/export/personas
   * @queryparam format - Export format (default: jsonl)
   * @returns JSON Lines file with personas and ontologies
   */
  fastify.get('/api/export/personas', {
    onRequest: [requireAuth],
    schema: {
      description: 'Export personas with their ontologies',
      tags: ['export'],
      querystring: Type.Object({
        format: Type.Optional(Type.Union([
          Type.Literal('jsonl'),
          Type.Literal('json')
        ]))
      }),
      response: {
        200: Type.String()
      }
    }
  }, async (request, reply) => {
    const { format = 'jsonl' } = request.query as { format?: 'jsonl' | 'json' }

    // Fetch user's personas
    const personas = await fastify.prisma.persona.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'asc' }
    })

    // Fetch ontologies for user's personas
    const personaIds = personas.map(p => p.id)
    const ontologies = await fastify.prisma.ontology.findMany({
      where: { personaId: { in: personaIds } },
      orderBy: { createdAt: 'asc' }
    })

    // Export personas with ontologies
    const exportData = exporter.exportPersonasWithOntologies(personas, ontologies)

    // Set content type and disposition
    if (format === 'jsonl') {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Content-Disposition', 'attachment; filename="personas.jsonl"')
      return reply.send(exportData)
    } else {
      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', 'attachment; filename="personas.json"')
      const lines = exportData.split('\n').filter(Boolean)
      const jsonArray = lines.map(line => JSON.parse(line))
      return reply.send(JSON.stringify(jsonArray, null, 2))
    }
  })

  /**
   * Export world state objects (entities, events, times, collections, relations).
   *
   * @route GET /api/export/world
   * @queryparam format - Export format (default: jsonl)
   * @returns JSON Lines file with world state objects
   */
  fastify.get('/api/export/world', {
    onRequest: [requireAuth],
    schema: {
      description: 'Export world state objects',
      tags: ['export'],
      querystring: Type.Object({
        format: Type.Optional(Type.Union([
          Type.Literal('jsonl'),
          Type.Literal('json')
        ]))
      }),
      response: {
        200: Type.String(),
        404: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { format = 'jsonl' } = request.query as { format?: 'jsonl' | 'json' }

    // Fetch world state for the authenticated user
    const worldState = await fastify.prisma.worldState.findFirst({
      where: { userId: request.user!.id }
    })

    if (!worldState) {
      reply.code(404)
      return reply.send({
        error: 'Not found',
        message: 'No world state data found'
      })
    }

    // Export world state
    const exportData = exporter.exportWorldState(worldState)

    // Set content type and disposition
    if (format === 'jsonl') {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Content-Disposition', 'attachment; filename="world-state.jsonl"')
      return reply.send(exportData)
    } else {
      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', 'attachment; filename="world-state.json"')
      const lines = exportData.split('\n').filter(Boolean)
      const jsonArray = lines.map(line => JSON.parse(line))
      return reply.send(JSON.stringify(jsonArray, null, 2))
    }
  })

  /**
   * Export video summaries with their claims and claim relations.
   *
   * @route GET /api/export/summaries
   * @queryparam format - Export format (default: jsonl)
   * @queryparam videoIds - Comma-separated list of video IDs to filter
   * @queryparam personaIds - Comma-separated list of persona IDs to filter
   * @returns JSON Lines file with summaries, claims, and claim relations
   */
  fastify.get('/api/export/summaries', {
    onRequest: [requireAuth],
    schema: {
      description: 'Export video summaries with claims',
      tags: ['export'],
      querystring: Type.Object({
        format: Type.Optional(Type.Union([
          Type.Literal('jsonl'),
          Type.Literal('json')
        ])),
        videoIds: Type.Optional(Type.String()),
        personaIds: Type.Optional(Type.String())
      }),
      response: {
        200: Type.String()
      }
    }
  }, async (request, reply) => {
    const {
      format = 'jsonl',
      videoIds,
      personaIds
    } = request.query as {
      format?: 'jsonl' | 'json'
      videoIds?: string
      personaIds?: string
    }

    // Parse filter parameters
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : undefined

    // Build where clause
    const where: {
      videoId?: { in: string[] }
      personaId?: { in: string[] }
    } = {}

    if (videoIdArray && videoIdArray.length > 0) {
      where.videoId = { in: videoIdArray }
    }
    if (personaIdArray && personaIdArray.length > 0) {
      where.personaId = { in: personaIdArray }
    }

    // Always scope to user's personas
    const userPersonas = await fastify.prisma.persona.findMany({
      where: { userId: request.user!.id },
      select: { id: true }
    })
    const userPersonaIds = userPersonas.map(p => p.id)

    // Add user persona filtering
    if (where.personaId) {
      // Intersect with user's personas
      const requestedIds = where.personaId.in
      where.personaId = { in: requestedIds.filter((id: string) => userPersonaIds.includes(id)) }
    } else {
      where.personaId = { in: userPersonaIds }
    }

    // Fetch summaries
    const summaries = await fastify.prisma.videoSummary.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    // Fetch claims for these summaries
    const summaryIds = summaries.map(s => s.id)
    const claims = await fastify.prisma.claim.findMany({
      where: { summaryId: { in: summaryIds } },
      orderBy: { createdAt: 'asc' }
    })

    // Fetch claim relations
    const claimIds = claims.map(c => c.id)
    const claimRelations = await fastify.prisma.claimRelation.findMany({
      where: {
        OR: [
          { sourceClaimId: { in: claimIds } },
          { targetClaimId: { in: claimIds } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    })

    // Export summaries with claims
    const exportData = exporter.exportSummariesWithClaims(summaries, claims, claimRelations)

    // Set headers with export stats
    reply.header('X-Export-Summaries', summaries.length.toString())
    reply.header('X-Export-Claims', claims.length.toString())
    reply.header('X-Export-ClaimRelations', claimRelations.length.toString())

    // Set content type and disposition
    if (format === 'jsonl') {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Content-Disposition', 'attachment; filename="summaries.jsonl"')
      return reply.send(exportData)
    } else {
      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', 'attachment; filename="summaries.json"')
      const lines = exportData.split('\n').filter(Boolean)
      const jsonArray = lines.map(line => JSON.parse(line))
      return reply.send(JSON.stringify(jsonArray, null, 2))
    }
  })
}

export default exportRoute
