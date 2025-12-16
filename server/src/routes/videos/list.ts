import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { NotFoundError, InternalError } from '../../lib/errors.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoSchema } from './schemas.js'

/**
 * Helper to transform video with metadata.
 * Handles metadata extraction and size calculation.
 */
function transformVideoWithMetadata(video: {
  id: string
  filename: string
  path: string
  createdAt: Date
  duration: number | null
  frameRate: number | null
  resolution: string | null
  metadata: unknown
}) {
  // Type guard to check if metadata is a non-null object
  const isValidMetadata = (val: unknown): val is Record<string, unknown> => {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
  }

  // Safely extract size from metadata
  let size = 0
  const metadata = video.metadata
  if (isValidMetadata(metadata)) {
    if (typeof metadata.filesize === 'number') {
      size = metadata.filesize
    } else if (typeof metadata.size === 'number') {
      size = metadata.size
    }
  }

  const baseData = {
    id: video.id,
    filename: video.filename,
    path: video.path,
    size,
    createdAt: video.createdAt.toISOString(),
    duration: video.duration,
    frameRate: video.frameRate,
    resolution: video.resolution,
  }

  // Merge with metadata JSON if it's a valid object
  if (isValidMetadata(metadata)) {
    return {
      ...baseData,
      ...metadata,
      // Ensure core fields aren't overridden by metadata
      id: video.id,
      filename: video.filename,
      path: video.path,
    }
  }

  return baseData
}

/**
 * Video list and get-by-ID routes.
 */
export const listRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
}> = async (fastify, opts) => {
  const { videoRepository } = opts

  /**
   * List all available videos.
   *
   * @route GET /api/videos
   * @returns Array of video metadata objects
   */
  fastify.get('/api/videos', {
    schema: {
      description: 'List all available videos',
      tags: ['videos'],
      response: {
        200: Type.Array(VideoSchema),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (_request, reply) => {
    try {
      // Query videos from database (database-first approach)
      const dbVideos = await videoRepository.findAll()

      // Return videos from database
      const videos = dbVideos.map(transformVideoWithMetadata)

      return reply.send(videos)
    } catch (error) {
      fastify.log.error(error)
      throw new InternalError('Failed to list videos')
    }
  })

  /**
   * Get video metadata by ID.
   *
   * @route GET /api/videos/:videoId
   * @param videoId - MD5 hash of filename
   * @returns Video metadata object
   * @throws NotFoundError if video does not exist
   */
  fastify.get('/api/videos/:videoId', {
    schema: {
      description: 'Get video metadata',
      tags: ['videos'],
      params: Type.Object({
        videoId: Type.String()
      }),
      response: {
        200: VideoSchema,
        404: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { videoId } = request.params as { videoId: string }

    // Query video from database (database-first approach)
    const video = await videoRepository.findById(videoId)

    if (!video) {
      throw new NotFoundError('Video', videoId)
    }

    const transformedVideo = transformVideoWithMetadata(video)

    return reply.send(transformedVideo)
  })
}
