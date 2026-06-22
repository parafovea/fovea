import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { promises as fs } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import { config } from '../../config.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoStorageProvider, VideoStorageConfig } from '../../services/videoStorage.js'
import { NotFoundError, InternalError, AppError } from '../../lib/errors.js'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../lib/fetchModelService.js'

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
      const modelServiceUrl = config.modelService.url

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

      const response = await fetchModelService(`${modelServiceUrl}/api/thumbnails/generate`, {
        method: 'POST',
        timeoutMs: MODEL_SERVICE_TIMEOUTS.thumbnails,
        body: requestBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        fastify.log.error({ status: response.status, error: errorText }, 'Model service thumbnail generation failed')
        return reply.code(response.status).send({
          error: `Thumbnail generation failed: ${errorText}`
        })
      }

      // Confirm the model service actually wrote the thumbnail to the
      // shared volume before declaring success. The 200 from
      // /api/thumbnails/generate means "I ran the work" — it does not
      // mean the file is on disk where this route expects to read it. If
      // the volume is unmounted, mis-mounted, or the worker silently
      // dropped the write, `createReadStream` would later emit an
      // 'error' event after `reply.type('image/jpeg')` had already been
      // committed, and Fastify would fail with "Attempted to send
      // payload of invalid type 'object'." Surface a clean 502 instead
      // so the frontend renders a real error rather than a corrupted
      // response.
      try {
        await fs.stat(thumbnailPath)
      } catch (statErr) {
        const cause = statErr instanceof Error ? statErr.message : String(statErr)
        fastify.log.error({ videoId, thumbnailPath, cause }, 'Model service returned ok but the thumbnail file is missing on disk')
        return reply.code(502).send({
          error: 'MODEL_SERVICE_OUTPUT_MISSING',
          message: 'Model service did not produce the expected thumbnail file',
        })
      }

      // Update database with thumbnail path
      await videoRepository.updateThumbnailPath(videoId, relativeThumbnailPath)

      // Serve the newly generated thumbnail
      const stream = createReadStream(thumbnailPath)
      return reply
        .type('image/jpeg')
        .header('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
        .send(stream)
    } catch (error) {
      // Re-throw typed errors to preserve status codes
      if (error instanceof AppError) {
        throw error
      }
      if (error instanceof ModelServiceTimeoutError) {
        fastify.log.error({ endpoint: error.endpoint, timeoutMs: error.timeoutMs }, 'Model service thumbnail generation timed out')
        return reply.code(504).send({ error: 'MODEL_SERVICE_TIMEOUT', message: error.message })
      }
      if (error instanceof ModelServiceUnreachableError) {
        fastify.log.error({ endpoint: error.endpoint, cause: error.cause.message }, 'Model service thumbnail generation unreachable')
        return reply.code(502).send({ error: 'MODEL_SERVICE_UNREACHABLE', message: error.message })
      }
      fastify.log.error(error)
      throw new InternalError('Failed to get thumbnail')
    }
  })
}
