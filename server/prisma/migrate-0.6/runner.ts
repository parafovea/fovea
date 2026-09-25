/**
 * Orchestrates the layers backfill across every legacy source in dependency
 * order: videos (media/expressions) first, then ontologies/typedefs, the world
 * graph, summaries/transcripts, annotations, and finally claims and their
 * relations. Each step reads legacy rows in batches, filtered by an optional
 * `--since` watermark on `updatedAt`, and upserts the mirrored layers rows. The
 * whole run is additive and idempotent: re-running mints no duplicates and never
 * mutates a legacy row.
 *
 * The admin CLI (`cli.ts`) drives it through the `dry-run` and `migrate`
 * subcommands.
 *
 * @module
 */

import type { PrismaClient } from '@prisma/client'
import { backfillVideos } from './backfill-videos.js'
import { backfillOntologies } from './backfill-ontologies.js'
import { backfillWorldStates } from './backfill-world.js'
import { backfillSummaries } from './backfill-summaries.js'
import { backfillAnnotations } from './backfill-annotations.js'
import { backfillClaims } from './backfill-claims.js'
import { addStats, type StepStats } from './helpers.js'

/** Options controlling a backfill run. */
export interface BackfillOptions {
  /** Only process legacy rows updated at or after this instant. */
  since?: Date
  /** Rows read per page from each source. */
  batchSize?: number
  /** Sink for progress logging; defaults to a no-op. */
  log?: (message: string) => void
}

/** The per-step and total tallies a backfill run produces. */
export interface BackfillReport {
  videos: StepStats
  ontologies: StepStats
  world: StepStats
  summaries: StepStats
  annotations: StepStats
  claims: StepStats
  total: StepStats
}

/** A `findMany`-shaped page fetch: rows ordered by id, offset and limited. */
type PageFetch<T> = (skip: number, take: number) => Promise<T[]>

/**
 * Streams a source in id-ordered pages until it is exhausted, applying `handle`
 * to each page and folding its tally into the accumulator.
 */
async function foldPages<T>(
  fetch: PageFetch<T>,
  batchSize: number,
  handle: (rows: T[]) => Promise<StepStats>,
  into: StepStats,
): Promise<void> {
  let skip = 0
  for (;;) {
    const rows = await fetch(skip, batchSize)
    if (rows.length === 0) break
    addStats(into, await handle(rows))
    if (rows.length < batchSize) break
    skip += rows.length
  }
}

/**
 * Runs the full backfill against a Prisma client.
 *
 * @param prisma - the Prisma client
 * @param options - watermark, batch size, and logging
 * @returns the per-step and total tallies
 */
export async function runBackfill(
  prisma: PrismaClient,
  options: BackfillOptions = {},
): Promise<BackfillReport> {
  const batchSize = options.batchSize ?? 500
  const log = options.log ?? (() => undefined)
  const sinceFilter = options.since ? { updatedAt: { gte: options.since } } : {}

  const report: BackfillReport = {
    videos: { created: 0, updated: 0 },
    ontologies: { created: 0, updated: 0 },
    world: { created: 0, updated: 0 },
    summaries: { created: 0, updated: 0 },
    annotations: { created: 0, updated: 0 },
    claims: { created: 0, updated: 0 },
    total: { created: 0, updated: 0 },
  }

  log('Step 1/6: videos -> media + expressions')
  await foldPages(
    (skip, take) =>
      prisma.video.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    (rows) => backfillVideos(prisma, rows),
    report.videos,
  )

  log('Step 2/6: ontologies -> layers ontologies + typedefs')
  await foldPages(
    (skip, take) =>
      prisma.ontology.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    (rows) => backfillOntologies(prisma, rows),
    report.ontologies,
  )

  log('Step 3/6: world states -> graph nodes + edges')
  await foldPages(
    (skip, take) =>
      prisma.worldState.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    (rows) => backfillWorldStates(prisma, rows),
    report.world,
  )

  log('Step 4/6: summaries -> audio media + transcript + speaker tier')
  await foldPages(
    (skip, take) =>
      prisma.videoSummary.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    (rows) => backfillSummaries(prisma, rows),
    report.summaries,
  )

  log('Step 5/6: annotations -> annotation layers + layers annotations')
  await foldPages(
    (skip, take) =>
      prisma.annotation.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    (rows) => backfillAnnotations(prisma, rows),
    report.annotations,
  )

  log('Step 6/6: claims -> claim nodes + spans + relation edges')
  await foldPages(
    (skip, take) =>
      prisma.claim.findMany({ where: sinceFilter, orderBy: { id: 'asc' }, skip, take }),
    batchSize,
    async (claims) => {
      const claimIds = claims.map((claim) => claim.id)
      const relations = await prisma.claimRelation.findMany({
        where: { sourceClaimId: { in: claimIds } },
        orderBy: { id: 'asc' },
      })
      return backfillClaims(prisma, claims, relations)
    },
    report.claims,
  )

  for (const step of [
    report.videos,
    report.ontologies,
    report.world,
    report.summaries,
    report.annotations,
    report.claims,
  ]) {
    addStats(report.total, step)
  }

  return report
}

/**
 * Alias for {@link runBackfill}: the whole 0.5->0.6 copy in dependency order.
 * The admin CLI imports this name.
 */
export const runFullMigration = runBackfill
