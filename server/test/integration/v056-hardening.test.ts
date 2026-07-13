import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createAdminTestUser, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * 0.5.6 correctness/security hardening: duplicate-create conflict handling and
 * idempotency, session revocation on password change, the last-project-owner
 * invariant, and the relation/share uniqueness constraints added this release.
 */
describe('0.5.6 backend hardening', () => {
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
    await prisma.loginAttempt.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.resourceShare.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
  })

  // BUG-16: duplicate email/username on admin create returns 409, not 500.
  it('admin user create returns 409 (not 500) on a duplicate email', async () => {
    const admin = await createAdminTestUser(prisma, { username: 'admin16', email: 'a16@example.com' })
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/api/admin/users',
        cookies: { session_token: admin.sessionToken },
        payload: { username: 'dupe', email: 'dupe@example.com', password: 'password123', displayName: 'Dupe', isAdmin: false },
      })
    expect((await create()).statusCode).toBe(201)
    const second = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: { session_token: admin.sessionToken },
      payload: { username: 'dupe2', email: 'dupe@example.com', password: 'password123', displayName: 'Dupe2', isAdmin: false },
    })
    expect(second.statusCode).toBe(409)
  })

  // BUG-02: changing the password revokes the caller's existing sessions.
  it('a password change invalidates the old session token', async () => {
    const user = await createRegularTestUser(prisma, { username: 'pw02', email: 'pw02@example.com' })
    const oldToken = user.sessionToken

    // The old token works before the change.
    expect((await app.inject({ method: 'GET', url: '/api/auth/abilities', cookies: { session_token: oldToken } })).statusCode).toBe(200)

    const change = await app.inject({
      method: 'PUT',
      url: '/api/user/profile',
      cookies: { session_token: oldToken },
      payload: { password: 'brand-new-password' },
    })
    expect(change.statusCode).toBe(200)

    // The old token is revoked; a fresh session cookie was issued in the response.
    const after = await app.inject({ method: 'GET', url: '/api/auth/abilities', cookies: { session_token: oldToken } })
    expect(after.statusCode).toBe(401)
  })

  // BUG-12: re-sharing the same resource to the same target is idempotent.
  it('sharing the same persona to the same user twice creates one share', async () => {
    const owner = await createRegularTestUser(prisma, { username: 'owner12', email: 'o12@example.com' })
    const target = await createRegularTestUser(prisma, { username: 'target12', email: 't12@example.com' })
    const persona = await prisma.persona.create({
      data: { userId: owner.id, name: 'P', role: 'Analyst', informationNeed: 'n' },
    })

    const share = () =>
      app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: owner.sessionToken },
        payload: { resourceType: 'persona', resourceId: persona.id, sharedWithUserId: target.id, permissionLevel: 'read_only' },
      })

    expect((await share()).statusCode).toBe(201)
    expect((await share()).statusCode).toBe(201)

    const rows = await prisma.resourceShare.findMany({ where: { resourceId: persona.id } })
    expect(rows).toHaveLength(1)
  })

  // BUG-26: the last project_owner cannot be demoted, leaving the project ownerless.
  it('refuses to demote the last project owner', async () => {
    const owner = await createRegularTestUser(prisma, { username: 'owner26', email: 'o26@example.com' })
    const manager = await createRegularTestUser(prisma, { username: 'mgr26', email: 'm26@example.com' })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: { session_token: owner.sessionToken },
      payload: { name: 'Proj 26', slug: 'proj-26' },
    })
    expect(created.statusCode).toBe(201)
    const projectId = created.json().id

    // Add the manager so they have manage_members.
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      cookies: { session_token: owner.sessionToken },
      payload: { userId: manager.id, role: 'project_manager' },
    })

    // The manager tries to demote the sole owner -> blocked.
    const demote = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/members/${owner.id}`,
      cookies: { session_token: manager.sessionToken },
      payload: { role: 'viewer' },
    })
    expect(demote.statusCode).toBe(400)
    const stillOwner = await prisma.projectMembership.findFirst({ where: { projectId, userId: owner.id } })
    expect(stillOwner?.role).toBe('project_owner')
  })
})
