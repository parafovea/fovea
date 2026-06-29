import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createAdminTestUser, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * The admin user-update endpoint writes `isAdmin`, but CASL `manage all` keys on
 * `systemRole`. They must stay in sync, otherwise an "admin" passes requireAdmin
 * yet has no CASL super-powers (or a demotion leaves stale super-powers).
 */
describe('Admin user update keeps systemRole in sync with isAdmin', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let adminSession: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const admin = await createAdminTestUser(prisma, { username: 'superadmin', email: 'super@example.com' })
    adminSession = admin.sessionToken
  })

  const updateUser = (userId: string, body: object) =>
    app.inject({
      method: 'PUT',
      url: `/api/admin/users/${userId}`,
      cookies: { session_token: adminSession },
      payload: body,
    })

  it('promoting to isAdmin sets systemRole to system_admin', async () => {
    const target = await createRegularTestUser(prisma, { username: 'promotee', email: 'promo@example.com' })
    expect((await updateUser(target.id, { isAdmin: true })).statusCode).toBe(200)
    const row = await prisma.user.findUnique({ where: { id: target.id } })
    expect(row?.isAdmin).toBe(true)
    expect(row?.systemRole).toBe('system_admin')
  })

  it('demoting from isAdmin resets systemRole to user', async () => {
    const target = await createRegularTestUser(prisma, { username: 'demotee', email: 'demo@example.com' })
    await prisma.user.update({ where: { id: target.id }, data: { isAdmin: true, systemRole: 'system_admin' } })
    expect((await updateUser(target.id, { isAdmin: false })).statusCode).toBe(200)
    const row = await prisma.user.findUnique({ where: { id: target.id } })
    expect(row?.isAdmin).toBe(false)
    expect(row?.systemRole).toBe('user')
  })
})
