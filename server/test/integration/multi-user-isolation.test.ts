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
import { reseedOwnershipBaseline } from './_rbac-baseline.js'
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

    // v0.2.0+ uses createdBy / createdByUserId as the ownership field
    // CASL ability rules condition on. The seed must populate them or
    // every CASL check below this fixture would deny — including the
    // owner's own access.
    const summary = await prisma.videoSummary.create({
      data: {
        videoId,
        personaId: persona.id,
        summary: [{ type: 'text', content: `${username} summary` }],
        createdBy: user.id,
      },
    })

    const claim = await prisma.claim.create({
      data: {
        summaryId: summary.id,
        summaryType: 'video',
        text: `${username} claim text`,
        gloss: [{ type: 'text', content: `${username} gloss` }],
        createdBy: user.id,
      },
    })

    const typeAnn = await prisma.annotation.create({
      data: {
        videoId,
        personaId: persona.id,
        userId: user.id,
        createdByUserId: user.id,
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
        createdByUserId: user.id,
        type: 'object',
        label: worldEntityId,
        linkType: 'entity',
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
    await reseedOwnershipBaseline(prisma)
    await prisma.loginAttempt.deleteMany()
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

    /**
     * End-to-end check that POST /api/import populates `importedBy` so the
     * row that GET /api/import/history is scoped against actually carries
     * the importer's id. Previously the create call omitted the field, which
     * meant every user saw an empty history list once the listing endpoint
     * became user-scoped.
     */
    it('POST /api/import populates importedBy so the row appears in the importer\'s history', async () => {
      // Minimal valid JSONL: one persona owned by user A's exporter id.
      const fixture = JSON.stringify({
        type: 'persona',
        data: {
          id: '00000000-0000-0000-0000-0000000000ab',
          userId: A.userId, // intentionally same userId so it's a same-user re-import
          name: 'Round-trip persona',
          role: 'Tester',
          informationNeed: 'Verify importedBy gets set',
        },
      })
      const formData = new (await import('form-data')).default()
      formData.append('file', Buffer.from(fixture, 'utf-8'), {
        filename: 'history-test.jsonl',
        contentType: 'application/x-ndjson',
      })

      const importRes = await app.inject({
        method: 'POST',
        url: '/api/import',
        cookies: { session_token: A.sessionToken },
        headers: { 'content-type': formData.getHeaders()['content-type'] },
        payload: formData.getBuffer(),
      })
      expect(importRes.statusCode).toBe(200)

      // Listing endpoint should return the new history row.
      const historyRes = await app.inject({
        method: 'GET',
        url: '/api/import/history',
        cookies: { session_token: A.sessionToken },
      })
      const history = historyRes.json() as { imports: Array<{ filename: string }> }
      expect(history.imports.map(i => i.filename)).toContain('history-test.jsonl')

      // And the underlying row carries the user id.
      const stored = await prisma.importHistory.findFirst({
        where: { filename: 'history-test.jsonl' },
        select: { importedBy: true },
      })
      expect(stored?.importedBy).toBe(A.userId)
    })
  })

  /**
   * Mutation routes must reject any attempt by user A to modify or delete a
   * resource owned by user B. A passing test here means each route checks
   * resource ownership against `request.user.id` before performing the write.
   * The accepted statuses are 403 (Forbidden) or 404 (Not Found, the
   * preferred response when an owner check fails since it does not confirm
   * the existence of resources the requester cannot see).
   */
  describe('Mutation isolation', () => {
    function expectDeniedOrNotFound(statusCode: number, label: string): void {
      expect([403, 404], `[${label}] expected 403/404 but got ${statusCode}`).toContain(statusCode)
    }

    it('POST /api/annotations rejects creating an annotation on another user\'s persona', async () => {
      const beforeCount = await prisma.annotation.count({ where: { personaId: B.personaId } })
      const res = await app.inject({
        method: 'POST',
        url: '/api/annotations',
        cookies: { session_token: A.sessionToken },
        payload: {
          videoId: sharedVideoId,
          personaId: B.personaId,
          type: 'type',
          label: 'hijacked-type',
          frames: { boxes: [], interpolationSegments: [], visibilityRanges: [], totalFrames: 0, keyframeCount: 0, interpolatedFrameCount: 0 },
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST annotation on foreign persona')
      const afterCount = await prisma.annotation.count({ where: { personaId: B.personaId } })
      expect(afterCount).toBe(beforeCount)
    })

    it('PUT /api/annotations/:id rejects writes to another user\'s annotation', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/annotations/${B.typeAnnotationId}`,
        cookies: { session_token: A.sessionToken },
        payload: { label: 'hijacked' },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT another user\'s annotation')
      // The annotation must remain unchanged.
      const stored = await prisma.annotation.findUnique({ where: { id: B.typeAnnotationId } })
      expect(stored?.label).not.toBe('hijacked')
    })

    it('DELETE /api/annotations/:videoId/:id rejects deletes of another user\'s annotation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/annotations/${sharedVideoId}/${B.typeAnnotationId}`,
        cookies: { session_token: A.sessionToken },
      })
      expectDeniedOrNotFound(res.statusCode, 'DELETE another user\'s annotation')
      // The annotation must still exist.
      const stored = await prisma.annotation.findUnique({ where: { id: B.typeAnnotationId } })
      expect(stored).not.toBeNull()
    })

    it('POST /api/summaries rejects creating a summary on another user\'s persona', async () => {
      // User A targets user B's persona.
      const res = await app.inject({
        method: 'POST',
        url: '/api/summaries',
        cookies: { session_token: A.sessionToken },
        payload: {
          videoId: sharedVideoId,
          personaId: B.personaId,
          summary: [{ type: 'text', content: 'hijacked summary' }],
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST summary on foreign persona')
      // No new summary should have been created on B's persona.
      const summaries = await prisma.videoSummary.findMany({
        where: { personaId: B.personaId, videoId: sharedVideoId }
      })
      // B's seed already has one; there should still be exactly one.
      expect(summaries.length).toBe(1)
      expect(summaries[0].id).toBe(B.summaryId)
    })

    it('PUT /api/videos/:videoId/summaries/:summaryId rejects writes to another user\'s summary', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/videos/${sharedVideoId}/summaries/${B.summaryId}`,
        cookies: { session_token: A.sessionToken },
        payload: { summary: [{ type: 'text', content: 'hijacked' }] },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT another user\'s summary')
      const stored = await prisma.videoSummary.findUnique({ where: { id: B.summaryId } })
      const storedSummary = stored?.summary as Array<{ content?: string }>
      expect(storedSummary?.[0]?.content).not.toBe('hijacked')
    })

    it('DELETE /api/videos/:videoId/summaries/:personaId rejects deletes of another user\'s summary', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/videos/${sharedVideoId}/summaries/${B.personaId}`,
        cookies: { session_token: A.sessionToken },
      })
      expectDeniedOrNotFound(res.statusCode, 'DELETE another user\'s summary')
      const stored = await prisma.videoSummary.findUnique({ where: { id: B.summaryId } })
      expect(stored).not.toBeNull()
    })

    it('PUT /api/personas/:id/ontology rejects writes to another user\'s ontology', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/personas/${B.personaId}/ontology`,
        cookies: { session_token: A.sessionToken },
        payload: { entities: [{ id: 'hijack-et', name: 'Hijacked', gloss: [] }] },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT another user\'s ontology')
      const ontology = await prisma.ontology.findUnique({ where: { personaId: B.personaId } })
      const entityTypes = ontology?.entityTypes as Array<{ id: string }>
      expect(entityTypes.map(e => e.id)).not.toContain('hijack-et')
    })

    it('POST /api/summaries/:summaryId/claims rejects creating a claim under another user\'s summary', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${B.summaryId}/claims`,
        cookies: { session_token: A.sessionToken },
        payload: {
          summaryType: 'video',
          text: 'hijacked claim',
          gloss: [{ type: 'text', content: 'hijack' }],
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST claim under another user\'s summary')
      const claims = await prisma.claim.findMany({ where: { summaryId: B.summaryId } })
      // B's seed has one claim; nothing was added.
      expect(claims.length).toBe(1)
      expect(claims[0].id).toBe(B.claimId)
    })

    it('PUT /api/summaries/:summaryId/claims/:claimId rejects writes to another user\'s claim', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/summaries/${B.summaryId}/claims/${B.claimId}`,
        cookies: { session_token: A.sessionToken },
        payload: { text: 'hijacked text' },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT another user\'s claim')
      const stored = await prisma.claim.findUnique({ where: { id: B.claimId } })
      expect(stored?.text).not.toBe('hijacked text')
    })

    it('DELETE /api/summaries/:summaryId/claims/:claimId rejects deletes of another user\'s claim', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${B.summaryId}/claims/${B.claimId}`,
        cookies: { session_token: A.sessionToken },
      })
      expectDeniedOrNotFound(res.statusCode, 'DELETE another user\'s claim')
      const stored = await prisma.claim.findUnique({ where: { id: B.claimId } })
      expect(stored).not.toBeNull()
    })

    it('POST /api/summaries/:summaryId/claims/:claimId/relations rejects creating a relation under another user\'s claim', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${B.summaryId}/claims/${B.claimId}/relations`,
        cookies: { session_token: A.sessionToken },
        payload: {
          targetClaimId: A.claimId, // pointing back at A's own claim is irrelevant here
          relationTypeId: 'any',
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST claim relation under foreign summary')
      const relations = await prisma.claimRelation.count({ where: { sourceClaimId: B.claimId } })
      expect(relations).toBe(0)
    })

    it('POST /api/summaries/:summaryId/claims/:claimId/relations rejects pointing at another user\'s targetClaimId', async () => {
      // A owns the source path (A.summaryId, A.claimId) but tries to target
      // B's claim. Without the targetClaim ownership check, A could create a
      // relation that surfaces B's claim text in A's relations view.
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${A.summaryId}/claims/${A.claimId}/relations`,
        cookies: { session_token: A.sessionToken },
        payload: {
          targetClaimId: B.claimId,
          relationTypeId: 'any',
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST claim relation with foreign targetClaim')
      const relations = await prisma.claimRelation.count({
        where: { sourceClaimId: A.claimId, targetClaimId: B.claimId },
      })
      expect(relations).toBe(0)
    })

    it('DELETE /api/summaries/:summaryId/claims/relations/:relationId rejects deletes of another user\'s claim relation', async () => {
      // Seed a real claim relation owned by user B.
      const relation = await prisma.claimRelation.create({
        data: {
          sourceClaimId: B.claimId,
          targetClaimId: B.claimId,
          relationTypeId: 'self-ref',
        },
      })
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/summaries/${B.summaryId}/claims/relations/${relation.id}`,
        cookies: { session_token: A.sessionToken },
      })
      expectDeniedOrNotFound(res.statusCode, 'DELETE another user\'s claim relation')
      const stored = await prisma.claimRelation.findUnique({ where: { id: relation.id } })
      expect(stored).not.toBeNull()
    })

    it('POST /api/videos/summaries/generate rejects queuing summary generation on another user\'s persona', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/generate',
        cookies: { session_token: A.sessionToken },
        payload: { videoId: sharedVideoId, personaId: B.personaId },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST summarize-generate on foreign persona')
    })

    it('POST /api/summaries/:summaryId/claims/generate rejects queuing claim extraction on another user\'s summary', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${B.summaryId}/claims/generate`,
        cookies: { session_token: A.sessionToken },
        payload: {
          summaryType: 'video',
          inputSources: {
            includeSummaryText: true,
            includeAnnotations: false,
            includeOntology: false,
            ontologyDepth: 'names-only',
          },
          extractionStrategy: 'sentence-based',
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST claims-generate on foreign summary')
    })

    it('POST /api/summaries/:summaryId/synthesize rejects queuing claim synthesis on another user\'s summary', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/summaries/${B.summaryId}/synthesize`,
        cookies: { session_token: A.sessionToken },
        payload: {},
      })
      expectDeniedOrNotFound(res.statusCode, 'POST synthesize on foreign summary')
    })

    it('PUT /api/ontology rejects upserting another user\'s persona by id', async () => {
      // User A sends a payload that names B's persona id. Without the
      // ownership precheck, the upsert would update B's persona row with
      // A's name/role/informationNeed, completing a full account-level
      // takeover of B's persona.
      const before = await prisma.persona.findUnique({ where: { id: B.personaId } })
      const res = await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: A.sessionToken },
        payload: {
          personas: [{
            id: B.personaId,
            name: 'Hijacked',
            role: 'Hijacked',
            informationNeed: 'Hijacked',
          }],
          personaOntologies: [],
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT ontology with foreign persona id')
      const after = await prisma.persona.findUnique({ where: { id: B.personaId } })
      expect(after?.name).toBe(before?.name)
      expect(after?.userId).toBe(B.userId)
    })

    it('PUT /api/ontology rejects upserting an ontology under another user\'s persona', async () => {
      const before = await prisma.ontology.findUnique({ where: { personaId: B.personaId } })
      const res = await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: A.sessionToken },
        payload: {
          personas: [],
          personaOntologies: [{
            personaId: B.personaId,
            entities: [{ id: 'hijack-et', name: 'Hijacked' }],
          }],
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'PUT ontology with foreign personaId')
      const after = await prisma.ontology.findUnique({ where: { personaId: B.personaId } })
      expect(JSON.stringify(after?.entityTypes)).toBe(JSON.stringify(before?.entityTypes))
    })

    it('POST /api/ontology/augment rejects requesting suggestions against another user\'s persona', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ontology/augment',
        cookies: { session_token: A.sessionToken },
        payload: {
          personaId: B.personaId,
          domain: 'security',
          targetCategory: 'entity',
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST ontology/augment with foreign personaId')
    })

    it('POST /api/videos/:videoId/detect rejects building a detection query from another user\'s persona', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/videos/${sharedVideoId}/detect`,
        cookies: { session_token: A.sessionToken },
        payload: { personaId: B.personaId },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST detect with foreign personaId')
    })

    it('POST /api/videos/:videoId/personas/:personaId/claims rejects creating a claim on another user\'s persona', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/videos/${sharedVideoId}/personas/${B.personaId}/claims`,
        cookies: { session_token: A.sessionToken },
        payload: {
          text: 'hijacked claim',
        },
      })
      expectDeniedOrNotFound(res.statusCode, 'POST video+persona claim on foreign persona')
      // No new claim should appear under B's existing summary.
      const claims = await prisma.claim.count({ where: { summaryId: B.summaryId } })
      expect(claims).toBe(1)
    })
  })

  /**
   * Privilege escalation guards. A regular user must not be able to flag
   * their persona as `isSystemGenerated`, since system personas are surfaced
   * to anonymous visitors via GET /api/personas (the unauthenticated branch
   * filters where isSystemGenerated=true).
   */
  describe('Privilege escalation guards', () => {
    it('POST /api/personas silently ignores isSystemGenerated from non-admin requests', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: A.sessionToken },
        payload: {
          name: 'Sneaky persona',
          role: 'Analyst',
          informationNeed: 'Be public',
          isSystemGenerated: true,
        },
      })
      expect(res.statusCode).toBe(201)
      const created = res.json() as { id: string; isSystemGenerated: boolean }
      expect(created.isSystemGenerated).toBe(false)
      // Cross-check by reading the row directly.
      const stored = await prisma.persona.findUnique({ where: { id: created.id } })
      expect(stored?.isSystemGenerated).toBe(false)
    })

    it('PUT /api/personas/:id silently ignores isSystemGenerated from non-admin requests', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/personas/${A.personaId}`,
        cookies: { session_token: A.sessionToken },
        payload: { isSystemGenerated: true },
      })
      // 200 (write succeeded) but the flag was stripped.
      expect(res.statusCode).toBe(200)
      const stored = await prisma.persona.findUnique({ where: { id: A.personaId } })
      expect(stored?.isSystemGenerated).toBe(false)
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

    it('GET /api/summaries/:summaryId/claims rejects user A reading another user\'s summary by id', async () => {
      // Defense in depth: even if user A knows B's summaryId, the claims
      // endpoint must not return B's claims.
      const res = await app.inject({
        method: 'GET',
        url: `/api/summaries/${B.summaryId}/claims`,
        cookies: { session_token: A.sessionToken },
      })
      expect([403, 404]).toContain(res.statusCode)
    })

    it('GET /api/summaries/:summaryId/claims/:claimId rejects user A reading another user\'s claim by id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/summaries/${B.summaryId}/claims/${B.claimId}`,
        cookies: { session_token: A.sessionToken },
      })
      expect([403, 404]).toContain(res.statusCode)
    })
  })
})
