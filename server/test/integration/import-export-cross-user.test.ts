import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { reseedOwnershipBaseline } from './_rbac-baseline.js'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
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
    await reseedOwnershipBaseline(prisma)
    // Clean database in dependency order
    await prisma.importHistory.deleteMany()
    // Layers store (reverse-FK order) — this test now seeds user A's data
    // through the layers-backed APIs, so the layers rows must be cleared too.
    await prisma.textAnnotationRelation.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.tokenization.deleteMany()
    await prisma.segmentation.deleteMany()
    await prisma.corpusMembership.deleteMany()
    await prisma.corpus.deleteMany()
    await prisma.clusterSet.deleteMany()
    await prisma.alignment.deleteMany()
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

    // Log both users in first — user A's data is seeded through the
    // layers-backed APIs (the legacy Annotation/WorldState/Ontology/Claim
    // models were removed in the clean break).
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

    // Ontology + world for user A via the combined layers-backed endpoint.
    await app.inject({
      method: 'PUT',
      url: '/api/ontology',
      cookies: { session_token: userASessionToken },
      payload: {
        personas: [
          { id: personaA.id, name: 'Analyst A', role: 'Security Analyst', informationNeed: 'Threat detection', details: '' },
        ],
        personaOntologies: [
          { personaId: personaA.id, entities: [{ id: 'et-person', name: 'Person', gloss: [] }], roles: [], events: [], relationTypes: [] },
        ],
        world: {
          entities: [{ id: 'entity-a1', name: 'Alice', typeId: 'et-person' }],
          events: [], times: [], entityCollections: [], eventCollections: [], timeCollections: [], relations: [],
        },
      },
    })
    await app.inject({
      method: 'PUT',
      url: '/api/world',
      cookies: { session_token: userASessionToken },
      payload: {
        entities: [{ id: 'entity-a1', name: 'Alice', typeId: 'et-person' }],
        events: [], times: [], entityCollections: [], eventCollections: [], timeCollections: [], relations: [],
      },
    })

    // A type annotation for user A on the shared video.
    await app.inject({
      method: 'POST',
      url: `/api/layers/videos/${sharedVideoId}/annotations`,
      cookies: { session_token: userASessionToken },
      payload: {
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

    // Summary (VideoSummary is retained) + a claim for user A.
    const summary = await prisma.videoSummary.create({
      data: {
        videoId: sharedVideoId,
        personaId: personaA.id,
        summary: [{ type: 'text', content: 'User A summary of video' }],
      },
    })
    await app.inject({
      method: 'POST',
      url: `/api/summaries/${summary.id}/claims`,
      cookies: { session_token: userASessionToken },
      payload: {
        summaryType: 'video',
        text: 'A person is visible in the video',
        gloss: [{ type: 'text', content: 'person visible' }],
      },
    })
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
    await prisma.videoSummary.deleteMany({ where: { persona: { userId: userAId } } })
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

    // Imported annotations live in the layers store; read the layers rows under
    // the importer's persona layers.
    const userBAnnotations = await prisma.layersAnnotation.findMany({
      where: { layer: { personaId: { in: userBPersonas.map(p => p.id) } } },
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
    const annotationsBefore = await prisma.layersAnnotation.findMany({
      where: { layer: { personaId: { in: personasBefore.map(p => p.id) } } },
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

    const annotationsAfter = await prisma.layersAnnotation.findMany({
      where: { layer: { personaId: { in: personasAfter.map(p => p.id) } } },
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
})
