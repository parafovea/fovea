import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Projects API.
 * Tests project CRUD, membership management, project personas, and world state.
 */
describe('Projects API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let testSessionToken: string
  let adminUserId: string
  let adminSessionToken: string
  let otherUserId: string
  let otherSessionToken: string

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
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
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

    // Create test user (project owner)
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash,
        displayName: 'Test User',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    testUserId = user.id

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'testpass123' },
    })
    testSessionToken = loginRes.cookies.find(c => c.name === 'session_token')!.value

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
      },
    })
    adminUserId = admin.id

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'adminuser', password: 'adminpass123' },
    })
    adminSessionToken = adminLogin.cookies.find(c => c.name === 'session_token')!.value

    // Create other user (for membership tests)
    const otherHash = await hashPassword('otherpass123')
    const other = await prisma.user.create({
      data: {
        username: 'otheruser',
        email: 'other@example.com',
        passwordHash: otherHash,
        displayName: 'Other User',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    otherUserId = other.id

    const otherLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'otheruser', password: 'otherpass123' },
    })
    otherSessionToken = otherLogin.cookies.find(c => c.name === 'session_token')!.value
  })

  // =========================================================================
  // POST /api/projects
  // =========================================================================

  describe('POST /api/projects', () => {
    it('creates a user-owned project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: {
          name: 'My Project',
          description: 'A test project',
          slug: 'my-project',
        },
      })

      expect(response.statusCode).toBe(201)
      const project = response.json()
      expect(project.name).toBe('My Project')
      expect(project.slug).toBe('my-project')
      expect(project.ownerUserId).toBe(testUserId)
      expect(project.ownerGroupId).toBeNull()
      expect(project.isArchived).toBe(false)
    })

    it('creates a group-owned project', async () => {
      // First create a group
      const groupRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Test Group', slug: 'test-group' },
      })
      const groupId = groupRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: {
          name: 'Group Project',
          slug: 'group-project',
          ownerGroupId: groupId,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().ownerGroupId).toBe(groupId)
      expect(response.json().ownerUserId).toBeNull()
    })

    it('returns 409 for duplicate slug', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'First', slug: 'taken' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Second', slug: 'taken' },
      })

      expect(response.statusCode).toBe(409)
    })

    it('returns 400 for invalid slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Bad', slug: 'Bad Slug!' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 403 when creating group project without group admin role', async () => {
      // Create group owned by admin
      const groupRes = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Admin Group', slug: 'admin-group' },
      })
      const groupId = groupRes.json().id

      // Add testUser as member (not admin)
      await prisma.groupMembership.create({
        data: { userId: testUserId, groupId, role: 'group_member' },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: {
          name: 'Forbidden Project',
          slug: 'forbidden-project',
          ownerGroupId: groupId,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        payload: { name: 'No Auth', slug: 'no-auth' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // =========================================================================
  // GET /api/projects
  // =========================================================================

  describe('GET /api/projects', () => {
    it('returns projects the user is a member of', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Listed Project', slug: 'listed-project' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const projects = response.json()
      expect(projects.length).toBeGreaterThanOrEqual(1)
      expect(projects[0]).toHaveProperty('myRole')
      expect(projects[0]).toHaveProperty('_count')
    })

    it('returns empty array when user has no projects', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects',
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('supports scope=personal filter', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Personal Project', slug: 'personal-project' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/projects?scope=personal',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId
  // =========================================================================

  describe('GET /api/projects/:projectId', () => {
    it('returns project details for a member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Detail Project', slug: 'detail-project' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const project = response.json()
      expect(project.id).toBe(projectId)
      expect(project.members).toHaveLength(1)
      expect(project.members[0].role).toBe('project_owner')
      expect(project).toHaveProperty('videoAssignmentCount')
    })

    it('returns 403 for non-member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Private Project', slug: 'private-project' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })

    it('allows system admin to view any project', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Admin View', slug: 'admin-view' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // PUT /api/projects/:projectId
  // =========================================================================

  describe('PUT /api/projects/:projectId', () => {
    it('updates project name', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'To Update', slug: 'to-update' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: testSessionToken },
        payload: { name: 'Updated Name', description: 'Updated desc' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Updated Name')
    })

    it('archives a project', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'To Archive', slug: 'to-archive' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: testSessionToken },
        payload: { isArchived: true },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().isArchived).toBe(true)
    })

    it('returns 403 for viewer role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'No Edit', slug: 'no-edit' },
      })
      const projectId = createRes.json().id

      // Add other user as viewer
      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'viewer' },
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: otherSessionToken },
        payload: { name: 'Should Fail' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/projects/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Nope' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // DELETE /api/projects/:projectId
  // =========================================================================

  describe('DELETE /api/projects/:projectId', () => {
    it('allows project owner to delete', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'To Delete', slug: 'to-delete' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('message')
    })

    it('returns 403 for non-owner member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Owned Project', slug: 'owned-project' },
      })
      const projectId = createRes.json().id

      // Add other as annotator
      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'annotator' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('allows system admin to delete any project', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Admin Del', slug: 'admin-del' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // POST /api/projects/:projectId/members
  // =========================================================================

  describe('POST /api/projects/:projectId/members', () => {
    it('adds a member with valid role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Member Project', slug: 'member-project' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'annotator' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().userId).toBe(otherUserId)
      expect(response.json().role).toBe('annotator')
    })

    it('returns 409 for duplicate membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Dup Member', slug: 'dup-member' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'viewer' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'annotator' },
      })

      expect(response.statusCode).toBe(409)
    })

    it('returns 403 for viewer trying to add members', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'No Add', slug: 'no-add' },
      })
      const projectId = createRes.json().id

      // Add other as viewer
      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'viewer' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: otherSessionToken },
        payload: { userId: adminUserId, role: 'annotator' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 400 for invalid role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Bad Role', slug: 'bad-role' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'project_owner' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId/members
  // =========================================================================

  describe('GET /api/projects/:projectId/members', () => {
    it('returns all project members', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'List Members', slug: 'list-members' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'reviewer' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
    })

    it('returns 403 for non-member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Secret Members', slug: 'secret-members' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // PUT /api/projects/:projectId/members/:userId
  // =========================================================================

  describe('PUT /api/projects/:projectId/members/:userId', () => {
    it('changes a member role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Change Role', slug: 'change-role' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'viewer' },
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}/members/${otherUserId}`,
        cookies: { session_token: testSessionToken },
        payload: { role: 'annotator' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().role).toBe('annotator')
    })

    it('returns 400 when changing own role', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Self Change', slug: 'self-change' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}/members/${testUserId}`,
        cookies: { session_token: testSessionToken },
        payload: { role: 'viewer' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for non-existent membership', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'No Member', slug: 'no-member' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}/members/00000000-0000-0000-0000-000000000000`,
        cookies: { session_token: testSessionToken },
        payload: { role: 'viewer' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // DELETE /api/projects/:projectId/members/:userId
  // =========================================================================

  describe('DELETE /api/projects/:projectId/members/:userId', () => {
    it('removes a member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Remove Member', slug: 'remove-member' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'annotator' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${otherUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 400 when removing the last owner', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Last Owner', slug: 'last-owner' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${testUserId}`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(400)
    })

    it('allows self-removal for non-owners', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Self Leave', slug: 'self-leave' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'annotator' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${otherUserId}`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId/personas
  // =========================================================================

  describe('GET /api/projects/:projectId/personas', () => {
    it('returns project personas', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Persona Proj', slug: 'persona-proj' },
      })
      const projectId = createRes.json().id

      // Create a persona scoped to this project
      await prisma.persona.create({
        data: {
          name: 'Project Persona',
          role: 'Analyst',
          informationNeed: 'Test need',
          userId: testUserId,
          projectId,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/personas`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const personas = response.json()
      expect(personas).toHaveLength(1)
      expect(personas[0].name).toBe('Project Persona')
    })

    it('returns 403 for non-member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Private Persona', slug: 'private-persona' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/personas`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId/world
  // =========================================================================

  describe('GET /api/projects/:projectId/world', () => {
    it('creates and returns world state for member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'World Proj', slug: 'world-proj' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/world`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const world = response.json()
      expect(world.userId).toBe(testUserId)
      expect(world.projectId).toBe(projectId)
      expect(world.entities).toEqual([])
      expect(world.events).toEqual([])
    })

    it('returns 403 for non-member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'No World', slug: 'no-world' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/world`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // PUT /api/projects/:projectId/world
  // =========================================================================

  describe('PUT /api/projects/:projectId/world', () => {
    it('updates world state for member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Update World', slug: 'update-world' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}/world`,
        cookies: { session_token: testSessionToken },
        payload: {
          entities: [{ id: 'e1', name: 'Entity 1' }],
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().entities).toHaveLength(1)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/world',
        cookies: { session_token: testSessionToken },
        payload: { entities: [] },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // CASL role outcomes for project_manager
  // =========================================================================

  describe('project_manager authorization', () => {
    it('allows a manager to update a project they do not own', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Manager Update', slug: 'manager-update' },
      })
      const projectId = createRes.json().id

      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'project_manager' },
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: otherSessionToken },
        payload: { name: 'Renamed By Manager' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Renamed By Manager')
    })

    it('allows a manager to add members', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Manager Adds', slug: 'manager-adds' },
      })
      const projectId = createRes.json().id

      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'project_manager' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: otherSessionToken },
        payload: { userId: adminUserId, role: 'annotator' },
      })

      expect(response.statusCode).toBe(201)
    })

    it('denies a manager deleting a project they do not own', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Manager No Delete', slug: 'manager-no-delete' },
      })
      const projectId = createRes.json().id

      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'project_manager' },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId/assignable-users
  // =========================================================================

  describe('GET /api/projects/:projectId/assignable-users', () => {
    it('returns users who are not yet members', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Assignable', slug: 'assignable' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/assignable-users`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const users = response.json()
      const ids = users.map((u: { id: string }) => u.id)
      // The owner (testUser) is already a member and must be excluded.
      expect(ids).not.toContain(testUserId)
      // Non-members are listed.
      expect(ids).toContain(otherUserId)
      expect(users[0]).toHaveProperty('username')
      expect(users[0]).toHaveProperty('displayName')
      expect(users[0]).not.toHaveProperty('passwordHash')
    })

    it('excludes a user once they become a member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Assignable Filter', slug: 'assignable-filter' },
      })
      const projectId = createRes.json().id

      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        cookies: { session_token: testSessionToken },
        payload: { userId: otherUserId, role: 'annotator' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/assignable-users`,
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const ids = response.json().map((u: { id: string }) => u.id)
      expect(ids).not.toContain(otherUserId)
    })

    it('returns 403 for a viewer (cannot manage members)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Assignable Forbidden', slug: 'assignable-forbidden' },
      })
      const projectId = createRes.json().id

      await prisma.projectMembership.create({
        data: { userId: otherUserId, projectId, role: 'viewer' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/assignable-users`,
        cookies: { session_token: otherSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('allows a system admin to list assignable users', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: { session_token: testSessionToken },
        payload: { name: 'Assignable Admin', slug: 'assignable-admin' },
      })
      const projectId = createRes.json().id

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/assignable-users`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 404 for a non-existent project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/assignable-users',
        cookies: { session_token: testSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
