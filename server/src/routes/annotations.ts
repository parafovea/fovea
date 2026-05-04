import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { assertAnnotationOwned, assertPersonaOwned } from '../lib/ownership.js'
import { requireAuth } from '../middleware/auth.js'

/**
 * TypeBox schema for Annotation response.
 */
const AnnotationResponseSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  personaId: Type.Union([Type.Null(), Type.String()]),
  type: Type.String(),
  label: Type.String(),
  /// 'entity' | 'event' | 'time' | 'location' | null. NULL for type
  /// annotations and for legacy object annotations created before the
  /// column existed (the frontend treats those as entity-linked).
  linkType: Type.Union([Type.Null(), Type.String()]),
  frames: Type.Unknown(),
  confidence: Type.Union([Type.Null(), Type.Number()]),
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
    onRequest: [requireAuth],
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

    // Scope to the requesting user's annotations: type annotations attached to
    // the user's personas plus persona-less object annotations the user owns.
    // Mirrors the filter used by routes/export.ts so a multi-user instance
    // never surfaces another user's imported copies in the All Annotations tab.
    const userPersonas = await fastify.prisma.persona.findMany({
      where: { userId: request.user!.id },
      select: { id: true }
    })
    const userPersonaIds = userPersonas.map(p => p.id)

    const annotations = await fastify.prisma.annotation.findMany({
      where: {
        videoId,
        OR: [
          { personaId: { in: userPersonaIds } },
          { personaId: null, userId: request.user!.id }
        ]
      },
      orderBy: { createdAt: 'asc' }
    })

    return reply.send(annotations.map(a => ({
      id: a.id,
      videoId: a.videoId,
      personaId: a.personaId,
      type: a.type,
      label: a.label,
      linkType: a.linkType,
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
    onRequest: [requireAuth],
    schema: {
      description: 'Create a new annotation',
      tags: ['annotations'],
      body: Type.Object({
        videoId: Type.String(),
        personaId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        type: Type.String(),
        label: Type.String(),
        // Optional for back-compat with clients that haven't been updated;
        // when omitted the column stays NULL and the frontend treats the
        // row as entity-linked (the historical default).
        linkType: Type.Optional(Type.Union([
          Type.Null(),
          Type.Literal('entity'),
          Type.Literal('event'),
          Type.Literal('time'),
          Type.Literal('location'),
        ])),
        frames: Type.Unknown(),
        confidence: Type.Optional(Type.Number()),
        source: Type.Optional(Type.String())
      }),
      response: {
        201: AnnotationResponseSchema
      }
    }
  }, async (request, reply) => {
    const data = request.body as {
      videoId: string
      personaId?: string | null
      type: string
      label: string
      linkType?: 'entity' | 'event' | 'time' | 'location' | null
      frames: Prisma.InputJsonValue
      confidence?: number
      source?: string
    }

    // If a personaId is supplied, it must belong to the requester. Without
    // this guard, A could inject a type annotation attributed to B's persona,
    // which would then surface in B's All Annotations list as a foreign row.
    if (data.personaId) {
      await assertPersonaOwned(fastify.prisma, data.personaId, request.user!.id)
    }

    const annotation = await fastify.prisma.annotation.create({
      data: {
        videoId: data.videoId,
        personaId: data.personaId ?? null,
        userId: request.user?.id ?? null,
        type: data.type,
        label: data.label,
        linkType: data.type === 'object' ? (data.linkType ?? null) : null,
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
      linkType: annotation.linkType,
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
    onRequest: [requireAuth],
    schema: {
      description: 'Update an annotation',
      tags: ['annotations'],
      params: Type.Object({
        id: Type.String()
      }),
      body: Type.Object({
        type: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        linkType: Type.Optional(Type.Union([
          Type.Null(),
          Type.Literal('entity'),
          Type.Literal('event'),
          Type.Literal('time'),
          Type.Literal('location'),
        ])),
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
      linkType?: 'entity' | 'event' | 'time' | 'location' | null
      frames?: Prisma.InputJsonValue
      confidence?: number
      source?: string
    }

    // Ownership-checked existence lookup; returns 404 for foreign annotations.
    await assertAnnotationOwned(fastify.prisma, id, request.user!.id)

    const annotation = await fastify.prisma.annotation.update({
      where: { id },
      data: {
        type: data.type,
        label: data.label,
        linkType: data.linkType,
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
      linkType: annotation.linkType,
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
    onRequest: [requireAuth],
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

    await assertAnnotationOwned(fastify.prisma, id, request.user!.id)

    await fastify.prisma.annotation.delete({
      where: { id }
    })

    return reply.code(204).send()
  })
}

export default annotationsRoute
