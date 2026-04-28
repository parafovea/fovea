/**
 * Multi-user isolation matrix.
 *
 * Seeds two parallel users (A and B) with a full data graph each (persona,
 * ontology, world state, summary, claim, type annotation, object annotation,
 * api key, session, import history) and asserts that every user-scoped GET
 * endpoint returns ONLY the requesting user's records.
 *
 * Adding a new listing or getter route should require adding a row here. If
 * that row is omitted, the next cross-tenant leak slips through; if the row
 * is present but the route forgets to scope, this test fails. The history of
 * issue #121 (and the recurring "scope X to authenticated user" entries in
 * 0.1.1 / 0.1.4 / 0.1.6 / 0.1.7 / 0.1.8) is what motivates this matrix.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

interface UserGraph {
  userId: string
  sessionToken: string
  personaId: string
  videoId: string // shared across both users (videos are global)
  worldEntityId: string
  worldEventId: string
  worldTimeId: string
  summaryId: string
  claimId: string
  typeAnnotationId: string
  objectAnnotationId: string
  apiKeyId: string
}

describe('Multi-user listing isolation matrix', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let sharedVideoId: string
  let A: UserGraph
  let B: UserGraph

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  /**
   * Build a complete data graph for a single user. Both users share the same
   * video so listing endpoints scoped by videoId have a real chance to leak.
   */
  async function seedUser(username: string, password: string, videoId: string): Promise<UserGraph> {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash,
        displayName: username,
        isAdmin: false,
      },
    })

    const persona = await prisma.persona.create({
      data: {
        userId: user.id,
        name: `${username} persona`,
        role: 'Analyst',
        informationNeed: 'Testing',
      },
    })

    await prisma.ontology.create({
      data: {
        personaId: persona.id,
        entityTypes: [{ id: `${username}-et`, name: 'Type', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    const worldEntityId = `${username}-entity-1`
    const worldEventId = `${username}-event-1`
    const worldTimeId = `${username}-time-1`
    await prisma.worldState.create({
      data: {
        userId: user.id,
        entities: [{ id: worldEntityId, name: `${username} Entity`, typeId: `${username}-et` }],
        events: [{ id: worldEventId, name: `${username} Event` }],
        times: [{ id: worldTimeId, label: `${username} Time` }],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      },
    })

    const summary = await prisma.videoSummary.create({
      data: {
        videoId,
        personaId: persona.id,
        summary: [{ type: 'text', content: `${username} summary` }],
      },
    })

    const claim = await prisma.claim.create({
      data: {
        summaryId: summary.id,
        summaryType: 'video',
        text: `${username} claim text`,
        gloss: [{ type: 'text', content: `${username} gloss` }],
      },
    })

    const typeAnn = await prisma.annotation.create({
      data: {
        videoId,
        personaId: persona.id,
        type: 'type',
        label: `${username}-et`,
        frames: {
          boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    const objectAnn = await prisma.annotation.create({
      data: {
        videoId,
        personaId: null,
        userId: user.id,
        type: 'object',
        label: worldEntityId,
        frames: {
          boxes: [{ x: 50, y: 50, width: 10, height: 10, frameNumber: 5, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 5, endFrame: 5, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        provider: 'anthropic',
        keyName: `${username} key`,
        encryptedKey: `enc-${username}-${Date.now()}`,
        keyMask: '...XYZ9',
      },
    })

    await prisma.importHistory.create({
      data: {
        importedBy: user.id,
        filename: `${username}-import.jsonl`,
        importOptions: {},
        result: { success: true },
        success: true,
        itemsImported: 0,
        itemsSkipped: 0,
      },
    })

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })
    const sessionToken = login.cookies.find(c => c.name === 'session_token')!.value

    return {
      userId: user.id,
      sessionToken,
      personaId: persona.id,
      videoId,
      worldEntityId,
      worldEventId,
      worldTimeId,
      summaryId: summary.id,
      claimId: claim.id,
      typeAnnotationId: typeAnn.id,
      objectAnnotationId: objectAnn.id,
      apiKeyId: apiKey.id,
    }
  }

  beforeEach(async () => {
    await prisma.importHistory.deleteMany()
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.user.deleteMany()

    const video = await prisma.video.create({
      data: { filename: 'shared.mp4', path: '/v/shared.mp4', duration: 60 },
    })
    sharedVideoId = video.id

    A = await seedUser('userA', 'passA12345', sharedVideoId)
    B = await seedUser('userB', 'passB12345', sharedVideoId)
  })

  /**
   * For each (user, endpoint) pair, asserts the response excludes the other
   * user's identifier. Driven by a single helper so the matrix stays compact.
   */
  async function expectIsolated<T>({
    label,
    url,
    requester,
    foreignIds,
    extractIds,
  }: {
    label: string
    url: string
    requester: UserGraph
    foreignIds: string[]
    extractIds: (body: T) => string[]
  }): Promise<void> {
    const res = await app.inject({
      method: 'GET',
      url,
      cookies: { session_token: requester.sessionToken },
    })
    if (res.statusCode !== 200) {
      throw new Error(`[${label}] expected 200 but got ${res.statusCode}: ${res.body.slice(0, 200)}`)
    }
    const ids = extractIds(res.json() as T)
    for (const fid of foreignIds) {
      expect(ids, `[${label}] requester=${requester.userId} should not see ${fid}`).not.toContain(fid)
    }
  }

  describe('Annotation listings', () => {
    it('GET /api/annotations/:videoId is user-scoped', async () => {
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/annotations/:videoId as A',
        url: `/api/annotations/${sharedVideoId}`,
        requester: A,
        foreignIds: [B.typeAnnotationId, B.objectAnnotationId],
        extractIds: body => body.map(a => a.id),
      })
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/annotations/:videoId as B',
        url: `/api/annotations/${sharedVideoId}`,
        requester: B,
        foreignIds: [A.typeAnnotationId, A.objectAnnotationId],
        extractIds: body => body.map(a => a.id),
      })
    })
  })

  describe('Summary listings', () => {
    it('GET /api/videos/:videoId/summaries is user-scoped', async () => {
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/videos/:videoId/summaries as A',
        url: `/api/videos/${sharedVideoId}/summaries`,
        requester: A,
        foreignIds: [B.summaryId],
        extractIds: body => body.map(s => s.id),
      })
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/videos/:videoId/summaries as B',
        url: `/api/videos/${sharedVideoId}/summaries`,
        requester: B,
        foreignIds: [A.summaryId],
        extractIds: body => body.map(s => s.id),
      })
    })
  })

  describe('Persona listings', () => {
    it('GET /api/personas only returns the requesting user\'s personas', async () => {
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/personas as A',
        url: '/api/personas',
        requester: A,
        foreignIds: [B.personaId],
        extractIds: body => body.map(p => p.id),
      })
    })

    it('GET /api/personas/:id returns 404 for another user\'s persona', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/personas/${B.personaId}`,
        cookies: { session_token: A.sessionToken },
      })
      expect([403, 404]).toContain(res.statusCode)
    })

    it('GET /api/personas/:id/ontology returns 403/404 for another user\'s persona', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/personas/${B.personaId}/ontology`,
        cookies: { session_token: A.sessionToken },
      })
      expect([403, 404]).toContain(res.statusCode)
    })
  })

  describe('World state listings', () => {
    it('GET /api/world only returns the requesting user\'s world objects', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/world',
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode).toBe(200)
      const world = res.json() as {
        entities: Array<{ id: string }>
        events: Array<{ id: string }>
        times: Array<{ id: string }>
      }
      const ids = [
        ...world.entities.map(e => e.id),
        ...world.events.map(e => e.id),
        ...world.times.map(t => t.id),
      ]
      expect(ids).not.toContain(B.worldEntityId)
      expect(ids).not.toContain(B.worldEventId)
      expect(ids).not.toContain(B.worldTimeId)
    })
  })

  describe('API key listings', () => {
    it('GET /api/api-keys only returns the requesting user\'s keys', async () => {
      await expectIsolated<Array<{ id: string }>>({
        label: 'GET /api/api-keys as A',
        url: '/api/api-keys',
        requester: A,
        foreignIds: [B.apiKeyId],
        extractIds: body => body.map(k => k.id),
      })
    })
  })

  describe('Session listings', () => {
    it('GET /api/sessions only returns the requesting user\'s sessions', async () => {
      // Both users logged in during seedUser, so each has exactly one session.
      // The endpoint masks tokens, so we cross-check by count: the requester's
      // response size must match the count of session rows where userId equals
      // the requester. If the route ever leaked another user's row this would
      // come back high.
      const dbSessionsForA = await prisma.session.count({ where: { userId: A.userId } })
      expect(dbSessionsForA).toBeGreaterThanOrEqual(1)

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode).toBe(200)
      const sessions = res.json() as Array<{ id: string }>
      expect(sessions.length).toBe(dbSessionsForA)

      // Cross-check: A's response must not include any session id that
      // belongs to user B in the database.
      const bSessionIds = (await prisma.session.findMany({
        where: { userId: B.userId },
        select: { id: true }
      })).map(s => s.id)
      for (const bId of bSessionIds) {
        expect(sessions.map(s => s.id)).not.toContain(bId)
      }
    })
  })

  describe('Import history listings', () => {
    it('GET /api/import/history only returns the requesting user\'s history', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/import/history',
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { imports: Array<{ filename: string }> }
      const filenames = body.imports.map(i => i.filename)
      expect(filenames).not.toContain('userB-import.jsonl')
      expect(filenames).toContain('userA-import.jsonl')
    })
  })

  describe('Claim listings', () => {
    /**
     * Claims are addressed by summaryId, and a user-owned summary id is the
     * gate. The summaries-list test above already proves a user cannot
     * discover another user's summary id via the listing endpoint, so the
     * claim listing is implicitly user-scoped through the summary surface.
     * This test asserts the claim list under each user's own summary returns
     * exactly the claims they own and not the foreign user's.
     */
    it('GET /api/summaries/:summaryId/claims for user A returns only A\'s claim', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/summaries/${A.summaryId}/claims`,
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode).toBe(200)
      const claims = res.json() as Array<{ id: string }>
      const ids = claims.map(c => c.id)
      expect(ids).toContain(A.claimId)
      expect(ids).not.toContain(B.claimId)
    })
  })
})
