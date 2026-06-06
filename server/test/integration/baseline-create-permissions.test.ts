/**
 * Integration test for the v0.4.1 production-demo 403-storm RBAC fix.
 *
 * Reproduces the live failure mode that hit demo.fovea.video before the
 * baseline-create rules landed in `server/src/lib/abilities.ts`: a fresh
 * signed-in user with no `project_memberships` row and no system-scope
 * RolePermission row granting `create` on the resource types was 403'd by
 * every authoring route the autosave loop fired. Drives the real Fastify
 * app through `app.inject` against the live Postgres, asserts each route
 * returns 201, then asserts the persisted row carries the caller as
 * `createdBy` / `createdByUserId`.
 *
 * Before the v0.4.1 baseline rules:
 *   - POST /api/summaries                           -> 403 'Cannot create this VideoSummary'
 *   - POST /api/annotations                         -> 403 'Cannot create Annotation in this scope'
 *   - POST /api/summaries/:summaryId/claims         -> 403 'Cannot create this Claim'
 *   - POST /api/personas (already granted via system rolePermission)
 *
 * After the v0.4.1 baseline rules: 201 across the board for the caller's
 * own resources, with no project_memberships row required.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'

describe('Baseline create permissions for owned resources', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Tear down every authoring surface so each test starts from a clean
    // slate. Order matters: claims -> annotations -> summaries -> ontology
    // -> world state -> persona -> video -> session -> rolePermission ->
    // user; FK cascade handles the rest.
    await prisma.loginAttempt.deleteMany()
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
  })

  /**
   * Seed the smallest possible signed-in user with NO project memberships
   * and NO system-scope role_permission rows granting `create`. This is
   * exactly the production-demo state that triggered the 403 storm.
   */
  async function seedMinimalUser(username = 'tester'): Promise<{
    userId: string
    sessionToken: string
    personaId: string
    videoId: string
  }> {
    const passwordHash = await hashPassword('testpass-' + username)
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash,
        displayName: username,
        isAdmin: false,
        systemRole: 'user',
      },
    })

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: `test-session-${user.id}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    const persona = await prisma.persona.create({
      data: {
        userId: user.id,
        name: `${username} persona`,
        role: 'Analyst',
        informationNeed: 'Testing baseline create grants',
      },
    })

    const video = await prisma.video.create({
      data: {
        filename: `${username}.mp4`,
        path: `/v/${username}.mp4`,
        duration: 60,
      },
    })

    return {
      userId: user.id,
      sessionToken: session.token,
      personaId: persona.id,
      videoId: video.id,
    }
  }

  it('POST /api/summaries returns 201 for a fresh user with no project_memberships', async () => {
    const u = await seedMinimalUser('summary-owner')

    const res = await app.inject({
      method: 'POST',
      url: '/api/summaries',
      cookies: { session_token: u.sessionToken },
      payload: {
        videoId: u.videoId,
        personaId: u.personaId,
        summary: [{ type: 'text', content: 'first cut' }],
      },
    })

    expect(res.statusCode, `body=${res.body.slice(0, 300)}`).toBe(201)
    const body = res.json() as { id: string; createdBy: string }
    expect(body.createdBy).toBe(u.userId)

    const row = await prisma.videoSummary.findUnique({ where: { id: body.id } })
    expect(row).not.toBeNull()
    expect(row!.createdBy).toBe(u.userId)
  })

  it('POST /api/annotations returns 201 for a fresh user with no project_memberships', async () => {
    const u = await seedMinimalUser('annotation-owner')

    const res = await app.inject({
      method: 'POST',
      url: '/api/annotations',
      cookies: { session_token: u.sessionToken },
      payload: {
        videoId: u.videoId,
        personaId: u.personaId,
        type: 'object',
        label: 'cargo container',
        frames: {
          boxes: [
            { x: 10, y: 20, width: 100, height: 80, frameNumber: 0, isKeyframe: true },
          ],
          interpolationSegments: [],
          visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
          totalFrames: 1,
          keyframeCount: 1,
          interpolatedFrameCount: 0,
        },
      },
    })

    expect(res.statusCode, `body=${res.body.slice(0, 300)}`).toBe(201)
    const body = res.json() as { id: string }
    const row = await prisma.annotation.findUnique({ where: { id: body.id } })
    expect(row).not.toBeNull()
    expect(row!.createdByUserId).toBe(u.userId)
  })

  it('POST /api/summaries/:summaryId/claims returns 201 for a fresh user with no project_memberships', async () => {
    const u = await seedMinimalUser('claim-owner')

    // Create the parent summary first (this exercises the same baseline
    // create rule that the v0.4.1 fix added) so we can hang a claim off it.
    const summaryRes = await app.inject({
      method: 'POST',
      url: '/api/summaries',
      cookies: { session_token: u.sessionToken },
      payload: {
        videoId: u.videoId,
        personaId: u.personaId,
        summary: [{ type: 'text', content: 'parent summary' }],
      },
    })
    expect(summaryRes.statusCode, `body=${summaryRes.body.slice(0, 300)}`).toBe(201)
    const summary = summaryRes.json() as { id: string }

    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/summaries/${summary.id}/claims`,
      cookies: { session_token: u.sessionToken },
      payload: {
        summaryType: 'video',
        text: 'a container fell from the ship',
        gloss: [{ type: 'text', content: 'a container fell from the ship' }],
      },
    })

    expect(claimRes.statusCode, `body=${claimRes.body.slice(0, 300)}`).toBe(201)
    const body = claimRes.json() as { claims: Array<{ id: string }> }
    expect(body.claims).toHaveLength(1)
    const row = await prisma.claim.findUnique({ where: { id: body.claims[0].id } })
    expect(row).not.toBeNull()
    expect(row!.createdBy).toBe(u.userId)
    expect(row!.summaryId).toBe(summary.id)
  })

  it('cross-user creates are still denied: A cannot create a summary as B', async () => {
    // Concrete check of the cross-user denial path through the HTTP route.
    // The server-side route always sets `createdBy: request.user.id`, so
    // even if a forged payload came through the CASL gate would still
    // produce a row owned by A. The negative-side check is therefore
    // simpler: B authoring under A's persona must 403 (persona ownership
    // gate at the summary route lives separately from CASL, but they
    // both must hold).
    const A = await seedMinimalUser('owner-a')
    const B = await seedMinimalUser('owner-b')

    const res = await app.inject({
      method: 'POST',
      url: '/api/summaries',
      cookies: { session_token: B.sessionToken },
      payload: {
        videoId: A.videoId,
        // A's persona — B is not the owner.
        personaId: A.personaId,
        summary: [{ type: 'text', content: 'forged from B against A persona' }],
      },
    })

    // Persona ownership precheck either short-circuits or CASL denies on the
    // candidate's resolved projectId; either way the row must not land.
    expect([403, 404]).toContain(res.statusCode)
    const summaries = await prisma.videoSummary.findMany({
      where: { videoId: A.videoId, personaId: A.personaId },
    })
    expect(summaries).toHaveLength(0)
  })

  it('the full autosave loop survives: POST /api/summaries followed by GET /api/videos/:videoId/summaries/:summaryId is consistent', async () => {
    // Mirrors what the VideoSummaryEditor autosave loop drives: open dialog,
    // post first cut, read it back to render the persisted state. Before the
    // v0.4.1 fix the POST 403'd and the dialog rendered the error text
    // 'Cannot create this VideoSummary' in place of the summary body; the
    // follow-on GET would then 404 because no row was ever materialized.
    const u = await seedMinimalUser('autosave-flow')

    const post = await app.inject({
      method: 'POST',
      url: '/api/summaries',
      cookies: { session_token: u.sessionToken },
      payload: {
        videoId: u.videoId,
        personaId: u.personaId,
        summary: [{ type: 'text', content: 'autosaved' }],
      },
    })
    expect(post.statusCode).toBe(201)
    const posted = post.json() as { id: string }

    // GET route URL pattern is /api/videos/:videoId/summaries/:personaId
    // (the trailing segment resolves the summary via the
    // (videoId, personaId) unique index, NOT by summary id). The same
    // path that the frontend hits on dialog open: see how the live
    // demo console logged /api/videos/<videoId>/summaries/<personaId>
    // and 404'd before the v0.4.1 fix because the autosave POST was
    // 403'd and never materialised the row.
    const get = await app.inject({
      method: 'GET',
      url: `/api/videos/${u.videoId}/summaries/${u.personaId}`,
      cookies: { session_token: u.sessionToken },
    })
    expect(get.statusCode).toBe(200)
    const fetched = get.json() as { id: string; createdBy: string }
    expect(fetched.id).toBe(posted.id)
    expect(fetched.createdBy).toBe(u.userId)
  })
})
