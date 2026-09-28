import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * A personaless object annotation has no persona to inherit project scope from.
 * It should fall back to the video's project (scoped to the caller's
 * membership), so project reviewers can see it; without that it is born
 * projectId = NULL and is invisible to project-scoped reads.
 */
describe('Personaless annotation project scope', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let session: string
  let userId: string
  let videoId: string
  let projectId: string

  const frames = {
    boxes: [{ x: 10, y: 20, width: 100, height: 80, frameNumber: 0, isKeyframe: true }],
    interpolationSegments: [],
    visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
    totalFrames: 1,
    keyframeCount: 1,
    interpolatedFrameCount: 0,
  }

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'annotator', email: 'ann@example.com' })
    session = user.sessionToken
    userId = user.id
    projectId = (await prisma.project.create({
      data: { name: 'Ann Project', slug: 'ann-project', createdBy: userId, ownerUserId: userId },
    })).id
    videoId = (await prisma.video.create({ data: { filename: 'a.mp4', path: '/v/a.mp4', duration: 60 } })).id
  })

  const postObjectAnnotation = () =>
    app.inject({
      method: 'POST',
      url: `/api/layers/videos/${videoId}/annotations`,
      cookies: { session_token: session },
      payload: { type: 'object', label: 'box', frames },
    })

  /** Reads the caller's object annotation for the video from the layers store. */
  const findObjectAnnotation = () =>
    prisma.layersAnnotation.findFirst({
      where: { createdByUserId: userId, layer: { expression: { videoId } } },
    })

  it('inherits the project when the caller is a member of the one project the video is assigned to', async () => {
    await prisma.projectVideoAssignment.create({ data: { projectId, videoId, assignedBy: userId } })
    await prisma.projectMembership.create({ data: { userId, projectId, role: 'annotator' } })

    expect((await postObjectAnnotation()).statusCode).toBe(201)
    const ann = await findObjectAnnotation()
    expect(ann?.projectId).toBe(projectId)
  })

  it('stays null when the video is assigned to a project the caller is not a member of', async () => {
    await prisma.projectVideoAssignment.create({ data: { projectId, videoId, assignedBy: userId } })
    // No membership for the caller in that project.

    expect((await postObjectAnnotation()).statusCode).toBe(201)
    const ann = await findObjectAnnotation()
    expect(ann?.projectId).toBeNull()
  })
})
