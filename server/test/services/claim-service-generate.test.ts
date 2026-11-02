import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

// Mock the queue module before importing the service. This both lets us assert
// the enqueued job payload and avoids the real BullMQ/Redis connections the
// module opens on import. `vi.hoisted` makes the spy available inside the
// hoisted mock factory.
const { extractionAdd } = vi.hoisted(() => ({ extractionAdd: vi.fn() }))
vi.mock('../../src/queues/setup.js', () => ({
  claimExtractionQueue: { add: extractionAdd, getJob: vi.fn() },
  claimSynthesisQueue: { add: vi.fn(), getJob: vi.fn() },
}))

import { ClaimService } from '../../src/services/claim-service.js'
import { GraphRepository } from '../../src/repositories/GraphRepository.js'
import { AnnotationLayerRepository } from '../../src/repositories/AnnotationLayerRepository.js'
import { defineAbilitiesFor, type UserRoles } from '../../src/lib/abilities.js'

/**
 * Claim extraction runs in a background worker that has no request user, so the
 * initiating user must be threaded through the job payload to be stamped as the
 * owner of each extracted claim. Without it, model-extracted claims are born
 * createdBy = NULL and are unreadable to the person who requested them.
 */
describe('ClaimService.generateClaims threads the requesting user into the job', () => {
  const adminRoles: UserRoles = { systemRole: 'system_admin', groupRoles: [], projectRoles: [] }

  beforeEach(() => {
    extractionAdd.mockReset()
    extractionAdd.mockResolvedValue({ id: 'job-1' })
  })

  it('enqueues the extraction job with createdBy set to the caller', async () => {
    // The layers ClaimService reads the summary through prisma.videoSummary; stub
    // just that lookup. The graph/annotation repositories are unused by
    // generateClaims, so minimal stand-ins suffice.
    const prisma = {
      videoSummary: {
        findUnique: vi.fn().mockResolvedValue({ id: 'summary-1', projectId: null, createdBy: 'user-1' }),
      },
    } as unknown as PrismaClient
    const ability = defineAbilitiesFor('user-1', adminRoles, [])
    const service = new ClaimService(
      {} as GraphRepository,
      {} as AnnotationLayerRepository,
      prisma,
      ability,
      'user-1',
      'system_admin',
    )

    await service.generateClaims('summary-1', {
      inputSources: {
        includeSummaryText: true,
        includeAnnotations: false,
        includeOntology: false,
        ontologyDepth: 'names-only',
      },
      extractionStrategy: 'sentence-based',
    })

    expect(extractionAdd).toHaveBeenCalledTimes(1)
    const jobData = extractionAdd.mock.calls[0][1]
    expect(jobData.createdBy).toBe('user-1')
    expect(jobData.summaryId).toBe('summary-1')
  })
})
