import { FastifyPluginAsync } from 'fastify'
import { Type, Static } from '@sinclair/typebox'
import { promises as fs } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import crypto from 'crypto'
import { buildDetectionQueryFromPersona, DetectionQueryOptions } from '../utils/queryBuilder.js'

const VideoSchema = Type.Object({
  id: Type.String(),
  filename: Type.String(),
  path: Type.String(),
  size: Type.Number(),
  createdAt: Type.String({ format: 'date-time' })
}, { additionalProperties: true })

// Create a short hash from filename for use as ID
function createVideoId(filename: string): string {
  return crypto.createHash('md5').update(filename).digest('hex').slice(0, 16)
}

/**
 * Videos API routes for listing and streaming video files.
 * Serves videos from the /data directory.
 */
const videosRoute: FastifyPluginAsync = async (fastify) => {
  const DATA_DIR = process.env.DATA_DIR || '/data'
  const DATA_URL = process.env.DATA_URL // S3 URL for video files (optional)

  // Cache mapping of video IDs to filenames
  const videoCache = new Map<string, string>()

  // Helper to refresh video cache
  async function refreshVideoCache() {
    videoCache.clear()

    if (DATA_URL) {
      // Fetch video list from S3
      try {
        const response = await fetch(`${DATA_URL}/`)
        const text = await response.text()

        // Parse S3 XML listing to extract filenames
        const fileMatches = text.matchAll(/<Key>([^<]+\.(?:webm|mp4))<\/Key>/g)
        for (const match of fileMatches) {
          const filename = match[1]
          const id = createVideoId(filename)
          videoCache.set(id, filename)
        }
      } catch (error) {
        fastify.log.error({ error }, 'Failed to fetch video list from S3')
      }
    } else {
      // Use local filesystem
      const files = await fs.readdir(DATA_DIR)
      // Prefer WebM files for better browser compatibility, fallback to MP4
      const videoFiles = files.filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
      videoFiles.forEach(filename => {
        const id = createVideoId(filename)
        videoCache.set(id, filename)
      })
    }
  }

  // Helper to load video metadata from .info.json file
  async function loadVideoMetadata(filename: string) {
    const infoFilename = filename.replace('.webm', '.info.json').replace('.mp4', '.info.json')

    try {
      let infoContent: string

      if (DATA_URL) {
        // Fetch from S3
        const infoUrl = `${DATA_URL}/${encodeURIComponent(infoFilename)}`
        const response = await fetch(infoUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.statusText}`)
        }
        infoContent = await response.text()
      } else {
        // Read from local filesystem
        const infoPath = path.join(DATA_DIR, infoFilename)
        infoContent = await fs.readFile(infoPath, 'utf-8')
      }

      return JSON.parse(infoContent)
    } catch (error) {
      // Log error for debugging
      fastify.log.warn({ filename, error }, 'Failed to load video metadata')
      return null
    }
  }

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
      await refreshVideoCache()

      const videos = await Promise.all(
        Array.from(videoCache.entries()).map(async ([id, filename]) => {
          const metadata = await loadVideoMetadata(filename)

          fastify.log.info({ filename, hasMetadata: !!metadata }, 'Loading video')

          // Use S3 URL if DATA_URL is configured, otherwise use local path
          const videoPath = DATA_URL
            ? `${DATA_URL}/${encodeURIComponent(filename)}`
            : path.join(DATA_DIR, filename)

          // Get file size and creation date
          let size = 0
          let createdAt = new Date()

          if (!DATA_URL) {
            // Only stat file if using local filesystem
            const stats = await fs.stat(videoPath)
            size = stats.size
            createdAt = stats.birthtime
          } else if (metadata?.filesize) {
            // Use filesize from metadata if available
            size = metadata.filesize
          }

          if (metadata?.timestamp) {
            createdAt = new Date(metadata.timestamp * 1000)
          }

          // Persist video to database
          await fastify.prisma.video.upsert({
            where: { id },
            update: {
              filename,
              path: videoPath,
              duration: metadata?.duration || null,
              frameRate: metadata?.fps || null,
              resolution: metadata?.resolution || metadata?.width && metadata?.height ? `${metadata.width}x${metadata.height}` : null,
              metadata: metadata || null,
            },
            create: {
              id,
              filename,
              path: videoPath,
              duration: metadata?.duration || null,
              frameRate: metadata?.fps || null,
              resolution: metadata?.resolution || metadata?.width && metadata?.height ? `${metadata.width}x${metadata.height}` : null,
              metadata: metadata || null,
            },
          })

          // Merge file stats with info.json metadata if available
          const baseData = {
            id,
            filename,
            path: videoPath,
            size,
            createdAt: createdAt.toISOString()
          }

          if (metadata) {
            return {
              ...baseData,
              ...metadata,
              // Override id to use our hash-based ID
              id
            }
          }

          return baseData
        })
      )

      return reply.send(videos)
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to list videos' })
    }
  })

  /**
   * Get video metadata by ID.
   *
   * @route GET /api/videos/:videoId
   * @param videoId - MD5 hash of filename
   * @returns Video metadata object
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

      if (videoCache.size === 0) {
        await refreshVideoCache()
      }

      const filename = videoCache.get(videoId)
      if (!filename) {
        return reply.code(404).send({ error: 'Video not found' })
      }

      try {
        const metadata = await loadVideoMetadata(filename)

        // Use S3 URL if DATA_URL is configured, otherwise use local path
        const videoPath = DATA_URL
          ? `${DATA_URL}/${encodeURIComponent(filename)}`
          : path.join(DATA_DIR, filename)

        // Get file size and creation date
        let size = 0
        let createdAt = new Date()

        if (!DATA_URL) {
          // Only stat file if using local filesystem
          const stats = await fs.stat(videoPath)
          size = stats.size
          createdAt = stats.birthtime
        } else if (metadata?.filesize) {
          // Use filesize from metadata if available
          size = metadata.filesize
        }

        if (metadata?.timestamp) {
          createdAt = new Date(metadata.timestamp * 1000)
        }

        // Persist video to database
        await fastify.prisma.video.upsert({
          where: { id: videoId },
          update: {
            filename,
            path: videoPath,
            duration: metadata?.duration || null,
            frameRate: metadata?.fps || null,
            resolution: metadata?.resolution || metadata?.width && metadata?.height ? `${metadata.width}x${metadata.height}` : null,
            metadata: metadata || null,
          },
          create: {
            id: videoId,
            filename,
            path: videoPath,
            duration: metadata?.duration || null,
            frameRate: metadata?.fps || null,
            resolution: metadata?.resolution || metadata?.width && metadata?.height ? `${metadata.width}x${metadata.height}` : null,
            metadata: metadata || null,
          },
        })

        const baseData = {
          id: videoId,
          filename,
          path: videoPath,
          size,
          createdAt: createdAt.toISOString()
        }

        if (metadata) {
          return reply.send({
            ...baseData,
            ...metadata,
            // Override id to use our hash-based ID
            id: videoId
          })
        }

        return reply.send(baseData)
      } catch (error) {
        return reply.code(404).send({ error: 'Video not found' })
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to get video' })
    }
  })

  /**
   * Stream video file with support for HTTP range requests.
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

      if (videoCache.size === 0) {
        await refreshVideoCache()
      }

      const filename = videoCache.get(videoId)
      if (!filename) {
        return reply.code(404).send({ error: 'Video not found' })
      }

      const filePath = path.join(DATA_DIR, filename)

      try {
        const stats = await fs.stat(filePath)
        const fileSize = stats.size
        const range = request.headers.range

        // Handle range requests for video streaming
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          const chunkSize = (end - start) + 1
          const stream = createReadStream(filePath, { start, end })
          const contentType = filename.endsWith('.webm') ? 'video/webm' : 'video/mp4'

          return reply
            .code(206)
            .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
            .header('Accept-Ranges', 'bytes')
            .header('Content-Length', chunkSize)
            .header('Content-Type', contentType)
            .send(stream)
        }

        // Full file request
        const stream = createReadStream(filePath)
        const contentType = filename.endsWith('.webm') ? 'video/webm' : 'video/mp4'
        return reply
          .type(contentType)
          .header('Content-Length', fileSize)
          .header('Accept-Ranges', 'bytes')
          .send(stream)
      } catch (error) {
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
        const video = await fastify.prisma.video.findUnique({
          where: { id: videoId },
          select: { path: true },
        })

        if (!video) {
          return reply.code(404).send({
            error: 'Video not found',
          })
        }

        // Convert backend path to model service path
        // Backend uses /data, model service uses /videos
        const modelVideoPath = video.path.replace('/data/', '/videos/')

        // Call model service
        const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'
        const response = await fetch(`${modelServiceUrl}/api/detection/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: videoId,
            video_path: modelVideoPath,
            query,
            confidence_threshold: confidenceThreshold,
            frame_numbers: frameNumbers,
            enable_tracking: enableTracking,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          fastify.log.error({ status: response.status, error: errorText }, 'Model service error')
          return reply.code(response.status).send({
            error: `Model service error: ${errorText}`,
          })
        }

        const detectionResult = await response.json() as {
          id: string
          video_id: string
          query: string
          frames: Array<{
            frame_number: number
            timestamp: number
            detections: Array<{
              bounding_box: {
                x: number
                y: number
                width: number
                height: number
              }
              confidence: number
              label: string
              track_id?: string | null
            }>
          }>
          total_detections: number
          processing_time: number
        }

        // Return full response matching DetectionResponse interface
        return reply.send({
          id: detectionResult.id,
          video_id: detectionResult.video_id,
          query: detectionResult.query,
          frames: detectionResult.frames,
          total_detections: detectionResult.total_detections,
          processing_time: detectionResult.processing_time,
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

export default videosRoute
