import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient, Prisma } from '@prisma/client'

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
    await prisma.worldState.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
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

    it('creates with a client-supplied id', async () => {
      const clientId = crypto.randomUUID()
      const response = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          id: clientId,
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'entity-1',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().id).toBe(clientId)
      const row = await prisma.annotation.findUnique({ where: { id: clientId } })
      expect(row).not.toBeNull()
    })

    it('updates in place on re-POST with the same id instead of duplicating', async () => {
      const clientId = crypto.randomUUID()
      const base = {
        id: clientId,
        videoId: testVideoId,
        personaId: null,
        type: 'object',
        label: 'entity-1',
        frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
      }
      const first = await app.inject({
        method: 'POST', url: '/api/annotations',
        cookies: { session_token: testSessionToken }, payload: base
      })
      expect(first.statusCode).toBe(201)

      // Re-POST the same id with edited frames (the autosave re-send).
      const second = await app.inject({
        method: 'POST', url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: { ...base, frames: [{ frameNumber: 0, x: 0.5, y: 0.5, width: 0.3, height: 0.3 }] }
      })
      expect(second.statusCode).toBe(200)
      expect(second.json().id).toBe(clientId)

      // Exactly one row, with the edited frames — no duplicate.
      const rows = await prisma.annotation.findMany({ where: { videoId: testVideoId, id: clientId } })
      expect(rows).toHaveLength(1)
      expect((rows[0].frames as Array<{ x: number }>)[0].x).toBe(0.5)
    })

    it('authorizes the idempotent update against the existing row, not the create candidate', async () => {
      // The existing-id path goes through `can('update', subject('Annotation',
      // existing))` — the same instance-level gate as PUT /api/annotations/:id.
      // Under the broad test seed every user may update any annotation, so a
      // second user's re-POST updates in place (a properly project-scoped
      // production model would instead 403 a non-owner without project update
      // rights — same gate, different rules). The security property under test
      // is that the create's identity columns are preserved: an update by id
      // never repoints videoId / createdByUserId.
      const clientId = crypto.randomUUID()
      const created = await app.inject({
        method: 'POST', url: '/api/annotations',
        cookies: { session_token: testSessionToken },
        payload: {
          id: clientId, videoId: testVideoId, personaId: null, type: 'object',
          label: 'entity-owned-by-A',
          frames: [{ frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
        }
      })
      expect(created.statusCode).toBe(201)

      const bHash = await hashPassword('reviserpass123')
      const userB = await prisma.user.create({
        data: { username: 'annotation-reviser', email: 'reviser@example.com', passwordHash: bHash, displayName: 'Reviser' }
      })
      const bSession = await prisma.session.create({
        data: { userId: userB.id, token: `test-session-${userB.id}`, expiresAt: new Date(Date.now() + 3600_000) }
      })

      const rePost = await app.inject({
        method: 'POST', url: '/api/annotations',
        cookies: { session_token: bSession.token },
        payload: {
          id: clientId, videoId: 'some-other-video', personaId: null, type: 'object',
          label: 'revised-label',
          frames: [{ frameNumber: 0, x: 0.9, y: 0.9, width: 0.1, height: 0.1 }]
        }
      })
      expect(rePost.statusCode).toBe(200)

      // Identity columns are immutable through the idempotent path: the row is
      // still A's and still on the original video, even though B sent a
      // different videoId; only the mutable fields changed.
      const row = await prisma.annotation.findUnique({ where: { id: clientId } })
      expect(row?.createdByUserId).toBe(testUserId)
      expect(row?.videoId).toBe(testVideoId)
      expect(row?.label).toBe('revised-label')
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

  describe('DELETE /api/annotations/:videoId/:id', () => {
    it('deletes annotation', async () => {
      const annotation = await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          type: 'object',
          label: 'to-delete',
          frames: { boxes: [] },
          createdByUserId: testUserId
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

  describe('GET /api/annotations/:videoId linkedObjectName', () => {
    /**
     * A reviewer reading another annotator's object annotation should see the
     * linked world object's name resolved from the annotation owner's world,
     * even though that world is private to its owner.
     */
    it('resolves linkedObjectName from the annotation owner world for a cross-user reviewer', async () => {
      // Owner (user A) authors the world objects and the annotations.
      const ownerHash = await hashPassword('ownerpass123')
      const owner = await prisma.user.create({
        data: {
          username: 'annotation-owner',
          email: 'owner@example.com',
          passwordHash: ownerHash,
          displayName: 'Annotation Owner',
          isAdmin: false,
          systemRole: 'user',
        }
      })

      // Owner's private world: an entity, an event, and a location entity.
      await prisma.worldState.create({
        data: {
          userId: owner.id,
          projectId: null,
          entities: [
            { id: 'entity-1', name: 'Red Car' },
            { id: 'location-1', name: 'Town Square', locationType: 'point' },
          ] as unknown as Prisma.InputJsonValue,
          events: [{ id: 'event-1', name: 'Collision' }] as unknown as Prisma.InputJsonValue,
          times: [] as unknown as Prisma.InputJsonValue,
        }
      })

      // Owner's annotations: an entity-linked, an event-linked, a location-
      // linked object annotation, plus a type annotation and an object
      // annotation whose label is absent from the owner's world.
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          userId: owner.id,
          createdByUserId: owner.id,
          type: 'object',
          label: 'entity-1',
          linkType: 'entity',
          frames: { boxes: [] }
        }
      })
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          userId: owner.id,
          createdByUserId: owner.id,
          type: 'object',
          label: 'event-1',
          linkType: 'event',
          frames: { boxes: [] }
        }
      })
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          userId: owner.id,
          createdByUserId: owner.id,
          type: 'object',
          label: 'location-1',
          linkType: 'location',
          frames: { boxes: [] }
        }
      })
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: testPersonaId,
          userId: owner.id,
          createdByUserId: owner.id,
          type: 'type',
          label: 'entity-type-1',
          frames: { boxes: [] }
        }
      })
      await prisma.annotation.create({
        data: {
          videoId: testVideoId,
          personaId: null,
          userId: owner.id,
          createdByUserId: owner.id,
          type: 'object',
          label: 'missing-object',
          linkType: 'entity',
          frames: { boxes: [] }
        }
      })

      // Reviewer (user B) is a system admin, so the CASL read filter grants
      // read on the owner's annotations. The reviewer has no world of their
      // own, so any name they see must come from the owner's world.
      const reviewerHash = await hashPassword('reviewerpass123')
      const reviewer = await prisma.user.create({
        data: {
          username: 'annotation-reviewer',
          email: 'reviewer@example.com',
          passwordHash: reviewerHash,
          displayName: 'Annotation Reviewer',
          isAdmin: true,
          systemRole: 'system_admin',
        }
      })
      const reviewerSession = await prisma.session.create({
        data: {
          userId: reviewer.id,
          token: `test-session-${reviewer.id}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/annotations/${testVideoId}`,
        cookies: { session_token: reviewerSession.token }
      })

      expect(response.statusCode).toBe(200)
      const annotations = response.json() as Array<{
        type: string
        label: string
        linkType: string | null
        linkedObjectName: string | null
      }>

      const byLabel = (label: string) => annotations.find(a => a.label === label)!

      // Entity, event, and location names resolve from the owner's world.
      expect(byLabel('entity-1').linkedObjectName).toBe('Red Car')
      expect(byLabel('event-1').linkedObjectName).toBe('Collision')
      expect(byLabel('location-1').linkedObjectName).toBe('Town Square')

      // Type annotations carry no linked object name.
      expect(byLabel('entity-type-1').linkedObjectName).toBeNull()

      // Object annotations whose label is absent from the owner world resolve
      // to null rather than a stale or fabricated name.
      expect(byLabel('missing-object').linkedObjectName).toBeNull()
    })
  })
})
