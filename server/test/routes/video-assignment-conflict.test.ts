import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createAdminTestUser } from '../helpers/rbac-test-setup.js'

/**
 * Re-assigning an already-assigned video hits the @@unique([projectId, videoId])
 * constraint. That must surface as a 409 Conflict, not an unhandled 500.
 */
describe('Duplicate video assignment', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let session: string
  let projectId: string
  let videoId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const admin = await createAdminTestUser(prisma, { username: 'assignadmin', email: 'assign@example.com' })
    session = admin.sessionToken
    projectId = (await prisma.project.create({
      data: { name: 'Assign Project', slug: 'assign-project', createdBy: admin.id, ownerUserId: admin.id },
    })).id
    videoId = (await prisma.video.create({ data: { filename: 'a.mp4', path: '/v/a.mp4', duration: 60 } })).id
  })

  it('returns 409 (not 500) when the video is already assigned', async () => {
    const assign = () =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/videos`,
        cookies: { session_token: session },
        payload: { videoId },
      })

    expect((await assign()).statusCode).toBe(201)
    const second = await assign()
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('CONFLICT')
  })
})
