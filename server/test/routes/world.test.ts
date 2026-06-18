import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the World State API.
 * Tests GET and PUT operations for user world state.
 */
describe('World State API', () => {
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
    await prisma.worldState.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
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

  describe('GET /api/world', () => {
    it('creates and returns empty world state when none exists', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState).toHaveProperty('id')
      expect(worldState.userId).toBe(testUserId)
      expect(worldState.entities).toEqual([])
      expect(worldState.events).toEqual([])
      expect(worldState.times).toEqual([])
      expect(worldState.entityCollections).toEqual([])
      expect(worldState.eventCollections).toEqual([])
      expect(worldState.timeCollections).toEqual([])
      expect(worldState.relations).toEqual([])
    })

    it('returns existing world state with data', async () => {
      // Create world state with data
      const testEntity = {
        id: 'entity-1',
        name: 'Test Entity',
        wikidataId: 'Q123',
        description: [],
        typeAssignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [testEntity],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState.entities).toHaveLength(1)
      expect(worldState.entities[0].name).toBe('Test Entity')
    })

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/world'
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns different world state for different users', async () => {
      // Create second user
      const passwordHash = await hashPassword('testpass456')
      const user2 = await prisma.user.create({
        data: {
          username: 'testuser2',
          email: 'test2@example.com',
          passwordHash,
          displayName: 'Test User 2',
          isAdmin: false,
        }
      })

      // Create world state for first user
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [{ id: 'entity-1', name: 'User 1 Entity' }],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Create world state for second user
      await prisma.worldState.create({
        data: {
          userId: user2.id,
          entities: [{ id: 'entity-2', name: 'User 2 Entity' }],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Check first user gets their data
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })

      expect(response1.statusCode).toBe(200)
      const worldState1 = response1.json()
      expect(worldState1.entities).toHaveLength(1)
      expect(worldState1.entities[0].name).toBe('User 1 Entity')

      // Login as second user
      const loginResponse2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser2', password: 'testpass456' }
      })
      const sessionToken2 = loginResponse2.cookies.find(c => c.name === 'session_token')!.value

      // Check second user gets their data
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: sessionToken2 }
      })

      expect(response2.statusCode).toBe(200)
      const worldState2 = response2.json()
      expect(worldState2.entities).toHaveLength(1)
      expect(worldState2.entities[0].name).toBe('User 2 Entity')
    })
  })

  describe('PUT /api/world', () => {
    it('creates new world state with provided data', async () => {
      const worldData = {
        entities: [
          {
            id: 'entity-1',
            name: 'John Doe',
            wikidataId: 'Q123',
            description: [],
            typeAssignments: []
          }
        ],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: []
      }

      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: worldData
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState.entities).toHaveLength(1)
      expect(worldState.entities[0].name).toBe('John Doe')

      // Verify it was persisted
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })

      expect(getResponse.statusCode).toBe(200)
      const persistedState = getResponse.json()
      expect(persistedState.entities).toHaveLength(1)
      expect(persistedState.entities[0].name).toBe('John Doe')
    })

    it('updates existing world state', async () => {
      // Create initial world state
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [{ id: 'entity-1', name: 'Old Entity' }],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Update with new data
      const updateData = {
        entities: [
          { id: 'entity-1', name: 'Updated Entity' },
          { id: 'entity-2', name: 'New Entity' }
        ],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: []
      }

      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: updateData
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState.entities).toHaveLength(2)
      expect(worldState.entities[0].name).toBe('Updated Entity')
      expect(worldState.entities[1].name).toBe('New Entity')
    })

    it('allows partial updates (only entities)', async () => {
      // Create initial world state
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [{ id: 'entity-1', name: 'Entity 1' }],
          events: [{ id: 'event-1', name: 'Event 1' }],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      // Update only entities
      const updateData = {
        entities: [{ id: 'entity-2', name: 'Entity 2' }]
      }

      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: updateData
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState.entities).toHaveLength(1)
      expect(worldState.entities[0].name).toBe('Entity 2')
      // Events should remain unchanged
      expect(worldState.events).toHaveLength(1)
      expect(worldState.events[0].name).toBe('Event 1')
    })

    it('handles complex world state with all field types', async () => {
      const complexWorldData = {
        entities: [
          { id: 'entity-1', name: 'Entity 1' },
          { id: 'entity-2', name: 'Entity 2' }
        ],
        events: [
          { id: 'event-1', name: 'Event 1' }
        ],
        times: [
          { id: 'time-1', name: 'Time 1' }
        ],
        entityCollections: [
          { id: 'ecoll-1', name: 'Entity Collection 1', entityIds: ['entity-1', 'entity-2'] }
        ],
        eventCollections: [
          { id: 'ecoll-2', name: 'Event Collection 1', eventIds: ['event-1'] }
        ],
        timeCollections: [
          { id: 'tcoll-1', name: 'Time Collection 1', timeIds: ['time-1'] }
        ],
        relations: [
          { id: 'rel-1', sourceId: 'entity-1', targetId: 'entity-2', relationType: 'knows' }
        ]
      }

      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: complexWorldData
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      expect(worldState.entities).toHaveLength(2)
      expect(worldState.events).toHaveLength(1)
      expect(worldState.times).toHaveLength(1)
      expect(worldState.entityCollections).toHaveLength(1)
      expect(worldState.eventCollections).toHaveLength(1)
      expect(worldState.timeCollections).toHaveLength(1)
      expect(worldState.relations).toHaveLength(1)
    })

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        payload: { entities: [] }
      })

      expect(response.statusCode).toBe(401)
    })

    it('preserves world state isolation between users', async () => {
      // Create second user
      const passwordHash = await hashPassword('testpass456')
      await prisma.user.create({
        data: {
          username: 'testuser2',
          email: 'test2@example.com',
          passwordHash,
          displayName: 'Test User 2',
          isAdmin: false,
        }
      })

      // User 1 creates world state
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: {
          entities: [{ id: 'entity-1', name: 'User 1 Entity' }]
        }
      })

      // Login as user 2
      const loginResponse2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser2', password: 'testpass456' }
      })
      const sessionToken2 = loginResponse2.cookies.find(c => c.name === 'session_token')!.value

      // User 2 creates world state
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: sessionToken2 },
        payload: {
          entities: [{ id: 'entity-2', name: 'User 2 Entity' }]
        }
      })

      // Verify user 1 still has their data
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })

      expect(response1.statusCode).toBe(200)
      const worldState1 = response1.json()
      expect(worldState1.entities).toHaveLength(1)
      expect(worldState1.entities[0].name).toBe('User 1 Entity')

      // Verify user 2 has their data
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: sessionToken2 }
      })

      expect(response2.statusCode).toBe(200)
      const worldState2 = response2.json()
      expect(worldState2.entities).toHaveLength(1)
      expect(worldState2.entities[0].name).toBe('User 2 Entity')
    })
  })

  describe('DELETE /api/admin/world/:userId', () => {
    it('clears a target user world state when called by an admin', async () => {
      // Promote the test user to admin so requireAdmin passes.
      await prisma.user.update({
        where: { id: testUserId },
        data: { isAdmin: true, systemRole: 'system_admin' }
      })
      const adminLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass123' }
      })
      const adminToken = adminLogin.cookies.find(c => c.name === 'session_token')!.value

      // Target user with populated world state.
      const passwordHash = await hashPassword('targetpass789')
      const targetUser = await prisma.user.create({
        data: {
          username: 'targetuser',
          email: 'target@example.com',
          passwordHash,
          displayName: 'Target User',
          isAdmin: false,
        }
      })
      await prisma.worldState.create({
        data: {
          userId: targetUser.id,
          entities: [{ id: 'entity-1', name: 'To Be Cleared' }],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/world/${targetUser.id}`,
        cookies: { session_token: adminToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('World state cleared successfully')
      expect(body.userId).toBe(targetUser.id)

      const cleared = await prisma.worldState.findFirst({
        where: { userId: targetUser.id, projectId: null }
      })
      expect(cleared?.entities).toEqual([])
    })

    it('returns 404 when the target user does not exist', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: { isAdmin: true, systemRole: 'system_admin' }
      })
      const adminLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser', password: 'testpass123' }
      })
      const adminToken = adminLogin.cookies.find(c => c.name === 'session_token')!.value

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/world/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: adminToken }
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 403 for a non-admin caller', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/world/${testUserId}`,
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('single-user mode', () => {
    afterEach(() => {
      delete process.env.FOVEA_MODE
    })

    it('returns the default user world state without authentication', async () => {
      process.env.FOVEA_MODE = 'single-user'

      const defaultUser = await prisma.user.create({
        data: {
          id: 'default-user',
          username: 'default-user',
          email: null,
          passwordHash: null,
          displayName: 'Default User',
          isAdmin: true,
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/world'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().userId).toBe(defaultUser.id)
    })
  })

  describe('demo mode', () => {
    afterEach(() => {
      delete process.env.FOVEA_DEMO_MODE
    })

    it('returns 401 for an anonymous read when demo mode is off', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/world'
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('world object deletion endpoints', () => {
    /**
     * Seeds the test user's personal world state with an entity, event, time,
     * relations pointing at each, and collections containing each, then a
     * persona whose ontology gloss references the seeded objects.
     */
    async function seedRichWorldState() {
      await prisma.worldState.create({
        data: {
          userId: testUserId,
          entities: [{ id: 'entity-1', name: 'Alice' }],
          events: [{ id: 'event-1', name: 'Meeting', type: 'event' }],
          times: [{ id: 'time-1', type: 'instant' }],
          entityCollections: [{ id: 'ec-1', name: 'People', members: ['entity-1'] }],
          eventCollections: [{ id: 'evc-1', name: 'Events', members: ['event-1'] }],
          timeCollections: [{ id: 'tc-1', name: 'Times', members: ['time-1'] }],
          relations: [
            { id: 'rel-e', relationTypeId: 'rt', sourceType: 'entity', sourceId: 'entity-1', targetType: 'event', targetId: 'event-1' },
            { id: 'rel-t', relationTypeId: 'rt', sourceType: 'time', sourceId: 'time-1', targetType: 'entity', targetId: 'entity-1' }
          ]
        }
      })

      const persona = await prisma.persona.create({
        data: {
          userId: testUserId,
          name: 'Analyst',
          role: 'analyst',
          informationNeed: 'understand events',
        }
      })
      await prisma.ontology.create({
        data: {
          personaId: persona.id,
          entityTypes: [
            {
              id: 'et-1',
              name: 'Person',
              gloss: [
                { type: 'text', content: 'A person like ' },
                { type: 'objectRef', content: 'entity-1', refType: 'entity-object' },
                { type: 'objectRef', content: 'event-1', refType: 'event-object' },
                { type: 'objectRef', content: 'time-1', refType: 'time-object' }
              ]
            }
          ],
          roleTypes: [],
          eventTypes: [],
          relationTypes: []
        }
      })

      return persona.id
    }

    it('previews entity deletion with reference counts', async () => {
      await seedRichWorldState()

      const response = await app.inject({
        method: 'GET',
        url: '/api/world/entities/entity-1/deletion-preview',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const preview = response.json()
      expect(preview.glossReferences).toBe(1)
      expect(preview.relationCount).toBe(2)
      expect(preview.collectionMemberships).toBe(1)
    })

    it('returns 404 previewing a missing entity', async () => {
      await seedRichWorldState()

      const response = await app.inject({
        method: 'GET',
        url: '/api/world/entities/missing/deletion-preview',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 previewing when no world state exists', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/world/entities/entity-1/deletion-preview',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(404)
    })

    it('deletes an entity and converts gloss references to text', async () => {
      const personaId = await seedRichWorldState()

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/world/entities/entity-1',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Entity "Alice" deleted successfully')
      expect(body.cleanedUp.glossReferences).toBe(1)
      expect(body.cleanedUp.relations).toBe(2)
      expect(body.cleanedUp.collectionMemberships).toBe(1)

      // Entity removed, relations referencing it removed, collection cleaned.
      const ws = await prisma.worldState.findFirst({ where: { userId: testUserId, projectId: null } })
      expect((ws!.entities as Array<{ id: string }>).find(e => e.id === 'entity-1')).toBeUndefined()
      expect(ws!.relations).toHaveLength(0)
      const ec = (ws!.entityCollections as Array<{ members: string[] }>)[0]
      expect(ec.members).not.toContain('entity-1')

      // The entity-object gloss ref became plain text with the entity name.
      const ontology = await prisma.ontology.findUnique({ where: { personaId } })
      const gloss = (ontology!.entityTypes as Array<{ gloss: Array<{ type: string; content: string }> }>)[0].gloss
      const converted = gloss.find(g => g.content === 'Alice')
      expect(converted?.type).toBe('text')
    })

    it('deletes an event with reference cleanup', async () => {
      await seedRichWorldState()

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/world/events/event-1',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Event "Meeting" deleted successfully')
      expect(body.cleanedUp.glossReferences).toBe(1)
      expect(body.cleanedUp.relations).toBe(1)
      expect(body.cleanedUp.collectionMemberships).toBe(1)
    })

    it('deletes a time with reference cleanup', async () => {
      await seedRichWorldState()

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/world/times/time-1',
        cookies: { session_token: testSessionToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Time "time-1" deleted successfully')
      expect(body.cleanedUp.glossReferences).toBe(1)
      expect(body.cleanedUp.relations).toBe(1)
      expect(body.cleanedUp.collectionMemberships).toBe(1)
    })

    it('returns 401 for an anonymous deletion request', async () => {
      await seedRichWorldState()

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/world/entities/entity-1'
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
