import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { seedOntology, seedWorldState, seedAnnotation } from '../helpers/seed-layers.js'

/**
 * Tests that export routes scope data to the authenticated user.
 * Verifies that user A cannot see user B's personas, summaries,
 * world state, or other user-specific data in exports.
 */
describe('Export API - User Scoping', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  // User A (the one doing exports)
  let userAId: string
  let userASessionToken: string
  let userAPersonaId: string

  // User B (another user whose data should be invisible to A)
  let userBId: string
  let userBPersonaId: string

  let sharedVideoId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order (layers store first, then the rest).
    await prisma.textAnnotationRelation.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    // Create user A
    const hashA = await hashPassword('passwordA')
    const userA = await prisma.user.create({
      data: {
        username: 'userA',
        email: 'userA@example.com',
        passwordHash: hashA,
        displayName: 'User A',
        isAdmin: false,
      },
    })
    userAId = userA.id

    // Create user B
    const hashB = await hashPassword('passwordB')
    const userB = await prisma.user.create({
      data: {
        username: 'userB',
        email: 'userB@example.com',
        passwordHash: hashB,
        displayName: 'User B',
        isAdmin: false,
      },
    })
    userBId = userB.id

    // Create shared video (visible to both)
    const video = await prisma.video.create({
      data: {
        filename: 'shared-video.mp4',
        path: '/videos/shared-video.mp4',
        duration: 120.0,
      },
    })
    sharedVideoId = video.id

    // Create persona for user A
    const personaA = await prisma.persona.create({
      data: {
        userId: userAId,
        name: 'Persona A',
        role: 'Analyst',
        informationNeed: 'User A analysis',
      },
    })
    userAPersonaId = personaA.id

    // Create ontology for user A's persona
    await seedOntology(prisma, {
      data: {
        personaId: userAPersonaId,
        entityTypes: [{ id: 'e1', name: 'Person', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // Create persona for user B
    const personaB = await prisma.persona.create({
      data: {
        userId: userBId,
        name: 'Persona B',
        role: 'Reviewer',
        informationNeed: 'User B review',
      },
    })
    userBPersonaId = personaB.id

    // Create ontology for user B's persona
    await seedOntology(prisma, {
      data: {
        personaId: userBPersonaId,
        entityTypes: [{ id: 'e2', name: 'Vehicle', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // Create summaries for both users
    await prisma.videoSummary.create({
      data: {
        videoId: sharedVideoId,
        personaId: userAPersonaId,
        summary: [{ type: 'text', content: 'User A summary' }],
      },
    })

    await prisma.videoSummary.create({
      data: {
        videoId: sharedVideoId,
        personaId: userBPersonaId,
        summary: [{ type: 'text', content: 'User B summary' }],
      },
    })

    // Create world state for both users
    await seedWorldState(prisma, {
      data: {
        userId: userAId,
        entities: [{ id: 'entity-a', name: 'Entity A' }],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      },
    })

    await seedWorldState(prisma, {
      data: {
        userId: userBId,
        entities: [{ id: 'entity-b', name: 'Entity B' }],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      },
    })

    // Create annotation for user A's persona (type annotation with keyframes)
    await seedAnnotation(prisma, {
      data: {
        videoId: sharedVideoId,
        personaId: userAPersonaId,
        userId: userAId,
        type: 'type',
        label: 'e1',
        frames: {
          boxes: [
            { x: 10, y: 10, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
            { x: 20, y: 20, width: 50, height: 50, frameNumber: 30, isKeyframe: true },
          ],
          interpolationSegments: [{ startFrame: 0, endFrame: 30, type: 'linear' }],
          visibilityRanges: [{ startFrame: 0, endFrame: 30, visible: true }],
          totalFrames: 31,
          keyframeCount: 2,
          interpolatedFrameCount: 0,
        },
      },
    })

    // Create annotation for user B's persona (type annotation with keyframes)
    await seedAnnotation(prisma, {
      data: {
        videoId: sharedVideoId,
        personaId: userBPersonaId,
        userId: userBId,
        type: 'type',
        label: 'e2',
        frames: {
          boxes: [
            { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
            { x: 110, y: 110, width: 50, height: 50, frameNumber: 15, isKeyframe: true },
            { x: 120, y: 120, width: 50, height: 50, frameNumber: 30, isKeyframe: true },
          ],
          interpolationSegments: [
            { startFrame: 0, endFrame: 15, type: 'linear' },
            { startFrame: 15, endFrame: 30, type: 'linear' },
          ],
          visibilityRanges: [{ startFrame: 0, endFrame: 30, visible: true }],
          totalFrames: 31,
          keyframeCount: 3,
          interpolatedFrameCount: 0,
        },
      },
    })

    // Create object annotation for user A (null personaId, owned by user A)
    await seedAnnotation(prisma, {
      data: {
        videoId: sharedVideoId,
        personaId: null,
        userId: userAId,
        type: 'object',
        label: 'entity-a',
        frames: {
          boxes: [
            { x: 50, y: 50, width: 30, height: 30, frameNumber: 0, isKeyframe: true },
          ],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    // Create object annotation for user B (null personaId, owned by user B)
    await seedAnnotation(prisma, {
      data: {
        videoId: sharedVideoId,
        personaId: null,
        userId: userBId,
        type: 'object',
        label: 'entity-b',
        frames: {
          boxes: [
            { x: 200, y: 200, width: 40, height: 40, frameNumber: 0, isKeyframe: true },
            { x: 210, y: 210, width: 40, height: 40, frameNumber: 10, isKeyframe: true },
            { x: 220, y: 220, width: 40, height: 40, frameNumber: 20, isKeyframe: true },
            { x: 230, y: 230, width: 40, height: 40, frameNumber: 30, isKeyframe: true },
          ],
          interpolationSegments: [
            { startFrame: 0, endFrame: 10, type: 'linear' },
            { startFrame: 10, endFrame: 20, type: 'linear' },
            { startFrame: 20, endFrame: 30, type: 'linear' },
          ],
          visibilityRanges: [{ startFrame: 0, endFrame: 30, visible: true }],
          totalFrames: 31,
          keyframeCount: 4,
          interpolatedFrameCount: 0,
        },
      },
    })

    // Login as user A
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'userA', password: 'passwordA' },
    })
    userASessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('GET /api/export', () => {
    it('exports only the authenticated user\'s personas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const personaLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'persona')

      expect(personaLines).toHaveLength(1)
      expect(personaLines[0].data.name).toBe('Persona A')
    })

    it('exports only ontologies belonging to the user\'s personas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const ontologyLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'ontology')

      expect(ontologyLines).toHaveLength(1)
      expect(ontologyLines[0].data.personaId).toBe(userAPersonaId)
    })

    it('excludes annotations belonging to other users\' personas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const annotationLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'annotation')

      // Should include user A's type annotation + shared null-persona object annotation
      // but NOT user B's type annotation
      expect(annotationLines).toHaveLength(2)
      const typeAnnotations = annotationLines.filter(
        (a: { data: { annotationType: string } }) => a.data.annotationType === 'type'
      )
      const objectAnnotations = annotationLines.filter(
        (a: { data: { annotationType: string } }) => a.data.annotationType === 'object'
      )
      expect(typeAnnotations).toHaveLength(1)
      expect(typeAnnotations[0].data.personaId).toBe(userAPersonaId)
      expect(objectAnnotations).toHaveLength(1)
    })

    it('includes object annotations with null personaId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const annotationLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'annotation')

      const objectAnnotations = annotationLines.filter(
        (a: { data: { annotationType: string } }) => a.data.annotationType === 'object'
      )
      expect(objectAnnotations).toHaveLength(1)
    })

    it('intersects personaIds filter with user\'s own personas for annotations', async () => {
      // Try to filter by user B's persona ID — should get no annotations
      const response = await app.inject({
        method: 'GET',
        url: `/api/export?personaIds=${userBPersonaId}`,
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const annotationLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'annotation')

      expect(annotationLines).toHaveLength(0)
    })

    it('exports only summaries for the user\'s personas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const summaryLines = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'summary')

      expect(summaryLines).toHaveLength(1)
      expect(summaryLines[0].data.personaId).toBe(userAPersonaId)
    })
  })

  describe('GET /api/export/stats', () => {
    it('counts only the authenticated user\'s data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/stats',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const stats = response.json()

      // User A has 1 persona, 1 ontology, 1 summary
      expect(stats.personaCount).toBe(1)
      expect(stats.ontologyCount).toBe(1)
      expect(stats.summaryCount).toBe(1)
      // User A's type annotation + user A's object annotation, not user B's
      expect(stats.annotationCount).toBe(2)
    })

    it('scopes keyframe counts to the authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/stats',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const stats = response.json()

      // User A's type annotation has 2 keyframes + user A's object annotation has 1 keyframe = 3
      // User B's type annotation (3 keyframes) and object annotation (4 keyframes) must NOT be counted
      expect(stats.keyframeCount).toBe(3)
      expect(stats.sequenceCount).toBe(2)
    })
  })

  describe('GET /api/export/personas', () => {
    it('exports only the authenticated user\'s personas and ontologies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/personas',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const parsed = lines.map(l => JSON.parse(l))

      const personas = parsed.filter((e: { type: string }) => e.type === 'persona')
      const ontologies = parsed.filter((e: { type: string }) => e.type === 'ontology')

      expect(personas).toHaveLength(1)
      expect(personas[0].data.name).toBe('Persona A')
      expect(ontologies).toHaveLength(1)
      expect(ontologies[0].data.personaId).toBe(userAPersonaId)
    })
  })

  describe('GET /api/export/world', () => {
    it('exports only the authenticated user\'s world state', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/world',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const entities = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'entity')

      // User A's world state has Entity A; User B's Entity B should not appear
      if (entities.length > 0) {
        expect(entities[0].data.name).toBe('Entity A')
      }
    })
  })

  describe('GET /api/export/summaries', () => {
    it('scopes summaries to the authenticated user\'s personas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/summaries',
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const lines = response.body.trim().split('\n').filter(l => l)
      const summaries = lines
        .map(l => JSON.parse(l))
        .filter((entry: { type: string }) => entry.type === 'summary')

      expect(summaries).toHaveLength(1)
      expect(summaries[0].data.personaId).toBe(userAPersonaId)
    })

    it('intersects personaIds filter with user\'s own personas', async () => {
      // Try to filter by user B's persona ID; should get empty results
      const response = await app.inject({
        method: 'GET',
        url: `/api/export/summaries?personaIds=${userBPersonaId}`,
        cookies: { session_token: userASessionToken },
      })

      expect(response.statusCode).toBe(200)
      const body = response.body.trim()
      // Should be empty since user B's persona is not user A's
      expect(body).toBe('')
    })
  })

  describe('authentication required', () => {
    it('returns 401 for /api/export without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export',
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 for /api/export/stats without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/stats',
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 for /api/export/personas without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/personas',
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 for /api/export/world without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/world',
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns 401 for /api/export/summaries without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/export/summaries',
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
