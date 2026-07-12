import { Type } from '@sinclair/typebox'
import { FastifyInstance } from 'fastify'
import { Prisma, type Media } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import { ForbiddenError, NotFoundError } from '../../lib/errors.js'
import { MediaRepository } from '../../repositories/MediaRepository.js'

/**
 * Response schema for a Media row. Scalar/envelope fields are typed; the layers
 * value-object JSON columns (audio/video/document/knowledgeRefs/metadata/
 * features) pass through as `Type.Unknown()` — their compile-time shape is the
 * `@fovea/layers-schema` `Media` interface, not hand-written TypeBox.
 */
const MediaResponseSchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  title: Type.Union([Type.Null(), Type.String()]),
  description: Type.Union([Type.Null(), Type.String()]),
  externalUri: Type.Union([Type.Null(), Type.String()]),
  blobPath: Type.Union([Type.Null(), Type.String()]),
  mimeType: Type.Union([Type.Null(), Type.String()]),
  durationMs: Type.Union([Type.Null(), Type.Number()]),
  parentMediaId: Type.Union([Type.Null(), Type.String()]),
  startOffsetMs: Type.Union([Type.Null(), Type.Number()]),
  audio: Type.Unknown(),
  video: Type.Unknown(),
  document: Type.Unknown(),
  knowledgeRefs: Type.Unknown(),
  metadata: Type.Unknown(),
  features: Type.Unknown(),
  languages: Type.Array(Type.String()),
  videoId: Type.Union([Type.Null(), Type.String()]),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Maps a Media row to its API response shape (dates to ISO strings). */
function mapMedia(row: Media): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    externalUri: row.externalUri,
    blobPath: row.blobPath,
    mimeType: row.mimeType,
    durationMs: row.durationMs,
    parentMediaId: row.parentMediaId,
    startOffsetMs: row.startOffsetMs,
    audio: row.audio,
    video: row.video,
    document: row.document,
    knowledgeRefs: row.knowledgeRefs,
    metadata: row.metadata,
    features: row.features,
    languages: row.languages,
    videoId: row.videoId,
    projectId: row.projectId,
    createdByUserId: row.createdByUserId,
    layersUri: row.layersUri,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Converts a value to Prisma.InputJsonValue for a JSON column write. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Media CRUD for the layers store. Media rows describe audio/video/image/
 * document sources that expressions attach to.
 *
 * Registered by the layers aggregator under the `/api/layers` prefix, which also
 * owns the shared `requireAuth` + `buildAbilities` hooks — this module neither
 * re-registers them nor adds its own prefix. Authorization mirrors
 * `routes/annotations.ts`: the list endpoint filters with
 * `accessibleBy(ability, 'read')`, single-row endpoints run an instance-level
 * `ability.can()` check, and creates are idempotent by client uuid with a P2002
 * fallback.
 */
export default async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  const mediaRepository = new MediaRepository(fastify.prisma)

  /**
   * List media rows the caller can read, paginated and newest-first.
   */
  fastify.get('/media', {
    schema: {
      description: 'List media rows the caller is authorized to read',
      tags: ['layers'],
      querystring: Type.Object({
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        offset: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
      response: {
        200: Type.Object({
          items: Type.Array(MediaResponseSchema),
          total: Type.Integer(),
          limit: Type.Integer(),
          offset: Type.Integer(),
        }),
      },
    },
  }, async (request, reply) => {
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const query = request.query as { limit?: number; offset?: number }
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const readScope = accessibleBy(request.ability, 'read').Media
    const [rows, total] = await Promise.all([
      mediaRepository.findAccessible(readScope, offset, limit),
      mediaRepository.countAccessible(readScope),
    ])
    return reply.send({ items: rows.map(mapMedia), total, limit, offset })
  })

  /**
   * Get one media row, gated by a CASL row-level `read` check.
   */
  fastify.get('/media/:id', {
    schema: {
      description: 'Get a media row',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 200: MediaResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const media = await mediaRepository.findById(id)
    if (!media) throw new NotFoundError('Media', id)
    if (!request.ability.can('read', subject('Media', media))) {
      throw new ForbiddenError('Cannot read this Media')
    }
    return reply.send(mapMedia(media))
  })

  /**
   * Create a media row. Inherits projectId from the request body (defaulting to
   * null) and is idempotent by client uuid: when a supplied id already exists,
   * the existing row is returned instead of a duplicate.
   */
  fastify.post('/media', {
    schema: {
      description: 'Create a media row, or return the existing one when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        kind: Type.String(),
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        externalUri: Type.Optional(Type.String()),
        blobPath: Type.Optional(Type.String()),
        mimeType: Type.Optional(Type.String()),
        durationMs: Type.Optional(Type.Integer()),
        parentMediaId: Type.Optional(Type.String()),
        startOffsetMs: Type.Optional(Type.Integer()),
        videoId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        audio: Type.Optional(Type.Unknown()),
        video: Type.Optional(Type.Unknown()),
        document: Type.Optional(Type.Unknown()),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
        languages: Type.Optional(Type.Array(Type.String())),
      }),
      response: { 200: MediaResponseSchema, 201: MediaResponseSchema },
    },
  }, async (request, reply) => {
    const data = request.body as {
      id?: string
      kind: string
      title?: string
      description?: string
      externalUri?: string
      blobPath?: string
      mimeType?: string
      durationMs?: number
      parentMediaId?: string
      startOffsetMs?: number
      videoId?: string | null
      projectId?: string | null
      audio?: unknown
      video?: unknown
      document?: unknown
      knowledgeRefs?: unknown
      metadata?: unknown
      features?: unknown
      languages?: string[]
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const userId = request.user!.id
    const projectId = data.projectId ?? null

    // Idempotent create: a supplied id that already exists is returned in place
    // (authorized against that row's read) rather than duplicated.
    if (data.id) {
      const existing = await mediaRepository.findById(data.id)
      if (existing) {
        if (!request.ability.can('read', subject('Media', existing))) {
          throw new ForbiddenError('Cannot read this Media')
        }
        return reply.code(200).send(mapMedia(existing))
      }
    }

    const candidate = subject('Media', { projectId, createdByUserId: userId })
    if (!request.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Media in this scope')
    }

    try {
      const created = await mediaRepository.create({
        id: data.id,
        kind: data.kind,
        title: data.title,
        description: data.description,
        externalUri: data.externalUri,
        blobPath: data.blobPath,
        mimeType: data.mimeType,
        durationMs: data.durationMs,
        parentMediaId: data.parentMediaId,
        startOffsetMs: data.startOffsetMs,
        videoId: data.videoId ?? null,
        projectId,
        createdByUserId: userId,
        audio: data.audio !== undefined ? toJson(data.audio) : undefined,
        video: data.video !== undefined ? toJson(data.video) : undefined,
        document: data.document !== undefined ? toJson(data.document) : undefined,
        knowledgeRefs: data.knowledgeRefs !== undefined ? toJson(data.knowledgeRefs) : undefined,
        metadata: data.metadata !== undefined ? toJson(data.metadata) : undefined,
        features: data.features !== undefined ? toJson(data.features) : undefined,
        languages: data.languages ?? [],
      })
      return reply.code(201).send(mapMedia(created))
    } catch (error) {
      // Concurrent-create race on the client id: return the now-existing row.
      if (
        data.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await mediaRepository.findById(data.id)
        if (existing) {
          if (!request.ability.can('read', subject('Media', existing))) {
            throw new ForbiddenError('Cannot read this Media')
          }
          return reply.code(200).send(mapMedia(existing))
        }
      }
      throw error
    }
  })

  /**
   * Update a media row. Caller must have `update` permission on the specific
   * media instance. Only provided fields are written.
   */
  fastify.put('/media/:id', {
    schema: {
      description: 'Update a media row',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        kind: Type.Optional(Type.String()),
        title: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        externalUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        blobPath: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        mimeType: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        durationMs: Type.Optional(Type.Union([Type.Null(), Type.Integer()])),
        parentMediaId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        startOffsetMs: Type.Optional(Type.Union([Type.Null(), Type.Integer()])),
        videoId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        audio: Type.Optional(Type.Unknown()),
        video: Type.Optional(Type.Unknown()),
        document: Type.Optional(Type.Unknown()),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
        languages: Type.Optional(Type.Array(Type.String())),
      }),
      response: { 200: MediaResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as {
      kind?: string
      title?: string | null
      description?: string | null
      externalUri?: string | null
      blobPath?: string | null
      mimeType?: string | null
      durationMs?: number | null
      parentMediaId?: string | null
      startOffsetMs?: number | null
      videoId?: string | null
      audio?: unknown
      video?: unknown
      document?: unknown
      knowledgeRefs?: unknown
      metadata?: unknown
      features?: unknown
      languages?: string[]
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const existing = await mediaRepository.findById(id)
    if (!existing) throw new NotFoundError('Media', id)
    if (!request.ability.can('update', subject('Media', existing))) {
      throw new ForbiddenError('Cannot update this Media')
    }

    const updated = await mediaRepository.update(id, {
      kind: data.kind,
      title: data.title,
      description: data.description,
      externalUri: data.externalUri,
      blobPath: data.blobPath,
      mimeType: data.mimeType,
      durationMs: data.durationMs,
      parentMediaId: data.parentMediaId,
      startOffsetMs: data.startOffsetMs,
      videoId: data.videoId,
      audio: data.audio !== undefined ? toJson(data.audio) : undefined,
      video: data.video !== undefined ? toJson(data.video) : undefined,
      document: data.document !== undefined ? toJson(data.document) : undefined,
      knowledgeRefs: data.knowledgeRefs !== undefined ? toJson(data.knowledgeRefs) : undefined,
      metadata: data.metadata !== undefined ? toJson(data.metadata) : undefined,
      features: data.features !== undefined ? toJson(data.features) : undefined,
      languages: data.languages,
    })
    return reply.send(mapMedia(updated))
  })

  /**
   * Delete a media row. Caller must have `delete` permission on the specific
   * media instance.
   */
  fastify.delete('/media/:id', {
    schema: {
      description: 'Delete a media row',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    const existing = await mediaRepository.findById(id)
    if (!existing) throw new NotFoundError('Media', id)
    if (!request.ability.can('delete', subject('Media', existing))) {
      throw new ForbiddenError('Cannot delete this Media')
    }
    await mediaRepository.delete(id)
    return reply.code(204).send()
  })
}
