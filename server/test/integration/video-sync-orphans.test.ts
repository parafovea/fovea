import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { buildApp } from '../../src/app.js'
import { syncVideosFromStorage, Logger } from '../../src/services/videoSync.js'
import { createVideoStorageProvider } from '../../src/services/videoStorage.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration test for the orphaned-video cleanup at the end of a sync: a
 * database video missing from a complete storage listing is removed, but an
 * empty listing against a populated database (misconfigured or unreachable
 * storage) removes nothing, because a video delete cascades to its summaries,
 * claims, and annotations.
 */
const warnings: string[] = []
const logger: Logger = {
  info: () => {},
  debug: () => {},
  warn: (_obj, message) => {
    if (message) warnings.push(message)
  },
  error: () => {},
}

describe('Orphaned video cleanup', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let tempDir: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    warnings.length = 0
    await prisma.projectVideoAssignment.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.video.deleteMany()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-sync-orphans-'))
    await prisma.video.createMany({
      data: [
        { id: 'db-only-1', filename: 'db-only-1.mp4', path: '/videos/db-only-1.mp4', duration: 1 },
        { id: 'db-only-2', filename: 'db-only-2.mp4', path: '/videos/db-only-2.mp4', duration: 1 },
      ],
    })
  })

  function runSync() {
    return syncVideosFromStorage(
      prisma,
      logger,
      createVideoStorageProvider({ type: 'local', localPath: tempDir, baseUrl: '/api/videos' }),
      { type: 'local', localPath: tempDir },
    )
  }

  it('keeps every database video when storage lists none', async () => {
    const result = await runSync()

    expect(result.total).toBe(0)
    expect(result.deleted).toBe(0)
    expect(await prisma.video.count()).toBe(2)
    expect(warnings).toContain('Storage listed no videos; skipping orphaned video cleanup')
  })

  it('removes database videos missing from a non-empty listing', async () => {
    await fs.writeFile(path.join(tempDir, 'present.mp4'), Buffer.from('p'))

    const result = await runSync()

    expect(result.total).toBe(1)
    expect(result.deleted).toBe(2)
    expect(await prisma.video.findUnique({ where: { id: 'db-only-1' } })).toBeNull()
    expect(await prisma.video.count()).toBe(1)
  })
})
