import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'

/**
 * Reproduces the project-scope collaboration defect: a VideoSummary (and the
 * claims under it) must be born stamped with the persona's project, otherwise
 * project collaborators — who read project content through the project-scoped
 * CASL rule, not ownership — cannot see the summary and are 403'd when adding
 * claims under it.
 *
 * The members here are NON-admin project members granted ONLY project-scoped
 * permissions (mirroring production), so the broad system-scope grants used by
 * other route tests do not mask the bug. Against the unfixed code the
 * collaborator assertions fail (the summary is born projectId = NULL).
 */
describe('Summary/Claim project scope for collaborators', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  const PROJECT_ID = 'fixed-project-id'

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  // creator (owns the persona) and collaborator (a second project member)
  let creator: { id: string; token: string }
  let collaborator: { id: string; token: string }
  let personaId: string
  let videoId: string
  let video2Id: string

  async function makeMember(username: string, role: string): Promise<{ id: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash: await hashPassword(`pw-${username}`),
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
    await prisma.projectMembership.create({
      data: { userId: user.id, projectId: PROJECT_ID, role },
    })
    return { id: user.id, token: session.token }
  }

  beforeEach(async () => {
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

    // Project-scope-only permissions for the annotator role. Deliberately NOT
    // the broad system-scope grants used elsewhere, so reads resolve through
    // the project condition and the NULL-projectId defect is observable.
    await prisma.rolePermission.createMany({
      data: ['persona', 'summary', 'claim'].flatMap((resourceType) =>
        ['read', 'create'].map((action) => ({
          scope: 'project' as const,
          role: 'annotator',
          resourceType,
          action,
          ownOnly: false,
        })),
      ),
    })

    await prisma.project.create({
      data: { id: PROJECT_ID, name: 'Scope Project', slug: 'scope-project', createdBy: 'seed', ownerUserId: null },
    })

    creator = await makeMember('creator', 'annotator')
    collaborator = await makeMember('collaborator', 'annotator')

    // A project persona owned by the creator.
    const persona = await prisma.persona.create({
      data: {
        userId: creator.id,
        projectId: PROJECT_ID,
        name: 'Project persona',
        role: 'Analyst',
        informationNeed: 'Project-scoped authoring',
      },
    })
    personaId = persona.id

    videoId = (await prisma.video.create({ data: { filename: 'a.mp4', path: '/v/a.mp4', duration: 60 } })).id
    video2Id = (await prisma.video.create({ data: { filename: 'b.mp4', path: '/v/b.mp4', duration: 60 } })).id
  })

  it('stamps the persona project on POST /api/summaries so a collaborator can read it and add a claim', async () => {
    // Creator authors the summary.
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/summaries',
      cookies: { session_token: creator.token },
      payload: {
        videoId,
        personaId,
        summary: [{ type: 'text', content: 'A red car drives through the intersection.' }],
      },
    })
    expect(createRes.statusCode).toBe(201)
    const summaryId = createRes.json().id

    // The row is born in the persona's project, not NULL.
    const persisted = await prisma.videoSummary.findUnique({ where: { id: summaryId } })
    expect(persisted?.projectId).toBe(PROJECT_ID)

    // The collaborator (not the creator) can now see it through project scope.
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/summaries`,
      cookies: { session_token: collaborator.token },
    })
    expect(listRes.statusCode).toBe(200)
    expect(listRes.json().map((s: { id: string }) => s.id)).toContain(summaryId)

    // And the collaborator can add a claim under it (the reported 403 is gone).
    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/summaries/${summaryId}/claims`,
      cookies: { session_token: collaborator.token },
      payload: { summaryType: 'video', text: 'The car is red.', audio: ['speech'] },
    })
    expect(claimRes.statusCode).toBe(201)

    const claim = await prisma.claim.findFirst({ where: { summaryId } })
    expect(claim?.projectId).toBe(PROJECT_ID)
  })

  it('auto-creates a project-scoped, owned summary when a collaborator adds the first claim', async () => {
    // No summary exists for (video2, persona); the claim create must mint one
    // stamped with the persona project and owned by the claim author.
    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/videos/${video2Id}/personas/${personaId}/claims`,
      cookies: { session_token: collaborator.token },
      payload: { text: 'An auto-created summary should be project scoped.' },
    })
    expect(claimRes.statusCode).toBe(201)

    const summary = await prisma.videoSummary.findUnique({
      where: { videoId_personaId: { videoId: video2Id, personaId } },
    })
    expect(summary?.projectId).toBe(PROJECT_ID)
    expect(summary?.createdBy).toBe(collaborator.id)
  })
})
