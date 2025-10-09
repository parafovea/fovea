import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { AnnotationExporter } from '../services/export-handler.js'

/**
 * TypeBox schema for validation errors.
 */
const ValidationErrorSchema = Type.Object({
  annotationId: Type.String(),
  errors: Type.Array(Type.String())
})

/**
 * Fastify plugin for export-related routes.
 * Provides endpoints for exporting annotations with bounding box sequences.
 *
 * Routes:
 * - GET /api/export - Export annotations in JSON Lines format
 */
const exportRoute: FastifyPluginAsync = async (fastify) => {
  const exporter = new AnnotationExporter()

  /**
   * Export annotations with bounding box sequences.
   * Supports filtering by persona, video, and annotation type.
   * Optionally includes fully interpolated frames or keyframes-only.
   *
   * @route GET /api/export
   * @queryparam format - Export format (default: jsonl)
   * @queryparam includeInterpolated - Include all interpolated frames (default: false)
   * @queryparam personaIds - Comma-separated list of persona IDs to filter
   * @queryparam videoIds - Comma-separated list of video IDs to filter
   * @queryparam annotationTypes - Comma-separated list of annotation types (type, object)
   * @returns JSON Lines file with annotations
   */
  fastify.get('/api/export', {
    schema: {
      description: 'Export annotations with bounding box sequences',
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

    // Parse filter parameters
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : undefined
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    // Build Prisma query filters
    const where: {
      personaId?: { in: string[] }
      videoId?: { in: string[] }
    } = {}

    if (personaIdArray && personaIdArray.length > 0) {
      where.personaId = { in: personaIdArray }
    }

    if (videoIdArray && videoIdArray.length > 0) {
      where.videoId = { in: videoIdArray }
    }

    if (annotationTypeArray && annotationTypeArray.length > 0) {
      // Need to filter by annotation type from frames JSON
      // This is more complex with Prisma, so we'll filter after fetching
    }

    // Fetch annotations from database
    const prismaAnnotations = await fastify.prisma.annotation.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    // Convert to export format
    let annotations = prismaAnnotations.map(a => exporter.convertPrismaAnnotation(a))

    // Filter by annotation type if specified
    if (annotationTypeArray && annotationTypeArray.length > 0) {
      annotations = annotations.filter(a =>
        annotationTypeArray.includes(a.annotationType)
      )
    }

    // Validate all sequences before export
    const validationErrors: Array<{ annotationId: string; errors: string[] }> = []

    for (const annotation of annotations) {
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

    // Get export statistics
    const stats = exporter.getExportStats(annotations, includeInterpolated)

    // Export annotations
    const exportData = exporter.exportAnnotations(annotations, {
      includeInterpolated,
      personaIds: personaIdArray,
      videoIds: videoIdArray,
      annotationTypes: annotationTypeArray
    })

    // Calculate size in MB
    const sizeInMB = (stats.totalSize / (1024 * 1024)).toFixed(2)

    // Set response headers with export statistics
    reply.header('X-Export-Size', `${sizeInMB}MB`)
    reply.header('X-Export-Annotations', stats.annotationCount.toString())
    reply.header('X-Export-Sequences', stats.sequenceCount.toString())
    reply.header('X-Export-Keyframes', stats.keyframeCount.toString())
    reply.header('X-Export-Interpolated-Frames', stats.interpolatedFrameCount.toString())

    // Add warning if export is large
    if (stats.totalSize > 100 * 1024 * 1024) {
      reply.header(
        'X-Export-Warning',
        'Large export. Consider filtering by persona or video.'
      )
    }

    // Set content type and disposition
    if (format === 'jsonl') {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Content-Disposition', 'attachment; filename="annotations.jsonl"')
    } else {
      // For JSON format, wrap in array
      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', 'attachment; filename="annotations.json"')

      // Convert JSON Lines to JSON array
      const lines = exportData.split('\n').filter(Boolean)
      const jsonArray = lines.map(line => JSON.parse(line))
      return reply.send(JSON.stringify(jsonArray, null, 2))
    }

    return reply.send(exportData)
  })

  /**
   * Get export statistics without performing the export.
   * Useful for estimating export size before downloading.
   *
   * @route GET /api/export/stats
   * @queryparam includeInterpolated - Include all interpolated frames (default: false)
   * @queryparam personaIds - Comma-separated list of persona IDs to filter
   * @queryparam videoIds - Comma-separated list of video IDs to filter
   * @queryparam annotationTypes - Comma-separated list of annotation types (type, object)
   * @returns Export statistics
   */
  fastify.get('/api/export/stats', {
    schema: {
      description: 'Get export statistics without performing export',
      tags: ['export'],
      querystring: Type.Object({
        includeInterpolated: Type.Optional(Type.Boolean()),
        personaIds: Type.Optional(Type.String()),
        videoIds: Type.Optional(Type.String()),
        annotationTypes: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Object({
          totalSize: Type.Number(),
          totalSizeMB: Type.String(),
          annotationCount: Type.Number(),
          sequenceCount: Type.Number(),
          keyframeCount: Type.Number(),
          interpolatedFrameCount: Type.Number(),
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

    // Parse filter parameters
    const personaIdArray = personaIds ? personaIds.split(',').filter(Boolean) : undefined
    const videoIdArray = videoIds ? videoIds.split(',').filter(Boolean) : undefined
    const annotationTypeArray = annotationTypes
      ? annotationTypes.split(',').filter(Boolean) as ('type' | 'object')[]
      : undefined

    // Build Prisma query filters
    const where: {
      personaId?: { in: string[] }
      videoId?: { in: string[] }
    } = {}

    if (personaIdArray && personaIdArray.length > 0) {
      where.personaId = { in: personaIdArray }
    }

    if (videoIdArray && videoIdArray.length > 0) {
      where.videoId = { in: videoIdArray }
    }

    // Fetch annotations from database
    const prismaAnnotations = await fastify.prisma.annotation.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    // Convert to export format
    let annotations = prismaAnnotations.map(a => exporter.convertPrismaAnnotation(a))

    // Filter by annotation type if specified
    if (annotationTypeArray && annotationTypeArray.length > 0) {
      annotations = annotations.filter(a =>
        annotationTypeArray.includes(a.annotationType)
      )
    }

    // Get export statistics
    const stats = exporter.getExportStats(annotations, includeInterpolated)

    // Calculate size in MB
    const sizeInMB = (stats.totalSize / (1024 * 1024)).toFixed(2)

    // Prepare response
    const response: {
      totalSize: number
      totalSizeMB: string
      annotationCount: number
      sequenceCount: number
      keyframeCount: number
      interpolatedFrameCount: number
      warning?: string
    } = {
      totalSize: stats.totalSize,
      totalSizeMB: `${sizeInMB}MB`,
      annotationCount: stats.annotationCount,
      sequenceCount: stats.sequenceCount,
      keyframeCount: stats.keyframeCount,
      interpolatedFrameCount: stats.interpolatedFrameCount
    }

    // Add warning if export is large
    if (stats.totalSize > 100 * 1024 * 1024) {
      response.warning = 'Large export. Consider filtering by persona or video.'
    }

    return reply.send(response)
  })
}

export default exportRoute
