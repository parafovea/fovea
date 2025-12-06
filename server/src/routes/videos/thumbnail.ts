import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { promises as fs } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoStorageProvider, VideoStorageConfig } from '../../services/videoStorage.js'
import { NotFoundError, InternalError } from '../../lib/errors.js'

/**
 * Video thumbnail generation and serving route.
 */
export const thumbnailRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  storageProvider: VideoStorageProvider
  storageConfig: VideoStorageConfig
  storagePath: string
}> = async (fastify, opts) => {
  const { videoRepository, storageProvider, storageConfig, storagePath } = opts

  /**
   * Get or generate video thumbnail.
   * Uses storage provider abstraction for thumbnail storage.
   *
   * @route GET /api/videos/:videoId/thumbnail
   * @param videoId - MD5 hash of filename
   * @param size - Optional size ('small' | 'medium' | 'large')
   * @param timestamp - Optional timestamp in seconds
   * @returns Thumbnail image stream
   */
  fastify.get('/api/videos/:videoId/thumbnail', {
    schema: {
      description: 'Get or generate video thumbnail',
      tags: ['videos'],
      params: Type.Object({
        videoId: Type.String()
      }),
      querystring: Type.Object({
        size: Type.Optional(Type.Union([
          Type.Literal('small'),
          Type.Literal('medium'),
          Type.Literal('large')
        ])),
        timestamp: Type.Optional(Type.Number())
      })
    }
  }, async (request, reply) => {
    try {
      const { videoId } = request.params as { videoId: string }
      const { size = 'medium', timestamp = 1.0 } = request.query as { size?: string; timestamp?: number }

      // Fetch video from database
      const video = await videoRepository.findByIdWithSelect(videoId, {
        id: true,
        path: true,
        filename: true,
        localThumbnailPath: true
      })

      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      const thumbnailFilename = `${videoId}_${size}.jpg`
      const thumbnailPath = path.join(storagePath, 'thumbnails', thumbnailFilename)
      const relativeThumbnailPath = `thumbnails/${thumbnailFilename}`

      // Check if thumbnail already exists
      try {
        await fs.stat(thumbnailPath)
        // Thumbnail exists, serve it
        const stream = createReadStream(thumbnailPath)
        return reply
          .type('image/jpeg')
          .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
          .send(stream)
      } catch {
        // Thumbnail doesn't exist, generate it
      }

      // Generate thumbnail via model service
      const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'

      // Get video URL that model service can access
      // For local storage, this will be a file path
      // For S3 storage, this will be a pre-signed URL
      let modelVideoPath: string

      if (storageConfig.type === 'local') {
        // Model service can access local files directly via volume mount
        modelVideoPath = video.path.replace(storagePath, '/videos')
      } else {
        // For S3/hybrid storage, generate a pre-signed URL for model service to download
        // URL expires in 15 minutes (900 seconds) - enough time for thumbnail generation
        modelVideoPath = await storageProvider.getVideoUrl(video.path, 900)
        fastify.log.debug({ videoId, videoPath: video.path, presignedUrl: modelVideoPath }, 'Generated pre-signed URL for thumbnail generation')
      }

      const requestBody = {
        video_id: videoId,
        video_path: modelVideoPath,
        timestamp: timestamp,
        size: size
      }

      const response = await fetch(`${modelServiceUrl}/api/thumbnails/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        fastify.log.error({ status: response.status, error: errorText }, 'Model service thumbnail generation failed')
        return reply.code(response.status).send({
          error: `Thumbnail generation failed: ${errorText}`
        })
      }

      // Update database with thumbnail path
      await videoRepository.updateThumbnailPath(videoId, relativeThumbnailPath)

      // Serve the newly generated thumbnail
      try {
        const stream = createReadStream(thumbnailPath)
        return reply
          .type('image/jpeg')
          .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
          .send(stream)
      } catch (error) {
        fastify.log.error({ error }, 'Failed to serve generated thumbnail')
        throw new InternalError('Failed to serve thumbnail')
      }
    } catch (error) {
      fastify.log.error(error)
      throw new InternalError('Failed to get thumbnail')
    }
  })
}
