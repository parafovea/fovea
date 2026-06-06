import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'
import { PrismaClient } from '@prisma/client'
import camelcaseKeys from 'camelcase-keys'
import snakecaseKeys from 'snakecase-keys'
import { buildDetectionQueryFromPersona, DetectionQueryOptions } from '../../utils/queryBuilder.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { DetectionRequestSchema, DetectionResponseSchema } from './schemas.js'
import { NotFoundError, ValidationError, InternalError, AppError, ForbiddenError, ErrorResponseSchema } from '../../lib/errors.js'
import { subject } from '@casl/ability'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../lib/fetchModelService.js'

/**
 * Object detection route.
 */
export const detectRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  prisma: PrismaClient
}> = async (fastify, opts) => {
  const { videoRepository, prisma } = opts

  /**
   * Detect objects in video using persona-based or manual query.
   *
   * @route POST /api/videos/:videoId/detect
   * @param videoId - MD5 hash of filename
   * @param personaId - Optional UUID of persona to use for query building
   * @param manualQuery - Optional manual query string to override persona-based query
   * @param queryOptions - Options for what to include in persona-based query
   * @param confidenceThreshold - Minimum confidence for detections (default 0.3)
   * @param frameNumbers - Optional array of specific frame numbers to process
   * @param enableTracking - Optional flag to enable object tracking across frames
   * @returns Detection results with bounding boxes
   */
  fastify.post<{
    Params: { videoId: string }
    Body: Static<typeof DetectionRequestSchema>
  }>(
    '/api/videos/:videoId/detect',
    {
      schema: {
        description: 'Detect objects in video frames',
        tags: ['videos'],
        params: Type.Object({
          videoId: Type.String(),
        }),
        body: DetectionRequestSchema,
        response: {
          200: DetectionResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
          504: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { videoId } = request.params
        const {
          personaId,
          manualQuery,
          queryOptions,
          confidenceThreshold = 0.3,
          frameNumbers,
          enableTracking = false,
        } = request.body

        // Validate that either personaId or manualQuery is provided
        if (!personaId && !manualQuery) {
          throw new ValidationError('Either personaId or manualQuery must be provided')
        }

        // The persona used to build the detection query must belong to the
        // requester. Without this guard, A could feed B's ontology into
        // the detector (consuming model-service quota on B's behalf and
        // leaking B's type vocabulary indirectly via the constructed
        // query). Wired through the same CASL ability the rest of the
        // app uses — no parallel ownership system.
        if (personaId) {
          if (!request.ability) throw new ForbiddenError('No abilities defined')
          const persona = await prisma.persona.findUnique({ where: { id: personaId } })
          if (!persona) throw new NotFoundError('Persona', personaId)
          if (!request.ability.can('read', subject('Persona', persona))) {
            throw new ForbiddenError('Cannot use this persona for detection')
          }
        }

        // Build query based on persona or use manual query
        let query: string
        if (manualQuery) {
          query = manualQuery
        } else if (personaId) {
          try {
            query = await buildDetectionQueryFromPersona(
              personaId,
              prisma,
              queryOptions as DetectionQueryOptions
            )
          } catch (error) {
            throw new ValidationError(error instanceof Error ? error.message : 'Failed to build query from persona')
          }
        } else {
          throw new ValidationError('Either personaId or manualQuery must be provided')
        }

        // Check if query is empty
        if (!query || query.trim() === '') {
          throw new ValidationError('Generated query is empty. Persona may have no entity types defined.')
        }

        // Fetch video to get path
        const video = await videoRepository.findByIdWithSelect(videoId, {
          path: true
        })

        if (!video) {
          throw new NotFoundError('Video', videoId)
        }

        // Convert backend path to model service path
        // Backend uses /data, model service uses /videos
        const modelVideoPath = video.path.replace('/data/', '/videos/')

        const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'

        const requestBody = snakecaseKeys({
          videoId,
          videoPath: modelVideoPath,
          query,
          confidenceThreshold,
          frameNumbers,
          enableTracking,
        })

        const response = await fetchModelService(`${modelServiceUrl}/api/detection/detect`, {
          method: 'POST',
          timeoutMs: MODEL_SERVICE_TIMEOUTS.detection,
          body: requestBody,
        })

        if (!response.ok) {
          const errorText = await response.text()
          fastify.log.error({ status: response.status, error: errorText }, 'Model service error')
          return reply.code(response.status).send({
            error: 'SERVICE_ERROR',
            message: `Model service error: ${errorText}`,
          })
        }

        const rawDetectionResult = await response.json()
        const detectionResult = camelcaseKeys(rawDetectionResult as Record<string, unknown>, { deep: true }) as Record<string, unknown>

        // Defensive shape check. The model service contract requires
        // `frames: list[FrameDetections]` per
        // model-service/src/.../schemas/detection.py:130, but a buggy or
        // partially-broken upstream can return `{}` or omit `frames`.
        // Without this guard the route serializes a payload that the
        // frontend then crashes on while reading `.frames.flatMap`,
        // hidden inside its error boundary.
        if (!Array.isArray(detectionResult.frames)) {
          fastify.log.error(
            { rawDetectionResult },
            'Model service detection response is missing the required `frames` array',
          )
          return reply.code(502).send({
            error: 'MODEL_SERVICE_BAD_RESPONSE',
            message: 'Model service returned a detection payload without a frames array',
          })
        }

        // Pass through the model-service shape verbatim (after the
        // snake-case to camel-case rename). DetectionResponseSchema in
        // schemas.ts is the single canonical contract that all three
        // layers (model-service, backend, frontend `DetectionResponse`)
        // agree on; reshaping here would just reintroduce drift.
        return reply.send(detectionResult)
      } catch (error) {
        // Re-throw typed errors to preserve status codes
        if (error instanceof AppError) {
          throw error
        }
        if (error instanceof ModelServiceTimeoutError) {
          fastify.log.error({ endpoint: error.endpoint, timeoutMs: error.timeoutMs }, 'Model service detection timed out')
          return reply.code(504).send({
            error: 'MODEL_SERVICE_TIMEOUT',
            message: error.message,
          })
        }
        if (error instanceof ModelServiceUnreachableError) {
          fastify.log.error({ endpoint: error.endpoint, cause: error.cause.message }, 'Model service detection unreachable')
          return reply.code(502).send({
            error: 'MODEL_SERVICE_UNREACHABLE',
            message: error.message,
          })
        }
        fastify.log.error(error)
        throw new InternalError(error instanceof Error ? error.message : 'Failed to detect objects')
      }
    }
  )
}
