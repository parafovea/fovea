import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { PrismaClient, Prisma } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import type { AppAbility } from '../lib/abilities.js'
import { AnnotationExporter } from '../services/export-handler.js'
import type { VideoAnnotationOutput } from '../services/video-annotation-mapper.js'
import { readOntologyAggregate } from '../services/layers-bridge/ontology-bridge.js'
import { readWorldAggregate } from '../services/layers-bridge/world-bridge.js'
import { readSummaryClaims } from '../services/layers-bridge/claim-bridge.js'
import type { StoredClaim, StoredRelation } from '../services/claim-layers-mapper.js'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { ForbiddenError } from '../lib/errors.js'

/** The ontology export shape reconstructed from the layers store. */
interface OntologyExportRow {
  personaId: string
  entityTypes: unknown[]
  eventTypes: unknown[]
  roleTypes: unknown[]
  relationTypes: unknown[]
}

/**
 * Reconstructs each persona's ontology from the layers store, skipping personas
 * that have no ontology in either store.
 */
async function collectOntologies(
  prisma: PrismaClient,
  personaIds: string[],
): Promise<OntologyExportRow[]> {
  const rows: OntologyExportRow[] = []
  for (const personaId of personaIds) {
    const { aggregate, exists } = await readOntologyAggregate(prisma, personaId)
    if (!exists) continue
    rows.push({
      personaId,
      entityTypes: aggregate.entityTypes,
      eventTypes: aggregate.eventTypes,
      roleTypes: aggregate.roleTypes,
      relationTypes: aggregate.relationTypes,
    })
  }
  return rows
}

/**
 * Reconstructs the readable claims and relations for a set of summaries from the
 * layers store. Claims are filtered by the caller's CASL read ability, and
 * relations are kept only when both endpoints reference readable claims.
 */
async function collectClaims(
  prisma: PrismaClient,
  ability: AppAbility,
  summaryIds: string[],
): Promise<{ claims: StoredClaim[]; relations: StoredRelation[] }> {
  const claims: StoredClaim[] = []
  const relations: StoredRelation[] = []
  for (const summaryId of summaryIds) {
    const summary = await readSummaryClaims(prisma, summaryId)
    for (const claim of summary.claims) {
      if (ability.can('read', subject('Claim', { ...claim }))) claims.push(claim)
    }
    relations.push(...summary.relations)
  }
  const readableClaimIds = new Set(claims.map(c => c.id))
  const keptRelations = relations.filter(
    r => readableClaimIds.has(r.sourceClaimId) || readableClaimIds.has(r.targetClaimId),
  )
  return { claims, relations: keptRelations }
}

/**
 * Reconstructs a scope's annotations from the layers store unioned with any
 * legacy rows, filtered by the caller's CASL read ability. The layers and legacy
 * WHERE clauses are composed from the persona/video/user scoping plus the CASL
 * read filter for each store.
 */
async function collectAnnotationOutputs(
  exporter: AnnotationExporter,
  prisma: PrismaClient,
  ability: AppAbility,
  scope: {
    personaIds: string[]
    userPersonaIds: string[]
    userId: string
    videoIds?: string[]
  },
): Promise<VideoAnnotationOutput[]> {
  let layersScope: Prisma.LayersAnnotationWhereInput
  let legacyScope: Prisma.AnnotationWhereInput
  if (scope.personaIds.length > 0) {
    const scopedIds = scope.personaIds.filter(id => scope.userPersonaIds.includes(id))
    layersScope = { layer: { personaId: { in: scopedIds } } }
    legacyScope = { personaId: { in: scopedIds } }
  } else {
    layersScope = {
      OR: [
        { layer: { personaId: { in: scope.userPersonaIds } } },
        { layer: { personaId: null }, createdByUserId: scope.userId },
      ],
    }
    legacyScope = {
      OR: [{ personaId: { in: scope.userPersonaIds } }, { personaId: null, userId: scope.userId }],
    }
  }

  const layersAnd: Prisma.LayersAnnotationWhereInput[] = [
    layersScope,
    accessibleBy(ability, 'read').LayersAnnotation,
  ]
  const legacyAnd: Prisma.AnnotationWhereInput[] = [
    legacyScope,
    accessibleBy(ability, 'read').Annotation,
  ]
  if (scope.videoIds && scope.videoIds.length > 0) {
    layersAnd.push({ layer: { expression: { videoId: { in: scope.videoIds } } } })
    legacyAnd.push({ videoId: { in: scope.videoIds } })
  }

  return exporter.readAnnotationOutputs(prisma, {
    layersWhere: { AND: layersAnd },
    legacyWhere: { AND: legacyAnd },
  })
}

/**
 * Fastify plugin for export-related routes.
 * Provides endpoints for exporting all user data.
 *
 * Every export reconstructs the legacy bundle shape from the unified layers
 * store: ontologies, world state, claims, and annotations are read back through
 * the layers bridge (which falls through to the legacy tables only when no
 * layers rows exist yet), so the export format is unchanged.
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
    onRequest: [requireAuth, buildAbilities],
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
        200: Type.String()
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
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : []
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

    const lines: string[] = []

    // 1. Export personas with ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: {
        AND: [
          { userId: request.user!.id },
          accessibleBy(ability, 'read').Persona,
        ],
      },
      orderBy: { createdAt: 'asc' }
    })
    const userPersonaIds = personas.map(p => p.id)
    const ontologies = await collectOntologies(fastify.prisma, userPersonaIds)
    if (personas.length > 0) {
      lines.push(exporter.exportPersonasWithOntologies(personas, ontologies))
    }

    // 2. Export world state
    const { aggregate: worldAggregate, exists: worldExists } = await readWorldAggregate(
      fastify.prisma,
      { userId: request.user!.id, projectId: null },
    )
    if (worldExists) {
      const worldLines = exporter.exportWorldState(worldAggregate)
      if (worldLines) {
        lines.push(worldLines)
      }
    }

    // 3. Export summaries with claims
    const summaries = await fastify.prisma.videoSummary.findMany({
      where: {
        AND: [
          { personaId: { in: userPersonaIds } },
          accessibleBy(ability, 'read').VideoSummary,
        ],
      },
      orderBy: { createdAt: 'asc' }
    })
    const summaryIds = summaries.map(s => s.id)
    const { claims, relations: claimRelations } = await collectClaims(fastify.prisma, ability, summaryIds)
    if (summaries.length > 0 || claims.length > 0) {
      lines.push(exporter.exportSummariesWithClaims(summaries, claims, claimRelations))
    }

    // 4. Export annotations with optional filtering
    const outputs = await collectAnnotationOutputs(exporter, fastify.prisma, ability, {
      personaIds: personaIdArray,
      userPersonaIds,
      userId: request.user!.id,
      videoIds: videoIdArray,
    })

    let convertedAnnotations = outputs.map(o => exporter.convertVideoAnnotationOutput(o))

    // Filter by annotation type if specified
    if (annotationTypeArray && annotationTypeArray.length > 0) {
      convertedAnnotations = convertedAnnotations.filter(a =>
        annotationTypeArray.includes(a.annotationType)
      )
    }

    // Filter out annotations with invalid sequences
    const validAnnotations = convertedAnnotations.filter(annotation => {
      const validation = exporter.validateSequence(annotation.boundingBoxSequence)
      if (!validation.valid) {
        fastify.log.warn({ annotationId: annotation.id, errors: validation.errors }, 'Skipping annotation with invalid sequence')
        return false
      }
      return true
    })
    const skippedCount = convertedAnnotations.length - validAnnotations.length
    if (skippedCount > 0) {
      reply.header('X-Export-Skipped', skippedCount.toString())
    }
    convertedAnnotations = validAnnotations

    if (convertedAnnotations.length > 0) {
      lines.push(exporter.exportAnnotations(convertedAnnotations, { includeInterpolated }))
    }

    const exportData = lines.filter(Boolean).join('\n')

    // Get world state counts for headers
    const worldCounts = worldExists ? {
      entities: worldAggregate.entities.length,
      events: worldAggregate.events.length,
      times: worldAggregate.times.length,
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
    onRequest: [requireAuth, buildAbilities],
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
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : []
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

    // 1. Count personas and ontologies
    const personas = await fastify.prisma.persona.findMany({
      where: {
        AND: [
          { userId: request.user!.id },
          accessibleBy(ability, 'read').Persona,
        ],
      },
      orderBy: { createdAt: 'asc' }
    })
    const systemPersonaCount = personas.filter(p => p.isSystemGenerated).length
    const userPersonaIds = personas.map(p => p.id)
    const ontologies = await collectOntologies(fastify.prisma, userPersonaIds)

    // Count ontology types
    let entityTypeCount = 0
    let eventTypeCount = 0
    let roleTypeCount = 0
    let relationTypeCount = 0
    for (const ontology of ontologies) {
      entityTypeCount += ontology.entityTypes.length
      eventTypeCount += ontology.eventTypes.length
      roleTypeCount += ontology.roleTypes.length
      relationTypeCount += ontology.relationTypes.length
    }

    // 2. Count world state objects
    const { aggregate: worldAggregate, exists: worldExists } = await readWorldAggregate(
      fastify.prisma,
      { userId: request.user!.id, projectId: null },
    )
    const worldCounts = worldExists ? {
      entities: worldAggregate.entities.length,
      events: worldAggregate.events.length,
      times: worldAggregate.times.length,
      entityCollections: worldAggregate.entityCollections.length,
      eventCollections: worldAggregate.eventCollections.length,
      timeCollections: worldAggregate.timeCollections.length,
      relations: worldAggregate.relations.length,
    } : { entities: 0, events: 0, times: 0, entityCollections: 0, eventCollections: 0, timeCollections: 0, relations: 0 }

    // 3. Count summaries and claims (scoped to user's personas)
    const summaryWhere = {
      AND: [
        { personaId: { in: userPersonaIds } },
        accessibleBy(ability, 'read').VideoSummary,
      ],
    }
    const summaryCount = await fastify.prisma.videoSummary.count({ where: summaryWhere })
    const userSummaries = await fastify.prisma.videoSummary.findMany({
      where: summaryWhere,
      select: { id: true }
    })
    const { claims, relations: claimRelations } = await collectClaims(
      fastify.prisma,
      ability,
      userSummaries.map(s => s.id),
    )
    const claimCount = claims.length
    const claimRelationCount = claimRelations.length

    // 4. Count and analyze annotations (with optional filtering)
    const outputs = await collectAnnotationOutputs(exporter, fastify.prisma, ability, {
      personaIds: personaIdArray,
      userPersonaIds,
      userId: request.user!.id,
      videoIds: videoIdArray,
    })
    let annotations = outputs.map(o => exporter.convertVideoAnnotationOutput(o))

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
    onRequest: [requireAuth, buildAbilities],
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

    // Fetch user's personas
    const personas = await fastify.prisma.persona.findMany({
      where: {
        AND: [
          { userId: request.user!.id },
          accessibleBy(ability, 'read').Persona,
        ],
      },
      orderBy: { createdAt: 'asc' }
    })

    // Reconstruct ontologies for user's personas
    const ontologies = await collectOntologies(fastify.prisma, personas.map(p => p.id))

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
    onRequest: [requireAuth, buildAbilities],
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    // Reconstruct world state for the authenticated user
    const { aggregate: worldAggregate, exists: worldExists } = await readWorldAggregate(
      fastify.prisma,
      { userId: request.user!.id, projectId: null },
    )

    if (!worldExists) {
      reply.code(404)
      return reply.send({
        error: 'Not found',
        message: 'No world state data found'
      })
    }

    // Export world state
    const exportData = exporter.exportWorldState(worldAggregate)

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
    onRequest: [requireAuth, buildAbilities],
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

    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

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
      where: {
        AND: [
          where,
          accessibleBy(ability, 'read').VideoSummary,
        ],
      },
      orderBy: { createdAt: 'asc' }
    })

    // Reconstruct claims and relations for these summaries
    const { claims, relations: claimRelations } = await collectClaims(
      fastify.prisma,
      ability,
      summaries.map(s => s.id),
    )

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
