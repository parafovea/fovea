import { randomUUID } from 'node:crypto'

import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma, type LayersAnnotation } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'

import { NotFoundError, ForbiddenError } from '../../lib/errors.js'
import {
  annotationToLayers,
  layersToAnnotation,
  isVideoAnnotationSubkind,
  VIDEO_ANNOTATION_SUBKINDS,
  type VideoAnnotationInput,
  type VideoAnnotationLinkType,
} from '../../services/video-annotation-mapper.js'
import {
  getOrCreateVideoExpression,
  parseResolution,
} from '../../services/video-expression-service.js'
import { layersOntologyForPersonaId } from '../../services/layers-id-map.js'
import { demoLayersAnnotationReadWhere } from '../../lib/demo-rbac.js'
import type { BoundingBoxSequence } from '../../services/layers-conversion-service.js'

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

  /**
   * Resolves the `LayersOntology` id to bind a type layer to, mirroring the
   * backfill: the persona's derived ontology id when that ontology exists, else
   * null (a soft binding, so a missing ontology does not block annotating).
   */
  const resolveOntologyId = async (personaId: string): Promise<string | null> => {
    const candidate = layersOntologyForPersonaId(personaId)
    const exists = (await prisma.layersOntology.count({ where: { id: candidate } })) > 0
    return exists ? candidate : null
  }

  /**
   * Resolves the denotation foreign key for an object annotation: the candidate
   * node id when a `GraphNode` with that id exists, else null. The column is a
   * real foreign key, so a link to a not-yet-migrated world object is stored as
   * null; the annotation `label` and features preserve the link either way.
   */
  const resolveDenotesNodeId = async (candidateId: string | null): Promise<string | null> => {
    if (!candidateId) return null
    const exists = (await prisma.graphNode.count({ where: { id: candidateId } })) > 0
    return exists ? candidateId : null
  }

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

    return reply.send(rows.map((row) => layersToAnnotation(
      row,
      { personaId: row.layer.personaId },
      { id: video.id, frameRate: video.frameRate },
      row.denotesNode ? { nodeType: row.denotesNode.nodeType, label: row.denotesNode.label } : null,
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
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability
    const userId = request.user!.id

    // Resolve the project scope + ontology binding from the persona, mirroring
    // annotations.ts: a type annotation inherits its persona's project scope and
    // the caller must be able to read that persona.
    let projectId: string | null = null
    let ontologyId: string | null = null
    if (body.personaId) {
      const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
      if (!persona) throw new NotFoundError('Persona', body.personaId)
      if (!ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create an annotation under this Persona')
      }
      projectId = persona.projectId
      ontologyId = await resolveOntologyId(persona.id)
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

    const { expressionId, video } = await getOrCreateVideoExpression(prisma, videoId)
    const { width, height } = parseResolution(video.resolution)
    const frameRate = video.frameRate ?? 30

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
    }

    const mapping = annotationToLayers(input, {
      expressionId,
      ontologyId,
      frameRate,
      videoWidth: width ?? undefined,
      videoHeight: height ?? undefined,
    })

    // Get-or-create the per-(video, persona) grouping layer. Derived
    // infrastructure keyed by a deterministic id (like the video Expression), so
    // it is upserted directly; the security boundary is the LayersAnnotation.
    // Scope columns are set once at creation and left stable across re-runs so a
    // layer shared with another annotator is not churned.
    await prisma.annotationLayer.upsert({
      where: { id: mapping.layer.id },
      create: {
        id: mapping.layer.id,
        expressionId: mapping.layer.expressionId,
        kind: mapping.layer.kind,
        subkind: mapping.layer.subkind,
        sourceMethod: mapping.layer.sourceMethod,
        ontologyId: mapping.layer.ontologyId,
        personaId: mapping.layer.personaId,
        projectId,
        createdByUserId: userId,
      },
      update: {
        expressionId: mapping.layer.expressionId,
        kind: mapping.layer.kind,
        subkind: mapping.layer.subkind,
        ontologyId: mapping.layer.ontologyId,
        personaId: mapping.layer.personaId,
      },
    })

    const denotesNodeId = await resolveDenotesNodeId(mapping.annotation.denotesNodeCandidateId)

    const writeData = {
      anchor: toJsonInput(mapping.annotation.anchor),
      label: mapping.annotation.label,
      confidence: mapping.annotation.confidence,
      ontologyTypeRefId: mapping.annotation.ontologyTypeRefId,
      denotesNodeId,
      features: toJsonInput(mapping.annotation.features),
      startMs: mapping.annotation.startMs,
      endMs: mapping.annotation.endMs,
    }

    const respond = (row: LayersAnnotation, statusCode: 200 | 201) =>
      reply.code(statusCode).send(layersToAnnotation(
        row,
        { personaId: input.personaId },
        { id: video.id, frameRate: video.frameRate },
        null,
      ))

    // Idempotent update of an existing annotation by its client id. Authorizes
    // against the EXISTING row's update permission so a caller cannot hijack
    // another user's annotation by supplying its id.
    const updateExisting = async (existing: LayersAnnotation) => {
      if (!ability.can('update', subject('LayersAnnotation', existing))) {
        throw new ForbiddenError('Cannot update this Annotation')
      }
      const updated = await prisma.layersAnnotation.update({
        where: { id: existing.id },
        data: writeData,
      })
      return respond(updated, 200)
    }

    // Load a client-supplied id as an idempotent-update target only when it is a
    // bounding-box annotation under this (video, persona) grouping layer. A row
    // of another subkind (notably a claim text span sharing the id space) or one
    // grouped under a different layer is treated as absent so the create path
    // never overwrites it, mirroring the PUT/DELETE subkind guard.
    const findUpdateTarget = async (candidateId: string): Promise<LayersAnnotation | null> => {
      const existing = await prisma.layersAnnotation.findUnique({
        where: { id: candidateId },
        include: { layer: true },
      })
      if (
        !existing ||
        !isVideoAnnotationSubkind(existing.layer.subkind) ||
        existing.layerId !== mapping.layer.id
      ) {
        return null
      }
      return existing
    }

    if (body.id) {
      const existing = await findUpdateTarget(body.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('LayersAnnotation', { projectId, createdByUserId: userId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Annotation in this scope')
    }

    try {
      const created = await prisma.layersAnnotation.create({
        data: {
          id: annotationId,
          layerId: mapping.annotation.layerId,
          projectId,
          createdByUserId: userId,
          ...writeData,
        },
      })
      return respond(created, 201)
    } catch (error) {
      // Concurrent-create race: a parallel request with the same client id won
      // the insert. Fall back to the idempotent update path so no duplicate
      // materializes.
      if (
        body.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await findUpdateTarget(annotationId)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
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
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const ability = request.ability

    const existing = await prisma.layersAnnotation.findUnique({
      where: { id },
      include: { layer: true },
    })
    // Treat a non-video-annotation row (e.g. a claim span sharing the
    // Expression) as absent so this route only ever mutates bounding-box
    // annotations.
    if (!existing || !isVideoAnnotationSubkind(existing.layer.subkind)) {
      throw new NotFoundError('Annotation', id)
    }
    if (!ability.can('update', subject('LayersAnnotation', existing))) {
      throw new ForbiddenError('Cannot update this Annotation')
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) throw new NotFoundError('Video', videoId)
    const { width, height } = parseResolution(video.resolution)
    const frameRate = video.frameRate ?? 30

    // Reconstruct the current legacy shape, then overlay the provided fields, so
    // an omitted field (e.g. linkType, which the frontend never sends on PUT)
    // keeps its stored value.
    const current = layersToAnnotation(
      existing,
      { personaId: existing.layer.personaId },
      { id: video.id, frameRate: video.frameRate },
      null,
    )

    const input: VideoAnnotationInput = {
      id: existing.id,
      videoId,
      personaId: existing.layer.personaId,
      type: body.type ?? current.type,
      label: body.label ?? current.label,
      linkType: body.linkType ?? current.linkType,
      frames: body.frames ?? current.frames,
      confidence: body.confidence !== undefined ? body.confidence : current.confidence,
      source: body.source || current.source,
    }

    const mapping = annotationToLayers(input, {
      expressionId: existing.layer.expressionId,
      ontologyId: existing.layer.ontologyId,
      frameRate,
      videoWidth: width ?? undefined,
      videoHeight: height ?? undefined,
    })
    const denotesNodeId = await resolveDenotesNodeId(mapping.annotation.denotesNodeCandidateId)

    const updated = await prisma.layersAnnotation.update({
      where: { id },
      data: {
        anchor: toJsonInput(mapping.annotation.anchor),
        label: mapping.annotation.label,
        confidence: mapping.annotation.confidence,
        ontologyTypeRefId: mapping.annotation.ontologyTypeRefId,
        denotesNodeId,
        features: toJsonInput(mapping.annotation.features),
        startMs: mapping.annotation.startMs,
        endMs: mapping.annotation.endMs,
      },
    })

    return reply.send(layersToAnnotation(
      updated,
      { personaId: existing.layer.personaId },
      { id: video.id, frameRate: video.frameRate },
      null,
    ))
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
    const { id } = request.params as { videoId: string; id: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const existing = await prisma.layersAnnotation.findUnique({
      where: { id },
      include: { layer: true },
    })
    // Treat a non-video-annotation row (e.g. a claim span sharing the
    // Expression) as absent so this route only ever deletes bounding-box
    // annotations.
    if (!existing || !isVideoAnnotationSubkind(existing.layer.subkind)) {
      throw new NotFoundError('Annotation', id)
    }
    if (!request.ability.can('delete', subject('LayersAnnotation', existing))) {
      throw new ForbiddenError('Cannot delete this Annotation')
    }

    await prisma.layersAnnotation.delete({ where: { id } })
    return reply.code(204).send()
  })
}

export default videoAnnotationsRoutes
