import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'
import { promises as fs } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import camelcaseKeys from 'camelcase-keys'
import snakecaseKeys from 'snakecase-keys'
import { buildDetectionQueryFromPersona, DetectionQueryOptions } from '../utils/queryBuilder.js'
import { createVideoStorageProvider, loadStorageConfig } from '../services/videoStorage.js'
import { syncVideosFromStorage } from '../services/videoSync.js'
import { NotFoundError } from '../lib/errors.js'
import { VideoRepository } from '../repositories/VideoRepository.js'

const VideoSchema = Type.Object({
  id: Type.String(),
  filename: Type.String(),
  path: Type.String(),
  size: Type.Number(),
  createdAt: Type.String({ format: 'date-time' })
}, { additionalProperties: true })

/**
 * Videos API routes for listing and streaming video files.
 * Serves videos from the /data directory.
 */
const videosRoute: FastifyPluginAsync = async (fastify) => {
  const DATA_DIR = process.env.DATA_DIR || '/data'

  // Initialize storage provider
  const storageConfig = loadStorageConfig()
  const storageProvider = createVideoStorageProvider(storageConfig)

  // Initialize video repository
  const videoRepository = new VideoRepository(fastify.prisma)

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
      const videos = dbVideos.map(video => {
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
      })

      return reply.send(videos)
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to list videos' })
    }
  })

  /**
   * Sync videos from storage to database.
   * Scans the storage provider, loads metadata, and upserts videos into database.
   * Admin-only endpoint for manual sync in production.
   *
   * @route POST /api/videos/sync
   * @returns Sync statistics
   */
  fastify.post('/api/videos/sync', {
    schema: {
      description: 'Sync videos from storage to database (admin only)',
      tags: ['videos'],
      response: {
        200: Type.Object({
          added: Type.Number(),
          updated: Type.Number(),
          errors: Type.Number(),
          total: Type.Number(),
        }),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (_request, reply) => {
    try {
      fastify.log.info('Manual video sync requested')

      // Use the storage-aware sync function
      const result = await syncVideosFromStorage(
        fastify.prisma,
        fastify.log,
        storageProvider,
        { type: storageConfig.type, localPath: storageConfig.localPath }
      )

      fastify.log.info(
        {
          added: result.added,
          updated: result.updated,
          deleted: result.deleted,
          errors: result.errors
        },
        'Manual sync completed'
      )

      return reply.send({
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        errors: result.errors,
        total: result.total,
      })
    } catch (error) {
      fastify.log.error({ error }, 'Video sync failed')
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to sync videos'
      })
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
      return reply.send({
        ...baseData,
        ...metadata,
        // Ensure core fields aren't overridden by metadata
        id: video.id,
        filename: video.filename,
        path: video.path,
      })
    }

    return reply.send(baseData)
  })

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
        // Database stores: /data/filename.webm
        // Storage provider expects: filename.webm (relative to basePath)
        const relativePath = video.path.replace(DATA_DIR, '').replace(/^\//, '')

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

  /**
   * Detection query options schema.
   */
  const DetectionQueryOptionsSchema = Type.Object({
    // Ontology type options
    includeEntityTypes: Type.Optional(Type.Boolean({ default: true })),
    includeEntityGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeEventTypes: Type.Optional(Type.Boolean({ default: false })),
    includeEventGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeRoleTypes: Type.Optional(Type.Boolean({ default: false })),
    includeRoleGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeRelationTypes: Type.Optional(Type.Boolean({ default: false })),
    includeRelationGlosses: Type.Optional(Type.Boolean({ default: false })),
    // World state instance options
    includeEntityInstances: Type.Optional(Type.Boolean({ default: false })),
    includeEntityInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeEventInstances: Type.Optional(Type.Boolean({ default: false })),
    includeEventInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeLocationInstances: Type.Optional(Type.Boolean({ default: false })),
    includeLocationInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
    includeTimeInstances: Type.Optional(Type.Boolean({ default: false })),
    includeTimeInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
  })

  /**
   * Detection request schema.
   */
  const DetectionRequestSchema = Type.Object({
    personaId: Type.Optional(Type.String({ format: 'uuid' })),
    manualQuery: Type.Optional(Type.String()),
    queryOptions: Type.Optional(DetectionQueryOptionsSchema),
    confidenceThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.3 })),
    frameNumbers: Type.Optional(Type.Array(Type.Number())),
    enableTracking: Type.Optional(Type.Boolean({ default: false })),
  })

  /**
   * Detection bounding box schema.
   */
  const BoundingBoxSchema = Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
    confidence: Type.Number(),
    label: Type.String(),
  })

  /**
   * Detection response schema.
   */
  const DetectionResponseSchema = Type.Object({
    videoId: Type.String(),
    query: Type.String(),
    frameResults: Type.Array(Type.Object({
      frameNumber: Type.Number(),
      detections: Type.Array(BoundingBoxSchema),
    })),
  })

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
              fastify.prisma,
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
        return reply.code(404).send({ error: 'Video not found' })
      }

      const thumbnailFilename = `${videoId}_${size}.jpg`
      const thumbnailPath = path.join(DATA_DIR, 'thumbnails', thumbnailFilename)
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
        modelVideoPath = video.path.replace(DATA_DIR, '/videos')
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
        return reply.code(500).send({ error: 'Failed to serve thumbnail' })
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to get thumbnail' })
    }
  })

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
        const relativePath = video.path.replace(DATA_DIR, '').replace(/^\//, '')

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

export default videosRoute
