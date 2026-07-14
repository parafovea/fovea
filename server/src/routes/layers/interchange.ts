import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyReply } from 'fastify'
import type { AppAbility } from '../../lib/abilities.js'
import { ForbiddenError, AppError } from '../../lib/errors.js'
import {
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../lib/fetchModelService.js'
import { InterchangeRepository } from '../../repositories/InterchangeRepository.js'
import { InterchangeService } from '../../services/interchange-service.js'

/**
 * Layers interchange routes: proxy import/export between the layers content
 * store and the model-service codec.
 *
 * `POST /api/layers/import` hands an opaque source payload to the model-service
 * for normalization, then persists the returned records under the caller's
 * scope and writes an import-history row. `POST /api/layers/export` reads a
 * corpus the caller may read back out as normalized records and serializes it
 * through the model-service.
 *
 * Authentication and CASL ability construction are owned by the `/api/layers`
 * aggregator (which registers `requireAuth` + `buildAbilities` as onRequest
 * hooks), so this module does not re-register them and declares its paths
 * relative to the `/api/layers` prefix.
 */
export default async function interchangeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Builds a per-request InterchangeService from the request-scoped ability.
   */
  const serviceFor = (ability: AppAbility | null | undefined, userId: string | undefined) =>
    new InterchangeService(new InterchangeRepository(fastify.prisma), ability ?? null, userId)

  /**
   * Import: normalize a source payload through the model-service and persist it.
   */
  fastify.post('/import', {
    schema: {
      description: 'Normalize an interchange payload through the model-service and persist the resulting layers records',
      tags: ['layers', 'interchange'],
      body: Type.Object({
        // Opaque source records; the model-service codec interprets them per
        // `source`. Validated as passthrough — the shape is the interchange
        // format's, not this store's.
        records: Type.Array(Type.Unknown()),
        source: Type.String(),
        filename: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: {
        200: Type.Object({
          importId: Type.String(),
          source: Type.String(),
          persisted: Type.Integer(),
          skipped: Type.Integer(),
          byNsid: Type.Record(Type.String(), Type.Integer()),
        }),
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      records: unknown[]
      source: string
      filename?: string
      projectId?: string | null
    }
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const service = serviceFor(request.ability, request.user?.id)
    try {
      const result = await service.importRecords(body)
      return reply.send(result)
    } catch (error) {
      return handleModelServiceError(fastify, reply, error, 'layers import')
    }
  })

  /**
   * Export: read a corpus back out and serialize it through the model-service.
   */
  fastify.post('/export', {
    schema: {
      description: 'Serialize a corpus into an interchange artifact via the model-service',
      tags: ['layers', 'interchange'],
      body: Type.Object({
        corpusId: Type.Optional(Type.String()),
        corpusName: Type.Optional(Type.String()),
      }),
      response: {
        // The artifact shape is the interchange format's; passthrough it.
        200: Type.Unknown(),
      },
    },
  }, async (request, reply) => {
    const body = request.body as { corpusId?: string; corpusName?: string }
    if (!request.ability) throw new ForbiddenError('No abilities defined')

    const service = serviceFor(request.ability, request.user?.id)
    try {
      const artifact = await service.exportRecords(body)
      return reply.send(artifact)
    } catch (error) {
      return handleModelServiceError(fastify, reply, error, 'layers export')
    }
  })
}

/**
 * Maps a thrown error to the right HTTP response: AppError re-throws so its own
 * status is used; a model-service timeout becomes 504 and an unreachable
 * model-service becomes 502, mirroring the other model-service proxy routes.
 */
function handleModelServiceError(
  fastify: FastifyInstance,
  reply: FastifyReply,
  error: unknown,
  label: string,
): FastifyReply {
  if (error instanceof AppError) throw error
  if (error instanceof ModelServiceTimeoutError) {
    fastify.log.error({ endpoint: error.endpoint, timeoutMs: error.timeoutMs }, `Model service ${label} timed out`)
    return reply.code(504).send({ error: 'MODEL_SERVICE_TIMEOUT', message: error.message })
  }
  if (error instanceof ModelServiceUnreachableError) {
    fastify.log.error({ endpoint: error.endpoint, cause: error.cause.message }, `Model service ${label} unreachable`)
    return reply.code(502).send({ error: 'MODEL_SERVICE_UNREACHABLE', message: error.message })
  }
  throw error
}
