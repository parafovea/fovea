import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
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
          isAdmin: false
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
          isAdmin: false
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
})
