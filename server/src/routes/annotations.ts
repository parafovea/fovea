import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma, Annotation as PrismaAnnotation } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import type { PureAbility } from '@casl/ability'
import type { PrismaQuery } from '@casl/prisma'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import type { AppAbility } from '../lib/abilities.js'

/**
 * Cast AppAbility to the shape @casl/prisma expects for accessibleBy. The
 * two libraries have different generic constraints that cannot be unified
 * without a cast; runtime behaviour is identical because both operate on
 * the same rule array.
 */
function prismaAbility(ability: AppAbility): PureAbility<[string, string], PrismaQuery> {
  return ability as unknown as PureAbility<[string, string], PrismaQuery>
}

/**
 * TypeBox schema for Annotation response.
 */
const AnnotationResponseSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  personaId: Type.Union([Type.Null(), Type.String()]),
  type: Type.String(),
  label: Type.String(),
  frames: Type.Unknown(),
  confidence: Type.Union([Type.Null(), Type.Number()]),
  source: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

/**
 * Fastify plugin for annotation-related routes.
 *
 * Every route requires authentication, builds the caller's CASL abilities,
 * and filters/verifies access against them. List endpoints apply
 * `accessibleBy(ability).Annotation` as a Prisma WHERE clause so the caller
 * only sees annotations they can read. Single-record endpoints load the
 * annotation first and run an instance-level `ability.can()` check before
 * proceeding.
 */
const annotationsRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get annotations for a specific video, filtered to what the caller can read.
   */
  fastify.get('/api/annotations/:videoId', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Get annotations for a specific video that the caller is authorized to read',
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const annotations = await fastify.prisma.annotation.findMany({
      where: {
        AND: [
          { videoId },
          accessibleBy(prismaAbility(request.ability), 'read').Annotation,
        ],
      },
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
   * Create a new annotation. Inherits projectId from the linked persona's
   * project (if any) so the new annotation is scoped consistently. Caller
   * must have `create` permission on Annotation in the resulting scope.
   */
  fastify.post('/api/annotations', {
    onRequest: [requireAuth, buildAbilities],
    schema: {
      description: 'Create a new annotation',
      tags: ['annotations'],
      body: Type.Object({
        videoId: Type.String(),
        personaId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
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
    const data = request.body as {
      videoId: string
      personaId?: string | null
      type: string
      label: string
      frames: Prisma.InputJsonValue
      confidence?: number
      source?: string
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const userId = request.user!.id

    // Resolve the project context from the persona (if any). Annotations
    // against a persona inherit that persona's project scope.
    let projectId: string | null = null
    if (data.personaId) {
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: data.personaId },
        select: { projectId: true, userId: true },
      })
      if (!persona) throw new NotFoundError('Persona', data.personaId)
      projectId = persona.projectId
    }

    // Pre-authorize the create in the resolved scope. Build a candidate
    // shape carrying the final projectId and createdByUserId so CASL's
    // MongoQuery conditions ({ projectId: { $in: memberProjects } } or
    // { createdByUserId: userId }) resolve against actual field values.
    const candidate = subject('Annotation', {
      projectId,
      createdByUserId: userId,
    } as unknown as PrismaAnnotation)
    if (!request.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Annotation in this scope')
    }

    const annotation = await fastify.prisma.annotation.create({
      data: {
        videoId: data.videoId,
        personaId: data.personaId ?? null,
        userId,
        createdByUserId: userId,
        projectId,
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
   * Update an annotation. Caller must have `update` permission on the
   * specific annotation instance (not merely on Annotation in general).
   */
  fastify.put('/api/annotations/:id', {
    onRequest: [requireAuth, buildAbilities],
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const existing = await fastify.prisma.annotation.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Annotation', id)

    if (!request.ability.can('update', subject('Annotation', existing))) {
      throw new ForbiddenError('Cannot update this Annotation')
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
   * Delete an annotation. Caller must have `delete` permission on the
   * specific annotation instance.
   */
  fastify.delete('/api/annotations/:videoId/:id', {
    onRequest: [requireAuth, buildAbilities],
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const existing = await fastify.prisma.annotation.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Annotation', id)

    if (!request.ability.can('delete', subject('Annotation', existing))) {
      throw new ForbiddenError('Cannot delete this Annotation')
    }

    await fastify.prisma.annotation.delete({ where: { id } })

    return reply.code(204).send()
  })
}

export default annotationsRoute
