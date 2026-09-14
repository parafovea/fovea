import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createAdminTestUser, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import { seedClaim } from '../helpers/seed-layers.js'
import { readSummaryClaims } from '../../src/services/layers-bridge/claim-bridge.js'

/**
 * 0.5.9 backend correctness/security hardening: model-route authentication,
 * project-membership enforcement on persona create, the monotonic optimistic
 * version guard, admin API-key per-provider uniqueness, profile duplicate-email
 * conflict handling, claim-id authorization, and deep-fork of a summary's claims.
 */
describe('0.5.9 backend hardening', () => {
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
    await prisma.resourceShare.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
  })

  describe('model routes require authentication', () => {
    it('rejects an unauthenticated read of the model config with 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/models/config' })
      expect(res.statusCode).toBe(401)
    })

    it('rejects a non-admin model selection with 403', async () => {
      const user = await createRegularTestUser(prisma, { username: 'mdl', email: 'mdl@example.com' })
      const res = await app.inject({
        method: 'POST',
        url: '/api/models/select',
        cookies: { session_token: user.sessionToken },
        payload: { task_type: 'detection', model_name: 'yolov8n' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('persona create is scoped to project membership', () => {
    it('forbids a non-member from creating a persona in a project', async () => {
      const owner = await createRegularTestUser(prisma, { username: 'owner', email: 'owner@example.com' })
      const outsider = await createRegularTestUser(prisma, { username: 'outsider', email: 'outsider@example.com' })

      const project = await prisma.project.create({
        data: { name: 'Closed', slug: 'closed-project', createdBy: owner.id },
      })
      await prisma.projectMembership.create({
        data: { userId: owner.id, projectId: project.id, role: 'project_owner' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: outsider.sessionToken },
        payload: { name: 'Sneaky', role: 'analyst', informationNeed: 'x', projectId: project.id },
      })
      expect(res.statusCode).toBe(403)
    })

    it('allows a member to create a persona in their project', async () => {
      const owner = await createRegularTestUser(prisma, { username: 'owner2', email: 'owner2@example.com' })
      const project = await prisma.project.create({
        data: { name: 'Open', slug: 'open-project', createdBy: owner.id },
      })
      await prisma.projectMembership.create({
        data: { userId: owner.id, projectId: project.id, role: 'project_owner' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/personas',
        cookies: { session_token: owner.sessionToken },
        payload: { name: 'Mine', role: 'analyst', informationNeed: 'x', projectId: project.id },
      })
      expect(res.statusCode).toBe(201)
    })
  })

  describe('personal world state carries a monotonic version guard', () => {
    it('advances the per-object lock on each guarded write and merges concurrent additions', async () => {
      const user = await createRegularTestUser(prisma, { username: 'wsv', email: 'wsv@example.com' })
      const headers = { cookies: { session_token: user.sessionToken } }

      // Materialize the personal world.
      await app.inject({ method: 'GET', url: '/api/world', ...headers })

      const put = (entities: Array<{ id: string; name: string }>) =>
        app.inject({ method: 'PUT', url: '/api/world', ...headers, payload: { entities } })

      // Two writes to the same object id, then a third adding a distinct object.
      expect((await put([{ id: 'e1', name: 'E1' }])).statusCode).toBe(200)
      expect((await put([{ id: 'e1', name: 'E1 renamed' }])).statusCode).toBe(200)
      expect((await put([{ id: 'e2', name: 'E2' }])).statusCode).toBe(200)

      // Merge-by-id keeps both additions; neither write clobbered the other.
      const worldRes = await app.inject({ method: 'GET', url: '/api/world', ...headers })
      const world = worldRes.json() as { entities: Array<{ id: string }> }
      const ids = world.entities.map((e) => e.id).sort()
      expect(ids).toEqual(['e1', 'e2'])

      // The layers store guards each world object with a monotonic lockVersion
      // compare-and-swap; the re-written e1 node advanced past its initial 0.
      const worldNodes = await prisma.graphNode.findMany({ where: { createdByUserId: user.id } })
      const objectId = (node: (typeof worldNodes)[number]): unknown =>
        ((node.properties as { foveaWorld?: { object?: { id?: unknown } } } | null)?.foveaWorld?.object?.id)
      const e1Node = worldNodes.find((node) => objectId(node) === 'e1')
      expect(e1Node?.lockVersion).toBeGreaterThan(0)
    })
  })

  describe('admin API keys are unique per provider', () => {
    it('returns 409 on a second admin key for the same provider', async () => {
      const admin = await createAdminTestUser(prisma, { username: 'akadmin', email: 'akadmin@example.com' })
      const create = () =>
        app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          cookies: { session_token: admin.sessionToken },
          payload: { provider: 'ANTHROPIC', keyName: 'primary', apiKey: 'sk-test-abcdefghijklmnop' },
        })
      expect((await create()).statusCode).toBe(201)
      expect((await create()).statusCode).toBe(409)
    })
  })

  describe('self-service profile update', () => {
    it('returns 409 (not 500) when changing to an already-used email', async () => {
      await createRegularTestUser(prisma, { username: 'taken', email: 'taken@example.com' })
      const mover = await createRegularTestUser(prisma, { username: 'mover', email: 'mover@example.com' })

      const res = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        cookies: { session_token: mover.sessionToken },
        payload: { email: 'taken@example.com' },
      })
      expect(res.statusCode).toBe(409)
    })
  })

  describe('forking a shared summary deep-copies its claims', () => {
    it('copies the claim tree and denormalized claimsJson under fresh ids', async () => {
      const sharer = await createRegularTestUser(prisma, { username: 'sharer', email: 'sharer@example.com' })
      const forker = await createRegularTestUser(prisma, { username: 'forker', email: 'forker@example.com' })

      const video = await prisma.video.create({ data: { filename: 'fork.mp4', path: '/fork.mp4' } })
      const persona = await prisma.persona.create({
        data: { userId: sharer.id, name: 'P', role: 'r', informationNeed: 'n' },
      })
      const summary = await prisma.videoSummary.create({
        data: { videoId: video.id, personaId: persona.id, createdBy: sharer.id },
      })
      // Seed the claim tree into the layers store (Claim is no longer its own
      // model). The parent has one child, so the fork must re-point the child's
      // parent link and the denormalized claimsJson at the fresh ids.
      const parent = await seedClaim(prisma, {
        data: { summaryId: summary.id, summaryType: 'video', text: 'Parent claim', createdBy: sharer.id },
      })
      const child = await seedClaim(prisma, {
        data: {
          summaryId: summary.id,
          summaryType: 'video',
          text: 'Child claim',
          parentClaimId: parent.id,
          createdBy: sharer.id,
        },
      })
      await prisma.videoSummary.update({
        where: { id: summary.id },
        data: {
          claimsVersion: '1.0',
          claimsExtractedAt: new Date(),
          claimsJson: {
            version: '1.0',
            claims: [{ id: parent.id, text: 'Parent claim', subclaims: [{ id: child.id, text: 'Child claim' }] }],
            metadata: { totalClaims: 2 },
          },
        },
      })

      const share = await prisma.resourceShare.create({
        data: {
          resourceType: 'summary',
          resourceId: summary.id,
          sharedByUserId: sharer.id,
          sharedWithUserId: forker.id,
          permissionLevel: 'forkable',
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/sharing/${share.id}/fork`,
        cookies: { session_token: forker.sessionToken },
      })
      expect(res.statusCode).toBe(201)
      const forkedSummaryId = res.json().resourceId as string

      const { claims: forkedClaims } = await readSummaryClaims(prisma, forkedSummaryId)
      expect(forkedClaims).toHaveLength(2)
      // Fresh ids, not the source ids.
      const forkedIds = forkedClaims.map((c) => c.id)
      expect(forkedIds).not.toContain(parent.id)
      expect(forkedIds).not.toContain(child.id)
      // Parent/child hierarchy preserved, re-pointed at the new parent id.
      const forkedParent = forkedClaims.find((c) => (c.parentClaimId ?? null) === null)
      const forkedChild = forkedClaims.find((c) => (c.parentClaimId ?? null) !== null)
      expect(forkedParent?.text).toBe('Parent claim')
      expect(forkedChild?.text).toBe('Child claim')
      expect(forkedChild?.parentClaimId).toBe(forkedParent?.id)

      // Denormalized claimsJson carried over and re-pointed at the new ids.
      const forkedSummary = await prisma.videoSummary.findUnique({ where: { id: forkedSummaryId } })
      const json = forkedSummary?.claimsJson as { claims: Array<{ id: string; subclaims: Array<{ id: string }> }> }
      expect(json.claims[0].id).toBe(forkedParent?.id)
      expect(json.claims[0].subclaims[0].id).toBe(forkedChild?.id)
    })
  })
})
