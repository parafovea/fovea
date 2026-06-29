import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createAdminTestUser, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * Deleting a group must clear its former members' cached abilities. Group-scope
 * non-ownOnly rules are emitted globally unconditioned, so without invalidation
 * a former member keeps the group's permissions until restart/re-login. We
 * detect that through GET /api/auth/abilities (which warms and reads the cache).
 *
 * Against the unfixed code the post-delete read still shows the group-granted
 * rule (stale cache).
 */
describe('Group deletion invalidates former members abilities', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let adminSession: string
  let memberSession: string
  let groupId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.groupMembership.deleteMany()
    await prisma.userGroup.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    // A group-scope, non-ownOnly permission emits a globally-unconditioned rule,
    // distinguishable from the own-only baseline video-delete rule.
    await prisma.rolePermission.create({
      data: { scope: 'group', role: 'group_admin', resourceType: 'video', action: 'delete', ownOnly: false },
    })
    const admin = await createAdminTestUser(prisma, { username: 'groupadmin', email: 'ga@example.com' })
    adminSession = admin.sessionToken
    const member = await createRegularTestUser(prisma, { username: 'groupmember', email: 'gm@example.com' })
    memberSession = member.sessionToken
    const group = await prisma.userGroup.create({ data: { name: 'G', slug: 'g', createdBy: admin.id } })
    groupId = group.id
    await prisma.groupMembership.create({ data: { userId: member.id, groupId, role: 'group_admin' } })
  })

  const memberRules = async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/abilities',
      cookies: { session_token: memberSession },
    })
    expect(res.statusCode).toBe(200)
    return res.json().rules as Array<{ action?: string; subject?: string; conditions?: unknown }>
  }

  // The group-granted rule is an unconditioned delete on Video (the own-only
  // baseline rule carries a createdByUserId condition).
  const hasGroupGrantedVideoDelete = (rules: Awaited<ReturnType<typeof memberRules>>) =>
    rules.some((r) => r.action === 'delete' && r.subject === 'Video' && r.conditions == null)

  it('a former member loses the group-granted ability immediately after group delete', async () => {
    // Warm the cache: the member has the group-granted global video-delete rule.
    expect(hasGroupGrantedVideoDelete(await memberRules())).toBe(true)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/groups/${groupId}`,
      cookies: { session_token: adminSession },
    })
    expect(del.statusCode).toBe(200)

    // The member's abilities are rebuilt without the group rule.
    expect(hasGroupGrantedVideoDelete(await memberRules())).toBe(false)
  })
})
