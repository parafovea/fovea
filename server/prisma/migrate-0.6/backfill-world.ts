/**
 * Copies each legacy `world_state` row into the native layers world graph
 * through the SAME bridge the application uses — no row construction here.
 *
 * The legacy `WorldState` columns (entities / events / times / the three
 * collection buckets / relations) ARE the `WorldStateAggregate` the world lens
 * consumes, so the copy is: read the legacy row -> assemble the aggregate ->
 * `mergeWorldObjects(prisma, scope, aggregate)` (the world bridge's in-place,
 * lockVersion-guarded upsert). The bridge derives every layers id
 * deterministically and upserts each object by its own id, so a re-run refreshes
 * the same rows without colliding (idempotent and resumable).
 *
 * @module
 */

import type { PrismaClient, WorldState } from '@prisma/client'

import {
  mergeWorldObjects,
  readWorldAggregate,
  type WorldScope,
} from '../../src/services/layers-bridge/world-bridge.js'
import { worldScaffoldLayerId } from '../../src/services/layers-id-map.js'
import type { WorldStateAggregate } from '../../src/services/world-model.js'

import { idsOf, selectForCopy, type StepStats } from './helpers.js'

/** Assembles the aggregate the world lens consumes from a legacy row. */
function aggregateOf(row: WorldState): WorldStateAggregate {
  return {
    entities: (row.entities as unknown[]) ?? [],
    events: (row.events as unknown[]) ?? [],
    times: (row.times as unknown[]) ?? [],
    entityCollections: (row.entityCollections as unknown[]) ?? [],
    eventCollections: (row.eventCollections as unknown[]) ?? [],
    timeCollections: (row.timeCollections as unknown[]) ?? [],
    relations: (row.relations as unknown[]) ?? [],
  }
}

/**
 * Copies a batch of legacy world-state rows into the native world graph.
 *
 * @param prisma - the Prisma client
 * @param rows - the legacy WorldState rows
 * @returns the created/updated tally (one aggregate written per row, counted as
 *   an update when the scope's world scaffold already existed)
 */
export async function backfillWorldStates(
  prisma: PrismaClient,
  rows: WorldState[],
  since?: Date,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const row of rows) {
    const scope: WorldScope = { userId: row.userId, projectId: row.projectId }
    const scaffoldId = worldScaffoldLayerId(row.userId, row.projectId)
    const existed = (await prisma.annotationLayer.count({ where: { id: scaffoldId } })) > 0
    // A catch-up writes only the objects 0.5 changed since the watermark, so an
    // object edited in 0.6 but not in 0.5 keeps its layers version.
    const legacy = aggregateOf(row)
    const current = since === undefined ? null : (await readWorldAggregate(prisma, scope)).aggregate
    const selected = Object.fromEntries(
      Object.entries(legacy).map(([bucket, objects]) => [
        bucket,
        selectForCopy(objects, idsOf(current?.[bucket as keyof WorldStateAggregate]), since),
      ]),
    ) as unknown as WorldStateAggregate
    await mergeWorldObjects(prisma, scope, selected)
    existed ? (stats.updated += 1) : (stats.created += 1)
  }
  return stats
}
