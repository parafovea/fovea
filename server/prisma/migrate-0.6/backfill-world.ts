/**
 * Copies each legacy `world_state` row into the native layers world graph
 * through the SAME lens + bridge the application uses — no row construction here.
 *
 * The legacy `WorldState` columns (entities / events / times / the three
 * collection buckets / relations) ARE the `WorldStateAggregate` the world lens
 * consumes, so the copy is: read the legacy row -> assemble the aggregate ->
 * `worldStateToLayers(aggregate, scope)` (the panproto world lens) ->
 * `createWorldProjection(prisma, projection)` (the world bridge writer). The
 * writer derives every layers id deterministically, so a re-run upserts the same
 * rows (idempotent).
 *
 * @module
 */

import type { PrismaClient, WorldState } from '@prisma/client'

import { worldStateToLayersViaLens } from '../../src/services/layers-lens/world-lens.js'
import type { WorldStateAggregate, WorldLayersScope } from '../../src/services/world-model.js'
import { createWorldProjection } from '../../src/services/layers-bridge/world-store.js'

import type { StepStats } from './helpers.js'

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
 * @returns the created/updated tally (one aggregate written per row)
 */
export async function backfillWorldStates(
  prisma: PrismaClient,
  rows: WorldState[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const row of rows) {
    const scope: WorldLayersScope = { projectId: row.projectId, createdByUserId: row.userId }
    const projection = await worldStateToLayersViaLens(aggregateOf(row), scope)
    await createWorldProjection(prisma, projection)
    stats.created += 1
  }
  return stats
}
