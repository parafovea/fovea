/**
 * Orchestrates the layers backfill across every legacy source in dependency
 * order: videos (media/expressions) first, then ontologies/typedefs, the world
 * graph, summaries/transcripts, annotations, and finally claims and their
 * relations. Each step reads legacy rows in batches, filtered by an optional
 * `--since` watermark on `updatedAt`, and upserts the mirrored layers rows. The
 * whole run is additive and idempotent: re-running mints no duplicates and never
 * mutates a legacy row.
 *
 * Run as a CLI:
 *
 * ```bash
 * tsx server/prisma/backfill/runner.ts --since 2026-01-01T00:00:00Z --batch-size 500
 * ```
 *
 * @module
 */

import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

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

/** Parses the CLI arguments into backfill options. */
function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--since') {
      const value = argv[i + 1]
      if (!value) throw new Error('--since requires an ISO-8601 timestamp')
      const since = new Date(value)
      if (Number.isNaN(since.getTime())) throw new Error(`invalid --since value: ${value}`)
      options.since = since
      i += 1
    } else if (arg === '--batch-size') {
      const value = argv[i + 1]
      const size = Number(value)
      if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`invalid --batch-size value: ${value}`)
      }
      options.batchSize = size
      i += 1
    }
  }
  return options
}

/** CLI entry: loads env, runs the backfill, prints the report, exits. */
async function main(): Promise<void> {
  dotenv.config()
  const options = parseArgs(process.argv.slice(2))
  options.log = (message) => process.stdout.write(`${message}\n`)

  const prisma = new PrismaClient()
  try {
    const report = await runBackfill(prisma, options)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
