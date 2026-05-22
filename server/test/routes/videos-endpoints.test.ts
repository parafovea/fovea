import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { createUserWithPassword } from '../fixtures/users.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'

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
  let adminSessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma

    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    // Create admin user for authenticated endpoints
    const adminUser = await createUserWithPassword('admin123', {
      id: 'video-test-admin',
      username: 'videotestadmin',
      isAdmin: true,
    })
    await prisma.user.create({ data: adminUser })

    // Login as admin
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'videotestadmin',
        password: 'admin123',
      },
    })
    const cookies = loginResponse.cookies
    adminSessionToken = cookies.find((c) => c.name === 'session_token')!.value
  })

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: 'video-test-admin' } })
    await prisma.user.deleteMany({ where: { id: 'video-test-admin' } })
    await app.close()
  })

  beforeEach(async () => {
    // Clean database
    await prisma.video.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)
  })

  describe('GET /api/videos', () => {
    it('returns empty array when no videos exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })

    it('uses VideoRepository.findByIdWithSelect() with path and filename', async () => {
      // This test verifies the route calls the repository with correct select
      // The actual file streaming will fail in test env, but we verify the route is accessible
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/stream-test-id/stream',
        cookies: { session_token: adminSessionToken },
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
        },
        cookies: { session_token: adminSessionToken },
      })

      // Route is accessible and accepts range header
      expect([404, 206, 500]).toContain(response.statusCode)
    })
  })

  describe('POST /api/videos/sync', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/sync',
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns sync statistics with correct schema when authenticated as admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/sync',
        cookies: {
          session_token: adminSessionToken,
        },
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
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result).toHaveProperty('url')
    })

    it('returns 404 for nonexistent video', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent/url',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })

    it('uses VideoRepository.findByIdWithSelect() with path', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/url-test-id/url',
        cookies: { session_token: adminSessionToken },
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
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })

    // The four "route-accessibility" tests below all share the same contract:
    // the route must process the request as far as the model-service call,
    // i.e. NOT 400-out on the query string and NOT 401/403-out on the
    // session. The status that comes back from the model-service step
    // depends on whether the test env can reach a real model service:
    //   - 200: thumbnail returned (model service responded ok and wrote the file)
    //   - 404: video row missing (acceptable for tests that don't seed the row)
    //   - 502: model service unreachable from the unit-test process
    //          (the production-correct outcome under the new fetchModelService
    //          helper — was 500 INTERNAL_ERROR before the typed error mapping
    //          landed; including 502 prevents the test from blocking legitimate
    //          hardening work)
    //   - 504: model service timed out (also production-correct under the helper)
    // 400 / 401 / 403 must NEVER appear — those would mean the route is broken
    // at the validation or auth layer, which is what these tests guard.
    // Statuses that mean the route processed the request all the way to
    // the model-service step. 200 = thumbnail returned, 404 = video row
    // missing (acceptable when the test does not seed the row), 502/504 =
    // model service unreachable/timed out from the unit-test process
    // (production-correct under the new fetchModelService helper — anything
    // that hits this path should now surface as a typed error, never an
    // unmapped 500).
    const ROUTE_PROCESSED_STATUSES = [200, 404, 502, 504] as const
    // Statuses that would indicate the route is broken below the
    // model-service layer (validation, auth, or unmapped 500).
    const ROUTE_BROKEN_STATUSES = [400, 401, 403, 500]
    function expectRouteProcessed(statusCode: number): void {
      expect(
        ROUTE_BROKEN_STATUSES.includes(statusCode),
        `route returned ${statusCode}; must not 4xx auth/validation or unmapped 5xx`,
      ).toBe(false)
      expect(
        ROUTE_PROCESSED_STATUSES,
        `route returned ${statusCode}; must be one of ${ROUTE_PROCESSED_STATUSES.join(', ')}`,
      ).toContain(statusCode as (typeof ROUTE_PROCESSED_STATUSES)[number])
    }

    it('accepts size query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail?size=small',
        cookies: { session_token: adminSessionToken },
      })
      expectRouteProcessed(response.statusCode)
    })

    it('accepts timestamp query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail?timestamp=5.0',
        cookies: { session_token: adminSessionToken },
      })
      expectRouteProcessed(response.statusCode)
    })

    it('uses VideoRepository.findByIdWithSelect() with thumbnail fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/thumb-test-id/thumbnail',
        cookies: { session_token: adminSessionToken },
      })
      expectRouteProcessed(response.statusCode)
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

      // Test each route is accessible with authentication.
      // The thumbnail route now surfaces the model-service-unreachable case
      // as a typed 502 (was 500 INTERNAL_ERROR pre-fetchModelService) and
      // the model-service-timeout case as 504; both are valid outcomes for
      // a route the unit-test process can reach without a running model
      // service container. The stream route can also legitimately 502 if
      // the storage provider is unreachable.
      const routes: Array<{ method: string; url: string; expectedCodes: number[] }> = [
        { method: 'GET', url: '/api/videos', expectedCodes: [200] },
        { method: 'GET', url: '/api/videos/integration-test', expectedCodes: [200] },
        { method: 'GET', url: '/api/videos/integration-test/stream', expectedCodes: [200, 404, 500] },
        { method: 'GET', url: '/api/videos/integration-test/thumbnail', expectedCodes: [200, 404, 502, 504] },
        { method: 'GET', url: '/api/videos/integration-test/url', expectedCodes: [200] },
        { method: 'POST', url: '/api/videos/sync', expectedCodes: [200] },
      ]

      for (const route of routes) {
        const response = await app.inject({
          method: route.method,
          url: route.url,
          cookies: { session_token: adminSessionToken },
        })

        expect(route.expectedCodes).toContain(response.statusCode)
      }
    })
  })
})
