import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { writeWorldAggregate } from '../../src/services/layers-bridge/world-bridge.js'

/**
 * Integration tests for the World State API.
 *
 * The `/api/world` contract is unchanged, but its store is the layers graph:
 * world objects persist as GraphNode rows and relations as GraphEdge rows, both
 * scoped to the user. These tests round-trip the aggregate through the route and
 * assert the data lands in graph_nodes / graph_edges.
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

  /** Removes all world/ontology data in reverse foreign-key order. */
  async function cleanDatabase(): Promise<void> {
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
  }

  beforeEach(async () => {
    await cleanDatabase()
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
    it('returns empty world state when none exists', async () => {
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

    it('surfaces a legacy WorldState row through the read-through bridge', async () => {
      // Seed the world objects into the layers store the route reads from.
      const testEntity = {
        id: 'entity-1',
        name: 'Test Entity',
        wikidataId: 'Q123',
        description: [],
        typeAssignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await writeWorldAggregate(
        prisma,
        { userId: testUserId, projectId: null },
        {
          entities: [testEntity],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      )

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
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser2', password: 'testpass456' }
      })
      const sessionToken2 = login2.cookies.find(c => c.name === 'session_token')!.value

      // Each user writes their own world through the route.
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: { entities: [{ id: 'entity-1', name: 'User 1 Entity' }] }
      })
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: sessionToken2 },
        payload: { entities: [{ id: 'entity-2', name: 'User 2 Entity' }] }
      })

      const response1 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })
      expect(response1.statusCode).toBe(200)
      const worldState1 = response1.json()
      expect(worldState1.entities).toHaveLength(1)
      expect(worldState1.entities[0].name).toBe('User 1 Entity')

      const response2 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: sessionToken2 }
      })
      expect(response2.statusCode).toBe(200)
      const worldState2 = response2.json()
      expect(worldState2.entities).toHaveLength(1)
      expect(worldState2.entities[0].name).toBe('User 2 Entity')

      // Isolation is enforced by the scope columns on the graph rows.
      expect(user2.id).not.toBe(testUserId)
    })
  })

  describe('PUT /api/world', () => {
    it('creates new world state with provided data and lands it in graph_nodes', async () => {
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

      // The entity landed as an entity-typed GraphNode reusing its own id.
      const node = await prisma.graphNode.findUnique({ where: { id: 'entity-1' } })
      expect(node).not.toBeNull()
      expect(node!.nodeType).toBe('entity')
      expect(node!.label).toBe('John Doe')
      expect(node!.createdByUserId).toBe(testUserId)

      // Verify it was persisted through a fresh read.
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
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: { entities: [{ id: 'entity-1', name: 'Old Entity' }] }
      })

      const updateData = {
        entities: [
          { id: 'entity-1', name: 'Updated Entity' },
          { id: 'entity-2', name: 'New Entity' }
        ]
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

      // The pruned entity is gone; the replacements landed.
      expect(await prisma.graphNode.count({ where: { createdByUserId: testUserId, nodeType: 'entity' } })).toBe(2)
    })

    it('merges the provided field by id and leaves other fields unchanged', async () => {
      // Seed initial world state through the route so it lands in the layers graph.
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: {
          entities: [{ id: 'entity-1', name: 'Entity 1' }],
          events: [{ id: 'event-1', name: 'Event 1' }]
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: { entities: [{ id: 'entity-2', name: 'Entity 2' }] }
      })

      expect(response.statusCode).toBe(200)
      const worldState = response.json()
      // Entities merge by id: the pre-existing entity-1 is kept and entity-2 is
      // added (the PUT no longer replaces the whole array). Removal is done via
      // the per-object DELETE routes, not by omission.
      expect(worldState.entities).toHaveLength(2)
      expect(worldState.entities.map((e: { id: string }) => e.id).sort()).toEqual(['entity-1', 'entity-2'])
      // Events (a field not provided in the PUT) remain unchanged.
      expect(worldState.events).toHaveLength(1)
      expect(worldState.events[0].name).toBe('Event 1')
    })

    it('handles complex world state with all field types', async () => {
      const complexWorldData = {
        entities: [
          { id: 'entity-1', name: 'Entity 1' },
          { id: 'entity-2', name: 'Entity 2' }
        ],
        events: [{ id: 'event-1', name: 'Event 1' }],
        times: [{ id: 'time-1', type: 'instant' }],
        entityCollections: [
          { id: 'ecoll-1', name: 'Entity Collection 1', entityIds: ['entity-1', 'entity-2'] }
        ],
        eventCollections: [
          { id: 'ecoll-2', name: 'Event Collection 1', eventIds: ['event-1'] }
        ],
        timeCollections: [
          { id: 'tcoll-1', name: 'Time Collection 1', times: [{ id: 'time-1', type: 'instant' }] }
        ],
        relations: [
          { id: 'rel-1', relationTypeId: 'knows', sourceType: 'entity', sourceId: 'entity-1', targetType: 'entity', targetId: 'entity-2' }
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

      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: { entities: [{ id: 'entity-1', name: 'User 1 Entity' }] }
      })

      const loginResponse2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'testuser2', password: 'testpass456' }
      })
      const sessionToken2 = loginResponse2.cookies.find(c => c.name === 'session_token')!.value

      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: sessionToken2 },
        payload: { entities: [{ id: 'entity-2', name: 'User 2 Entity' }] }
      })

      const response1 = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })
      expect(response1.statusCode).toBe(200)
      const worldState1 = response1.json()
      expect(worldState1.entities).toHaveLength(1)
      expect(worldState1.entities[0].name).toBe('User 1 Entity')

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

  describe('layers round-trip', () => {
    it('round-trips a rich world state through the route and lands it in graph_nodes/graph_edges', async () => {
      const world = {
        entities: [
          {
            id: 'entity-alice',
            name: 'Alice',
            description: [{ type: 'text', content: 'The lead' }],
            wikidataId: 'Q42',
            typeAssignments: [{ personaId: 'p-1', entityTypeId: 'et-person', confidence: 0.9 }],
            metadata: { alternateNames: ['Al'] }
          },
          {
            id: 'entity-hall',
            name: 'City Hall',
            description: [],
            typeAssignments: [],
            locationType: 'point',
            coordinateSystem: 'GPS',
            coordinates: { latitude: 40.1, longitude: -80.2 },
            metadata: {}
          }
        ],
        events: [
          {
            id: 'event-meeting',
            name: 'Meeting',
            description: [],
            personaInterpretations: [
              { personaId: 'p-1', eventTypeId: 'et-meet', participants: [{ entityId: 'entity-alice', roleTypeId: 'rt-agent' }] }
            ],
            metadata: { certainty: 0.8 }
          }
        ],
        times: [
          { id: 'time-noon', label: 'Noon', type: 'instant' }
        ],
        entityCollections: [
          { id: 'ec-people', name: 'People', description: [], entityIds: ['entity-alice'], collectionType: 'group', typeAssignments: [] }
        ],
        eventCollections: [
          { id: 'evc-agenda', name: 'Agenda', description: [], eventIds: ['event-meeting'], collectionType: 'sequence', typeAssignments: [] }
        ],
        timeCollections: [
          { id: 'tc-day', name: 'Day', description: [], times: [{ id: 'time-noon', type: 'instant' }], collectionType: 'group' }
        ],
        relations: [
          { id: 'rel-attends', relationTypeId: 'attends', sourceType: 'entity', sourceId: 'entity-alice', targetType: 'event', targetId: 'event-meeting', metadata: { note: 'chair' } },
          { id: 'rel-when', relationTypeId: 'occurs-at', sourceType: 'event', sourceId: 'event-meeting', targetType: 'time', targetId: 'time-noon' }
        ]
      }

      const putResponse = await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: world
      })
      expect(putResponse.statusCode).toBe(200)

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })
      expect(getResponse.statusCode).toBe(200)
      const got = getResponse.json()

      // Every bucket deep-equals what went in.
      expect(got.entities).toEqual(world.entities)
      expect(got.events).toEqual(world.events)
      expect(got.times).toEqual(world.times)
      expect(got.entityCollections).toEqual(world.entityCollections)
      expect(got.eventCollections).toEqual(world.eventCollections)
      expect(got.timeCollections).toEqual(world.timeCollections)
      expect(got.relations).toEqual(world.relations)

      // The rows landed in the layers graph: 2 entities + 1 event + 1 time + 3
      // collections = 7 nodes, 2 relation edges.
      const nodeCount = await prisma.graphNode.count({ where: { createdByUserId: testUserId } })
      expect(nodeCount).toBe(7)
      const edgeCount = await prisma.graphEdge.count({ where: { createdByUserId: testUserId } })
      expect(edgeCount).toBe(2)

      // Node types are projected: entity -> entity, event -> situation, time -> time.
      expect((await prisma.graphNode.findUnique({ where: { id: 'entity-alice' } }))!.nodeType).toBe('entity')
      expect((await prisma.graphNode.findUnique({ where: { id: 'event-meeting' } }))!.nodeType).toBe('situation')
      expect((await prisma.graphNode.findUnique({ where: { id: 'time-noon' } }))!.nodeType).toBe('time')
      // The relation edge reuses the relation id and denormalizes its endpoints.
      const edge = await prisma.graphEdge.findUnique({ where: { id: 'rel-attends' } })
      expect(edge!.sourceLocalId).toBe('entity-alice')
      expect(edge!.targetLocalId).toBe('event-meeting')
      expect(edge!.edgeType).toBe('attends')
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

      // Target user with a populated world written through the route.
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
      const targetLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'targetuser', password: 'targetpass789' }
      })
      const targetToken = targetLogin.cookies.find(c => c.name === 'session_token')!.value
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: targetToken },
        payload: { entities: [{ id: 'entity-1', name: 'To Be Cleared' }] }
      })
      expect(await prisma.graphNode.count({ where: { createdByUserId: targetUser.id } })).toBe(1)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/world/${targetUser.id}`,
        cookies: { session_token: adminToken }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('World state cleared successfully')
      expect(body.userId).toBe(targetUser.id)

      // The target's world objects are pruned from the layers graph.
      expect(await prisma.graphNode.count({ where: { createdByUserId: targetUser.id } })).toBe(0)
      const cleared = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: targetToken }
      })
      expect(cleared.json().entities).toEqual([])
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
     * Seeds the test user's personal world (through the route, so it lands in
     * the layers graph) with an entity, event, time, relations pointing at each,
     * and collections containing each, plus a persona whose ontology gloss
     * references the seeded objects.
     */
    async function seedRichWorldState(): Promise<string> {
      await app.inject({
        method: 'PUT',
        url: '/api/world',
        cookies: { session_token: testSessionToken },
        payload: {
          entities: [{ id: 'entity-1', name: 'Alice', description: [], typeAssignments: [] }],
          events: [{ id: 'event-1', name: 'Meeting', description: [], personaInterpretations: [] }],
          times: [{ id: 'time-1', type: 'instant' }],
          entityCollections: [{ id: 'ec-1', name: 'People', entityIds: ['entity-1'] }],
          eventCollections: [{ id: 'evc-1', name: 'Events', eventIds: ['event-1'] }],
          timeCollections: [{ id: 'tc-1', name: 'Times', times: [{ id: 'time-1', type: 'instant' }] }],
          relations: [
            { id: 'rel-e', relationTypeId: 'rt', sourceType: 'entity', sourceId: 'entity-1', targetType: 'event', targetId: 'event-1' },
            { id: 'rel-t', relationTypeId: 'rt', sourceType: 'time', sourceId: 'time-1', targetType: 'entity', targetId: 'entity-1' }
          ]
        }
      })

      const personaId = randomUUID()
      await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: testSessionToken },
        payload: {
          personas: [{ id: personaId, name: 'Analyst', role: 'analyst', informationNeed: 'understand events' }],
          personaOntologies: [{
            personaId,
            entities: [{
              id: 'et-1',
              name: 'Person',
              gloss: [
                { type: 'text', content: 'A person like ' },
                { type: 'objectRef', content: 'entity-1', refType: 'entity-object' },
                { type: 'objectRef', content: 'event-1', refType: 'event-object' },
                { type: 'objectRef', content: 'time-1', refType: 'time-object' }
              ]
            }],
            roles: [],
            events: [],
            relationTypes: []
          }]
        }
      })

      return personaId
    }

    /** Reads the entity type's gloss from the persona ontology via the route. */
    async function readEntityTypeGloss(): Promise<Array<{ type: string; content: string }>> {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ontology',
        cookies: { session_token: testSessionToken }
      })
      const bundle = response.json() as {
        personaOntologies: Array<{ entities: Array<{ id: string; gloss: Array<{ type: string; content: string }> }> }>
      }
      const entityType = bundle.personaOntologies[0].entities.find(e => e.id === 'et-1')!
      return entityType.gloss
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
      await seedRichWorldState()

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
      const world = (await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: testSessionToken }
      })).json() as {
        entities: Array<{ id: string }>
        relations: unknown[]
        entityCollections: Array<{ entityIds: string[] }>
      }
      expect(world.entities.find(e => e.id === 'entity-1')).toBeUndefined()
      expect(world.relations).toHaveLength(0)
      expect(world.entityCollections[0].entityIds).not.toContain('entity-1')
      expect(await prisma.graphNode.findUnique({ where: { id: 'entity-1' } })).toBeNull()

      // The entity-object gloss ref became plain text with the entity name.
      const gloss = await readEntityTypeGloss()
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
