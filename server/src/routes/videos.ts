import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { promises as fs } from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import crypto from 'crypto'

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

  // Cache mapping of video IDs to filenames
  const videoCache = new Map<string, string>()

  // Helper to refresh video cache
  async function refreshVideoCache() {
    const files = await fs.readdir(DATA_DIR)
    const videoFiles = files.filter(f => f.endsWith('.mp4'))
    videoCache.clear()
    videoFiles.forEach(filename => {
      const id = createVideoId(filename)
      videoCache.set(id, filename)
    })
  }

  // Helper to load video metadata from .info.json file
  async function loadVideoMetadata(filename: string) {
    const infoPath = path.join(DATA_DIR, filename.replace('.mp4', '.info.json'))
    try {
      const infoContent = await fs.readFile(infoPath, 'utf-8')
      return JSON.parse(infoContent)
    } catch (error) {
      // Log error for debugging
      fastify.log.warn({ filename, infoPath, error }, 'Failed to load video metadata')
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
          const filePath = path.join(DATA_DIR, filename)
          const stats = await fs.stat(filePath)
          const metadata = await loadVideoMetadata(filename)

          fastify.log.info({ filename, hasMetadata: !!metadata }, 'Loading video')

          // Merge file stats with info.json metadata if available
          const baseData = {
            id,
            filename,
            path: `/api/videos/${id}/stream`,
            size: stats.size,
            createdAt: stats.birthtime.toISOString()
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

      const filePath = path.join(DATA_DIR, filename)

      try {
        const stats = await fs.stat(filePath)
        const metadata = await loadVideoMetadata(filename)

        const baseData = {
          id: videoId,
          filename,
          path: `/api/videos/${videoId}/stream`,
          size: stats.size,
          createdAt: stats.birthtime.toISOString()
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
   * Stream video file.
   *
   * @route GET /api/videos/:videoId/stream
   * @param videoId - MD5 hash of filename
   * @returns Video file stream
   */
  fastify.get('/api/videos/:videoId/stream', {
    schema: {
      description: 'Stream video file',
      tags: ['videos'],
      params: Type.Object({
        videoId: Type.String()
      }),
      response: {
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

      const filePath = path.join(DATA_DIR, filename)

      try {
        const stats = await fs.stat(filePath)
        const stream = createReadStream(filePath)

        return reply
          .type('video/mp4')
          .header('Content-Length', stats.size)
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
}

export default videosRoute
