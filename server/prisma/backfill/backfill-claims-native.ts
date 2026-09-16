/**
 * One-shot backfill from the legacy claim sidecar to the native layers
 * representation.
 *
 * Before the native re-model, every claim was stashed verbatim under
 * `GraphNode.properties.foveaClaim.object` (relations under
 * `GraphEdge.properties.foveaClaimRelation.object`), and the columns beside it
 * held only a partial projection. This script reconstructs each claim and
 * relation from those stashes and reprojects it through the current mapper so the
 * native rows become authoritative:
 *
 *   - a claim becomes a GraphNode (identity + summary-membership feature scalars)
 *     denoted by ONE primary bearer LayersAnnotation (text, confidence, gloss /
 *     claimer / claimRelation as argumentRefs, the parent link, and the residual
 *     leftover), plus temporal-grounding sibling annotations and cross-object
 *     reference edges;
 *   - a relation becomes a GraphEdge between the two claim nodes, tagged with the
 *     `fovea.edgeRole` feature, its span endpoints / notes in the edge residual.
 *
 * The legacy `foveaClaim` / `foveaClaimRelation` stash rows are deleted, so the
 * store carries no sidecar. Text spans and the sentence index ride in the primary
 * annotation's residual leaf scalars (exact), so no canonical Tokenization or
 * sentence Segmentation is required for a lossless backfill; a source that later
 * grows a Tokenization can upgrade the anchor without data loss.
 *
 * Idempotent: a re-run finds no `foveaClaim` stash to migrate (a migrated node's
 * properties are flat feature scalars with no `.object`).
 *
 * Run (against a configured DATABASE_URL) with tsx, e.g.
 * `tsx prisma/backfill/backfill-claims-native.ts`. This script is not wired into
 * `prisma migrate`; run it once after deploying the re-model, and after the
 * ontology and world backfills.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import { writeClaim, writeClaimRelation } from '../../src/services/layers-bridge/claim-bridge.js'
import type { StoredClaim, StoredRelation } from '../../src/services/claim-layers-mapper.js'

/** The marker key a legacy claim node carried in its `properties`. */
const CLAIM_MARKER = 'foveaClaim'

/** The marker key a legacy claim-relation edge carried in its `properties`. */
const CLAIM_RELATION_MARKER = 'foveaClaimRelation'

/** Extracts the verbatim claim stashed under `properties.foveaClaim.object`, or null. */
function readClaimStash(properties: unknown): StoredClaim | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[CLAIM_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const object = (marker as Record<string, unknown>).object
  if (object === null || typeof object !== 'object') return null
  return object as StoredClaim
}

/** Extracts the verbatim relation stashed under `properties.foveaClaimRelation.object`, or null. */
function readRelationStash(properties: unknown): StoredRelation | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[CLAIM_RELATION_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const object = (marker as Record<string, unknown>).object
  if (object === null || typeof object !== 'object') return null
  return object as StoredRelation
}

/**
 * Backfills every claim and relation that still carries the legacy stash.
 *
 * @param prisma - the Prisma client
 * @returns the number of legacy claim/relation rows migrated
 */
export async function backfillClaimsNative(prisma: PrismaClient): Promise<number> {
  let migrated = 0

  // Claims: reconstruct from the node stash, then reproject the native rows. The
  // parent link rides in the claim's residual scalar, so no parent-before-child
  // ordering is required.
  const nodes = await prisma.graphNode.findMany({ where: { nodeType: 'claim' } })
  for (const node of nodes) {
    const claim = readClaimStash(node.properties)
    if (!claim) continue

    const summary = await prisma.videoSummary.findUnique({ where: { id: claim.summaryId } })
    if (!summary) continue // an orphaned claim node whose summary is gone; skip.

    // Delete the legacy denoting annotations and the legacy node first: the
    // reprojected node reuses the same id, so the old rows must go before the
    // native ones are created.
    await prisma.layersAnnotation.deleteMany({ where: { denotesNodeId: claim.id } })
    await prisma.graphNode.delete({ where: { id: claim.id } })

    await writeClaim(
      prisma,
      { id: summary.id, videoId: summary.videoId, projectId: summary.projectId, createdBy: summary.createdBy },
      claim,
    )
    migrated += 1
  }

  // Relations: reconstruct from the edge stash, then reproject the native edge.
  const edges = await prisma.graphEdge.findMany({})
  for (const edge of edges) {
    const relation = readRelationStash(edge.properties)
    if (!relation) continue

    // Recover the source claim's project scope for the reprojected edge.
    const sourceNode = relation.sourceClaimId
      ? await prisma.graphNode.findUnique({
          where: { id: relation.sourceClaimId },
          select: { projectId: true },
        })
      : null

    await prisma.graphEdge.delete({ where: { id: relation.id } })
    await writeClaimRelation(prisma, relation, '', sourceNode?.projectId ?? null)
    migrated += 1
  }

  return migrated
}

/** Runs the backfill against the configured DATABASE_URL. */
async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const migrated = await backfillClaimsNative(prisma)
    process.stdout.write(`Backfilled ${migrated} legacy claim/relation rows to the native representation.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

// Run when executed directly; skip when imported by tests (which set VITEST /
// NODE_ENV=test), mirroring prisma/seed.ts and the ontology/world backfills.
const isTestEnvironment = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
if (!isTestEnvironment) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
