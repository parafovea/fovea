import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { seedLegacyFixture, cleanupFixture, type LegacyFixture } from './fixtures.js'
import { runBackfill } from '../runner.js'
import { clearState, ensureStateTable, readState, recordBackfilled, recordVerified } from '../state.js'
import { claimAnnotationId } from '../../../src/services/layers-id-map.js'

const exec = promisify(execFile)

/** Runs the public CLI against the test database. */
async function command(...args: string[]): Promise<void> {
  await exec(process.execPath, ['--import', 'tsx', 'prisma/migrate-0.6/cli.ts', ...args], { timeout: 30_000 })
}

describe('migration checkpoint recovery', () => {
  const prisma = new PrismaClient()
  let fixture: LegacyFixture

  beforeEach(async () => {
    await ensureStateTable(prisma)
    await clearState(prisma)
    const since = new Date()
    fixture = await seedLegacyFixture(prisma)
    await runBackfill(prisma, { since })
  })
  afterEach(async () => {
    await cleanupFixture(prisma, fixture)
    await clearState(prisma)
  })
  afterAll(async () => { await prisma.$disconnect() })

  it('resumes catch-up from the previous verification without overwriting native edits', async () => {
    const checkpoint = new Date()
    await recordVerified(prisma, {}, checkpoint)
    await prisma.layersAnnotation.update({ where: { id: claimAnnotationId(fixture.claimAId) }, data: { text: 'Edited in 0.6' } })
    await prisma.claim.update({ where: { id: fixture.claimBId }, data: { text: 'Changed in 0.5', updatedAt: new Date(checkpoint.getTime() + 1) } })
    await recordBackfilled(prisma, {})
    await command('auto')
    expect((await prisma.layersAnnotation.findUniqueOrThrow({ where: { id: claimAnnotationId(fixture.claimAId) } })).text).toBe('Edited in 0.6')
    expect((await prisma.layersAnnotation.findUniqueOrThrow({ where: { id: claimAnnotationId(fixture.claimBId) } })).text).toBe('Changed in 0.5')
    expect((await readState(prisma))?.phase).toBe('verified')
  }, 30_000)

  it('does not promote a subset verification to a full verified marker', async () => {
    await command('verify', '--since', new Date(Date.now() + 60_000).toISOString())
    expect(await readState(prisma)).toBeNull()
  }, 30_000)
})
