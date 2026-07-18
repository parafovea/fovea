/**
 * Native persistence for the world surface over the unified layers store.
 *
 * A WorldState aggregate projects to GraphNodes (entities/locations/situations/
 * times), GraphEdges (relations + instance-of type assignments), ClusterSets
 * (collections), and world-denoting LayersAnnotations (temporal/spatial values,
 * event interpretations) hung off a per-scope scaffold Expression + layer. This
 * module owns reading those rows back, pruning them, and materializing a
 * projection — shared by the world service and the world bridge so both persist
 * the world the same way.
 *
 * World rows are discriminated structurally, not by a marker blob: nodes by
 * `nodeType`, edges by the `fovea.edgeRole` feature tag, clusters by their
 * `fovea.bucket` feature tag, annotations by the deterministic scaffold layer.
 *
 * @module
 */

import { Prisma } from '@prisma/client'

import { worldScaffoldExpressionId, worldScaffoldLayerId } from '../layers-id-map.js'
import {
  WORLD_NODE_TYPES,
  isWorldEdge,
  worldClusterBucket,
  type MappedWorldAnnotation,
  type MappedWorldCluster,
  type MappedWorldEdge,
  type MappedWorldNode,
  type WorldLayersProjection,
  type WorldLayersRows,
  type WorldLayersScope,
} from '../world-layers-mapper.js'
import { ConflictError } from '../../lib/errors.js'
import { toJson, type PrismaLike } from './util.js'

/** The scope columns keying a scope's world rows. */
function scopeWhere(scope: WorldLayersScope): { createdByUserId: string | null; projectId: string | null } {
  return { createdByUserId: scope.createdByUserId, projectId: scope.projectId }
}

/** True when a scope holds any world rows. */
export interface WorldRowsRead {
  rows: WorldLayersRows
  exists: boolean
}

/**
 * Reads a scope's world rows from the layers store.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning scope
 * @returns the world rows and whether any existed
 */
export async function readWorldRows(prisma: PrismaLike, scope: WorldLayersScope): Promise<WorldRowsRead> {
  const where = scopeWhere(scope)
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)

  const nodes = await prisma.graphNode.findMany({
    where: { ...where, nodeType: { in: [...WORLD_NODE_TYPES] } },
  })
  const edges = (await prisma.graphEdge.findMany({ where })).filter(isWorldEdge)
  const clusters = (await prisma.clusterSet.findMany({ where })).filter((c) => worldClusterBucket(c) !== null)
  const annotations = await prisma.layersAnnotation.findMany({ where: { layerId } })

  const rows: WorldLayersRows = { nodes, edges, clusters, annotations }
  const exists = nodes.length > 0 || edges.length > 0 || clusters.length > 0
  return { rows, exists }
}

/**
 * Prunes a scope's world rows: the scaffold annotations/layer/expression, the
 * collection ClusterSets, the world edges, and the world nodes.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning scope
 */
export async function pruneWorldRows(prisma: PrismaLike, scope: WorldLayersScope): Promise<void> {
  const where = scopeWhere(scope)
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const expressionId = worldScaffoldExpressionId(scope.createdByUserId, scope.projectId)

  await prisma.layersAnnotation.deleteMany({ where: { layerId } })
  await prisma.annotationLayer.deleteMany({ where: { id: layerId } })
  await prisma.expression.deleteMany({ where: { id: expressionId } })

  const clusters = (await prisma.clusterSet.findMany({ where })).filter((c) => worldClusterBucket(c) !== null)
  if (clusters.length > 0) {
    await prisma.clusterSet.deleteMany({ where: { id: { in: clusters.map((c) => c.id) } } })
  }
  const edges = (await prisma.graphEdge.findMany({ where })).filter(isWorldEdge)
  if (edges.length > 0) await prisma.graphEdge.deleteMany({ where: { id: { in: edges.map((e) => e.id) } } })
  await prisma.graphNode.deleteMany({ where: { ...where, nodeType: { in: [...WORLD_NODE_TYPES] } } })
}

/** Ensures the per-scope scaffold Expression + AnnotationLayer exist. */
async function ensureScaffold(prisma: PrismaLike, projection: WorldLayersProjection): Promise<void> {
  const scaffold = projection.scaffold
  if (!scaffold) return
  await prisma.expression.upsert({
    where: { id: scaffold.expressionId },
    update: {},
    create: {
      id: scaffold.expressionId,
      layersId: scaffold.expressionId,
      kind: 'concept',
      sourceKind: 'world-model',
      projectId: scaffold.projectId,
      createdByUserId: scaffold.createdByUserId,
    },
  })
  await prisma.annotationLayer.upsert({
    where: { id: scaffold.layerId },
    update: {},
    create: {
      id: scaffold.layerId,
      expressionId: scaffold.expressionId,
      kind: 'graph',
      subkind: 'world',
      projectId: scaffold.projectId,
      createdByUserId: scaffold.createdByUserId,
    },
  })
}

/** Creates one GraphNode from its projection. */
function createNode(prisma: PrismaLike, node: MappedWorldNode): Promise<unknown> {
  return prisma.graphNode.create({
    data: {
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      properties: toJson(node.properties),
      knowledgeRefs: toJson(node.knowledgeRefs),
      metadata: toJson(node.metadata),
      projectId: node.projectId,
      createdByUserId: node.createdByUserId,
    },
  })
}

/** Creates one GraphEdge from its projection. */
function createEdge(prisma: PrismaLike, edge: MappedWorldEdge): Promise<unknown> {
  return prisma.graphEdge.create({
    data: {
      id: edge.id,
      source: toJson(edge.source) as Prisma.InputJsonValue,
      target: toJson(edge.target) as Prisma.InputJsonValue,
      sourceLocalId: edge.sourceLocalId,
      targetLocalId: edge.targetLocalId,
      edgeType: edge.edgeType,
      label: edge.label,
      confidence: edge.confidence,
      properties: toJson(edge.properties),
      metadata: toJson(edge.metadata),
      projectId: edge.projectId,
      createdByUserId: edge.createdByUserId,
    },
  })
}

/** Creates one collection ClusterSet from its projection. */
function createCluster(prisma: PrismaLike, cluster: MappedWorldCluster): Promise<unknown> {
  return prisma.clusterSet.create({
    data: {
      id: cluster.id,
      kind: cluster.kind,
      clusters: toJson(cluster.clusters) as Prisma.InputJsonValue,
      projectId: cluster.projectId,
      createdByUserId: cluster.createdByUserId,
    },
  })
}

/**
 * Creates one world-denoting LayersAnnotation. The `anchor` field is omitted so
 * the column stores SQL NULL — a world-denoting annotation attaches to its node
 * via `denotesNodeId` and carries its value on `temporal`/`spatial`, not a
 * media/text anchor.
 */
function createAnnotation(prisma: PrismaLike, annotation: MappedWorldAnnotation): Promise<unknown> {
  return prisma.layersAnnotation.create({
    data: {
      id: annotation.id,
      layerId: annotation.layerId,
      denotesNodeId: annotation.denotesNodeId,
      label: annotation.label,
      ontologyTypeRefId: annotation.ontologyTypeRefId,
      arguments: toJson(annotation.arguments),
      temporal: toJson(annotation.temporal),
      spatial: toJson(annotation.spatial),
      confidence: annotation.confidence,
      features: toJson(annotation.features),
      projectId: annotation.projectId,
      createdByUserId: annotation.createdByUserId,
    },
  })
}

/**
 * Materializes a projection into a freshly-pruned scope: scaffold, then nodes
 * (denoted-node FK must precede its annotations), edges, clusters, annotations.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param projection - the projected world rows
 */
export async function createWorldProjection(
  prisma: PrismaLike,
  projection: WorldLayersProjection,
): Promise<void> {
  await ensureScaffold(prisma, projection)
  for (const node of projection.nodes) await createNode(prisma, node)
  for (const edge of projection.edges) await createEdge(prisma, edge)
  for (const cluster of projection.clusters) await createCluster(prisma, cluster)
  for (const annotation of projection.annotations) await createAnnotation(prisma, annotation)
}

/**
 * Merges a projection into a scope's rows in place, guarded by each node's and
 * relation edge's `lockVersion`. Every object is upserted by its own id; rows the
 * projection does not mention are left untouched, so a concurrently-added object
 * is never dropped. The derived rows of each written object (its instance-of
 * edges and denoting annotations) are replaced so an edit does not orphan a stale
 * assignment or interpretation. On a same-object compare-and-swap miss the whole
 * merge retries against a fresh read; after `maxAttempts` it throws.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning scope
 * @param projection - the projected world rows to upsert
 * @param maxAttempts - how many times to retry a conflicting compare-and-swap
 * @throws {ConflictError} when the write keeps conflicting after retries
 */
export async function upsertWorldProjection(
  prisma: PrismaLike,
  scope: WorldLayersScope,
  projection: WorldLayersProjection,
  maxAttempts: number,
): Promise<void> {
  const where = scopeWhere(scope)
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const relationEdges = projection.edges.filter((e) => e.edgeType !== 'instance-of')
  const assignmentEdges = projection.edges.filter((e) => e.edgeType === 'instance-of')
  const ownerIds = [...projection.nodes.map((n) => n.id), ...projection.clusters.map((c) => c.id)]
  const nodeIds = projection.nodes.map((n) => n.id)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await ensureScaffold(prisma, projection)

    const existingNodes = new Map(
      (await prisma.graphNode.findMany({ where: { ...where, nodeType: { in: [...WORLD_NODE_TYPES] } } })).map((n) => [
        n.id,
        n,
      ]),
    )
    const existingEdges = new Map(
      (await prisma.graphEdge.findMany({ where })).filter(isWorldEdge).map((e) => [e.id, e]),
    )
    let conflict = false

    for (const node of projection.nodes) {
      const existing = existingNodes.get(node.id)
      if (existing) {
        const result = await prisma.graphNode.updateMany({
          where: { id: node.id, lockVersion: existing.lockVersion },
          data: {
            nodeType: node.nodeType,
            label: node.label,
            properties: toJson(node.properties),
            knowledgeRefs: toJson(node.knowledgeRefs),
            metadata: toJson(node.metadata),
            lockVersion: { increment: 1 },
          },
        })
        if (result.count !== 1) {
          conflict = true
          break
        }
      } else {
        try {
          await createNode(prisma, node)
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            conflict = true
            break
          }
          throw error
        }
      }
    }
    if (conflict) {
      if (attempt + 1 < maxAttempts) continue
      throw new ConflictError('World state update conflicted after retries')
    }

    // Replace the derived rows of every written object, then recreate them.
    if (nodeIds.length > 0) {
      await prisma.layersAnnotation.deleteMany({ where: { layerId, denotesNodeId: { in: nodeIds } } })
    }
    if (ownerIds.length > 0) {
      await prisma.graphEdge.deleteMany({ where: { edgeType: 'instance-of', sourceLocalId: { in: ownerIds } } })
    }
    for (const edge of assignmentEdges) await createEdge(prisma, edge)
    for (const annotation of projection.annotations) await createAnnotation(prisma, annotation)

    for (const edge of relationEdges) {
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
            confidence: edge.confidence,
            properties: toJson(edge.properties),
            metadata: toJson(edge.metadata),
            lockVersion: { increment: 1 },
          },
        })
        if (result.count !== 1) {
          conflict = true
          break
        }
      } else {
        try {
          await createEdge(prisma, edge)
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            conflict = true
            break
          }
          throw error
        }
      }
    }
    if (conflict) {
      if (attempt + 1 < maxAttempts) continue
      throw new ConflictError('World state update conflicted after retries')
    }

    for (const cluster of projection.clusters) {
      await prisma.clusterSet.upsert({
        where: { id: cluster.id },
        update: { kind: cluster.kind, clusters: toJson(cluster.clusters) as Prisma.InputJsonValue },
        create: {
          id: cluster.id,
          kind: cluster.kind,
          clusters: toJson(cluster.clusters) as Prisma.InputJsonValue,
          projectId: cluster.projectId,
          createdByUserId: cluster.createdByUserId,
        },
      })
    }

    return
  }

  throw new ConflictError('World state update conflicted after retries')
}
