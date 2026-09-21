/**
 * Exports the legacy 0.5 tables the 0.6.1 contract migration will drop, so an
 * admin holds a restorable backup taken with the same client the copy reads.
 *
 * The five dropped tables are the legacy annotation models — `Annotation`,
 * `WorldState`, `Ontology`, `Claim`, and `ClaimRelation`. Videos, summaries, and
 * personas survive into 0.6 and are not exported here. The dump is a single JSON
 * object keyed by table, each holding its full row array, written atomically to
 * the target path.
 *
 * @module
 */

import { writeFile } from 'node:fs/promises'

import type { PrismaClient } from '@prisma/client'

/** The exported backup: every legacy row that the contract migration will drop. */
export interface LegacyExport {
  exportedAt: string
  counts: Record<string, number>
  tables: {
    annotations: unknown[]
    worldStates: unknown[]
    ontologies: unknown[]
    claims: unknown[]
    claimRelations: unknown[]
  }
}

/** Reads every row of the five soon-to-be-dropped legacy tables. */
export async function collectLegacyExport(prisma: PrismaClient): Promise<LegacyExport> {
  const [annotations, worldStates, ontologies, claims, claimRelations] = await Promise.all([
    prisma.annotation.findMany({ orderBy: { id: 'asc' } }),
    prisma.worldState.findMany({ orderBy: { id: 'asc' } }),
    prisma.ontology.findMany({ orderBy: { id: 'asc' } }),
    prisma.claim.findMany({ orderBy: { id: 'asc' } }),
    prisma.claimRelation.findMany({ orderBy: { id: 'asc' } }),
  ])
  return {
    exportedAt: new Date().toISOString(),
    counts: {
      annotations: annotations.length,
      worldStates: worldStates.length,
      ontologies: ontologies.length,
      claims: claims.length,
      claimRelations: claimRelations.length,
    },
    tables: { annotations, worldStates, ontologies, claims, claimRelations },
  }
}

/** Collects the legacy export and writes it to `path` as pretty JSON. */
export async function writeLegacyExport(prisma: PrismaClient, path: string): Promise<LegacyExport> {
  const dump = await collectLegacyExport(prisma)
  await writeFile(path, `${JSON.stringify(dump, null, 2)}\n`, 'utf8')
  return dump
}
