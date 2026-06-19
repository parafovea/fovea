import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'
import { isDemoModeEnabled } from '../lib/demo-flags.js'

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
  /// Display name of the linked world object, resolved server-side from the
  /// annotation owner's WorldState. Lets a reviewer reading another
  /// annotator's object annotation see the object's name even though the
  /// object lives in the owner's private world (not the reviewer's). Absent
  /// for type annotations and null when the object cannot be resolved.
  linkedObjectName: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

/**
 * Kinds of world object an object annotation may link to via its `label`.
 */
const RESOLVABLE_LINK_TYPES = new Set(['entity', 'event', 'time', 'location'])

/**
 * A world object as stored in a WorldState JSON array. Only the fields the
 * name resolver needs are typed; arrays hold richer shapes than this.
 */
interface WorldObjectRecord {
  id?: unknown
  name?: unknown
  label?: unknown
}

/**
 * Builds an id -> display-name index over a single owner's WorldState.
 *
 * `linkType` determines which JSON array the object lives in:
 * - entity, location -> `entities` (locations are entities carrying a
 *   `locationType` field, so they share the entities array)
 * - event -> `events`
 * - time -> `times`
 *
 * The display name is the object's `name`; times carry a `label` instead of a
 * `name`, so `label` is used as a fallback. Objects missing both are skipped.
 *
 * @param worldState - the owner's WorldState row (entities/events/times JSON)
 * @returns map from world-object id to its display name
 */
function indexWorldObjectNames(worldState: {
  entities: unknown
  events: unknown
  times: unknown
}): Map<string, string> {
  const index = new Map<string, string>()
  const arrays: unknown[] = [worldState.entities, worldState.events, worldState.times]
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const raw of arr) {
      const obj = raw as WorldObjectRecord
      if (typeof obj?.id !== 'string') continue
      const name = typeof obj.name === 'string'
        ? obj.name
        : typeof obj.label === 'string'
          ? obj.label
          : null
      if (name !== null) index.set(obj.id, name)
    }
  }
  return index
}

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
    const userId = request.user!.id

    // FOVEA_DEMO_MODE override: demo deployments seed system-
    // generated annotations on the curated tour videos that are
    // not authored by the visitor, so the CASL accessibleBy
    // filter would hide them. In demo mode we also surface every
    // annotation whose source flag marks it a fixture row — the
    // demo seeder writes `source: 'demo-fixture'` for every
    // hand-authored or model-service-produced tour annotation,
    // so a self-hoster with no demo seed sees zero extra rows.
    const baseWhere = isDemoModeEnabled()
      ? {
          videoId,
          OR: [
            accessibleBy(request.ability, 'read').Annotation,
            // The demo seeder writes `source: 'demo-fixture:<stableId>'`
            // so each hand-authored track persists as its own row.
            // startsWith matches the whole family without coupling
            // the read path to the per-track stable IDs.
            { source: { startsWith: 'demo-fixture' } },
          ],
        }
      : {
          AND: [
            { videoId },
            accessibleBy(request.ability, 'read').Annotation,
          ],
        }
    const annotations = await fastify.prisma.annotation.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'asc' },
    })

    // Resolve linkedObjectName for object annotations from each annotation
    // owner's WorldState. World objects (entities/events/times/locations) are
    // per-user JSON private to their owner, so a reviewer reading another
    // annotator's object annotation cannot resolve the linked object's name
    // from their own world. This privileged read exposes only the object's
    // name and only for annotations the caller already passed the CASL read
    // filter above. Batch the owners into one query, then index per owner.
    const ownerIds = new Set<string>()
    for (const a of annotations) {
      if (a.linkType && RESOLVABLE_LINK_TYPES.has(a.linkType) && a.label) {
        ownerIds.add(a.createdByUserId ?? userId)
      }
    }

    const nameIndexByOwner = new Map<string, Map<string, string>>()
    if (ownerIds.size > 0) {
      const worldStates = await fastify.prisma.worldState.findMany({
        where: { userId: { in: [...ownerIds] }, projectId: null },
        select: { userId: true, entities: true, events: true, times: true },
      })
      for (const ws of worldStates) {
        nameIndexByOwner.set(ws.userId, indexWorldObjectNames(ws))
      }
    }

    /**
     * Resolves the display name of an annotation's linked world object.
     *
     * @param a - the annotation row
     * @returns the object's name, or null when it is a type annotation or the
     *   object cannot be found in the owner's world
     */
    const resolveLinkedObjectName = (a: typeof annotations[number]): string | null => {
      if (!a.linkType || !RESOLVABLE_LINK_TYPES.has(a.linkType) || !a.label) {
        return null
      }
      const ownerId = a.createdByUserId ?? userId
      return nameIndexByOwner.get(ownerId)?.get(a.label) ?? null
    }

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
      linkedObjectName: resolveLinkedObjectName(a),
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
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const userId = request.user!.id

    // Resolve the project context from the persona (if any). Annotations
    // against a persona inherit that persona's project scope.
    let projectId: string | null = null
    if (data.personaId) {
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: data.personaId },
      })
      if (!persona) throw new NotFoundError('Persona', data.personaId)
      // Ensure the caller can use this persona as the annotation's owner.
      // Without this check, A could attach a type annotation to B's
      // persona (the route would otherwise let it through because A has
      // generic `create Annotation` and the create candidate uses
      // createdByUserId=A, not the foreign personaId).
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create an annotation under this Persona')
      }
      projectId = persona.projectId
    }

    // Pre-authorize the create in the resolved scope. Build a candidate
    // shape carrying the final projectId and createdByUserId so CASL's
    // MongoQuery conditions ({ projectId: { $in: memberProjects } } or
    // { createdByUserId: userId }) resolve against actual field values.
    const candidate = subject('Annotation', {
      projectId,
      createdByUserId: userId,
    })
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
