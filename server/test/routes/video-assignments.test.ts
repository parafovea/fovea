import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the Video Assignments API.
 * Tests project-scoped video assignment and unassignment, bulk operations,
 * assignment rules CRUD, and rule evaluation.
 */
describe('Video Assignments API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let ownerUserId: string
  let ownerSessionToken: string
  let memberUserId: string
  let memberSessionToken: string
  let adminUserId: string
  let adminSessionToken: string
  let testVideoId: string
  let testProjectId: string

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

    // Create project owner
    const ownerHash = await hashPassword('ownerpass123')
    const owner = await prisma.user.create({
      data: {
        username: 'projowner',
        email: 'owner@example.com',
        passwordHash: ownerHash,
        displayName: 'Project Owner',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    ownerUserId = owner.id
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'projowner', password: 'ownerpass123' },
    })
    ownerSessionToken = ownerLogin.cookies.find(c => c.name === 'session_token')!.value

    // Create regular member (viewer)
    const memberHash = await hashPassword('memberpass123')
    const member = await prisma.user.create({
      data: {
        username: 'member',
        email: 'member@example.com',
        passwordHash: memberHash,
        displayName: 'Member User',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    memberUserId = member.id
    const memberLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'member', password: 'memberpass123' },
    })
    memberSessionToken = memberLogin.cookies.find(c => c.name === 'session_token')!.value

    // Create admin
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

    // Create a test video
    const video = await prisma.video.create({
      data: {
        filename: `test-video-${Date.now()}.mp4`,
        path: '/videos/test.mp4',
        duration: 120,
        frameRate: 30,
        resolution: '1920x1080',
      },
    })
    testVideoId = video.id

    // Create a test project with owner as project_owner
    const project = await prisma.project.create({
      data: {
        name: 'Assignment Project',
        slug: `assignment-project-${Date.now()}`,
        createdBy: ownerUserId,
        ownerUserId,
      },
    })
    testProjectId = project.id

    await prisma.projectMembership.create({
      data: { userId: ownerUserId, projectId: testProjectId, role: 'project_owner' },
    })

    // Add member as viewer
    await prisma.projectMembership.create({
      data: { userId: memberUserId, projectId: testProjectId, role: 'viewer' },
    })
  })

  // =========================================================================
  // GET /api/projects/:projectId/videos
  // =========================================================================

  describe('GET /api/projects/:projectId/videos', () => {
    it('returns empty array when no videos assigned', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns assigned videos', async () => {
      await prisma.projectVideoAssignment.create({
        data: {
          projectId: testProjectId,
          videoId: testVideoId,
          source: 'manual',
          assignedBy: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const assignments = response.json()
      expect(assignments).toHaveLength(1)
      expect(assignments[0].videoId).toBe(testVideoId)
    })

    it('allows viewer members to list assignments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: memberSessionToken },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns 403 for non-member', async () => {
      // Create a new user that is not a member
      const otherHash = await hashPassword('otherpass123')
      await prisma.user.create({
        data: {
          username: 'nonmember',
          email: 'nonmember@example.com',
          passwordHash: otherHash,
          displayName: 'Non Member',
        },
      })
      const otherLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'nonmember', password: 'otherpass123' },
      })
      const otherToken = otherLogin.cookies.find(c => c.name === 'session_token')!.value

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: otherToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/videos',
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // POST /api/projects/:projectId/videos
  // =========================================================================

  describe('POST /api/projects/:projectId/videos', () => {
    it('assigns a video to a project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: ownerSessionToken },
        payload: { videoId: testVideoId },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().videoId).toBe(testVideoId)
      expect(response.json().projectId).toBe(testProjectId)
      expect(response.json().source).toBe('manual')
    })

    it('assigns a video with a specific user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: ownerSessionToken },
        payload: { videoId: testVideoId, assignedUserId: memberUserId },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().assignedUserId).toBe(memberUserId)
    })

    it('returns 403 for viewer (non-manager)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: memberSessionToken },
        payload: { videoId: testVideoId },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent video', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${testProjectId}/videos`,
        cookies: { session_token: ownerSessionToken },
        payload: { videoId: '00000000-0000-0000-0000-000000000000' },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/videos',
        cookies: { session_token: ownerSessionToken },
        payload: { videoId: testVideoId },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // DELETE /api/projects/:projectId/videos/:videoId
  // =========================================================================

  describe('DELETE /api/projects/:projectId/videos/:videoId', () => {
    it('unassigns a video from a project', async () => {
      await prisma.projectVideoAssignment.create({
        data: {
          projectId: testProjectId,
          videoId: testVideoId,
          source: 'manual',
          assignedBy: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${testProjectId}/videos/${testVideoId}`,
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })

    it('returns 403 for viewer', async () => {
      await prisma.projectVideoAssignment.create({
        data: {
          projectId: testProjectId,
          videoId: testVideoId,
          source: 'manual',
          assignedBy: ownerUserId,
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${testProjectId}/videos/${testVideoId}`,
        cookies: { session_token: memberSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })

    it('returns 404 for non-existent assignment', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${testProjectId}/videos/${testVideoId}`,
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // POST /api/admin/video-assignments/bulk
  // =========================================================================

  describe('POST /api/admin/video-assignments/bulk', () => {
    it('bulk assigns videos to a project', async () => {
      const video2 = await prisma.video.create({
        data: {
          filename: `bulk-video-${Date.now()}.mp4`,
          path: '/videos/bulk.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080',
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/bulk',
        cookies: { session_token: adminSessionToken },
        payload: {
          videoIds: [testVideoId, video2.id],
          projectId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().created).toBe(2)
    })

    it('skips already-assigned videos', async () => {
      // Pre-assign one video
      await prisma.projectVideoAssignment.create({
        data: {
          projectId: testProjectId,
          videoId: testVideoId,
          source: 'manual',
          assignedBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/bulk',
        cookies: { session_token: adminSessionToken },
        payload: {
          videoIds: [testVideoId],
          projectId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().created).toBe(0)
    })

    it('returns 404 for non-existent project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/bulk',
        cookies: { session_token: adminSessionToken },
        payload: {
          videoIds: [testVideoId],
          projectId: '00000000-0000-0000-0000-000000000000',
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 for non-existent videos', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/bulk',
        cookies: { session_token: adminSessionToken },
        payload: {
          videoIds: ['00000000-0000-0000-0000-000000000000'],
          projectId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/bulk',
        cookies: { session_token: ownerSessionToken },
        payload: {
          videoIds: [testVideoId],
          projectId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // =========================================================================
  // Assignment Rules CRUD
  // =========================================================================

  describe('POST /api/admin/video-assignments/rules', () => {
    it('creates an assignment rule', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules',
        cookies: { session_token: adminSessionToken },
        payload: {
          name: 'Test Rule',
          description: 'Matches certain videos',
          conditions: [
            { field: 'category', operator: 'equals', value: 'sports' },
          ],
          targetType: 'project',
          targetId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(201)
      const rule = response.json()
      expect(rule.name).toBe('Test Rule')
      expect(rule.isActive).toBe(true)
      expect(rule.conditions).toHaveLength(1)
    })

    it('returns 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules',
        cookies: { session_token: ownerSessionToken },
        payload: {
          name: 'Forbidden',
          conditions: [{ field: 'x', operator: 'equals', value: 'y' }],
          targetType: 'project',
          targetId: testProjectId,
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /api/admin/video-assignments/rules', () => {
    it('lists all rules', async () => {
      await prisma.videoAssignmentRule.create({
        data: {
          name: 'Rule One',
          conditions: [{ field: 'f', operator: 'equals', value: 'v' }],
          targetType: 'project',
          targetId: testProjectId,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/video-assignments/rules',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('PUT /api/admin/video-assignments/rules/:ruleId', () => {
    it('updates a rule', async () => {
      const rule = await prisma.videoAssignmentRule.create({
        data: {
          name: 'To Update',
          conditions: [{ field: 'f', operator: 'equals', value: 'v' }],
          targetType: 'project',
          targetId: testProjectId,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/video-assignments/rules/${rule.id}`,
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Updated Rule', isActive: false },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().name).toBe('Updated Rule')
      expect(response.json().isActive).toBe(false)
    })

    it('returns 404 for non-existent rule', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/video-assignments/rules/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: adminSessionToken },
        payload: { name: 'Nope' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/admin/video-assignments/rules/:ruleId', () => {
    it('deletes a rule', async () => {
      const rule = await prisma.videoAssignmentRule.create({
        data: {
          name: 'To Delete',
          conditions: [{ field: 'f', operator: 'equals', value: 'v' }],
          targetType: 'project',
          targetId: testProjectId,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/video-assignments/rules/${rule.id}`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().success).toBe(true)
    })

    it('returns 404 for non-existent rule', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/video-assignments/rules/00000000-0000-0000-0000-000000000000',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // =========================================================================
  // Rule Evaluation
  // =========================================================================

  describe('POST /api/admin/video-assignments/rules/:ruleId/evaluate', () => {
    it('evaluates a rule and returns matching videos', async () => {
      // Create video with metadata
      const video = await prisma.video.create({
        data: {
          filename: `metadata-${Date.now()}.mp4`,
          path: '/videos/meta.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080',
          metadata: { category: 'sports', league: 'nfl' },
        },
      })

      const rule = await prisma.videoAssignmentRule.create({
        data: {
          name: 'Sports Rule',
          conditions: [{ field: 'category', operator: 'equals', value: 'sports' }],
          targetType: 'project',
          targetId: testProjectId,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/video-assignments/rules/${rule.id}/evaluate`,
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.ruleId).toBe(rule.id)
      expect(result.matchingVideoIds).toContain(video.id)
      expect(result.matchingVideoCount).toBeGreaterThanOrEqual(1)
    })

    it('returns 404 for non-existent rule', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules/00000000-0000-0000-0000-000000000000/evaluate',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/video-assignments/rules/evaluate-all', () => {
    it('evaluates all active rules and creates assignments', async () => {
      // Create video with metadata
      await prisma.video.create({
        data: {
          filename: `eval-all-${Date.now()}.mp4`,
          path: '/videos/eval.mp4',
          duration: 60,
          frameRate: 30,
          resolution: '1920x1080',
          metadata: { tag: 'auto' },
        },
      })

      // Create active rule targeting the project
      await prisma.videoAssignmentRule.create({
        data: {
          name: 'Auto Rule',
          conditions: [{ field: 'tag', operator: 'equals', value: 'auto' }],
          targetType: 'project',
          targetId: testProjectId,
          isActive: true,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules/evaluate-all',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      const result = response.json()
      expect(result.rulesEvaluated).toBeGreaterThanOrEqual(1)
      expect(result.assignmentsCreated).toBeGreaterThanOrEqual(1)
    })

    it('returns zero assignments when no rules match', async () => {
      // Create rule that matches nothing
      await prisma.videoAssignmentRule.create({
        data: {
          name: 'No Match',
          conditions: [{ field: 'nonexistent', operator: 'equals', value: 'nothing' }],
          targetType: 'project',
          targetId: testProjectId,
          isActive: true,
          createdBy: adminUserId,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules/evaluate-all',
        cookies: { session_token: adminSessionToken },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().assignmentsCreated).toBe(0)
    })

    it('returns 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/video-assignments/rules/evaluate-all',
        cookies: { session_token: ownerSessionToken },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
