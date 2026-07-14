import { Type } from '@sinclair/typebox'
import { FastifyInstance } from 'fastify'
import { ExpressionRepository } from '../../repositories/ExpressionRepository.js'
import { TextExpressionService } from '../../services/text-expression-service.js'

/**
 * Expressions resource group of the layers store: expression detail reads,
 * on-demand materialization of a video's text expressions, and standalone
 * document creation/listing. (Media CRUD lives in the sibling `media.ts`.)
 *
 * Registered by the layers aggregator under the `/api/layers` prefix, which also
 * owns the shared `requireAuth` + `buildAbilities` hooks — this module neither
 * re-registers them nor adds its own prefix. Endpoint paths are declared
 * relative to `/api/layers` (e.g. `/expressions/:id` -> `GET
 * /api/layers/expressions/:id`).
 *
 * Authorization is delegated to the TextExpressionService, which mirrors
 * `routes/annotations.ts`: list endpoints filter with `accessibleBy(ability,
 * 'read')`, single-row reads run an instance-level `ability.can()` check, and
 * document creates are idempotent by client uuid with a P2002 fallback.
 */
export default async function expressionsRoutes(fastify: FastifyInstance): Promise<void> {
  const expressionRepository = new ExpressionRepository(fastify.prisma)

  /**
   * Get one expression with its tokenizations, annotation layers (with their
   * annotations and relations), and segmentations. Single privileged read
   * gated by a CASL row-level `read` check.
   */
  fastify.get('/expressions/:id', {
    schema: {
      description: 'Get an expression with its tokenizations, annotation layers, and relations',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 200: Type.Unknown() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = new TextExpressionService(
      expressionRepository,
      request.ability ?? null,
      request.user?.id
    )
    const detail = await service.getExpressionDetail(id)
    return reply.send(detail)
  })

  /**
   * Materialize (and store) the text expressions projected from a video: the
   * metadata-text expression from `Video.metadata` and the ASR-transcript
   * expression + segmentation from a summary's `transcriptJson`. Idempotent
   * per-user under a source digest.
   */
  fastify.get('/videos/:videoId/text-expressions', {
    schema: {
      description: 'Materialize and return a video\'s metadata-text and ASR-transcript expressions',
      tags: ['layers'],
      params: Type.Object({ videoId: Type.String() }),
      response: { 200: Type.Array(Type.Unknown()) },
    },
  }, async (request, reply) => {
    const { videoId } = request.params as { videoId: string }
    const service = new TextExpressionService(
      expressionRepository,
      request.ability ?? null,
      request.user?.id
    )
    const expressions = await service.materializeVideoTextExpressions(videoId)
    return reply.send(expressions)
  })

  /**
   * Create a standalone document expression from pasted text plus a canonical
   * whitespace tokenization. Idempotent create-by-client-uuid: when a supplied
   * id already exists, the existing document is returned instead of a duplicate.
   */
  fastify.post('/documents', {
    schema: {
      description: 'Create a standalone document expression (sourceKind=document) from pasted text',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        text: Type.String(),
        title: Type.Optional(Type.String()),
        languages: Type.Optional(Type.Array(Type.String())),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        metadata: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
      }),
      response: { 200: Type.Unknown(), 201: Type.Unknown() },
    },
  }, async (request, reply) => {
    const body = request.body as {
      id?: string
      text: string
      title?: string
      languages?: string[]
      projectId?: string | null
      metadata?: unknown
      features?: unknown
    }
    const service = new TextExpressionService(
      expressionRepository,
      request.ability ?? null,
      request.user?.id
    )
    // A supplied id that already resolves to a stored document is returned as a
    // 200 (idempotent); a fresh create is a 201.
    const preexisting = body.id ? await expressionRepository.findById(body.id) : null
    const document = await service.createDocument(body)
    return reply.code(preexisting ? 200 : 201).send(document)
  })

  /**
   * List document expressions the caller can read, paginated and newest-first.
   */
  fastify.get('/documents', {
    schema: {
      description: 'List document expressions the caller is authorized to read',
      tags: ['layers'],
      querystring: Type.Object({
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
        offset: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
      response: {
        200: Type.Object({
          items: Type.Array(Type.Unknown()),
          total: Type.Integer(),
          limit: Type.Integer(),
          offset: Type.Integer(),
        }),
      },
    },
  }, async (request, reply) => {
    const query = request.query as { limit?: number; offset?: number }
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const service = new TextExpressionService(
      expressionRepository,
      request.ability ?? null,
      request.user?.id
    )
    const { items, total } = await service.listDocuments({ skip: offset, take: limit })
    return reply.send({ items, total, limit, offset })
  })
}
