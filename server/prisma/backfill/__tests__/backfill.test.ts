/**
 * Integration test for the layers backfill against a real Postgres.
 *
 * Seeds one representative row of every legacy source, runs the backfill scoped
 * to those rows by an `updatedAt` watermark, verifies the annotation frames
 * round-trip bit-exactly and every model reaches count parity, then re-runs the
 * backfill and asserts idempotency (no duplicate rows). All fixture and layers
 * rows are torn down in reverse foreign-key order so the shared dev database's
 * existing videos are untouched and re-runs are stable.
 *
 * @module
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

import { runBackfill } from '../runner.js'
import { runVerify } from '../verify.js'
import { to1000 } from '../../../src/services/layers-conversion-service.js'
import {
  expressionTranscriptId,
  expressionVideoId,
  expressionVideoMetadataTextId,
  mediaAudioId,
  mediaVideoId,
  reuseAnnotationId,
} from '../id-map.js'
import { seedLegacyFixture, cleanupFixture, type LegacyFixture } from './fixtures.js'

// The backfill CLI loads env from `.env`; the test does the same so the
// standalone Prisma client picks up DATABASE_URL for the local Postgres.
dotenv.config()

/** A fixture-scoped tally of the layers rows the backfill produces. */
interface LayersCounts {
  media: number
  expression: number
  segmentation: number
  tokenization: number
  annotationLayer: number
  layersAnnotation: number
  clusterSet: number
  graphNode: number
  graphEdge: number
  typeDef: number
  layersOntology: number
}

/** Snapshots the fixture-scoped layers row counts for the idempotency check. */
async function snapshotCounts(prisma: PrismaClient, fixture: LegacyFixture): Promise<LayersCounts> {
  const { userId, videoId } = fixture
  const [
    media,
    expression,
    segmentation,
    tokenization,
    annotationLayer,
    layersAnnotation,
    clusterSet,
    graphNode,
    graphEdge,
    typeDef,
    layersOntology,
  ] = await Promise.all([
    prisma.media.count({ where: { videoId } }),
    prisma.expression.count({ where: { videoId } }),
    prisma.segmentation.count({ where: { expression: { videoId } } }),
    prisma.tokenization.count({ where: { expression: { videoId } } }),
    prisma.annotationLayer.count({ where: { createdByUserId: userId } }),
    prisma.layersAnnotation.count({ where: { createdByUserId: userId } }),
    prisma.clusterSet.count({ where: { createdByUserId: userId } }),
    prisma.graphNode.count({ where: { createdByUserId: userId } }),
    prisma.graphEdge.count({ where: { createdByUserId: userId } }),
    prisma.typeDef.count({ where: { createdByUserId: userId } }),
    prisma.layersOntology.count({ where: { createdByUserId: userId } }),
  ])
  return {
    media,
    expression,
    segmentation,
    tokenization,
    annotationLayer,
    layersAnnotation,
    clusterSet,
    graphNode,
    graphEdge,
    typeDef,
    layersOntology,
  }
}

describe('layers backfill', () => {
  let prisma: PrismaClient
  let fixture: LegacyFixture
  // Watermark just before seeding so the backfill/verify only touch fixture rows
  // and leave the dev database's pre-existing videos alone.
  const since = new Date(Date.now() - 5000)

  beforeAll(async () => {
    prisma = new PrismaClient()
    fixture = await seedLegacyFixture(prisma)
  })

  afterAll(async () => {
    if (fixture) await cleanupFixture(prisma, fixture)
    await prisma.$disconnect()
  })

  it('backfills, round-trips annotation frames, and reaches count parity', async () => {
    const report = await runBackfill(prisma, { since })
    expect(report.total.created).toBeGreaterThan(0)

    // Every legacy source produced its layers rows.
    expect(await prisma.media.count({ where: { id: mediaVideoId(fixture.videoId) } })).toBe(1)
    expect(await prisma.media.count({ where: { id: mediaAudioId(fixture.summaryId) } })).toBe(1)
    expect(await prisma.expression.count({ where: { id: expressionVideoId(fixture.videoId) } })).toBe(1)
    expect(
      await prisma.expression.count({ where: { id: expressionVideoMetadataTextId(fixture.videoId) } }),
    ).toBe(1)
    expect(
      await prisma.expression.count({ where: { id: expressionTranscriptId(fixture.summaryId) } }),
    ).toBe(1)

    // The ontology mapped to one LayersOntology and four TypeDefs (one per bucket).
    expect(await prisma.layersOntology.count({ where: { personaId: fixture.personaId } })).toBe(1)
    expect(await prisma.typeDef.count({ where: { createdByUserId: fixture.userId } })).toBe(4)
    expect(await prisma.typeDef.count({ where: { id: fixture.entityTypeId, typeKind: 'entity-type' } })).toBe(1)
    expect(await prisma.typeDef.count({ where: { id: fixture.eventTypeId, typeKind: 'situation-type' } })).toBe(1)
    expect(await prisma.typeDef.count({ where: { id: fixture.roleTypeId, typeKind: 'role-type' } })).toBe(1)
    expect(
      await prisma.typeDef.count({ where: { id: fixture.relationTypeId, typeKind: 'relation-type' } }),
    ).toBe(1)

    // World objects became graph nodes (entity, situation), and the relation an edge.
    const entityNode = await prisma.graphNode.findUnique({ where: { id: fixture.entityId } })
    expect(entityNode?.nodeType).toBe('entity')
    const eventNode = await prisma.graphNode.findUnique({ where: { id: fixture.eventId } })
    expect(eventNode?.nodeType).toBe('situation')
    expect(await prisma.graphEdge.count({ where: { id: fixture.worldRelationId } })).toBe(1)

    // The claims became claim nodes and the claim relation an edge.
    const claimNode = await prisma.graphNode.findUnique({ where: { id: fixture.claimAId } })
    expect(claimNode?.nodeType).toBe('claim')
    expect(await prisma.graphNode.count({ where: { id: fixture.claimBId, nodeType: 'claim' } })).toBe(1)
    expect(await prisma.graphEdge.count({ where: { id: fixture.claimRelationId } })).toBe(1)

    // The annotation produced exactly one LayersAnnotation that denotes the
    // entity node and carries the confidence on the 0-1000 scale.
    const layersAnnotation = await prisma.layersAnnotation.findUnique({
      where: { id: reuseAnnotationId(fixture.annotationId) },
    })
    expect(layersAnnotation).not.toBeNull()
    expect(layersAnnotation?.denotesNodeId).toBe(fixture.entityId)
    expect(layersAnnotation?.confidence).toBe(to1000(0.87))

    // Verify: frames round-trip bit-exactly and every model reaches count parity.
    const verifyReport = await runVerify(prisma, { since })
    expect(verifyReport.mismatches).toEqual([])
    expect(verifyReport.roundTripped).toBe(1)
    expect(verifyReport.counts.annotations).toBe(1)
    expect(verifyReport.counts.ontologyTypes).toBe(4)
    expect(verifyReport.counts.worldObjects).toBe(2)
    expect(verifyReport.counts.claims).toBe(2)
    expect(verifyReport.counts.videos).toBe(1)
  })

  it('is idempotent: re-running produces no duplicate rows', async () => {
    const before = await snapshotCounts(prisma, fixture)
    const rerun = await runBackfill(prisma, { since })
    const after = await snapshotCounts(prisma, fixture)

    // A re-run mints nothing new and only refreshes existing rows in place.
    expect(after).toEqual(before)
    expect(rerun.total.created).toBe(0)

    // Verify still passes after the second run.
    const verifyReport = await runVerify(prisma, { since })
    expect(verifyReport.mismatches).toEqual([])
    expect(verifyReport.roundTripped).toBe(1)
  })

  it('verify reports a mismatch when a produced row is missing, then heals on re-run', async () => {
    // Drop the backfilled annotation row: the verifier must notice the broken
    // count parity so the CLI can exit non-zero on it.
    await prisma.layersAnnotation.delete({ where: { id: reuseAnnotationId(fixture.annotationId) } })

    const broken = await runVerify(prisma, { since })
    expect(broken.mismatches.length).toBeGreaterThan(0)
    expect(broken.mismatches.some((message) => message.includes(fixture.annotationId))).toBe(true)
    expect(broken.roundTripped).toBe(0)

    // Re-running the backfill restores the row, and verify goes green again.
    await runBackfill(prisma, { since })
    const healed = await runVerify(prisma, { since })
    expect(healed.mismatches).toEqual([])
    expect(healed.roundTripped).toBe(1)
  })
})
