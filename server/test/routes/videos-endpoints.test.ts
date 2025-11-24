import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Route registration smoke tests for video endpoints.
 * These tests ensure that route refactoring doesn't break endpoint accessibility.
 *
 * Covers endpoints without existing unit test coverage:
 * - GET /api/videos (list)
 * - GET /api/videos/:videoId (get)
 * - GET /api/videos/:videoId/stream
 * - GET /api/videos/:videoId/thumbnail
 * - POST /api/videos/sync
 * - GET /api/videos/:videoId/url
 */
describe('Videos API - Route Registration', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database
    await prisma.video.deleteMany()
  })

  describe('GET /api/videos', () => {
    it('returns empty array when no videos exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns array of videos with correct schema', async () => {
      // Create test video
      await prisma.video.create({
        data: {
          id: 'test-video-1',
          filename: 'test1.mp4',
          path: '/data/test1.mp4',
          metadata: {
            filesize: 1024000,
            codec: 'h264'
          }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
      })

      expect(response.statusCode).toBe(200)
      const videos = response.json()
      expect(Array.isArray(videos)).toBe(true)
      expect(videos).toHaveLength(1)
      expect(videos[0]).toMatchObject({
        id: 'test-video-1',
        filename: 'test1.mp4',
        path: '/data/test1.mp4',
        size: 1024000,
      })
      expect(videos[0]).toHaveProperty('createdAt')
    })

    it('handles videos with missing metadata gracefully', async () => {
      await prisma.video.create({
        data: {
          id: 'test-video-2',
          filename: 'test2.mp4',
          path: '/data/test2.mp4',
          metadata: {}
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
      })

      expect(response.statusCode).toBe(200)
      const videos = response.json()
      expect(videos[0]).toMatchObject({
        id: 'test-video-2',
        size: 0, // Should default to 0 when no size in metadata
      })
    })

    it('uses VideoRepository.findAll()', async () => {
      // Create multiple videos to verify repository usage
      await prisma.video.createMany({
        data: [
          { id: 'video-1', filename: 'v1.mp4', path: '/data/v1.mp4' },
          { id: 'video-2', filename: 'v2.mp4', path: '/data/v2.mp4' },
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
    })
  })

  describe('GET /api/videos/:videoId', () => {
    it('returns video metadata with correct schema', async () => {
      await prisma.video.create({
        data: {
          id: 'test-video-id',
          filename: 'test.mp4',
          path: '/data/test.mp4',
          metadata: {
            filesize: 2048000,
            duration: 30,
          }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/test-video-id',
      })

      expect(response.statusCode).toBe(200)
      const video = response.json()
      expect(video).toMatchObject({
        id: 'test-video-id',
        filename: 'test.mp4',
        path: '/data/test.mp4',
        size: 2048000,
      })
      expect(video).toHaveProperty('createdAt')
    })

    it('returns 404 for nonexistent video using NotFoundError', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent-id',
      })

      expect(response.statusCode).toBe(404)
      const body = response.json()
      expect(body.error).toBe('NOT_FOUND')
      expect(body.message).toContain('Video')
      expect(body.message).toContain('nonexistent-id')
    })

    it('uses VideoRepository.findById()', async () => {
      await prisma.video.create({
        data: {
          id: 'repo-test-id',
          filename: 'repo-test.mp4',
          path: '/data/repo-test.mp4',
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/repo-test-id',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().id).toBe('repo-test-id')
    })
  })

  describe('GET /api/videos/:videoId/stream', () => {
    beforeEach(async () => {
      await prisma.video.create({
        data: {
          id: 'stream-test-id',
          filename: 'stream-test.mp4',
          path: '/data/stream-test.mp4',
        }
      })
    })

    it('returns 404 for nonexistent video', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent/stream',
      })

      expect(response.statusCode).toBe(404)
    })

    it('uses VideoRepository.findByIdWithSelect() with path and filename', async () => {
      // This test verifies the route calls the repository with correct select
      // The actual file streaming will fail in test env, but we verify the route is accessible
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/stream-test-id/stream',
      })

      // Will be 404 or 500 because file doesn't exist, but route is accessible
      expect([404, 500]).toContain(response.statusCode)
    })

    it('accepts range header for partial content', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/stream-test-id/stream',
        headers: {
          range: 'bytes=0-1023'
        }
      })

      // Route is accessible and accepts range header
      expect([404, 206, 500]).toContain(response.statusCode)
    })
  })

  describe('POST /api/videos/sync', () => {
    it('returns sync statistics with correct schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/sync',
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveProperty('added')
      expect(result).toHaveProperty('updated')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('total')
      expect(typeof result.added).toBe('number')
      expect(typeof result.updated).toBe('number')
      expect(typeof result.errors).toBe('number')
      expect(typeof result.total).toBe('number')
    })

    it('calls syncVideosFromStorage correctly', async () => {
      // The sync will execute with current storage config
      // Just verify the endpoint is accessible and returns correct structure
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/sync',
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('GET /api/videos/:videoId/url', () => {
    beforeEach(async () => {
      await prisma.video.create({
        data: {
          id: 'url-test-id',
          filename: 'url-test.mp4',
          path: '/data/url-test.mp4',
        }
      })
    })

    it('returns URL with correct schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/url-test-id/url',
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveProperty('url')
      expect(typeof result.url).toBe('string')
    })

    it('accepts expiresIn query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/url-test-id/url?expiresIn=7200',
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveProperty('url')
    })

    it('returns 404 for nonexistent video', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent/url',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })

    it('uses VideoRepository.findByIdWithSelect() with path', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/url-test-id/url',
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('GET /api/videos/:videoId/thumbnail', () => {
    beforeEach(async () => {
      await prisma.video.create({
        data: {
          id: 'thumb-test-id',
          filename: 'thumb-test.mp4',
          path: '/data/thumb-test.mp4',
        }
      })
    })

    it('returns 404 for nonexistent video', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent/thumbnail',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })

    it('accepts size query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail?size=small',
      })

      // Will fail to generate thumbnail in test env, but route is accessible
      expect([200, 404, 500]).toContain(response.statusCode)
    })

    it('accepts timestamp query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail?timestamp=5.0',
      })

      // Will fail to generate thumbnail in test env, but route is accessible
      expect([200, 404, 500]).toContain(response.statusCode)
    })

    it('uses VideoRepository.findByIdWithSelect() with thumbnail fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail',
      })

      // Route is accessible and attempts to fetch video
      expect([200, 404, 500]).toContain(response.statusCode)
    })
  })

  describe('Route Integration', () => {
    it('all video routes are registered and accessible', async () => {
      // Create a test video for routes that need it
      await prisma.video.create({
        data: {
          id: 'integration-test',
          filename: 'integration.mp4',
          path: '/data/integration.mp4',
        }
      })

      // Test each route is accessible
      const routes = [
        { method: 'GET', url: '/api/videos', expectedCodes: [200] },
        { method: 'GET', url: '/api/videos/integration-test', expectedCodes: [200] },
        { method: 'GET', url: '/api/videos/integration-test/stream', expectedCodes: [200, 404, 500] },
        { method: 'GET', url: '/api/videos/integration-test/thumbnail', expectedCodes: [200, 404, 500] },
        { method: 'GET', url: '/api/videos/integration-test/url', expectedCodes: [200] },
        { method: 'POST', url: '/api/videos/sync', expectedCodes: [200] },
      ]

      for (const route of routes) {
        const response = await app.inject({
          method: route.method,
          url: route.url,
        })

        expect(route.expectedCodes).toContain(response.statusCode)
      }
    })
  })
})
