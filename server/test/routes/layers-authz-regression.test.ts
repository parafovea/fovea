import { randomUUID } from 'node:crypto'

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { reseedOwnershipBaseline } from '../integration/_rbac-baseline.js'
import { expressionVideoId } from '../../src/services/layers-id-map.js'

/**
 * Route-level authorization regressions over the layers store. These pin three
 * cross-tenant leaks the audit surfaced, each against a real Postgres and the
 * production-like ownership baseline (every action `ownOnly`, so CASL resolves
 * to `{ <ownershipField>: userId }` per model):
 *
 *  - GET /api/layers/videos/:videoId/text-expressions must not materialize
 *    another user's private summary transcript, and must 404 (not leak
 *    existence) for a video the caller cannot access.
 *  - POST /api/layers/videos/:videoId/annotations must never overwrite a
 *    LayersAnnotation of a non-video subkind (e.g. a claim text span) that
 *    happens to share the supplied client id.
 *  - POST /api/layers/media (and, systemically, POST /api/layers/documents)
 *    must reject a projectId naming a project the caller is not a member of.
 */
describe('Layers authorization regressions', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  let userAId: string
  let userATokenValue: string
  let userBId: string
  let userBTokenValue: string

  const passwordA = 'passA-regression'
  const passwordB = 'passB-regression'

  async function createUser(username: string, password: string, isAdmin = false): Promise<string> {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { username, email: `${username}@example.com`, passwordHash, displayName: username, isAdmin },
    })
    return user.id
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } })
    return res.cookies.find((c) => c.name === 'session_token')!.value
  }

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await reseedOwnershipBaseline(prisma)
    // Reverse-FK cleanup so each test starts from a clean layers store.
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
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()

    const username = `regr-a-${randomUUID().slice(0, 8)}`
    const usernameB = `regr-b-${randomUUID().slice(0, 8)}`
    userAId = await createUser(username, passwordA)
    userBId = await createUser(usernameB, passwordB)
    userATokenValue = await login(username, passwordA)
    userBTokenValue = await login(usernameB, passwordB)
  })

  describe('GET /api/layers/videos/:videoId/text-expressions', () => {
    it('does not materialize another user\'s private summary transcript', async () => {
      // A globally-unassigned video (accessible to every authenticated user)
      // that also carries public metadata text, so the metadata-text expression
      // is produced and the endpoint answers 200.
      const video = await prisma.video.create({
        data: {
          filename: 'text-expr.mp4',
          path: '/v/text-expr.mp4',
          duration: 60,
          metadata: { description: 'Public metadata description', language: 'en' },
        },
      })

      // User B owns a persona + summary whose transcript is private to B.
      const personaB = await prisma.persona.create({
        data: { userId: userBId, name: 'B persona', role: 'Analyst', informationNeed: 'x' },
      })
      const privateTranscript = 'SECRET private transcript segment owned by user B'
      await prisma.videoSummary.create({
        data: {
          videoId: video.id,
          personaId: personaB.id,
          summary: [{ type: 'text', content: 'B summary' }],
          createdBy: userBId,
          transcriptJson: {
            segments: [{ start: 0, end: 5, text: privateTranscript }],
            language: 'en',
          },
        },
      })

      // User A materializes the video's text expressions. A cannot read B's
      // summary, so only the metadata-text expression comes back — never an
      // asr-transcript sourced from B's private transcript.
      const res = await app.inject({
        method: 'GET',
        url: `/api/layers/videos/${video.id}/text-expressions`,
        cookies: { session_token: userATokenValue },
      })
      expect(res.statusCode).toBe(200)
      const expressions = res.json() as Array<{ sourceKind: string; text: string }>
      expect(expressions.map((e) => e.sourceKind)).not.toContain('asr-transcript')
      for (const expr of expressions) {
        expect(expr.text).not.toContain(privateTranscript)
      }

      // Control: user B, the summary owner, does get the asr-transcript.
      const ownerRes = await app.inject({
        method: 'GET',
        url: `/api/layers/videos/${video.id}/text-expressions`,
        cookies: { session_token: userBTokenValue },
      })
      expect(ownerRes.statusCode).toBe(200)
      const ownerExpressions = ownerRes.json() as Array<{ sourceKind: string; text: string }>
      expect(ownerExpressions.map((e) => e.sourceKind)).toContain('asr-transcript')
    })

    it('returns 404 for a video the caller cannot access', async () => {
      // A video assigned to a project user A is not a member of: it is no longer
      // global, so A's accessible set excludes it and the endpoint must 404
      // rather than leak the video's existence or its text.
      const video = await prisma.video.create({
        data: {
          filename: 'private-video.mp4',
          path: '/v/private-video.mp4',
          duration: 30,
          metadata: { description: 'Should never be materialized for A' },
        },
      })
      const project = await prisma.project.create({
        data: { name: 'B project', slug: `b-project-${randomUUID().slice(0, 8)}`, createdBy: userBId, ownerUserId: userBId },
      })
      await prisma.projectMembership.create({
        data: { userId: userBId, projectId: project.id, role: 'project_owner' },
      })
      await prisma.projectVideoAssignment.create({
        data: { projectId: project.id, videoId: video.id, assignedBy: userBId },
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/layers/videos/${video.id}/text-expressions`,
        cookies: { session_token: userATokenValue },
      })
      expect(res.statusCode).toBe(404)

      // The member (B) still reaches it.
      const memberRes = await app.inject({
        method: 'GET',
        url: `/api/layers/videos/${video.id}/text-expressions`,
        cookies: { session_token: userBTokenValue },
      })
      expect(memberRes.statusCode).toBe(200)
    })
  })

  describe('POST /api/layers/videos/:videoId/annotations', () => {
    it('does not overwrite a non-video-subkind row that shares the supplied client id', async () => {
      const video = await prisma.video.create({
        data: { filename: 'ann-video.mp4', path: '/v/ann-video.mp4', duration: 10, frameRate: 30, resolution: '1920x1080' },
      })

      // Materialize the video Expression so a claim span can anchor over it,
      // exactly as a real claim text span does.
      await prisma.expression.create({
        data: {
          id: expressionVideoId(video.id),
          layersId: `video:${video.id}`,
          kind: 'video',
          sourceKind: 'video',
          videoId: video.id,
          createdByUserId: userAId,
        },
      })
      const claimLayer = await prisma.annotationLayer.create({
        data: {
          id: randomUUID(),
          expressionId: expressionVideoId(video.id),
          kind: 'span',
          subkind: 'claim',
          createdByUserId: userAId,
        },
      })
      const sharedId = randomUUID()
      const claimAnchor = { textAnchor: { tokenIndices: [3, 4] } }
      await prisma.layersAnnotation.create({
        data: {
          id: sharedId,
          layerId: claimLayer.id,
          anchor: claimAnchor,
          label: 'claim-span-label',
          text: 'a fragile claim span',
          createdByUserId: userAId,
        },
      })

      // POST a bounding-box video annotation reusing the claim span's id. The
      // idempotent-update path must treat the claim span as absent (wrong
      // subkind) and never rewrite it into a bounding-box annotation.
      const res = await app.inject({
        method: 'POST',
        url: `/api/layers/videos/${video.id}/annotations`,
        cookies: { session_token: userATokenValue },
        payload: {
          id: sharedId,
          videoId: video.id,
          personaId: null,
          type: 'object',
          label: 'hijack-box',
          linkType: null,
          frames: {
            boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          source: 'manual',
        },
      })
      // The POST must not report a successful idempotent update of the span.
      expect(res.statusCode).not.toBe(200)

      // The claim span is byte-for-byte intact: still under the claim layer,
      // still carrying its text-anchor and label — not a bounding-box overwrite.
      const stored = await prisma.layersAnnotation.findUnique({ where: { id: sharedId } })
      expect(stored).not.toBeNull()
      expect(stored!.layerId).toBe(claimLayer.id)
      expect(stored!.label).toBe('claim-span-label')
      expect(stored!.text).toBe('a fragile claim span')
      expect(stored!.anchor).toEqual(claimAnchor)
    })
  })

  describe('POST /api/layers/media project scoping', () => {
    it('rejects a projectId naming a project the caller is not a member of', async () => {
      // A project owned by B; user A is not a member.
      const project = await prisma.project.create({
        data: { name: 'B-only project', slug: `b-only-${randomUUID().slice(0, 8)}`, createdBy: userBId, ownerUserId: userBId },
      })
      await prisma.projectMembership.create({
        data: { userId: userBId, projectId: project.id, role: 'project_owner' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/layers/media',
        cookies: { session_token: userATokenValue },
        payload: { kind: 'document', title: 'injected', projectId: project.id },
      })
      expect(res.statusCode).toBe(403)

      // No row leaked into the foreign project's read scope.
      const injected = await prisma.media.count({ where: { projectId: project.id } })
      expect(injected).toBe(0)
    })

    it('rejects a foreign projectId on POST /api/layers/documents too', async () => {
      const project = await prisma.project.create({
        data: { name: 'B-only docs', slug: `b-docs-${randomUUID().slice(0, 8)}`, createdBy: userBId, ownerUserId: userBId },
      })
      await prisma.projectMembership.create({
        data: { userId: userBId, projectId: project.id, role: 'project_owner' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/layers/documents',
        cookies: { session_token: userATokenValue },
        payload: { text: 'injected document', projectId: project.id },
      })
      expect(res.statusCode).toBe(403)
      const injected = await prisma.expression.count({ where: { projectId: project.id } })
      expect(injected).toBe(0)
    })

    it('allows a personal (null-project) media create', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/layers/media',
        cookies: { session_token: userATokenValue },
        payload: { kind: 'document', title: 'personal media' },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json() as { projectId: string | null; createdByUserId: string }
      expect(body.projectId).toBeNull()
      expect(body.createdByUserId).toBe(userAId)
    })

    it('allows a media create scoped to a project the caller is a member of', async () => {
      const project = await prisma.project.create({
        data: { name: 'A project', slug: `a-project-${randomUUID().slice(0, 8)}`, createdBy: userAId, ownerUserId: userAId },
      })
      await prisma.projectMembership.create({
        data: { userId: userAId, projectId: project.id, role: 'project_owner' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/layers/media',
        cookies: { session_token: userATokenValue },
        payload: { kind: 'document', title: 'member media', projectId: project.id },
      })
      expect(res.statusCode).toBe(201)
      expect((res.json() as { projectId: string | null }).projectId).toBe(project.id)
    })
  })
})
