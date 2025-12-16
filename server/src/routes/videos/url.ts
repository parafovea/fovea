import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoStorageProvider, VideoStorageConfig } from '../../services/videoStorage.js'
import { NotFoundError, InternalError, AppError, ErrorResponseSchema } from '../../lib/errors.js'

/**
 * Video URL generation route.
 */
export const urlRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  storageProvider: VideoStorageProvider
  storageConfig: VideoStorageConfig
  storagePath: string
}> = async (fastify, opts) => {
  const { videoRepository, storageProvider, storageConfig, storagePath } = opts

  /**
   * Get a direct URL for video access (signed if using S3).
   * Useful when frontend needs direct access to video (e.g., for MediaSource API).
   *
   * @route GET /api/videos/:videoId/url
   * @param videoId - MD5 hash of filename
   * @returns Video URL (pre-signed if using S3)
   */
  fastify.get('/api/videos/:videoId/url', {
    schema: {
      description: 'Get video URL',
      tags: ['videos'],
      params: Type.Object({
        videoId: Type.String()
      }),
      querystring: Type.Object({
        expiresIn: Type.Optional(Type.Number({ default: 3600 }))
      }),
      response: {
        200: Type.Object({
          url: Type.String(),
          expiresIn: Type.Optional(Type.Number())
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { videoId } = request.params as { videoId: string }
      const { expiresIn = 3600 } = request.query as { expiresIn?: number }

      // Fetch video from database
      const video = await videoRepository.findByIdWithSelect(videoId, {
        path: true
      })

      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      try {
        // Convert full path to relative path for storage provider
        const relativePath = video.path.replace(storagePath, '').replace(/^\//, '')

        // Get URL from storage provider
        const url = await storageProvider.getVideoUrl(relativePath, expiresIn)

        return reply.send({
          url,
          expiresIn: storageConfig.type !== 'local' ? expiresIn : undefined
        })
      } catch (error) {
        fastify.log.error({ error, videoId }, 'Failed to get video URL')
        throw new InternalError('Failed to get video URL')
      }
    } catch (error) {
      // Re-throw typed errors to preserve status codes
      if (error instanceof AppError) {
        throw error
      }
      fastify.log.error(error)
      throw new InternalError('Failed to get video URL')
    }
  })
}
