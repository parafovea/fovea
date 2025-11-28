import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoStorageProvider } from '../../services/videoStorage.js'

/**
 * Video streaming route with range request support.
 */
export const streamRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  storageProvider: VideoStorageProvider
  storagePath: string
}> = async (fastify, opts) => {
  const { videoRepository, storageProvider, storagePath } = opts

  /**
   * Stream video file with support for HTTP range requests.
   * Uses storage provider abstraction to support local, S3, and hybrid storage.
   *
   * @route GET /api/videos/:videoId/stream
   * @param videoId - MD5 hash of filename
   * @returns Video file stream (supports partial content)
   */
  fastify.get('/api/videos/:videoId/stream', {
    schema: {
      description: 'Stream video file',
      tags: ['videos'],
      params: Type.Object({
        videoId: Type.String()
      })
    }
  }, async (request, reply) => {
    try {
      const { videoId } = request.params as { videoId: string }

      // Fetch video from database to get path
      const video = await videoRepository.findByIdWithSelect(videoId, {
        path: true,
        filename: true
      })

      if (!video) {
        return reply.code(404).send({ error: 'Video not found' })
      }

      const range = request.headers.range

      try {
        // Convert full path to relative path for storage provider
        // Database stores: /videos/filename.webm
        // Storage provider expects: filename.webm (relative to basePath)
        const relativePath = video.path.replace(storagePath, '').replace(/^\//, '')

        // Use storage provider to get video stream
        const result = await storageProvider.getVideoStream(relativePath, range)

        // Handle range requests
        if (result.range) {
          return reply
            .code(206)
            .header('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.range.total}`)
            .header('Accept-Ranges', 'bytes')
            .header('Content-Length', result.contentLength)
            .header('Content-Type', result.contentType)
            .send(result.stream)
        }

        // Full file request
        return reply
          .type(result.contentType)
          .header('Content-Length', result.contentLength)
          .header('Accept-Ranges', 'bytes')
          .send(result.stream)
      } catch (error) {
        fastify.log.error({ error, videoId }, 'Failed to stream video')
        return reply.code(404).send({ error: 'Video not found' })
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to stream video' })
    }
  })
}
