import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Personas API.
 * Tests all CRUD operations for personas using a test database.
 */
describe('Personas API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
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

    // Login to get session token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' }
    })
    testSessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('GET /api/personas', () => {
    it('returns an empty array when no personas exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/personas',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns all personas sorted by creation date (newest first)', async () => {
      await prisma.persona.create({
        data: {
          name: 'Baseball Scout',
          role: 'Player Development Analyst',
          informationNeed: 'Tracking pitcher mechanics and ball movement',
          userId: testUserId
        }
      })

      await new Promise(resolve => setTimeout(resolve, 10))

      await prisma.persona.create({
        data: {
          name: 'Wildlife Researcher',
          role: 'Marine Biologist',
          informationNeed: 'Documenting whale pod interactions',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/personas',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const personas = response.json()
      expect(personas).toHaveLength(2)
      expect(personas[0].name).toBe('Wildlife Researcher')
      expect(personas[1].name).toBe('Baseball Scout')
    })

    it('includes all persona fields in response', async () => {
      await prisma.persona.create({
        data: {
          name: 'Film Continuity Editor',
          role: 'Post-Production Specialist',
          informationNeed: 'Tracking prop positions across takes',
          details: 'Focuses on visual consistency',
          isSystemGenerated: false,
          hidden: false,
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/personas',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const personas = response.json()
      expect(personas[0]).toMatchObject({
        name: 'Film Continuity Editor',
        role: 'Post-Production Specialist',
        informationNeed: 'Tracking prop positions across takes',
        details: 'Focuses on visual consistency',
        isSystemGenerated: false,
        hidden: false
      })
      expect(personas[0]).toHaveProperty('id')
      expect(personas[0]).toHaveProperty('createdAt')
      expect(personas[0]).toHaveProperty('updatedAt')
    })
  })

  describe('POST /api/personas', () => {
    it('creates a new persona with required fields', async () => {
      const newPersona = {
        name: 'Retail Analyst',
        role: 'Store Manager',
        informationNeed: 'Analyzing customer flow and product interaction'
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: testSessionToken },
        payload: newPersona
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created).toMatchObject(newPersona)
      expect(created).toHaveProperty('id')
      expect(created.isSystemGenerated).toBe(false)
      expect(created.hidden).toBe(false)
    })

    it('creates a persona with optional fields', async () => {
      const newPersona = {
        name: 'Traffic Engineer',
        role: 'Urban Planning Specialist',
        informationNeed: 'Studying intersection usage patterns',
        details: 'Focus on pedestrian crossings and traffic signals',
        isSystemGenerated: true,
        hidden: true
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: testSessionToken },
        payload: newPersona
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created).toMatchObject(newPersona)
    })

    it('creates an associated ontology when creating a persona', async () => {
      const newPersona = {
        name: 'Medical Trainer',
        role: 'Surgical Resident',
        informationNeed: 'Reviewing laparoscopic technique'
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: testSessionToken },
        payload: newPersona
      })

      expect(response.statusCode).toBe(201)
      const personaId = response.json().id

      const ontology = await prisma.ontology.findUnique({
        where: { personaId }
      })

      expect(ontology).not.toBeNull()
      expect(ontology?.entityTypes).toEqual([])
      expect(ontology?.eventTypes).toEqual([])
      expect(ontology?.roleTypes).toEqual([])
      expect(ontology?.relationTypes).toEqual([])
    })

    it('validates required fields', async () => {
      const invalidPersona = {
        name: '',
        role: 'Test Role',
        informationNeed: 'Test Need'
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: testSessionToken },
        payload: invalidPersona
      })

      expect(response.statusCode).toBe(400)
    })

    it('validates all required fields are present', async () => {
      const incompletePersona = {
        name: 'Test Name'
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: testSessionToken },
        payload: incompletePersona
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /api/personas/:id', () => {
    it('returns a specific persona by ID', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Esports Coach',
          role: 'Team Strategist',
          informationNeed: 'Annotating player positioning in match replays',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        id: created.id,
        name: 'Esports Coach',
        role: 'Team Strategist',
        informationNeed: 'Annotating player positioning in match replays'
      })
    })

    it('returns 404 for non-existent persona', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${fakeId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/personas/not-a-uuid',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PUT /api/personas/:id', () => {
    it('updates a persona with partial data', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Fact Checker',
          role: 'Journalist',
          informationNeed: 'Annotating protest footage for timeline verification',
          userId: testUserId
        }
      })

      const update = {
        name: 'Senior Fact Checker',
        informationNeed: 'Verifying event timelines in news footage'
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken },
        payload: update
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.name).toBe('Senior Fact Checker')
      expect(updated.role).toBe('Journalist')
      expect(updated.informationNeed).toBe('Verifying event timelines in news footage')
    })

    it('updates all optional fields', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Infrastructure Analyst',
          role: 'Government Analyst',
          informationNeed: 'Tracking construction progress',
          details: 'Original details',
          isSystemGenerated: false,
          hidden: false,
          userId: testUserId
        }
      })

      const update = {
        details: 'Updated details',
        isSystemGenerated: true,
        hidden: true
      }

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken },
        payload: update
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.details).toBe('Updated details')
      expect(updated.isSystemGenerated).toBe(true)
      expect(updated.hidden).toBe(true)
    })

    it('returns 404 for non-existent persona', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${fakeId}`,
        cookies: { session_token: testSessionToken },
        payload: { name: 'Updated Name' }
      })

      expect(response.statusCode).toBe(404)
    })

    it('validates updated field values', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken },
        payload: { name: '' }
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/personas/:id', () => {
    it('deletes a persona', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Commodity Trader',
          role: 'Financial Analyst',
          informationNeed: 'Annotating warehouse activity',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('message')

      const deleted = await prisma.persona.findUnique({
        where: { id: created.id }
      })
      expect(deleted).toBeNull()
    })

    it('cascades deletion to associated ontology', async () => {
      const created = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [],
              eventTypes: [],
              roleTypes: [],
              relationTypes: []
            }
          }
        }
      })

      await app.inject({
        method: 'DELETE',
        url: `/api/personas/${created.id}`,
        cookies: { session_token: testSessionToken }
      })

      const ontology = await prisma.ontology.findUnique({
        where: { personaId: created.id }
      })
      expect(ontology).toBeNull()
    })

    it('returns 404 for non-existent persona', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${fakeId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
