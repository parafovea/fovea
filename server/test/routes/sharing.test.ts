import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Sharing API.
 * Tests resource sharing, listing received and sent shares, revocation, and forking.
 */
describe('Sharing API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let ownerUserId: string
  let ownerSessionToken: string
  let recipientUserId: string
  let recipientSessionToken: string
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
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.groupMembership.deleteMany()
    await prisma.userGroup.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.video.deleteMany()
    await prisma.loginAttempt.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    // Create owner user
    const ownerHash = await hashPassword('ownerpass123')
    const owner = await prisma.user.create({
      data: {
        username: 'owner',
        email: 'owner@example.com',
        passwordHash: ownerHash,
        displayName: 'Owner User',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    ownerUserId = owner.id
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'owner', password: 'ownerpass123' },
    })
    ownerSessionToken = ownerLogin.cookies.find(c => c.name === 'session_token')!.value

    // Create recipient user
    const recipientHash = await hashPassword('recipientpass123')
    const recipient = await prisma.user.create({
      data: {
        username: 'recipient',
        email: 'recipient@example.com',
        passwordHash: recipientHash,
        displayName: 'Recipient User',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    recipientUserId = recipient.id
    const recipientLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'recipient', password: 'recipientpass123' },
    })
    recipientSessionToken = recipientLogin.cookies.find(c => c.name === 'session_token')!.value

    // Create admin user
    const adminHash = await hashPassword('adminpass123')
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: adminHash,
        displayName: 'Admin User',
        isAdmin: true,
      },
    })
    adminUserId = admin.id
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'adminpass123' },
    })
    adminSessionToken = adminLogin.cookies.find(c => c.name === 'session_token')!.value
  })

  // =========================================================================
  // POST /api/sharing
  // =========================================================================

  describe('POST /api/sharing', () => {
    it('shares a persona with another user', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Shared Persona',
          role: 'Analyst',
          informationNeed: 'Test need',
          userId: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: ownerSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      expect(response.statusCode).toBe(201)
      const share = response.json()
      expect(share.resourceType).toBe('persona')
      expect(share.sharedByUserId).toBe(ownerUserId)
      expect(share.sharedWithUserId).toBe(recipientUserId)
      expect(share.permissionLevel).toBe('read_only')
    })

    it('shares a resource with a group', async () => {
      // Create group with owner as member
      const group = await prisma.userGroup.create({
        data: {
          name: 'Share Group',
          slug: 'share-group',
          createdBy: ownerUserId,
        },
      })
      await prisma.groupMembership.create({
        data: { userId: ownerUserId, groupId: group.id, role: 'group_owner' },
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Group Shared',
          role: 'Researcher',
          informationNeed: 'Group test',
          userId: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: ownerSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedWithGroupId: group.id,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().sharedWithGroupId).toBe(group.id)
    })

    it('returns 400 when both userId and groupId specified', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Both Target',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: ownerSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedWithUserId: recipientUserId,
          sharedWithGroupId: '00000000-0000-0000-0000-000000000000',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when no target specified', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'No Target',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: ownerSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: persona.id,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for non-existent resource', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: ownerSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: '00000000-0000-0000-0000-000000000000',
          sharedWithUserId: recipientUserId,
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 403 when non-owner tries to share', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Not Mine',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        cookies: { session_token: recipientSessionToken },
        payload: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedWithUserId: adminUserId,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing',
        payload: {
          resourceType: 'persona',
          resourceId: '00000000-0000-0000-0000-000000000000',
          sharedWithUserId: recipientUserId,
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // =========================================================================
  // GET /api/sharing/received
  // =========================================================================

  describe('GET /api/sharing/received', () => {
    it('returns shares received by the user', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Received Persona',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/sharing/received',
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const shares = response.json()
      expect(shares).toHaveLength(1)
      expect(shares[0].resourceType).toBe('persona')
      expect(shares[0]).toHaveProperty('sharedByUser')
    })

    it('includes shares received via group membership', async () => {
      const group = await prisma.userGroup.create({
        data: { name: 'Recipient Group', slug: 'recipient-group', createdBy: ownerUserId },
      })
      await prisma.groupMembership.create({
        data: { userId: recipientUserId, groupId: group.id, role: 'group_member' },
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Group Received',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithGroupId: group.id,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/sharing/received',
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty array when no shares received', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sharing/received',
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })
  })

  // =========================================================================
  // GET /api/sharing/sent
  // =========================================================================

  describe('GET /api/sharing/sent', () => {
    it('returns shares sent by the user', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Sent Persona',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'forkable',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/sharing/sent',
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const shares = response.json()
      expect(shares).toHaveLength(1)
      expect(shares[0].permissionLevel).toBe('forkable')
    })

    it('returns empty array when no shares sent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sharing/sent',
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })
  })

  // =========================================================================
  // DELETE /api/sharing/:shareId
  // =========================================================================

  describe('DELETE /api/sharing/:shareId', () => {
    it('allows original sharer to revoke', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Revoke Target',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sharing/${share.id}`,
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('message')
    })

    it('allows system admin to revoke any share', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Admin Revoke',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sharing/${share.id}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 403 when non-sharer tries to revoke', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'No Revoke',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sharing/${share.id}`,
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent share', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/sharing/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // POST /api/sharing/:shareId/fork
  // =========================================================================

  describe('POST /api/sharing/:shareId/fork', () => {
    it('forks a persona into the recipient workspace', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Forkable Persona',
          role: 'Original Role',
          informationNeed: 'Original need',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'forkable',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/sharing/${share.id}/fork`,
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(201)
      const result = response.json()
      expect(result.resourceType).toBe('persona')
      expect(result.resourceId).not.toBe(persona.id) // new ID
      expect(result.resource.name).toBe('Forkable Persona')
    })

    it('returns 403 for read_only share', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Read Only',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'read_only',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/sharing/${share.id}/fork`,
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 403 for non-recipient', async () => {
      const persona = await prisma.persona.create({
        data: {
          name: 'Not For You',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithUserId: recipientUserId,
          permissionLevel: 'forkable',
        },
      })

      // Admin is not the recipient
      const response = await app.inject({
        method: 'POST',
        url: `/api/sharing/${share.id}/fork`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent share', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sharing/00000000-0000-0000-0000-000000000000/fork',
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })

    it('allows group member to fork group-shared resource', async () => {
      const group = await prisma.userGroup.create({
        data: { name: 'Fork Group', slug: 'fork-group', createdBy: ownerUserId },
      })
      await prisma.groupMembership.create({
        data: { userId: recipientUserId, groupId: group.id, role: 'group_member' },
      })

      const persona = await prisma.persona.create({
        data: {
          name: 'Group Fork',
          role: 'Test',
          informationNeed: 'Test',
          userId: ownerUserId,
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'persona',
          resourceId: persona.id,
          sharedByUserId: ownerUserId,
          sharedWithGroupId: group.id,
          permissionLevel: 'forkable',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/sharing/${share.id}/fork`,
        cookies: { session_token: recipientSessionToken },
      })

      expect(response.statusCode).toBe(201)
    })
  })
})
