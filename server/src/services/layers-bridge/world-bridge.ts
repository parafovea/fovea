/**
 * World-state bridge over the unified layers store.
 *
 * Reconstructs the WorldState aggregate the `/api/world` contract exchanges from
 * the layers graph (GraphNode + GraphEdge), and materializes an aggregate back
 * into it. Reads read the layers store only; writes prune the scope's world rows
 * and recreate them from the aggregate. This is the persistence primitive the
 * export, import, sharing, and persona-cleanup paths share, mirroring the
 * structure of `world-state-service.ts`.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import { ConflictError } from '../../lib/errors.js'
import {
  worldStateToLayers,
  layersToWorldState,
  isWorldRow,
  emptyWorldState,
  personalWorldStateId,
  type WorldStateAggregate,
} from '../world-layers-mapper.js'
import { toJson, type PrismaLike } from './util.js'

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

/**
 * Reads a scope's world aggregate from the layers store.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning user id and project scope
 * @returns the reconstructed aggregate and whether any backing rows existed
 */
export async function readWorldAggregate(
  prisma: PrismaLike,
  scope: WorldScope,
): Promise<WorldRead> {
  const where = { createdByUserId: scope.userId, projectId: scope.projectId }
  const nodes = (await prisma.graphNode.findMany({ where })).filter(isWorldRow)
  const edges = (await prisma.graphEdge.findMany({ where })).filter(isWorldRow)

  if (nodes.length > 0 || edges.length > 0) {
    return { aggregate: layersToWorldState(nodes, edges), exists: true }
  }

  return { aggregate: emptyWorldState(), exists: false }
}

/**
 * Writes a scope's world aggregate to the layers store: prunes the scope's
 * existing world rows, then recreates nodes and edges from the aggregate.
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
  const where = { createdByUserId: scope.userId, projectId: scope.projectId }
  const existingNodes = (await prisma.graphNode.findMany({ where })).filter(isWorldRow)
  for (const node of existingNodes) await prisma.graphNode.delete({ where: { id: node.id } })
  const existingEdges = (await prisma.graphEdge.findMany({ where })).filter(isWorldRow)
  for (const edge of existingEdges) await prisma.graphEdge.delete({ where: { id: edge.id } })

  const { nodes, edges } = worldStateToLayers(aggregate, {
    projectId: scope.projectId,
    createdByUserId: scope.userId,
  })

  for (const node of nodes) {
    await prisma.graphNode.create({
      data: {
        id: node.id,
        nodeType: node.nodeType,
        label: node.label,
        properties: toJson(node.properties),
        knowledgeRefs: toJson(node.knowledgeRefs),
        projectId: node.projectId,
        createdByUserId: node.createdByUserId,
      },
    })
  }
  for (const edge of edges) {
    await prisma.graphEdge.create({
      data: {
        id: edge.id,
        source: toJson(edge.source) as Prisma.InputJsonValue,
        target: toJson(edge.target) as Prisma.InputJsonValue,
        sourceLocalId: edge.sourceLocalId,
        targetLocalId: edge.targetLocalId,
        edgeType: edge.edgeType,
        label: edge.label,
        properties: toJson(edge.properties),
        projectId: edge.projectId,
        createdByUserId: edge.createdByUserId,
      },
    })
  }
}

/**
 * Merges a world aggregate into a scope's rows in place, guarded by each row's
 * `lockVersion`: every object is upserted as its own GraphNode/GraphEdge row
 * (created when new, updated under a compare-and-swap when it already exists).
 * Rows the aggregate does not mention are left untouched, so a concurrently-added
 * object is never dropped. A same-object CAS miss (a concurrent writer advanced
 * the row's `lockVersion`) throws {@link ConflictError} rather than retrying, so
 * an enclosing `prisma.$transaction` rolls the whole compound write back rather
 * than partially reapplying a stale value. This is the version-guarded world
 * write the persona/type-deletion cleanup routes through, keeping the world write
 * atomic with its ontology and annotation cleanup.
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
  const where = { createdByUserId: scope.userId, projectId: scope.projectId }
  const existingNodes = new Map(
    (await prisma.graphNode.findMany({ where })).filter(isWorldRow).map((n) => [n.id, n]),
  )
  const existingEdges = new Map(
    (await prisma.graphEdge.findMany({ where })).filter(isWorldRow).map((e) => [e.id, e]),
  )
  const { nodes, edges } = worldStateToLayers(aggregate, {
    projectId: scope.projectId,
    createdByUserId: scope.userId,
  })

  for (const node of nodes) {
    const existing = existingNodes.get(node.id)
    if (existing) {
      const result = await prisma.graphNode.updateMany({
        where: { id: node.id, lockVersion: existing.lockVersion },
        data: {
          nodeType: node.nodeType,
          label: node.label,
          properties: toJson(node.properties),
          knowledgeRefs: toJson(node.knowledgeRefs),
          lockVersion: { increment: 1 },
        },
      })
      if (result.count !== 1) throw new ConflictError('World state update conflicted')
    } else {
      await prisma.graphNode.create({
        data: {
          id: node.id,
          nodeType: node.nodeType,
          label: node.label,
          properties: toJson(node.properties),
          knowledgeRefs: toJson(node.knowledgeRefs),
          projectId: node.projectId,
          createdByUserId: node.createdByUserId,
        },
      })
    }
  }

  for (const edge of edges) {
    const existing = existingEdges.get(edge.id)
    if (existing) {
      const result = await prisma.graphEdge.updateMany({
        where: { id: edge.id, lockVersion: existing.lockVersion },
        data: {
          source: toJson(edge.source) as Prisma.InputJsonValue,
          target: toJson(edge.target) as Prisma.InputJsonValue,
          sourceLocalId: edge.sourceLocalId,
          targetLocalId: edge.targetLocalId,
          edgeType: edge.edgeType,
          label: edge.label,
          properties: toJson(edge.properties),
          lockVersion: { increment: 1 },
        },
      })
      if (result.count !== 1) throw new ConflictError('World state update conflicted')
    } else {
      await prisma.graphEdge.create({
        data: {
          id: edge.id,
          source: toJson(edge.source) as Prisma.InputJsonValue,
          target: toJson(edge.target) as Prisma.InputJsonValue,
          sourceLocalId: edge.sourceLocalId,
          targetLocalId: edge.targetLocalId,
          edgeType: edge.edgeType,
          label: edge.label,
          properties: toJson(edge.properties),
          projectId: edge.projectId,
          createdByUserId: edge.createdByUserId,
        },
      })
    }
  }
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
  const worldNodes = (await prisma.graphNode.findMany({ where: { projectId: null } })).filter(isWorldRow)
  const owners = new Set(
    worldNodes.map((n) => n.createdByUserId).filter((id): id is string => id !== null),
  )
  for (const owner of owners) {
    if (personalWorldStateId(owner) === worldStateId) return owner
  }
  return null
}

/**
 * Extracts world-object ids from every scope's world rows across the store, for
 * import conflict detection. Scans the layers graph world nodes so an imported id
 * colliding with any existing world object is detected.
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

  const addId = (bucket: Set<string>, object: unknown): void => {
    if (object && typeof object === 'object' && 'id' in object) {
      const id = (object as { id: unknown }).id
      if (typeof id === 'string') bucket.add(id)
    }
  }
  const collect = (aggregate: WorldStateAggregate): void => {
    for (const object of aggregate.entities) addId(entityIds, object)
    for (const object of aggregate.events) addId(eventIds, object)
    for (const object of aggregate.times) addId(timeIds, object)
    for (const object of aggregate.entityCollections) addId(collectionIds, object)
    for (const object of aggregate.eventCollections) addId(collectionIds, object)
    for (const object of aggregate.timeCollections) addId(collectionIds, object)
    for (const object of aggregate.relations) addId(relationIds, object)
  }

  const worldNodes = (await prisma.graphNode.findMany({})).filter(isWorldRow)
  const worldEdges = (await prisma.graphEdge.findMany({})).filter(isWorldRow)
  // Group the layers world rows by scope so each aggregate reconstructs from a
  // single scope's rows and its stashed bucket indices stay coherent.
  const scopeKey = (row: { createdByUserId: string | null; projectId: string | null }): string =>
    `${row.createdByUserId ?? ''}::${row.projectId ?? ''}`
  const nodesByScope = new Map<string, typeof worldNodes>()
  const edgesByScope = new Map<string, typeof worldEdges>()
  for (const node of worldNodes) {
    const key = scopeKey(node)
    ;(nodesByScope.get(key) ?? nodesByScope.set(key, []).get(key)!).push(node)
  }
  for (const edge of worldEdges) {
    const key = scopeKey(edge)
    ;(edgesByScope.get(key) ?? edgesByScope.set(key, []).get(key)!).push(edge)
  }
  const scopes = new Set([...nodesByScope.keys(), ...edgesByScope.keys()])
  for (const key of scopes) {
    collect(layersToWorldState(nodesByScope.get(key) ?? [], edgesByScope.get(key) ?? []))
  }

  return { entityIds, eventIds, timeIds, collectionIds, relationIds }
}
