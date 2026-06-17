import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { syncVideosFromStorage, Logger } from '../../src/services/videoSync.js'
import { createVideoStorageProvider } from '../../src/services/videoStorage.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration test for manifest-driven provisioning during video sync:
 * recursive discovery feeds a fovea.manifest.json that upserts projects and
 * groups, reconciles memberships, and assigns videos to the most-specific
 * matching project. Re-running the sync must be idempotent.
 */
const silentLogger: Logger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
}

describe('Manifest-driven sync', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let tempDir: string
  let adminId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.groupMembership.deleteMany()
    await prisma.projectMembership.deleteMany()
    await prisma.project.deleteMany()
    await prisma.userGroup.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()

    const passwordHash = await hashPassword('testpass123')
    const admin = await prisma.user.create({
      data: { username: 'admin', email: 'admin@example.com', passwordHash, displayName: 'Admin', isAdmin: true },
    })
    adminId = admin.id
    await prisma.user.create({
      data: { username: 'wgantt', email: 'wgantt@example.com', passwordHash, displayName: 'W', isAdmin: false },
    })

    // Build a videos directory with nested clips + a manifest.
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-sync-'))
    await fs.mkdir(path.join(tempDir, 'team', 'qc'), { recursive: true })
    await fs.mkdir(path.join(tempDir, 'other'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'team', 'clip-a.mp4'), Buffer.from('a'))
    await fs.writeFile(path.join(tempDir, 'team', 'qc', 'clip-b.mp4'), Buffer.from('b'))
    await fs.writeFile(path.join(tempDir, 'other', 'clip-c.mp4'), Buffer.from('c'))
    await fs.writeFile(
      path.join(tempDir, 'fovea.manifest.json'),
      JSON.stringify({
        groups: [
          { slug: 'scale', name: 'SCALE Team', members: [{ username: 'wgantt', role: 'group_admin' }] },
        ],
        projects: [
          { slug: 'scale-team', name: 'SCALE Team Project', ownerGroup: 'scale', paths: ['team/**'] },
          { slug: 'scale-qc', name: 'SCALE QC', ownerGroup: 'scale', paths: ['team/qc/**'] },
        ],
      })
    )
  })

  function provider() {
    return createVideoStorageProvider({ type: 'local', localPath: tempDir, baseUrl: '/api/videos' })
  }

  function runSync() {
    return syncVideosFromStorage(
      prisma,
      silentLogger,
      provider(),
      { type: 'local', localPath: tempDir },
      { syncUserId: adminId }
    )
  }

  it('upserts groups/projects, reconciles members, and assigns videos by most-specific glob', async () => {
    const result = await runSync()

    expect(result.total).toBe(3)
    expect(result.manifest).toBeDefined()
    expect(result.manifest!.groupsUpserted).toBe(1)
    expect(result.manifest!.projectsUpserted).toBe(2)
    expect(result.manifest!.membersReconciled).toBe(1)
    expect(result.manifest!.videosAssigned).toBe(2) // clip-a -> team, clip-b -> qc; clip-c unmatched

    const group = await prisma.userGroup.findUnique({ where: { slug: 'scale' } })
    expect(group).not.toBeNull()
    expect(group!.createdBy).toBe(adminId)

    const membership = await prisma.groupMembership.findFirst({
      where: { groupId: group!.id },
      include: { user: true },
    })
    expect(membership?.user.username).toBe('wgantt')
    expect(membership?.role).toBe('group_admin')

    const qc = await prisma.project.findUnique({ where: { slug: 'scale-qc' } })
    expect(qc?.ownerGroupId).toBe(group!.id)

    // clip-b (team/qc/clip-b.mp4) goes to the deeper qc project, not scale-team.
    const assignments = await prisma.projectVideoAssignment.findMany({
      include: { video: true, project: true },
    })
    const byKey = new Map(assignments.map((a) => [a.video.filename, a.project.slug]))
    expect(byKey.get('team/clip-a.mp4')).toBe('scale-team')
    expect(byKey.get('team/qc/clip-b.mp4')).toBe('scale-qc')
    expect(byKey.has('other/clip-c.mp4')).toBe(false)
    expect(assignments.every((a) => a.source === 'folder')).toBe(true)
  })

  it('is idempotent on re-sync (no duplicate assignments or memberships)', async () => {
    await runSync()
    const second = await runSync()

    expect(second.manifest!.videosAssigned).toBe(0)

    const assignments = await prisma.projectVideoAssignment.count()
    expect(assignments).toBe(2)

    const memberships = await prisma.groupMembership.count()
    expect(memberships).toBe(1)
  })

  it('skips a malformed manifest but still discovers videos', async () => {
    await fs.writeFile(path.join(tempDir, 'fovea.manifest.json'), '{ not valid json')

    const result = await runSync()

    expect(result.total).toBe(3) // videos still discovered recursively
    expect(result.manifest).toBeUndefined() // manifest skipped
    expect(await prisma.userGroup.count()).toBe(0)
    expect(await prisma.projectVideoAssignment.count()).toBe(0)
  })
})
