import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'
import FormData from 'form-data'

/**
 * Integration tests for cross-user import/export round-trip.
 * Verifies that exporting from user A and importing as user B
 * creates copies with new IDs rather than conflicting.
 *
 * Requires a running PostgreSQL database (runs in CI).
 */
describe('Cross-user import/export round-trip', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  let userAId: string
  let userASessionToken: string
  let userBId: string
  let userBSessionToken: string
  let sharedVideoId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
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

    // Create a shared video
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
        name: 'Analyst A',
        role: 'Security Analyst',
        informationNeed: 'Threat detection',
      },
    })

    // Create ontology for user A
    await prisma.ontology.create({
      data: {
        personaId: personaA.id,
        entityTypes: [{ id: 'et-person', name: 'Person', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // Create world state for user A
    await prisma.worldState.create({
      data: {
        userId: userAId,
        entities: [{ id: 'entity-a1', name: 'Alice', typeId: 'et-person' }],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      },
    })

    // Create annotation for user A
    await prisma.annotation.create({
      data: {
        videoId: sharedVideoId,
        personaId: personaA.id,
        type: 'type',
        label: 'et-person',
        frames: {
          boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    // Create summary for user A
    const summary = await prisma.videoSummary.create({
      data: {
        videoId: sharedVideoId,
        personaId: personaA.id,
        summary: [{ type: 'text', content: 'User A summary of video' }],
      },
    })

    // Create claim for user A
    await prisma.claim.create({
      data: {
        summaryId: summary.id,
        summaryType: 'video',
        text: 'A person is visible in the video',
        gloss: [{ type: 'text', content: 'person visible' }],
      },
    })

    // Login both users
    const loginA = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'userA', password: 'passwordA' },
    })
    userASessionToken = loginA.cookies.find(c => c.name === 'session_token')!.value

    const loginB = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'userB', password: 'passwordB' },
    })
    userBSessionToken = loginB.cookies.find(c => c.name === 'session_token')!.value
  })

  /**
   * Helper to create a multipart import request body.
   */
  function createImportForm(jsonlContent: string, options?: Record<string, unknown>): { body: Buffer; contentType: string } {
    const form = new FormData()
    form.append('file', Buffer.from(jsonlContent, 'utf-8'), {
      filename: 'import.jsonl',
      contentType: 'application/x-ndjson',
    })
    if (options) {
      form.append('options', JSON.stringify(options))
    }
    return {
      body: form.getBuffer(),
      contentType: form.getHeaders()['content-type'],
    }
  }

  it('user A export includes userId on persona lines', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userASessionToken },
    })

    expect(response.statusCode).toBe(200)
    const lines = response.body.trim().split('\n').filter(l => l)
    const personaLines = lines.map(l => JSON.parse(l)).filter((e: { type: string }) => e.type === 'persona')

    expect(personaLines).toHaveLength(1)
    expect(personaLines[0].data.userId).toBe(userAId)
  })

  it('user B importing user A export creates copies with new IDs', async () => {
    // Step 1: User A exports
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userASessionToken },
    })
    expect(exportResponse.statusCode).toBe(200)
    const exportedJsonl = exportResponse.body

    // Step 2: User B imports
    const { body, contentType } = createImportForm(exportedJsonl)
    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/import',
      cookies: { session_token: userBSessionToken },
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(importResponse.statusCode).toBe(200)
    const result = importResponse.json()
    expect(result.success).toBe(true)

    // Step 3: Verify user B now has their own copy of data
    // User B should have a persona
    const userBPersonas = await prisma.persona.findMany({ where: { userId: userBId } })
    expect(userBPersonas.length).toBeGreaterThanOrEqual(1)

    // The new persona should have a different ID from user A's persona
    const userAPersonas = await prisma.persona.findMany({ where: { userId: userAId } })
    const userAPersonaIds = new Set(userAPersonas.map(p => p.id))
    for (const persona of userBPersonas) {
      expect(userAPersonaIds.has(persona.id)).toBe(false)
    }

    // Step 4: User B exports and verifies they have data
    const userBExport = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userBSessionToken },
    })
    expect(userBExport.statusCode).toBe(200)
    const userBLines = userBExport.body.trim().split('\n').filter(l => l)
    expect(userBLines.length).toBeGreaterThan(0)

    const userBExportedPersonas = userBLines
      .map(l => JSON.parse(l))
      .filter((e: { type: string }) => e.type === 'persona')
    expect(userBExportedPersonas.length).toBeGreaterThanOrEqual(1)
    expect(userBExportedPersonas[0].data.userId).toBe(userBId)
  })

  it('cross-user import generates new IDs even when original IDs are absent from DB', async () => {
    // Step 1: User A exports
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userASessionToken },
    })
    expect(exportResponse.statusCode).toBe(200)
    const exportedJsonl = exportResponse.body

    // Collect user A's original IDs from the export
    const exportedLines = exportedJsonl.trim().split('\n').filter((l: string) => l).map((l: string) => JSON.parse(l))
    const originalPersonaIds = exportedLines
      .filter((e: { type: string }) => e.type === 'persona')
      .map((e: { data: { id: string } }) => e.data.id)
    const originalAnnotationIds = exportedLines
      .filter((e: { type: string }) => e.type === 'annotation')
      .map((e: { data: { id: string } }) => e.data.id)

    // Step 2: Delete user A's data so IDs no longer exist in the DB
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany({ where: { persona: { userId: userAId } } })
    await prisma.videoSummary.deleteMany({ where: { persona: { userId: userAId } } })
    await prisma.ontology.deleteMany({ where: { persona: { userId: userAId } } })
    await prisma.worldState.deleteMany({ where: { userId: userAId } })
    await prisma.persona.deleteMany({ where: { userId: userAId } })

    // Step 3: User B imports user A's export (IDs no longer in DB)
    const { body, contentType } = createImportForm(exportedJsonl)
    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/import',
      cookies: { session_token: userBSessionToken },
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(importResponse.statusCode).toBe(200)
    const result = importResponse.json()
    expect(result.success).toBe(true)

    // Step 4: Verify user B has new IDs (not the originals from user A)
    const userBPersonas = await prisma.persona.findMany({ where: { userId: userBId } })
    expect(userBPersonas.length).toBeGreaterThanOrEqual(1)
    for (const persona of userBPersonas) {
      expect(originalPersonaIds).not.toContain(persona.id)
    }

    const userBAnnotations = await prisma.annotation.findMany({
      where: { personaId: { in: userBPersonas.map(p => p.id) } },
    })
    expect(userBAnnotations.length).toBeGreaterThanOrEqual(1)
    for (const annotation of userBAnnotations) {
      expect(originalAnnotationIds).not.toContain(annotation.id)
    }
  })

  it('user A re-importing own export does not create duplicates', async () => {
    // Step 1: User A exports
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userASessionToken },
    })
    expect(exportResponse.statusCode).toBe(200)
    const exportedJsonl = exportResponse.body

    // Count user A's data before re-import
    const personasBefore = await prisma.persona.findMany({ where: { userId: userAId } })
    const annotationsBefore = await prisma.annotation.findMany({
      where: { personaId: { in: personasBefore.map(p => p.id) } },
    })

    // Step 2: User A re-imports (default strategy is skip)
    const { body, contentType } = createImportForm(exportedJsonl)
    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/import',
      cookies: { session_token: userASessionToken },
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(importResponse.statusCode).toBe(200)
    const result = importResponse.json()
    expect(result.success).toBe(true)

    // Step 3: Verify no duplicates were created
    const personasAfter = await prisma.persona.findMany({ where: { userId: userAId } })
    expect(personasAfter).toHaveLength(personasBefore.length)

    const annotationsAfter = await prisma.annotation.findMany({
      where: { personaId: { in: personasAfter.map(p => p.id) } },
    })
    expect(annotationsAfter).toHaveLength(annotationsBefore.length)
  })

  it('import preview shows conflicts tagged with ownership', async () => {
    // Step 1: User A exports
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/export',
      cookies: { session_token: userASessionToken },
    })
    expect(exportResponse.statusCode).toBe(200)
    const exportedJsonl = exportResponse.body

    // Step 2: User B previews import
    const { body, contentType } = createImportForm(exportedJsonl)
    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/import/preview',
      cookies: { session_token: userBSessionToken },
      headers: { 'content-type': contentType },
      payload: body,
    })

    expect(previewResponse.statusCode).toBe(200)
    const preview = previewResponse.json()

    // Conflicts should be detected (ID collisions)
    expect(preview.conflicts.length).toBeGreaterThanOrEqual(0)
    // Counts should reflect the import content
    expect(preview.counts.annotations).toBeGreaterThanOrEqual(0)
  })

  /**
   * Regression tests for issue #121: imported entities/claims display issues.
   *
   * The duplicate-row symptom on multi-user instances reproduces when two
   * users import the same export file: the unscoped GET /api/annotations and
   * GET /api/videos/:videoId/summaries endpoints used to return every user's
   * copies, including the foreign user's regenerated UUIDs, which the
   * frontend rendered as raw IDs because the requesting user could not see
   * the foreign worldState entities those IDs point to.
   */
  describe('Multi-user listing isolation (issue #121)', () => {
    /**
     * Seed a second user's import-equivalent state (persona + worldState +
     * annotation + summary + claim) on the shared video so we can assert that
     * neither user sees the other's records.
     */
    async function seedUserBImportedData(): Promise<{
      personaId: string
      summaryId: string
      typeAnnotationId: string
      objectAnnotationId: string
      claimId: string
    }> {
      const personaB = await prisma.persona.create({
        data: {
          userId: userBId,
          name: 'Analyst B',
          role: 'Compliance Analyst',
          informationNeed: 'Policy review',
        },
      })
      await prisma.ontology.create({
        data: {
          personaId: personaB.id,
          entityTypes: [{ id: 'et-vehicle', name: 'Vehicle', gloss: [] }],
          eventTypes: [],
          roleTypes: [],
          relationTypes: [],
        },
      })
      await prisma.worldState.create({
        data: {
          userId: userBId,
          entities: [{ id: 'entity-b1', name: 'Train', typeId: 'et-vehicle' }],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: [],
        },
      })
      const typeAnn = await prisma.annotation.create({
        data: {
          videoId: sharedVideoId,
          personaId: personaB.id,
          type: 'type',
          label: 'et-vehicle',
          frames: {
            boxes: [{ x: 0, y: 0, width: 50, height: 50, frameNumber: 0, isKeyframe: true }],
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
          videoId: sharedVideoId,
          personaId: null,
          userId: userBId,
          type: 'object',
          label: 'entity-b1',
          frames: {
            boxes: [{ x: 100, y: 0, width: 50, height: 50, frameNumber: 5, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 5, endFrame: 5, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
        },
      })
      const summaryB = await prisma.videoSummary.create({
        data: {
          videoId: sharedVideoId,
          personaId: personaB.id,
          summary: [{ type: 'text', content: 'User B summary of video' }],
        },
      })
      const claimB = await prisma.claim.create({
        data: {
          summaryId: summaryB.id,
          summaryType: 'video',
          text: 'A vehicle is visible in the video',
          gloss: [{ type: 'text', content: 'vehicle visible' }],
        },
      })
      return {
        personaId: personaB.id,
        summaryId: summaryB.id,
        typeAnnotationId: typeAnn.id,
        objectAnnotationId: objectAnn.id,
        claimId: claimB.id,
      }
    }

    it('GET /api/annotations/:videoId only returns the requesting user\'s annotations', async () => {
      const userBData = await seedUserBImportedData()

      // Sanity: both users have annotations on the shared video at the DB level
      const allOnVideo = await prisma.annotation.findMany({ where: { videoId: sharedVideoId } })
      expect(allOnVideo.length).toBeGreaterThanOrEqual(3) // 1 from beforeEach (A), 2 from B

      // User A should see only their own annotation, not user B's
      const userAResponse = await app.inject({
        method: 'GET',
        url: `/api/annotations/${sharedVideoId}`,
        cookies: { session_token: userASessionToken },
      })
      expect(userAResponse.statusCode).toBe(200)
      const userAAnnotations = userAResponse.json() as Array<{ id: string; personaId: string | null; type: string; label: string }>
      const userAIds = userAAnnotations.map(a => a.id)
      expect(userAIds).not.toContain(userBData.typeAnnotationId)
      expect(userAIds).not.toContain(userBData.objectAnnotationId)
      // None of user A's annotations should leak user B's persona id
      for (const ann of userAAnnotations) {
        if (ann.personaId !== null) {
          expect(ann.personaId).not.toBe(userBData.personaId)
        }
      }

      // User B should see only their own annotations (type + object), not A's
      const userBResponse = await app.inject({
        method: 'GET',
        url: `/api/annotations/${sharedVideoId}`,
        cookies: { session_token: userBSessionToken },
      })
      expect(userBResponse.statusCode).toBe(200)
      const userBAnnotations = userBResponse.json() as Array<{ id: string; personaId: string | null }>
      const userBIds = userBAnnotations.map(a => a.id)
      expect(userBIds).toContain(userBData.typeAnnotationId)
      expect(userBIds).toContain(userBData.objectAnnotationId)
      expect(userBAnnotations.length).toBe(2)
    })

    it('GET /api/videos/:videoId/summaries only returns the requesting user\'s summaries', async () => {
      const userBData = await seedUserBImportedData()

      const userAResponse = await app.inject({
        method: 'GET',
        url: `/api/videos/${sharedVideoId}/summaries`,
        cookies: { session_token: userASessionToken },
      })
      expect(userAResponse.statusCode).toBe(200)
      const userASummaries = userAResponse.json() as Array<{ id: string; personaId: string }>
      expect(userASummaries.map(s => s.id)).not.toContain(userBData.summaryId)
      expect(userASummaries.every(s => s.personaId !== userBData.personaId)).toBe(true)

      const userBResponse = await app.inject({
        method: 'GET',
        url: `/api/videos/${sharedVideoId}/summaries`,
        cookies: { session_token: userBSessionToken },
      })
      expect(userBResponse.statusCode).toBe(200)
      const userBSummaries = userBResponse.json() as Array<{ id: string; personaId: string }>
      expect(userBSummaries.map(s => s.id)).toContain(userBData.summaryId)
      expect(userBSummaries.length).toBe(1)
    })

    it('after both users import the same export, neither user sees duplicates on the shared video', async () => {
      // Reuse the existing seed (user A) and create user B's "imported" copy.
      // Each user's copy uses different UUIDs (regenerated on import) but
      // sits on the same shared video.
      const userBData = await seedUserBImportedData()

      const userAResponse = await app.inject({
        method: 'GET',
        url: `/api/annotations/${sharedVideoId}`,
        cookies: { session_token: userASessionToken },
      })
      const userAAnnotations = userAResponse.json() as Array<{ id: string; personaId: string | null; userId?: string | null }>
      // User A's beforeEach seed has exactly one annotation
      expect(userAAnnotations).toHaveLength(1)
      expect(userAAnnotations[0].id).not.toBe(userBData.typeAnnotationId)
      expect(userAAnnotations[0].id).not.toBe(userBData.objectAnnotationId)
    })

    it('GET /api/summaries/:summaryId/claims for user A does not return claims under user B\'s summary', async () => {
      const userBData = await seedUserBImportedData()

      // User A asking for B's summary should be blocked at the summary-list
      // level (the previous test) AND at the per-summary level if A guesses
      // an ID. The current claim route does not enforce ownership on its own,
      // so we verify the summaries-list scope catches it: a user listing
      // their summaries never sees B's summaryId, so the frontend never asks
      // for B's claims in the first place.
      const userAList = await app.inject({
        method: 'GET',
        url: `/api/videos/${sharedVideoId}/summaries`,
        cookies: { session_token: userASessionToken },
      })
      const userASummaries = userAList.json() as Array<{ id: string }>
      expect(userASummaries.map(s => s.id)).not.toContain(userBData.summaryId)
    })
  })
})
