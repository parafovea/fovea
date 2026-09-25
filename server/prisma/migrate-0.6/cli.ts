/**
 * The admin CLI for the 0.5-to-0.6 data migration.
 *
 * A Fovea deployment upgraded from 0.5 keeps its legacy annotation/world/claim/
 * ontology data in the tables the 0.6.0 schema retains (the expand phase). This
 * CLI copies that data into the native layers tables through the same panproto
 * lenses and bridges the running application uses, verifies the copy is complete
 * and lossless, and records a durable marker so the guarded drop migration in a later release
 * knows the legacy tables are safe to remove (the contract phase).
 *
 * Every subcommand reads `DATABASE_URL` from the environment. The production
 * image ships this file bundled as `cli.cjs` (run `node prisma/migrate-0.6/cli.cjs
 * <subcommand>`); a source checkout runs it through tsx.
 *
 * The backend runs `auto` on every start, after `prisma migrate deploy`: it
 * copies and verifies only when the 0.5 tables hold rows and no verified copy
 * is recorded, so an upgrade needs no manual step. The other subcommands
 * (`preflight`, `export`, `dry-run`, `migrate`, `verify`, `status`, `rollback`)
 * let an admin inspect, back up, or re-drive the copy by hand.
 *
 * The copy is idempotent and resumable: a re-run before verify refreshes the
 * same rows and mints nothing new. After verify, `migrate` requires `--force`,
 * because a re-run would revert edits made in 0.6.
 *
 * @module
 */

import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

import { writeLegacyExport } from './export-legacy.js'
import { runBackfill, type BackfillReport } from './runner.js'
import {
  clearState,
  ensureStateTable,
  readState,
  recordBackfilled,
  recordVerified,
} from './state.js'
import { runVerify, type VerifyReport } from './verify.js'

/** A thrown sentinel that rolls a dry-run's transaction back after it reports. */
class DryRunRollback extends Error {
  constructor(readonly report: BackfillReport) {
    super('dry-run rollback')
  }
}

/** Parsed CLI options shared across subcommands. */
interface CliOptions {
  since?: Date
  batchSize?: number
  out?: string
  force?: boolean
}

/** The legacy source tables and the Prisma delegates that count them. */
const LEGACY_TABLES = [
  'annotation',
  'ontology',
  'worldState',
  'claim',
  'claimRelation',
  'video',
  'videoSummary',
] as const

/**
 * The five 0.5 tables whose rows exist only for the copy. Videos and summaries
 * are live 0.6 tables, so they do not signal pending 0.5 data.
 */
const COPY_SOURCE_TABLES = ['annotation', 'ontology', 'worldState', 'claim', 'claimRelation'] as const

/** The native layers tables the copy writes into, checked for presence. */
const LAYERS_TABLES = ['media', 'expression', 'layersAnnotation', 'graphNode', 'typeDef', 'layersOntology'] as const

/** Prints a line to stdout. */
function out(message: string): void {
  process.stdout.write(`${message}\n`)
}

/** Counts every legacy source table, keyed by name. */
async function legacyCounts(prisma: PrismaClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of LEGACY_TABLES) {
    // The delegate name is the table's camelCase model accessor.
    const delegate = prisma[table] as unknown as { count: () => Promise<number> }
    counts[table] = await delegate.count()
  }
  return counts
}

/** Sums the rows in the five 0.5 copy-source tables. */
async function copySourceRows(prisma: PrismaClient): Promise<number> {
  let total = 0
  for (const table of COPY_SOURCE_TABLES) {
    const delegate = prisma[table] as unknown as { count: () => Promise<number> }
    total += await delegate.count()
  }
  return total
}

/**
 * Checks that every native layers table is queryable (i.e. the 0.6 schema is
 * applied), returning the names of any that are not.
 */
async function missingLayersTables(prisma: PrismaClient): Promise<string[]> {
  const missing: string[] = []
  for (const table of LAYERS_TABLES) {
    try {
      const delegate = prisma[table] as unknown as { count: () => Promise<number> }
      await delegate.count()
    } catch {
      missing.push(table)
    }
  }
  return missing
}

/** `preflight`: confirms the DB is ready to migrate and prints what it found. */
async function preflight(prisma: PrismaClient): Promise<number> {
  await ensureStateTable(prisma)
  const missing = await missingLayersTables(prisma)
  if (missing.length > 0) {
    out(`NOT READY: the 0.6 schema is not applied (missing layers tables: ${missing.join(', ')}).`)
    out('Run `prisma migrate deploy` first, then re-run preflight.')
    return 1
  }
  const counts = await legacyCounts(prisma)
  const state = await readState(prisma)
  out('Preflight OK. The 0.6 schema is applied and the legacy tables are readable.')
  out('Legacy rows to copy:')
  for (const [table, count] of Object.entries(counts)) out(`  ${table.padEnd(16)} ${count}`)
  out(state ? `Prior migration state: ${state.phase}.` : 'No prior migration state; this is a first run.')
  return 0
}

/** `export`: writes a restorable backup of the soon-to-be-dropped legacy tables. */
async function exportLegacy(prisma: PrismaClient, options: CliOptions): Promise<number> {
  const path = options.out ?? `fovea-legacy-export-${new Date().toISOString().slice(0, 10)}.json`
  const dump = await writeLegacyExport(prisma, path)
  out(`Wrote legacy backup to ${path}.`)
  for (const [table, count] of Object.entries(dump.counts)) out(`  ${table.padEnd(16)} ${count}`)
  return 0
}

/** Prints a backfill report's per-domain and total tallies. */
function printReport(report: BackfillReport): void {
  const domains: Array<[string, { created: number; updated: number }]> = [
    ['videos', report.videos],
    ['ontologies', report.ontologies],
    ['world', report.world],
    ['summaries', report.summaries],
    ['annotations', report.annotations],
    ['claims', report.claims],
    ['TOTAL', report.total],
  ]
  for (const [name, stats] of domains) {
    out(`  ${name.padEnd(12)} created ${String(stats.created).padStart(6)}  updated ${String(stats.updated).padStart(6)}`)
  }
}

/** `dry-run`: runs the whole copy inside a transaction that is rolled back. */
async function dryRun(prisma: PrismaClient, options: CliOptions): Promise<number> {
  out('Dry run: copying inside a transaction that will be rolled back...')
  try {
    await prisma.$transaction(
      async (tx) => {
        const report = await runBackfill(tx as unknown as PrismaClient, {
          since: options.since,
          batchSize: options.batchSize,
          log: out,
        })
        throw new DryRunRollback(report)
      },
      { timeout: 60 * 60 * 1000, maxWait: 60 * 1000 },
    )
    return 0
  } catch (error) {
    if (error instanceof DryRunRollback) {
      out('Dry run complete (rolled back, nothing persisted). Would copy:')
      printReport(error.report)
      return 0
    }
    throw error
  }
}

/** Prints a verify report and returns the process exit code it implies. */
function reportVerify(report: VerifyReport): number {
  out(`Verify: ${report.roundTripped} annotation(s) round-tripped to the canonical 0.6 projection.`)
  out(`        ${report.contentChecked} world/ontology/claim object(s) reproduced faithfully by the backward read.`)
  out('Count parity:')
  for (const [name, count] of Object.entries(report.counts)) out(`  ${name.padEnd(16)} ${count}`)
  if (report.mismatches.length > 0) {
    out(`VERIFY FAILED: ${report.mismatches.length} mismatch(es):`)
    for (const message of report.mismatches) out(`  - ${message}`)
    return 1
  }
  out('VERIFY OK: no mismatches.')
  return 0
}

/**
 * `migrate`: runs the copy for real, then verifies and records the marker.
 *
 * Once the marker reads `verified` it refuses without `--force`: the copy
 * rewrites every migrated object from its 0.5 source, so a re-run after users
 * have edited in 0.6 would revert those edits.
 */
async function migrate(prisma: PrismaClient, options: CliOptions): Promise<number> {
  const missing = await missingLayersTables(prisma)
  if (missing.length > 0) {
    out(`Refusing to migrate: the 0.6 schema is not applied (missing: ${missing.join(', ')}). Run preflight.`)
    return 1
  }
  await ensureStateTable(prisma)
  const state = await readState(prisma)
  if (state?.phase === 'verified' && !options.force) {
    out('Refusing to migrate: the copy is already verified on this database.')
    out('A re-run rewrites every migrated object from its 0.5 source and reverts edits made in 0.6.')
    out('Pass --force (optionally with --since) only when no one has edited in 0.6 since the copy.')
    return 1
  }
  return copyAndVerify(prisma, options)
}

/**
 * `auto`: the startup step. Copies only when the 0.5 tables hold rows and no
 * verified copy is recorded, so fresh installs and already-migrated
 * deployments start without touching the layers store. A failed verify exits
 * non-zero, which stops the backend from starting with the legacy data intact.
 */
async function auto(prisma: PrismaClient, options: CliOptions): Promise<number> {
  const missing = await missingLayersTables(prisma)
  if (missing.length > 0) {
    out(`0.5-to-0.6 copy: the 0.6 schema is not applied (missing: ${missing.join(', ')}). Run \`prisma migrate deploy\` first.`)
    return 1
  }
  if ((await copySourceRows(prisma)) === 0) {
    out('0.5-to-0.6 copy: no 0.5 data to copy.')
    return 0
  }
  await ensureStateTable(prisma)
  const state = await readState(prisma)
  if (state?.phase === 'verified') {
    out('0.5-to-0.6 copy: already verified on this database.')
    return 0
  }
  out('0.5-to-0.6 copy: 0.5 data found and not yet migrated; copying now.')
  return copyAndVerify(prisma, options)
}

/** Runs the copy, verifies it, and records the marker; returns the exit code. */
async function copyAndVerify(prisma: PrismaClient, options: CliOptions): Promise<number> {
  out('Copying legacy data into the native layers tables...')
  const report = await runBackfill(prisma, {
    since: options.since,
    batchSize: options.batchSize,
    log: out,
  })
  printReport(report)
  await recordBackfilled(prisma, report as unknown as Parameters<typeof recordBackfilled>[1])

  out('Verifying the copy...')
  const verify = await runVerify(prisma, { since: options.since })
  const code = reportVerify(verify)
  if (code === 0) {
    await recordVerified(prisma, verify as unknown as Parameters<typeof recordVerified>[1])
    out('Recorded migration state: verified. The legacy tables are safe to drop in the release that removes them.')
  } else {
    out('Migration state left at: backfilled. Fix the mismatches and re-run `migrate` (it is idempotent).')
  }
  return code
}

/** `verify`: re-runs the verifier without copying, recording a passing result. */
async function verify(prisma: PrismaClient, options: CliOptions): Promise<number> {
  await ensureStateTable(prisma)
  const report = await runVerify(prisma, { since: options.since })
  const code = reportVerify(report)
  if (code === 0) await recordVerified(prisma, report as unknown as Parameters<typeof recordVerified>[1])
  return code
}

/** `status`: prints legacy vs layers counts and the recorded migration phase. */
async function status(prisma: PrismaClient): Promise<number> {
  await ensureStateTable(prisma)
  const state = await readState(prisma)
  out(state ? `Migration phase: ${state.phase}` : 'Migration phase: not started')
  if (state?.verifiedAt) out(`Verified at: ${state.verifiedAt.toISOString()}`)
  const missing = await missingLayersTables(prisma)
  if (missing.length === 0) {
    const counts = await legacyCounts(prisma)
    out('Legacy row counts (present until the release that removes them):')
    for (const [table, count] of Object.entries(counts)) out(`  ${table.padEnd(16)} ${count}`)
  }
  return 0
}

/**
 * `rollback`: clears the migration marker so a re-run starts fresh. It does not
 * delete the copied layers rows (the copy is idempotent, so a re-run refreshes
 * them) and it does not touch the legacy tables (they persist until the release that removes them). For
 * a full revert, restore the DB from the `export` backup or your own snapshot.
 */
async function rollback(prisma: PrismaClient): Promise<number> {
  await ensureStateTable(prisma)
  await clearState(prisma)
  out('Cleared the migration marker. Legacy tables are untouched and still present.')
  out('Re-run `migrate` to copy again, or restore from a backup for a full revert.')
  return 0
}

/** Parses `--since`, `--batch-size`, `--out`, and `--force` from the argument tail. */
function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--since') {
      if (!value) throw new Error('--since requires an ISO-8601 timestamp')
      const since = new Date(value)
      if (Number.isNaN(since.getTime())) throw new Error(`invalid --since value: ${value}`)
      options.since = since
      i += 1
    } else if (flag === '--batch-size') {
      if (!value) throw new Error('--batch-size requires a number')
      options.batchSize = Number.parseInt(value, 10)
      i += 1
    } else if (flag === '--force') {
      options.force = true
    } else if (flag === '--out') {
      if (!value) throw new Error('--out requires a file path')
      options.out = value
      i += 1
    }
  }
  return options
}

/** The subcommand table. */
const COMMANDS: Record<string, (prisma: PrismaClient, options: CliOptions) => Promise<number>> = {
  preflight: (prisma) => preflight(prisma),
  export: exportLegacy,
  'dry-run': dryRun,
  migrate,
  auto,
  verify,
  status: (prisma) => status(prisma),
  rollback: (prisma) => rollback(prisma),
}

/** CLI entry: dispatches the subcommand and exits with its code. */
async function main(): Promise<void> {
  dotenv.config()
  const [command, ...rest] = process.argv.slice(2)
  const handler = command ? COMMANDS[command] : undefined
  if (!handler) {
    out(`Usage: ${process.argv[1] ?? 'cli'} <${Object.keys(COMMANDS).join('|')}> [options]`)
    process.exitCode = command ? 1 : 0
    return
  }
  const options = parseOptions(rest)
  const prisma = new PrismaClient()
  try {
    process.exitCode = await handler(prisma, options)
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
