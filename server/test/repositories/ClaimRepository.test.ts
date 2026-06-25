import { describe, it, expect, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ClaimRepository } from '../../src/repositories/ClaimRepository.js'

/**
 * Unit coverage for the auto-created parent summary. When a claim is added to a
 * (video, persona) that has no summary yet, the repository creates an empty one
 * — and it must stamp the persona's project scope and the caller as owner, or
 * the summary is born NULL-scoped/orphaned and becomes invisible to project
 * collaborators (and even to its own creator).
 */
describe('ClaimRepository.upsertEmptyVideoSummary', () => {
  const makeRepo = () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'summary-1' })
    const prisma = { videoSummary: { upsert } } as unknown as PrismaClient
    return { repo: new ClaimRepository(prisma), upsert }
  }

  it('stamps projectId and createdBy on the created summary', async () => {
    const { repo, upsert } = makeRepo()

    await repo.upsertEmptyVideoSummary('video-1', 'persona-1', 'project-1', 'user-1')

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          videoId: 'video-1',
          personaId: 'persona-1',
          projectId: 'project-1',
          createdBy: 'user-1',
        }),
      }),
    )
  })

  it('passes projectId undefined for a personal persona while still stamping the owner', async () => {
    const { repo, upsert } = makeRepo()

    await repo.upsertEmptyVideoSummary('video-1', 'persona-1', null, 'user-1')

    const arg = upsert.mock.calls[0][0]
    expect(arg.create.projectId).toBeUndefined()
    expect(arg.create.createdBy).toBe('user-1')
  })
})
