import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Annotations API.
 * Tests persona ID handling for type vs object annotations.
 */
describe('Annotations API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string
  let testVideoId: string
  let testPersonaId: string

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
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.user.deleteMany()

    // Create test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false
      }
    })
    testUserId = user.id

    // Create test video
    const video = await prisma.video.create({
      data: {
        filename: 'test-video.mp4',
        path: '/videos/test-video.mp4',
        duration: 60.0
      }
    })
    testVideoId = video.id

    // Create test persona
    const persona = await prisma.persona.create({
      data: {
        userId: testUserId,
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing annotations'
      }
    })
    testPersonaId = persona.id

    // Login to get session token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' }
    })
    testSessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('POST /api/annotations', () => {
    it('creates object annotation with null personaId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'entity-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.personaId).toBeNull()
      expect(body.type).toBe('object')

      // Verify in database
      const dbAnnotation = await prisma.annotation.findUnique({
        where: { id: body.id }
      })
      expect(dbAnnotation?.personaId).toBeNull()
    })

    it('creates type annotation with required personaId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-type-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.personaId).toBe(testPersonaId)
      expect(body.type).toBe('type')
    })

    it('accepts omitted personaId for object annotations', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          // personaId omitted entirely
          type: 'object',
          label: 'entity-2',
          frames: [{ frameNumber: 0, x: 0.2, y: 0.2, width: 0.3, height: 0.3 }]
        }
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().personaId).toBeNull()
    })

    it('creates annotation with confidence score', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-type-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }],
          confidence: 0.95
        }
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().confidence).toBe(0.95)
    })
  })

  describe('GET /api/annotations/:videoId', () => {
    it('returns annotations with null personaId correctly', async () => {
      // Create object annotation with null personaId directly in DB
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'test-entity',
          frames: { boxes: [] }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/annotations/${testVideoId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const annotations = response.json()
      expect(annotations).toHaveLength(1)
      expect(annotations[0].personaId).toBeNull()
    })

    it('returns mixed annotations with and without personaId', async () => {
      // Create object annotation (no personaId)
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'entity-1',
          frames: { boxes: [] }
        }
      })

      // Create type annotation (with personaId)
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'entity-type-1',
          frames: { boxes: [] }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/annotations/${testVideoId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const annotations = response.json()
      expect(annotations).toHaveLength(2)

      const objectAnnotation = annotations.find((a: { type: string }) => a.type === 'object')
      const typeAnnotation = annotations.find((a: { type: string }) => a.type === 'type')

      expect(objectAnnotation.personaId).toBeNull()
      expect(typeAnnotation.personaId).toBe(testPersonaId)
    })

    it('returns empty array for video with no annotations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/annotations/${testVideoId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })
  })

  describe('PUT /api/annotations/:id', () => {
    it('updates annotation label', async () => {
      const annotation = await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          type: 'type',
          label: 'original-label',
          frames: { boxes: [] }
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/annotations/${annotation.id}`,
        cookies: { session_token: testSessionToken },
        payload: {
          label: 'updated-label'
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().label).toBe('updated-label')
    })

    it('returns 404 for non-existent annotation', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/annotations/non-existent-id',
        cookies: { session_token: testSessionToken },
        payload: {
          label: 'new-label'
        }
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('Auth middleware', () => {
    it('allows GET requests without authentication (single-user mode)', async () => {
      // Create annotation first
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'test-entity',
          frames: { boxes: [] }
        }
      })

      // Request without session token
      const response = await app.inject({
        method: 'GET',
        url: `/api/annotations/${testVideoId}`
        // No cookies
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
    })

    it('allows POST requests without authentication (single-user mode)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        // No cookies
        payload: {
          videoId: testVideoId,
          type: 'object',
          label: 'entity-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      expect(response.statusCode).toBe(201)
    })

    it('properly parses session cookie when provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          videoId: testVideoId,
          type: 'object',
          label: 'entity-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      expect(response.statusCode).toBe(201)
    })
  })

  describe('DELETE /api/annotations/:videoId/:id', () => {
    it('deletes annotation', async () => {
      const annotation = await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'to-delete',
          frames: { boxes: [] }
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/annotations/${testVideoId}/${annotation.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(204)

      // Verify deleted
      const dbAnnotation = await prisma.annotation.findUnique({
        where: { id: annotation.id }
      })
      expect(dbAnnotation).toBeNull()
    })

    it('returns 404 for non-existent annotation', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/annotations/${testVideoId}/non-existent-id`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
