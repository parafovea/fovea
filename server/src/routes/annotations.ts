import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'

/**
 * TypeBox schema for Annotation response.
 */
const AnnotationResponseSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  personaId: Type.String(),
  type: Type.String(),
  label: Type.String(),
  frames: Type.Unknown(),
  confidence: Type.Union([Type.Number(), Type.Null()]),
  source: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

/**
 * Fastify plugin for annotation-related routes.
 * Provides endpoints for retrieving and managing video annotations.
 *
 * Routes:
 * - GET /api/annotations/:videoId - Get annotations for a specific video
 * - POST /api/annotations - Create a new annotation
 * - PUT /api/annotations/:id - Update an annotation
 * - DELETE /api/annotations/:videoId/:id - Delete an annotation
 */
const annotationsRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all annotations for a specific video.
   *
   * @route GET /api/annotations/:videoId
   * @param videoId - ID of the video
   * @returns Array of annotations
   */
  fastify.get('/api/annotations/:videoId', {
    schema: {
      description: 'Get annotations for a specific video',
      tags: ['annotations'],
      params: Type.Object({
        videoId: Type.String()
      }),
      response: {
        200: Type.Array(AnnotationResponseSchema)
      }
    }
  }, async (request, reply) => {
    const { videoId } = request.params as { videoId: string }

    const annotations = await fastify.prisma.annotation.findMany({
      where: { videoId },
      orderBy: { createdAt: 'asc' }
    })

    return reply.send(annotations.map(a => ({
      id: a.id,
      videoId: a.videoId,
      personaId: a.personaId,
      type: a.type,
      label: a.label,
      frames: a.frames,
      confidence: a.confidence,
      source: a.source,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    })))
  })

  /**
   * Create a new annotation.
   *
   * @route POST /api/annotations
   * @param annotation - Annotation data
   * @returns Created annotation
   */
  fastify.post('/api/annotations', {
    schema: {
      description: 'Create a new annotation',
      tags: ['annotations'],
      body: Type.Object({
        videoId: Type.String(),
        personaId: Type.String(),
        type: Type.String(),
        label: Type.String(),
        frames: Type.Unknown(),
        confidence: Type.Optional(Type.Number()),
        source: Type.Optional(Type.String())
      }),
      response: {
        201: AnnotationResponseSchema
      }
    }
  }, async (request, reply) => {
    fastify.log.error('[ANNOTATION CREATE] RECEIVED BODY')
    fastify.log.error(JSON.stringify({
      body: request.body,
      hasType: 'type' in (request.body as any),
      keys: Object.keys(request.body as any)
    }))

    const data = request.body as {
      videoId: string
      personaId: string
      type: string
      label: string
      frames: Prisma.InputJsonValue
      confidence?: number
      source?: string
    }

    const annotation = await fastify.prisma.annotation.create({
      data: {
        videoId: data.videoId,
        personaId: data.personaId,
        type: data.type,
        label: data.label,
        frames: data.frames,
        confidence: data.confidence,
        source: data.source || 'manual'
      }
    })

    return reply.code(201).send({
      id: annotation.id,
      videoId: annotation.videoId,
      personaId: annotation.personaId,
      type: annotation.type,
      label: annotation.label,
      frames: annotation.frames,
      confidence: annotation.confidence,
      source: annotation.source,
      createdAt: annotation.createdAt.toISOString(),
      updatedAt: annotation.updatedAt.toISOString()
    })
  })

  /**
   * Update an existing annotation.
   *
   * @route PUT /api/annotations/:id
   * @param id - Annotation ID
   * @param annotation - Updated annotation data
   * @returns Updated annotation
   */
  fastify.put('/api/annotations/:id', {
    schema: {
      description: 'Update an annotation',
      tags: ['annotations'],
      params: Type.Object({
        id: Type.String()
      }),
      body: Type.Object({
        type: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        frames: Type.Optional(Type.Unknown()),
        confidence: Type.Optional(Type.Number()),
        source: Type.Optional(Type.String())
      }),
      response: {
        200: AnnotationResponseSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as {
      type?: string
      label?: string
      frames?: Prisma.InputJsonValue
      confidence?: number
      source?: string
    }

    const annotation = await fastify.prisma.annotation.update({
      where: { id },
      data: {
        type: data.type,
        label: data.label,
        frames: data.frames,
        confidence: data.confidence,
        source: data.source
      }
    })

    return reply.send({
      id: annotation.id,
      videoId: annotation.videoId,
      personaId: annotation.personaId,
      type: annotation.type,
      label: annotation.label,
      frames: annotation.frames,
      confidence: annotation.confidence,
      source: annotation.source,
      createdAt: annotation.createdAt.toISOString(),
      updatedAt: annotation.updatedAt.toISOString()
    })
  })

  /**
   * Delete an annotation.
   *
   * @route DELETE /api/annotations/:videoId/:id
   * @param videoId - Video ID
   * @param id - Annotation ID
   */
  fastify.delete('/api/annotations/:videoId/:id', {
    schema: {
      description: 'Delete an annotation',
      tags: ['annotations'],
      params: Type.Object({
        videoId: Type.String(),
        id: Type.String()
      }),
      response: {
        204: Type.Null()
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    await fastify.prisma.annotation.delete({
      where: { id }
    })

    return reply.code(204).send()
  })
}

export default annotationsRoute
