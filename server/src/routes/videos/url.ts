import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoStorageProvider, VideoStorageConfig } from '../../services/videoStorage.js'

/**
 * Video URL generation route.
 */
export const urlRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  storageProvider: VideoStorageProvider
  storageConfig: VideoStorageConfig
  dataDir: string
}> = async (fastify, opts) => {
  const { videoRepository, storageProvider, storageConfig, dataDir } = opts

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
        404: Type.Object({
          error: Type.String()
        }),
        500: Type.Object({
          error: Type.String()
        })
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
        return reply.code(404).send({ error: 'Video not found' })
      }

      try {
        // Convert full path to relative path for storage provider
        const relativePath = video.path.replace(dataDir, '').replace(/^\//, '')

        // Get URL from storage provider
        const url = await storageProvider.getVideoUrl(relativePath, expiresIn)

        return reply.send({
          url,
          expiresIn: storageConfig.type !== 'local' ? expiresIn : undefined
        })
      } catch (error) {
        fastify.log.error({ error, videoId }, 'Failed to get video URL')
        return reply.code(500).send({ error: 'Failed to get video URL' })
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to get video URL' })
    }
  })
}
