import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../../src/lib/password.js'

/**
 * Tests that video routes require authentication.
 * Verifies the requireAuth hook added to the videos plugin
 * rejects unauthenticated requests with 401.
 */
describe('Video Routes - Authentication', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let sessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create test user and login
    const passwordHash = await hashPassword('testpass123')
    await prisma.user.create({
      data: {
        username: 'videoauthuser',
        email: 'videoauth@example.com',
        passwordHash,
        displayName: 'Video Auth User',
        isAdmin: false,
        systemRole: 'system_admin',
      },
    })

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'videoauthuser', password: 'testpass123' },
    })
    sessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('GET /api/videos', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error).toBe('UNAUTHORIZED')
    })

    it('returns 200 with valid session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos',
        cookies: { session_token: sessionToken },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('GET /api/videos/:videoId', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/some-video-id',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error).toBe('UNAUTHORIZED')
    })

    it('returns 404 for nonexistent video with valid auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent-id',
        cookies: { session_token: sessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /api/videos/:videoId/stream', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/some-video-id/stream',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/videos/:videoId/thumbnail', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/some-video-id/thumbnail',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/videos/:videoId/url', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/some-video-id/url',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /api/videos/:videoId/detect', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/videos/some-video-id/detect',
        payload: { manualQuery: 'test' },
      })

      expect(response.statusCode).toBe(401)
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
  })

  it('rejects expired session tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/videos',
      cookies: { session_token: 'invalid-token-value' },
    })

    expect(response.statusCode).toBe(401)
  })
})
