import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Groups API.
 * Tests all group CRUD operations, membership management, and admin routes.
 */
describe('Groups API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string
  let adminUserId: string
  let adminSessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.resourceShare.deleteMany()
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.videoAssignmentRule.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.groupMembership.deleteMany()
    await prisma.userGroup.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.video.deleteMany()
    await prisma.loginAttempt.deleteMany()
    await prisma.user.deleteMany()

    // Create regular test user
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false,
        systemRole: 'system_admin',
        systemRole: 'user',
      },
    })
    testUserId = user.id

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' },
    })
    testSessionToken = loginResponse.cookies.find(c => c.name === 'session_token')!.value

    // Create admin user
    const adminHash = await hashPassword('adminpass123')
    const admin = await prisma.user.create({
      data: {
        username: 'adminuser',
        email: 'admin@example.com',
        passwordHash: adminHash,
        displayName: 'Admin User',
        isAdmin: true,
        systemRole: 'system_admin',
        systemRole: 'system_admin',
      },
    })
    adminUserId = admin.id

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'adminuser', password: 'adminpass123' },
    })
    adminSessionToken = adminLogin.cookies.find(c => c.name === 'session_token')!.value
  })

  // =========================================================================
  // POST /api/groups
  // =========================================================================

  describe('POST /api/groups', () => {
    it('creates a new group and makes the user the owner', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: {
          name: 'Research Lab',
          description: 'A research group',
          slug: 'research-lab',
        },
      })

      expect(response.statusCode).toBe(201)
      const group = response.json()
      expect(group.name).toBe('Research Lab')
      expect(group.description).toBe('A research group')
      expect(group.slug).toBe('research-lab')
      expect(group.createdBy).toBe(testUserId)
      expect(group.members).toHaveLength(1)
      expect(group.members[0].role).toBe('group_owner')
      expect(group.members[0].userId).toBe(testUserId)
    })

    it('returns 409 for duplicate slug', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Group One', slug: 'my-group' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Group Two', slug: 'my-group' },
      })

      expect(response.statusCode).toBe(409)
    })

    it('returns 400 for invalid slug format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Bad Slug', slug: 'INVALID SLUG!' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'No Auth', slug: 'no-auth' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // =========================================================================
  // GET /api/groups
  // =========================================================================

  describe('GET /api/groups', () => {
    it('returns empty array when user belongs to no groups', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns groups with member count and user role', async () => {
      // Create a group (user becomes owner)
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Test Group', slug: 'test-group' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const groups = response.json()
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('Test Group')
      expect(groups[0].memberCount).toBe(1)
      expect(groups[0].userRole).toBe('group_owner')
    })
  })

  // =========================================================================
  // GET /api/groups/:groupId
  // =========================================================================

  describe('GET /api/groups/:groupId', () => {
    it('returns group details with members for a group member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Detail Group', slug: 'detail-group' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const group = response.json()
      expect(group.id).toBe(groupId)
      expect(group.name).toBe('Detail Group')
      expect(group.members).toHaveLength(1)
    })

    it('returns 403 for non-member', async () => {
      // Create group with admin user
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Private Group', slug: 'private-group' },
      })
      const groupId = createRes.json().id

      // Try to access with regular user (not a member)
      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 400 for invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups/not-a-uuid',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // =========================================================================
  // PUT /api/groups/:groupId
  // =========================================================================

  describe('PUT /api/groups/:groupId', () => {
    it('updates group name and description', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Original', slug: 'original' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
        payload: { name: 'Updated', description: 'New description' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Updated')
      expect(response.json().description).toBe('New description')
    })

    it('returns 403 for group_member (not admin or owner)', async () => {
      // Create group with admin
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Admin Group', slug: 'admin-group' },
      })
      const groupId = createRes.json().id

      // Add testUser as group_member
      await prisma.groupMembership.create({
        data: { userId: testUserId, groupId, role: 'group_member' },
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
        payload: { name: 'Should Fail' },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // DELETE /api/groups/:groupId
  // =========================================================================

  describe('DELETE /api/groups/:groupId', () => {
    it('allows group owner to delete group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'To Delete', slug: 'to-delete' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)

      // Verify group is deleted
      const group = await prisma.userGroup.findUnique({ where: { id: groupId } })
      expect(group).toBeNull()
    })

    it('returns 403 for non-owner member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Owned by Admin', slug: 'owned-by-admin' },
      })
      const groupId = createRes.json().id

      // Add testUser as group_admin (not owner)
      await prisma.groupMembership.create({
        data: { userId: testUserId, groupId, role: 'group_admin' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent group', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${fakeId}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })

    it('allows system admin to delete any group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'User Group', slug: 'user-group' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // POST /api/groups/:groupId/members
  // =========================================================================

  describe('POST /api/groups/:groupId/members', () => {
    it('adds a member to the group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Team Group', slug: 'team-group' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_member' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().userId).toBe(adminUserId)
      expect(response.json().role).toBe('group_member')
    })

    it('returns 409 for duplicate membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Dup Group', slug: 'dup-group' },
      })
      const groupId = createRes.json().id

      // First add
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_member' },
      })

      // Duplicate add
      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_admin' },
      })

      expect(response.statusCode).toBe(409)
    })

    it('returns 404 for non-existent user', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Nope Group', slug: 'nope-group' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: {
          userId: '00000000-0000-0000-0000-000000000000',
          role: 'group_member',
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 403 for non-admin group member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Restricted', slug: 'restricted' },
      })
      const groupId = createRes.json().id

      // Add testUser as group_member
      await prisma.groupMembership.create({
        data: { userId: testUserId, groupId, role: 'group_member' },
      })

      // Create a third user to try to add
      const thirdUser = await prisma.user.create({
        data: {
          username: 'thirduser',
          email: 'third@example.com',
          passwordHash: await hashPassword('pass123'),
          displayName: 'Third User',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: thirdUser.id, role: 'group_member' },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // GET /api/groups/:groupId/members
  // =========================================================================

  describe('GET /api/groups/:groupId/members', () => {
    it('returns all members of a group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Members Group', slug: 'members-group' },
      })
      const groupId = createRes.json().id

      // Add another member
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_admin' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const members = response.json()
      expect(members).toHaveLength(2)
    })

    it('returns 403 for non-member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Secret Group', slug: 'secret-group' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // PUT /api/groups/:groupId/members/:userId
  // =========================================================================

  describe('PUT /api/groups/:groupId/members/:userId', () => {
    it('changes a member role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Role Group', slug: 'role-group' },
      })
      const groupId = createRes.json().id

      // Add member
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_member' },
      })

      // Update role
      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}/members/${adminUserId}`,
        cookies: { session_token: testSessionToken },
        payload: { role: 'group_admin' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().role).toBe('group_admin')
    })

    it('returns 403 when trying to change group_owner role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Owner Group', slug: 'owner-group' },
      })
      const groupId = createRes.json().id

      // Add admin as group_admin
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_admin' },
      })

      // Admin tries to change the owner's role
      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}/members/${testUserId}`,
        cookies: { session_token: adminSessionToken },
        payload: { role: 'group_member' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Missing Member', slug: 'missing-member' },
      })
      const groupId = createRes.json().id

      const fakeUserId = '00000000-0000-0000-0000-000000000000'
      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}/members/${fakeUserId}`,
        cookies: { session_token: testSessionToken },
        payload: { role: 'group_admin' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // DELETE /api/groups/:groupId/members/:userId
  // =========================================================================

  describe('DELETE /api/groups/:groupId/members/:userId', () => {
    it('removes a member from the group', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Remove Group', slug: 'remove-group' },
      })
      const groupId = createRes.json().id

      // Add admin as member
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: adminUserId, role: 'group_member' },
      })

      // Remove admin
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${adminUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })

    it('allows self-removal', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Self Leave', slug: 'self-leave' },
      })
      const groupId = createRes.json().id

      // Add admin as another owner so we can leave
      await prisma.groupMembership.create({
        data: { userId: adminUserId, groupId, role: 'group_owner' },
      })

      // testUser self-removes
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${testUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 400 when trying to remove last owner', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Last Owner', slug: 'last-owner' },
      })
      const groupId = createRes.json().id

      // Try to self-remove as the only owner
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${testUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for non-existent membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'No Member', slug: 'no-member' },
      })
      const groupId = createRes.json().id

      const fakeUserId = '00000000-0000-0000-0000-000000000000'
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${fakeUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // Admin routes
  // =========================================================================

  describe('GET /api/admin/groups', () => {
    it('returns all groups for admin', async () => {
      // Create groups with different users
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'User Group', slug: 'user-group' },
      })
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Admin Group', slug: 'admin-group' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
    })

    it('returns 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/groups',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('POST /api/admin/groups', () => {
    it('creates a group for any user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: {
          name: 'Admin Created',
          slug: 'admin-created',
          createdBy: testUserId,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().createdBy).toBe(testUserId)
      // The specified user should be the group_owner
      expect(response.json().members[0].userId).toBe(testUserId)
      expect(response.json().members[0].role).toBe('group_owner')
    })

    it('returns 404 for non-existent createdBy user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: {
          name: 'Bad User',
          slug: 'bad-user',
          createdBy: '00000000-0000-0000-0000-000000000000',
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 409 for duplicate slug', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'First', slug: 'taken-slug', createdBy: testUserId },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Second', slug: 'taken-slug', createdBy: testUserId },
      })

      expect(response.statusCode).toBe(409)
    })
  })

  describe('PUT /api/admin/groups/:groupId', () => {
    it('updates any group as admin', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'To Update', slug: 'to-update' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/groups/${groupId}`,
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Admin Updated' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Admin Updated')
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/groups/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Nope' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/admin/groups/:groupId', () => {
    it('deletes any group as admin', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Admin Delete', slug: 'admin-delete' },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/groups/${groupId}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/groups/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/groups/:groupId/members', () => {
    it('adds any user to any group with any role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: {
          name: 'Admin Member Group',
          slug: 'admin-member-group',
          createdBy: adminUserId,
        },
      })
      const groupId = createRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/groups/${groupId}/members`,
        cookies: { session_token: adminSessionToken },
        payload: { userId: testUserId, role: 'group_owner' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().role).toBe('group_owner')
    })

    it('returns 409 for duplicate membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/groups',
        cookies: { session_token: adminSessionToken },
        payload: {
          name: 'Dup Admin Group',
          slug: 'dup-admin-group',
          createdBy: adminUserId,
        },
      })
      const groupId = createRes.json().id

      // testUser already not in this group, add them
      await app.inject({
        method: 'POST',
        url: `/api/admin/groups/${groupId}/members`,
        cookies: { session_token: adminSessionToken },
        payload: { userId: testUserId, role: 'group_member' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/groups/${groupId}/members`,
        cookies: { session_token: adminSessionToken },
        payload: { userId: testUserId, role: 'group_admin' },
      })

      expect(response.statusCode).toBe(409)
    })
  })
})
