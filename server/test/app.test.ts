import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { createUserWithPassword } from './fixtures/users.js'

describe('Fastify App', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let sessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma

    const user = await createUserWithPassword('testpass123', {
      id: 'app-test-user',
      username: 'apptestuser',
    })
    await prisma.user.create({ data: user })

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'apptestuser', password: 'testpass123' },
    })
    sessionToken = loginResponse.cookies.find((c) => c.name === 'session_token')!.value
  })

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: 'app-test-user' } })
    await prisma.user.deleteMany({ where: { id: 'app-test-user' } })
    await app.close()
  })

  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')

      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('status', 'healthy')
      expect(body).toHaveProperty('timestamp')
      expect(typeof body.timestamp).toBe('string')
      expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
    })

    it('should return valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      })

      const body = JSON.parse(response.body)
      const timestamp = new Date(body.timestamp)
      const now = new Date()

      // Timestamp should be within last 5 seconds
      const diff = now.getTime() - timestamp.getTime()
      expect(diff).toBeLessThan(5000)
      expect(diff).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Swagger Documentation', () => {
    it('should serve Swagger UI at /docs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs'
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
    })

    it('should serve OpenAPI schema at /docs/json', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json'
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')

      const schema = JSON.parse(response.body)
      expect(schema).toHaveProperty('openapi')
      expect(schema).toHaveProperty('info')
      expect(schema.info).toHaveProperty('title', 'Fovea API')
      expect(schema.info).toHaveProperty('version', '1.0.0')
    })
  })

  describe('Security', () => {
    it('should include security headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      })

      expect(response.headers).toHaveProperty('x-content-type-options')
      expect(response.headers).toHaveProperty('x-frame-options')
    })

    it('should allow CORS from configured origins', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/health',
        headers: {
          origin: 'http://localhost:5173'
        }
      })

      expect(response.headers['access-control-allow-origin']).toBeDefined()
    })
  })

  describe('Global Error Handler', () => {
    it('should handle NotFoundError from real route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent-video-id',
        cookies: { session_token: sessionToken },
      })

      expect(response.statusCode).toBe(404)

      const body = JSON.parse(response.body)
      expect(body.error).toBe('NOT_FOUND')
      expect(body.message).toContain('Video')
      expect(body.message).toContain('nonexistent-video-id')
      expect(body).not.toHaveProperty('stack')
    })
  })
})
