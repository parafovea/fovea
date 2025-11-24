import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'
import { PrismaClient } from '@prisma/client'
import camelcaseKeys from 'camelcase-keys'
import snakecaseKeys from 'snakecase-keys'
import { buildDetectionQueryFromPersona, DetectionQueryOptions } from '../../utils/queryBuilder.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { DetectionRequestSchema, DetectionResponseSchema } from './schemas.js'

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
          400: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() }),
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
          return reply.code(400).send({
            error: 'Either personaId or manualQuery must be provided',
          })
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
            return reply.code(400).send({
              error: error instanceof Error ? error.message : 'Failed to build query from persona',
            })
          }
        } else {
          return reply.code(400).send({
            error: 'Either personaId or manualQuery must be provided',
          })
        }

        // Check if query is empty
        if (!query || query.trim() === '') {
          return reply.code(400).send({
            error: 'Generated query is empty. Persona may have no entity types defined.',
          })
        }

        // Fetch video to get path
        const video = await videoRepository.findByIdWithSelect(videoId, {
          path: true
        })

        if (!video) {
          return reply.code(404).send({
            error: 'Video not found',
          })
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

        const response = await fetch(`${modelServiceUrl}/api/detection/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorText = await response.text()
          fastify.log.error({ status: response.status, error: errorText }, 'Model service error')
          return reply.code(response.status).send({
            error: `Model service error: ${errorText}`,
          })
        }

        const rawDetectionResult = await response.json()
        const detectionResult = camelcaseKeys(rawDetectionResult as Record<string, unknown>, { deep: true }) as {
          videoId: string
          query: string
          frames: Array<{
            frameNumber: number
            detections: Array<{
              boundingBox: { x: number; y: number; width: number; height: number }
              confidence: number
              label: string
            }>
          }>
        }

        return reply.send({
          videoId: detectionResult.videoId,
          query: detectionResult.query,
          frameResults: detectionResult.frames.map((frame) => ({
            frameNumber: frame.frameNumber,
            detections: frame.detections.map((det) => ({
              x: det.boundingBox.x,
              y: det.boundingBox.y,
              width: det.boundingBox.width,
              height: det.boundingBox.height,
              confidence: det.confidence,
              label: det.label,
            })),
          })),
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({
          error: error instanceof Error ? error.message : 'Failed to detect objects',
        })
      }
    }
  )
}
