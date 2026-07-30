/**
 * World-state bridge over the unified layers store.
 *
 * Reconstructs the WorldState aggregate the `/api/world` contract exchanges from
 * the native layers rows (GraphNode + GraphEdge + catalog collections/memberships +
 * world-denoting
 * LayersAnnotations) and materializes an aggregate back into them. Reads read the
 * layers store only; writes prune the scope's world rows and recreate them, or
 * merge in place under each row's version guard. This is the persistence
 * primitive the export, import, sharing, and persona-cleanup paths share,
 * mirroring the structure of `world-state-service.ts`.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import {
  isWorldEdge,
  emptyWorldState,
  personalWorldStateId,
  WORLD_NODE_TYPES,
  type WorldStateAggregate,
} from '../world-model.js'
import { worldStateToLayersViaLens, layersToWorldStateViaLens } from '../layers-lens/world-lens.js'
import { readWorldRows, pruneWorldRows, createWorldProjection, upsertWorldProjection } from './world-store.js'
import { type PrismaLike } from './util.js'

/** The scope a personal world's rows are keyed by. */
export interface WorldScope {
  userId: string
  projectId: string | null
}

/** A reconstructed world aggregate plus whether any backing rows existed. */
export interface WorldRead {
  aggregate: WorldStateAggregate
  exists: boolean
}

/** The layers scope columns a WorldScope resolves to. */
function layersScope(scope: WorldScope): { createdByUserId: string | null; projectId: string | null } {
  return { createdByUserId: scope.userId, projectId: scope.projectId }
}

/**
 * Reads a scope's world aggregate from the layers store.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning user id and project scope
 * @returns the reconstructed aggregate and whether any backing rows existed
 */
export async function readWorldAggregate(prisma: PrismaLike, scope: WorldScope): Promise<WorldRead> {
  const { rows, exists } = await readWorldRows(prisma, layersScope(scope))
  return exists ? { aggregate: await layersToWorldStateViaLens(rows), exists } : { aggregate: emptyWorldState(), exists }
}

/**
 * Writes a scope's world aggregate to the layers store: prunes the scope's
 * existing world rows, then recreates them from the aggregate.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning user id and project scope
 * @param aggregate - the world state to persist
 */
export async function writeWorldAggregate(
  prisma: PrismaLike,
  scope: WorldScope,
  aggregate: WorldStateAggregate,
): Promise<void> {
  const layers = layersScope(scope)
  await pruneWorldRows(prisma, layers)
  await createWorldProjection(prisma, await worldStateToLayersViaLens(aggregate, layers))
}

/**
 * Merges a world aggregate into a scope's rows in place, guarded by each row's
 * `lockVersion`. Rows the aggregate does not mention are left untouched, so a
 * concurrently-added object is never dropped. A same-object compare-and-swap miss
 * throws {@link ConflictError} rather than retrying, so an enclosing
 * `prisma.$transaction` rolls the whole compound write back rather than partially
 * reapplying a stale value. This is the version-guarded world write the
 * persona/type-deletion cleanup routes through, keeping the world write atomic
 * with its ontology and annotation cleanup.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning user id and project scope
 * @param aggregate - the world objects to upsert in place
 * @throws {ConflictError} when a same-object edit lost a concurrent race
 */
export async function mergeWorldObjects(
  prisma: PrismaLike,
  scope: WorldScope,
  aggregate: WorldStateAggregate,
): Promise<void> {
  const layers = layersScope(scope)
  await upsertWorldProjection(prisma, layers, await worldStateToLayersViaLens(aggregate, layers), 1)
}

/**
 * Resolves the owner user id of a personal world from its synthetic world-state
 * id. The `/api/world` response reports a personal world under the deterministic
 * {@link personalWorldStateId}, so a share keyed by that id resolves to its owner.
 *
 * @param prisma - the Prisma client
 * @param worldStateId - the world-state id to resolve
 * @returns the owner user id, or null when it resolves to no personal world
 */
export async function resolvePersonalWorldOwner(
  prisma: PrismaClient,
  worldStateId: string,
): Promise<string | null> {
  const worldNodes = await prisma.graphNode.findMany({
    where: { projectId: null, nodeType: { in: [...WORLD_NODE_TYPES] } },
  })
  const owners = new Set(worldNodes.map((n) => n.createdByUserId).filter((id): id is string => id !== null))
  for (const owner of owners) {
    if (personalWorldStateId(owner) === worldStateId) return owner
  }
  return null
}

/**
 * Extracts world-object ids from every scope's world rows across the store, for
 * import conflict detection. World-object ids are the row keys directly — a node's
 * id (entity/situation/time), a catalog collection's id, a relation edge's id
 * — so an imported id colliding with any existing world object is detected without
 * reconstructing the aggregate.
 *
 * @param prisma - the Prisma client
 * @returns the global id sets by bucket
 */
export async function readAllWorldObjectIds(prisma: PrismaClient): Promise<{
  entityIds: Set<string>
  eventIds: Set<string>
  timeIds: Set<string>
  collectionIds: Set<string>
  relationIds: Set<string>
}> {
  const entityIds = new Set<string>()
  const eventIds = new Set<string>()
  const timeIds = new Set<string>()
  const collectionIds = new Set<string>()
  const relationIds = new Set<string>()

  const nodes = await prisma.graphNode.findMany({ where: { nodeType: { in: [...WORLD_NODE_TYPES] } } })
  for (const node of nodes) {
    if (node.nodeType === 'entity' || node.nodeType === 'location') entityIds.add(node.id)
    else if (node.nodeType === 'situation') eventIds.add(node.id)
    else if (node.nodeType === 'time') timeIds.add(node.id)
  }
  // Collections are the catalog collections across all world scopes.
  const collections = await prisma.catalogCollection.findMany({})
  for (const collection of collections) collectionIds.add(collection.id)
  // Relations are the endpoint-kind-tagged world edges.
  const edges = (await prisma.graphEdge.findMany({})).filter(isWorldEdge)
  for (const edge of edges) relationIds.add(edge.id)

  return { entityIds, eventIds, timeIds, collectionIds, relationIds }
}
