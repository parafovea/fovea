/**
 * The 0.5-to-0.6 migration's durable state marker.
 *
 * A single-row `_layers_migration_state` table records how far the upgrade has
 * progressed: `backfilled` once the copy has run, `verified` once the verifier
 * has passed with zero mismatches. The guarded 0.6.1 contract migration (which
 * drops the legacy tables) reads this row and refuses to run until it reads
 * `verified`, so the legacy data is never dropped before its native copy is
 * proven. The table lives outside the Prisma model set: it is migration
 * infrastructure, created on demand by the CLI rather than by a schema model.
 *
 * @module
 */

import { Prisma, type PrismaClient } from '@prisma/client'

/** The phase the migration has reached. */
export type MigrationPhase = 'backfilled' | 'verified'

/** The single marker row. */
export interface MigrationState {
  phase: MigrationPhase
  backfilledAt: Date | null
  verifiedAt: Date | null
  report: Prisma.JsonValue | null
}

/** A Prisma client or an interactive-transaction client. */
type Client = Pick<PrismaClient, '$executeRawUnsafe' | '$queryRaw' | '$executeRaw'>

/** Creates the marker table if it does not exist. Safe to call repeatedly. */
export async function ensureStateTable(prisma: Client): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_layers_migration_state" (
      "id" INTEGER PRIMARY KEY DEFAULT 1,
      "phase" TEXT NOT NULL,
      "backfilledAt" TIMESTAMPTZ,
      "verifiedAt" TIMESTAMPTZ,
      "report" JSONB,
      CONSTRAINT "_layers_migration_state_single_row" CHECK ("id" = 1)
    )
  `)
}

/** Reads the marker row, or null when the migration has not started. */
export async function readState(prisma: Client): Promise<MigrationState | null> {
  const rows = await prisma.$queryRaw<
    Array<{ phase: MigrationPhase; backfilledAt: Date | null; verifiedAt: Date | null; report: Prisma.JsonValue | null }>
  >(Prisma.sql`
    SELECT "phase", "backfilledAt", "verifiedAt", "report"
    FROM "_layers_migration_state" WHERE "id" = 1
  `)
  return rows[0] ?? null
}

/** Records that the copy has run, preserving any prior verified timestamp. */
export async function recordBackfilled(prisma: Client, report: Prisma.InputJsonValue): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "_layers_migration_state" ("id", "phase", "backfilledAt", "report")
    VALUES (1, 'backfilled', now(), ${report})
    ON CONFLICT ("id") DO UPDATE
      SET "phase" = 'backfilled', "backfilledAt" = now(), "report" = ${report}
  `)
}

/** Records that the verifier passed with zero mismatches. */
export async function recordVerified(prisma: Client, report: Prisma.InputJsonValue): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "_layers_migration_state" ("id", "phase", "backfilledAt", "verifiedAt", "report")
    VALUES (1, 'verified', now(), now(), ${report})
    ON CONFLICT ("id") DO UPDATE
      SET "phase" = 'verified', "verifiedAt" = now(), "report" = ${report}
  `)
}

/** Clears the marker so a fresh run starts from nothing (used by rollback). */
export async function clearState(prisma: Client): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM "_layers_migration_state" WHERE "id" = 1`)
}
