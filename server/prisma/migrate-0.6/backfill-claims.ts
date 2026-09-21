/**
 * Copies each legacy `claims` row (and its `claim_relations`) into the native
 * layers claim store through the SAME bridge the application uses — no row
 * construction here.
 *
 * The legacy `Claim` columns map 1:1 onto the `StoredClaim` view-model the claim
 * bridge consumes, and `ClaimRelation` onto `StoredRelation`. The copy assembles
 * those and calls `writeClaim(prisma, summaryContext, claim)` /
 * `writeClaimRelation(prisma, relation, summaryId, projectId)`, which run the
 * claim mapper/lens internally and persist deterministically (idempotent).
 *
 * @module
 */

import type { PrismaClient, Claim, ClaimRelation } from '@prisma/client'

import {
  writeClaim,
  writeClaimRelation,
  type ClaimSummaryContext,
} from '../../src/services/layers-bridge/claim-bridge.js'
import type { StoredClaim, StoredRelation } from '../../src/services/claim-model.js'

import type { StepStats } from './helpers.js'

/** Maps a legacy Claim row onto the StoredClaim view-model (dates to ISO). */
function storedClaimOf(row: Claim): StoredClaim {
  return {
    id: row.id,
    summaryId: row.summaryId,
    summaryType: row.summaryType,
    text: row.text,
    gloss: row.gloss,
    parentClaimId: row.parentClaimId,
    textSpans: row.textSpans,
    timeSpans: row.timeSpans,
    claimerType: row.claimerType,
    claimerGloss: row.claimerGloss,
    claimRelation: row.claimRelation,
    claimEventId: row.claimEventId,
    claimTimeId: row.claimTimeId,
    claimLocationId: row.claimLocationId,
    confidence: row.confidence,
    modelUsed: row.modelUsed,
    extractionStrategy: row.extractionStrategy,
    audio: row.audio,
    video: row.video,
    metadata: row.metadata,
    comment: row.comment,
    createdBy: row.createdBy,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Maps a legacy ClaimRelation row onto the StoredRelation view-model. */
function storedRelationOf(row: ClaimRelation): StoredRelation {
  return {
    id: row.id,
    sourceClaimId: row.sourceClaimId,
    targetClaimId: row.targetClaimId,
    relationTypeId: row.relationTypeId,
    sourceSpans: row.sourceSpans,
    targetSpans: row.targetSpans,
    confidence: row.confidence,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Copies a batch of legacy claims and their relations into native layers claims.
 *
 * @param prisma - the Prisma client
 * @param claims - the legacy Claim rows
 * @param relations - the legacy ClaimRelation rows whose source is in `claims`
 * @returns the created/updated tally
 */
export async function backfillClaims(
  prisma: PrismaClient,
  claims: Claim[],
  relations: ClaimRelation[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  const summaryContext = new Map<string, ClaimSummaryContext>()

  for (const claim of claims) {
    let context = summaryContext.get(claim.summaryId)
    if (!context) {
      const summary = await prisma.videoSummary.findUnique({ where: { id: claim.summaryId } })
      if (!summary) continue
      context = {
        id: summary.id,
        videoId: summary.videoId,
        projectId: summary.projectId,
        createdBy: claim.createdBy,
      }
      summaryContext.set(claim.summaryId, context)
    }
    await writeClaim(prisma, context, storedClaimOf(claim))
    stats.created += 1
  }

  const projectByClaim = new Map(claims.map((c) => [c.id, c.projectId] as const))
  for (const relation of relations) {
    const source = claims.find((c) => c.id === relation.sourceClaimId)
    await writeClaimRelation(
      prisma,
      storedRelationOf(relation),
      source?.summaryId ?? '',
      projectByClaim.get(relation.sourceClaimId) ?? null,
    )
    stats.created += 1
  }

  return stats
}
