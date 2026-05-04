import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
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
    await prisma.worldState.deleteMany()
    await prisma.video.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    // Create test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false,
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
      // v0.2.1 coerces isSystemGenerated to false for non-admin requests
      // so a regular user cannot publish their persona to anonymous
      // visitors via the unauthenticated GET /api/personas branch.
      expect(created.name).toBe(newPersona.name)
      expect(created.role).toBe(newPersona.role)
      expect(created.informationNeed).toBe(newPersona.informationNeed)
      expect(created.details).toBe(newPersona.details)
      expect(created.hidden).toBe(true)
      expect(created.isSystemGenerated).toBe(false)
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
      // v0.2.1 strips isSystemGenerated from non-admin updates so a
      // regular user cannot toggle the flag.
      expect(updated.details).toBe('Updated details')
      expect(updated.hidden).toBe(true)
      expect(updated.isSystemGenerated).toBe(false)
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

    it('cascades deletion to associated video summaries', async () => {
      // Create video first
      const video = await prisma.video.create({
        data: {
          filename: `test-video-summary-${Date.now()}.mp4`,
          path: '/videos/test-video-summary.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create video summary linked to persona
      await prisma.videoSummary.create({
        data: {
          videoId: video.id,
          personaId: persona.id,
          summary: []
        }
      })

      // Delete persona
      await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify video summary was deleted
      const summary = await prisma.videoSummary.findFirst({
        where: { personaId: persona.id }
      })
      expect(summary).toBeNull()
    })

    it('cascades deletion to associated annotations', async () => {
      // Create video first
      const video = await prisma.video.create({
        data: {
          filename: `test-video-${Date.now()}.mp4`,
          path: '/videos/test-video.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create annotation with personaId
      await prisma.annotation.create({
        data: {
          videoId: video.id,
          personaId: persona.id,
          type: 'type',
          label: 'entity-type-1',
          frames: [{ frame: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      // Delete persona
      await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify annotation was deleted
      const annotation = await prisma.annotation.findFirst({
        where: { personaId: persona.id }
      })
      expect(annotation).toBeNull()
    })

    it('cleans up Entity.typeAssignments in WorldState', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create world state with entity having type assignment for this persona
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [
            {
              id: 'entity-1',
              name: 'Test Entity',
              description: [],
              typeAssignments: [
                { personaId: persona.id, entityTypeId: 'type-1' },
                { personaId: 'other-persona', entityTypeId: 'type-2' }
              ]
            }
          ],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Delete persona
      await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify type assignment was cleaned up
      const worldState = await prisma.worldState.findFirst({
        where: { userId: testUserId, projectId: null }
      })
      const entities = worldState?.entities as Array<{ typeAssignments?: Array<{ personaId: string }> }>
      const entity = entities[0]
      expect(entity.typeAssignments).toHaveLength(1)
      expect(entity.typeAssignments![0].personaId).toBe('other-persona')
    })

    it('cleans up Event.personaInterpretations in WorldState', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create world state with event having persona interpretation
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [],
          events: [
            {
              id: 'event-1',
              name: 'Test Event',
              description: [],
              personaInterpretations: [
                { personaId: persona.id, eventTypeId: 'event-type-1', participants: [] },
                { personaId: 'other-persona', eventTypeId: 'event-type-2', participants: [] }
              ]
            }
          ],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Delete persona
      await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Verify persona interpretation was cleaned up
      const worldState = await prisma.worldState.findFirst({
        where: { userId: testUserId, projectId: null }
      })
      const events = worldState?.events as Array<{ personaInterpretations?: Array<{ personaId: string }> }>
      const event = events[0]
      expect(event.personaInterpretations).toHaveLength(1)
      expect(event.personaInterpretations![0].personaId).toBe('other-persona')
    })

    it('returns 401 without authentication', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`
        // No session_token
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 404 when deleting another user\'s persona', async () => {
      // Create another user
      const anotherUser = await prisma.user.create({
        data: {
          username: 'anotheruser',
          email: 'another@example.com',
          passwordHash: await hashPassword('testpass123'),
          displayName: 'Another User',
          isAdmin: false,
        }
      })

      // Create persona for another user
      const persona = await prisma.persona.create({
        data: {
          name: 'Another User Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: anotherUser.id
        }
      })

      // Try to delete with testUser's session
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${persona.id}`,
        cookies: { session_token: testSessionToken }
      })

      // Should get 403 (forbidden — not the owner)
      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /api/personas/:id/deletion-preview', () => {
    it('returns correct typeCount from ontology', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId,
          ontology: {
            create: {
              entityTypes: [{ id: 'e1', name: 'Entity1' }],
              roleTypes: [{ id: 'r1', name: 'Role1' }, { id: 'r2', name: 'Role2' }],
              eventTypes: [{ id: 'ev1', name: 'Event1' }],
              relationTypes: []
            }
          }
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${persona.id}/deletion-preview`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const preview = response.json()
      expect(preview.typeCount).toBe(4) // 1 entity + 2 roles + 1 event
    })

    it('returns correct annotationCount', async () => {
      const video = await prisma.video.create({
        data: {
          filename: `test-annot-${Date.now()}.mp4`,
          path: '/videos/test-annot.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create 3 annotations
      await prisma.annotation.createMany({
        data: [
          { videoId: video.id, personaId: persona.id, type: 'type', label: 'test1', frames: [] },
          { videoId: video.id, personaId: persona.id, type: 'type', label: 'test2', frames: [] },
          { videoId: video.id, personaId: persona.id, type: 'type', label: 'test3', frames: [] }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${persona.id}/deletion-preview`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().annotationCount).toBe(3)
    })

    it('returns correct summaryCount', async () => {
      const video1 = await prisma.video.create({
        data: {
          filename: `test1-${Date.now()}.mp4`,
          path: '/videos/test1.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      const video2 = await prisma.video.create({
        data: {
          filename: `test2-${Date.now()}.mp4`,
          path: '/videos/test2.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080'
        }
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create 2 video summaries
      await prisma.videoSummary.createMany({
        data: [
          { videoId: video1.id, personaId: persona.id, summary: [] },
          { videoId: video2.id, personaId: persona.id, summary: [] }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${persona.id}/deletion-preview`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().summaryCount).toBe(2)
    })

    it('returns correct worldAssignmentCount', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      // Create world state with assignments
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [
            {
              id: 'entity-1',
              typeAssignments: [
                { personaId: persona.id, entityTypeId: 'type-1' },
                { personaId: persona.id, entityTypeId: 'type-2' }
              ]
            }
          ],
          events: [
            {
              id: 'event-1',
              personaInterpretations: [
                { personaId: persona.id, eventTypeId: 'event-type-1' }
              ]
            }
          ],
          times: [],
          entityCollections: [
            {
              id: 'collection-1',
              typeAssignments: [
                { personaId: persona.id, entityTypeId: 'type-3' }
              ]
            }
          ],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${persona.id}/deletion-preview`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().worldAssignmentCount).toBe(4) // 2 + 1 + 1
    })

    it('returns 404 for non-existent persona', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${fakeId}/deletion-preview`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 401 without authentication', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Test Persona',
          role: 'Test Role',
          informationNeed: 'Test Need',
          userId: testUserId
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${persona.id}/deletion-preview`
        // No session_token
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
