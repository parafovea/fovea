import { randomUUID } from 'node:crypto'

import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'

import { NotFoundError, ForbiddenError, ConflictError } from '../../lib/errors.js'
import {
  isVideoAnnotationSubkind,
  removeTrackMembership,
  tracksByAnnotation,
  VIDEO_ANNOTATION_SUBKINDS,
  type VideoAnnotationInput,
  type VideoAnnotationLinkType,
} from '../../services/video-annotation-shared.js'
import { layersToAnnotation } from '../../services/layers-lens/video-lens.js'
import {
  getOrCreateVideoExpression,
} from '../../services/video-expression-service.js'
import { trackClusterSetId } from '../../services/layers-id-map.js'
import { demoLayersAnnotationReadWhere } from '../../lib/demo-rbac.js'
import { writeVideoAnnotation, readAnnotationById } from '../../services/layers-bridge/annotation-bridge.js'
import type { BoundingBoxSequence } from '../../services/layers-conversion-service.js'
import { VideoAccessService } from '../../services/video-access-service.js'

/** Nullable string response field (serializes null correctly; see fastify-typebox skill). */
const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })
/** Nullable number response field. */
const NullableNumber = Type.Unsafe<number | null>({ type: ['number', 'null'] })

/**
 * Response shape for a video annotation. Matches the legacy `/api/annotations`
 * contract so the frontend `Annotation` wire shape is unchanged: the timeline,
 * drawing, and keyframe UI keep operating on the same view-model.
 */
const VideoAnnotationResponseSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  personaId: NullableString,
  type: Type.String(),
  label: Type.String(),
  linkType: NullableString,
  frames: Type.Unknown(),
  confidence: NullableNumber,
  source: Type.String(),
  notes: Type.Optional(Type.String()),
  linkedObjectName: Type.Optional(NullableString),
  createdBy: NullableString,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** The object-annotation link kinds accepted on create. */
const LinkTypeSchema = Type.Union([
  Type.Null(),
  Type.Literal('entity'),
  Type.Literal('event'),
  Type.Literal('time'),
  Type.Literal('location'),
  Type.Literal('entity-collection'),
  Type.Literal('event-collection'),
  Type.Literal('time-collection'),
])

/** Coerces a value to a Prisma JSON input, stripping undefined properties. */
function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Video-annotation routes over the unified layers store. Registered by the
 * layers aggregator under the `/api/layers` prefix, behind its shared
 * `requireAuth` + `buildAbilities` hooks (which this module must not
 * re-register). Each annotation persists as one `LayersAnnotation` under a
 * per-(video, persona) grouping `AnnotationLayer`, converted to and from the
 * legacy `BoundingBoxSequence` server-side. Authorization mirrors
 * `routes/annotations.ts`: list endpoints apply the CASL read filter, and
 * single-row endpoints run an instance-level `can()` check.
 */
const videoAnnotationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = fastify.prisma
  const videoAccess = new VideoAccessService(prisma)

  // Check the source before materializing shared rows or reading annotations.
  fastify.addHook('preHandler', async request => {
    const { videoId } = request.params as { videoId: string }
    const accessible = await videoAccess.getAccessibleVideoIds(request.user!.id, request.user!.systemRole || 'user')
    if (accessible !== 'all' && !accessible.includes(videoId)) {
      throw new NotFoundError('Video', videoId)
    }
  })

  // ---- GET -----------------------------------------------------------------

  /**
   * List a video's annotations the caller can read, reconstructed from the
   * layers store into the legacy annotation shape.
   */
  fastify.get('/videos/:videoId/annotations', {
    schema: {
      description: 'List a video\'s annotations from the layers store that the caller can read',
      tags: ['layers'],
      params: Type.Object({ videoId: Type.String() }),
      response: { 200: Type.Array(VideoAnnotationResponseSchema) },
    },
  }, async (request, reply) => {
    const { videoId } = request.params as { videoId: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const { expressionId, video } = await getOrCreateVideoExpression(prisma, videoId)

    const readScope = accessibleBy(request.ability, 'read').LayersAnnotation
    // In demo mode also match annotations grouped under a system persona, so an
    // anonymous visitor whose CASL ability is scoped to their own data still
    // sees the seed user's curated tour annotations (see lib/demo-rbac.ts).
    const demoScope = demoLayersAnnotationReadWhere()
    const accessScope = demoScope ? { OR: [readScope, demoScope] } : readScope
    // Scope to the video-annotation subkinds so span layers of other kinds
    // (notably claim text spans, subkind 'claim') that anchor over the same
    // video Expression never surface here as bounding-box annotations.
    const rows = await prisma.layersAnnotation.findMany({
      where: {
        AND: [
          accessScope,
          { layer: { expressionId, subkind: { in: [...VIDEO_ANNOTATION_SUBKINDS] } } },
        ],
      },
      include: { layer: true, denotesNode: true },
      orderBy: { createdAt: 'asc' },
    })

    // The video's track ClusterSet resolves each annotation's tracker identity.
    const trackSet = await prisma.clusterSet.findUnique({
      where: { id: trackClusterSetId(videoId) },
    })
    const tracks = tracksByAnnotation(trackSet?.clusters ?? null)

    return reply.send(rows.map((row) => layersToAnnotation(
      row,
      { personaId: row.layer.personaId, sourceMethod: row.layer.sourceMethod },
      { id: video.id, frameRate: video.frameRate },
      row.denotesNode ? { nodeType: row.denotesNode.nodeType, label: row.denotesNode.label } : null,
      tracks.get(row.id) ?? null,
    )))
  })

  // ---- POST ----------------------------------------------------------------

  /**
   * Create a video annotation, or update it in place when a client-supplied id
   * already exists (idempotent create), mirroring the legacy route's
   * P2002-guarded idempotency so autosave never mints duplicate rows.
   */
  fastify.post('/videos/:videoId/annotations', {
    schema: {
      description: 'Create a video annotation in the layers store (idempotent by client id)',
      tags: ['layers'],
      params: Type.Object({ videoId: Type.String() }),
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        videoId: Type.Optional(Type.String()),
        personaId: Type.Optional(NullableString),
        type: Type.String(),
        label: Type.String(),
        linkType: Type.Optional(LinkTypeSchema),
        frames: Type.Unknown(),
        confidence: Type.Optional(Type.Number()),
        source: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
      }),
      response: {
        200: VideoAnnotationResponseSchema,
        201: VideoAnnotationResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { videoId } = request.params as { videoId: string }
    const body = request.body as {
      id?: string
      personaId?: string | null
      type: string
      label: string
      linkType?: VideoAnnotationLinkType | null
      frames: BoundingBoxSequence
      confidence?: number
      source?: string
      notes?: string
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability
    const userId = request.user!.id

    // Resolve the project scope + ontology binding from the persona, mirroring
    // annotations.ts: a type annotation inherits its persona's project scope and
    // the caller must be able to read that persona.
    let projectId: string | null = null
    if (body.personaId) {
      const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
      if (!persona) throw new NotFoundError('Persona', body.personaId)
      if (!ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create an annotation under this Persona')
      }
      projectId = persona.projectId
    } else {
      // Personaless object annotation: with no persona to inherit project scope
      // from, adopt the video's project only when exactly one of the caller's
      // projects has this video assigned, so a project reviewer can see it. A
      // zero or ambiguous (multiple) assignment stays personal (projectId = null).
      const assignments = await prisma.projectVideoAssignment.findMany({
        where: { videoId },
        select: { projectId: true },
      })
      const assignedProjectIds = [...new Set(assignments.map((a) => a.projectId))]
      if (assignedProjectIds.length > 0) {
        const memberships = await prisma.projectMembership.findMany({
          where: { userId, projectId: { in: assignedProjectIds } },
          select: { projectId: true },
        })
        const memberProjectIds = [...new Set(memberships.map((m) => m.projectId))]
        if (memberProjectIds.length === 1) projectId = memberProjectIds[0]
      }
    }

    const annotationId = body.id ?? randomUUID()
    const input: VideoAnnotationInput = {
      id: annotationId,
      videoId,
      personaId: body.personaId ?? null,
      type: body.type,
      label: body.label,
      linkType: body.linkType ?? null,
      frames: body.frames,
      confidence: body.confidence ?? null,
      source: body.source || 'manual',
      notes: body.notes,
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${annotationId}, 0))`
      const existing = await tx.layersAnnotation.findUnique({
        where: { id: annotationId },
        include: { layer: { include: { expression: true } } },
      })
      if (existing) {
        if (!isVideoAnnotationSubkind(existing.layer.subkind) ||
          existing.layer.expression.videoId !== videoId || existing.layer.personaId !== input.personaId) {
          throw new ConflictError(`An annotation with id ${annotationId} already exists`)
        }
        if (!ability.can('update', subject('LayersAnnotation', existing))) {
          throw new ForbiddenError('Cannot update this Annotation')
        }
      } else if (!ability.can('create', subject('LayersAnnotation', { projectId, createdByUserId: userId }))) {
        throw new ForbiddenError('Cannot create Annotation in this scope')
      }
      await writeVideoAnnotation(tx as PrismaClient, input, {
        projectId: existing ? existing.projectId : projectId,
        userId: existing ? existing.createdByUserId : userId,
      })
      return { created: !existing, annotation: await readAnnotationById(tx as PrismaClient, annotationId) }
    })
    return reply.code(result.created ? 201 : 200).send(result.annotation)
  })

  // ---- PUT -----------------------------------------------------------------

  /**
   * Update a video annotation (e.g. moving a keyframe). Caller must have update
   * permission on the specific annotation instance. Only the frames and the
   * mutable scalar fields are re-mapped; the grouping layer and persona are
   * fixed by the existing row.
   */
  fastify.put('/videos/:videoId/annotations/:id', {
    schema: {
      description: 'Update a video annotation in the layers store',
      tags: ['layers'],
      params: Type.Object({ videoId: Type.String(), id: Type.String() }),
      body: Type.Object({
        type: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        linkType: Type.Optional(LinkTypeSchema),
        frames: Type.Optional(Type.Unknown()),
        confidence: Type.Optional(Type.Number()),
        source: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
      }),
      response: { 200: VideoAnnotationResponseSchema },
    },
  }, async (request, reply) => {
    const { videoId, id } = request.params as { videoId: string; id: string }
    const body = request.body as {
      type?: string
      label?: string
      linkType?: VideoAnnotationLinkType | null
      frames?: BoundingBoxSequence
      confidence?: number
      source?: string
      notes?: string
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`
      const existing = await tx.layersAnnotation.findUnique({
        where: { id },
        include: { layer: { include: { expression: true } } },
      })
      if (!existing || !isVideoAnnotationSubkind(existing.layer.subkind) || existing.layer.expression.videoId !== videoId) {
        throw new NotFoundError('Annotation', id)
      }
      if (!ability.can('update', subject('LayersAnnotation', existing))) {
        throw new ForbiddenError('Cannot update this Annotation')
      }
      const current = await readAnnotationById(tx as PrismaClient, id)
      if (!current) throw new NotFoundError('Annotation', id)
      const input: VideoAnnotationInput = {
        ...current,
        ...body,
        id,
        videoId,
        personaId: existing.layer.personaId,
      }
      await writeVideoAnnotation(tx as PrismaClient, input, {
        projectId: existing.projectId,
        userId: existing.createdByUserId,
      })
      return readAnnotationById(tx as PrismaClient, id)
    })
    return reply.send(result)
  })

  // ---- DELETE --------------------------------------------------------------

  /**
   * Delete a video annotation. Caller must have delete permission on the
   * specific annotation instance. The grouping layer is left in place (it may
   * hold other annotations).
   */
  fastify.delete('/videos/:videoId/annotations/:id', {
    schema: {
      description: 'Delete a video annotation from the layers store',
      tags: ['layers'],
      params: Type.Object({ videoId: Type.String(), id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { videoId, id } = request.params as { videoId: string; id: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`
      const existing = await tx.layersAnnotation.findUnique({
        where: { id },
        include: { layer: { include: { expression: true } } },
      })
      if (!existing || !isVideoAnnotationSubkind(existing.layer.subkind) || existing.layer.expression.videoId !== videoId) {
        throw new NotFoundError('Annotation', id)
      }
      if (!request.ability!.can('delete', subject('LayersAnnotation', existing))) {
        throw new ForbiddenError('Cannot delete this Annotation')
      }
      const setId = trackClusterSetId(videoId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${setId}, 0))`
      await tx.layersAnnotation.delete({ where: { id } })
      const trackSet = await tx.clusterSet.findUnique({ where: { id: setId } })
      if (trackSet) await tx.clusterSet.update({
        where: { id: setId },
        data: { clusters: toJsonInput(removeTrackMembership(trackSet.clusters, id)) },
      })
    })

    return reply.code(204).send()
  })
}

export default videoAnnotationsRoutes
