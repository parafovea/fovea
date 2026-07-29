/**
 * Native persistence for the world surface over the unified layers store.
 *
 * A WorldState aggregate projects to GraphNodes (entities/locations/situations/
 * times), GraphEdges (relations), ClusterSets (collections), and world
 * LayersAnnotations (a presence annotation per node carrying its typed value and
 * description, plus type-assignment and event-interpretation annotations) hung
 * off a per-scope scaffold Expression + layer. This module owns reading those
 * rows back, pruning them, and materializing a projection — shared by the world
 * service and the world bridge so both persist the world the same way.
 *
 * World rows are discriminated natively, without a marker blob: a node by the
 * world-scaffold presence annotation that denotes it (a video-object-annotation
 * denotation stub has none, so it is neither surfaced nor pruned), a collection
 * ClusterSet by its binding to the scaffold expression, a relation edge by the
 * endpoint-kind property the projection stamps on it, and the annotations by the
 * deterministic scaffold layer.
 *
 * @module
 */

import { Prisma } from '@prisma/client'

import { worldScaffoldExpressionId, worldScaffoldLayerId } from '../layers-id-map.js'
import {
  isWorldEdge,
  isWorldPresence,
  type MappedWorldAnnotation,
  type MappedWorldCluster,
  type MappedWorldEdge,
  type MappedWorldNode,
  type WorldLayersProjection,
  type WorldLayersRows,
  type WorldLayersScope,
} from '../world-model.js'
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

/** The distinct non-null node ids a scope's presence annotations denote. */
function presenceNodeIds(annotations: Array<{ denotesNodeId: string | null; label: string | null; parentAnnotationId: string | null }>): string[] {
  const ids = new Set<string>()
  for (const annotation of annotations) {
    if (annotation.denotesNodeId && isWorldPresence(annotation)) ids.add(annotation.denotesNodeId)
  }
  return [...ids]
}

/**
 * Reads a scope's world rows from the layers store. World nodes are those a
 * world-scaffold presence annotation denotes (so a video denotation stub sharing
 * a nodeType is excluded), collections are the ClusterSets bound to the scaffold
 * expression, and relations are the endpoint-kind-tagged graph edges.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning scope
 * @returns the world rows and whether any existed
 */
export async function readWorldRows(prisma: PrismaLike, scope: WorldLayersScope): Promise<WorldRowsRead> {
  const where = scopeWhere(scope)
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const expressionId = worldScaffoldExpressionId(scope.createdByUserId, scope.projectId)

  const annotations = await prisma.layersAnnotation.findMany({ where: { layerId } })
  const nodeIds = presenceNodeIds(annotations)
  const nodes =
    nodeIds.length > 0 ? await prisma.graphNode.findMany({ where: { ...where, id: { in: nodeIds } } }) : []
  const clusters = await prisma.clusterSet.findMany({ where: { ...where, expressionId } })
  const edges = (await prisma.graphEdge.findMany({ where })).filter(isWorldEdge)

  const rows: WorldLayersRows = { nodes, edges, clusters, annotations }
  const exists = nodes.length > 0 || edges.length > 0 || clusters.length > 0
  return { rows, exists }
}

/**
 * Prunes a scope's world rows. World nodes are recovered from their presence
 * annotations before those are deleted; a node still denoted by a non-world
 * annotation after the scaffold is cleared (a live video-object link) is left in
 * place, so `denotesNode`'s SetNull can never silently sever it. The scaffold
 * expression is deleted only after its collection ClusterSets, so their
 * `expressionId` FK is not SetNull-orphaned before they are removed.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param scope - the owning scope
 */
export async function pruneWorldRows(prisma: PrismaLike, scope: WorldLayersScope): Promise<void> {
  const where = scopeWhere(scope)
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const expressionId = worldScaffoldExpressionId(scope.createdByUserId, scope.projectId)

  const annotations = await prisma.layersAnnotation.findMany({
    where: { layerId },
    select: { denotesNodeId: true, label: true, parentAnnotationId: true },
  })
  const worldNodeIds = presenceNodeIds(annotations)

  // Collections reference the scaffold expression, so remove them before it.
  await prisma.clusterSet.deleteMany({ where: { ...where, expressionId } })
  await prisma.layersAnnotation.deleteMany({ where: { layerId } })
  await prisma.annotationLayer.deleteMany({ where: { id: layerId } })
  await prisma.expression.deleteMany({ where: { id: expressionId } })

  const edges = (await prisma.graphEdge.findMany({ where })).filter(isWorldEdge)
  if (edges.length > 0) await prisma.graphEdge.deleteMany({ where: { id: { in: edges.map((e) => e.id) } } })

  if (worldNodeIds.length > 0) {
    // A world node still denoted by a surviving (non-scaffold) annotation carries
    // a live cross-surface link; deleting it would SetNull that link, so keep it.
    const stillDenoted = await prisma.layersAnnotation.findMany({
      where: { denotesNodeId: { in: worldNodeIds } },
      select: { denotesNodeId: true },
    })
    const keep = new Set(stillDenoted.map((a) => a.denotesNodeId).filter((id): id is string => id !== null))
    const deletable = worldNodeIds.filter((id) => !keep.has(id))
    if (deletable.length > 0) await prisma.graphNode.deleteMany({ where: { ...where, id: { in: deletable } } })
  }
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

/** The GraphNode create/update data a projection node carries. */
function nodeData(node: MappedWorldNode): {
  nodeType: string
  label: string | null
  properties: Prisma.InputJsonValue | undefined
  knowledgeRefs: Prisma.InputJsonValue | undefined
  metadata: Prisma.InputJsonValue | undefined
} {
  return {
    nodeType: node.nodeType,
    label: node.label,
    properties: toJson(node.properties),
    knowledgeRefs: toJson(node.knowledgeRefs),
    metadata: toJson(node.metadata),
  }
}

/** Upserts one GraphNode from its projection (a pruned-but-kept node is updated). */
function upsertNode(prisma: PrismaLike, node: MappedWorldNode): Promise<unknown> {
  const data = nodeData(node)
  return prisma.graphNode.upsert({
    where: { id: node.id },
    update: data,
    create: { id: node.id, projectId: node.projectId, createdByUserId: node.createdByUserId, ...data },
  })
}

/** Creates one GraphNode from its projection. */
function createNode(prisma: PrismaLike, node: MappedWorldNode): Promise<unknown> {
  return prisma.graphNode.create({
    data: { id: node.id, projectId: node.projectId, createdByUserId: node.createdByUserId, ...nodeData(node) },
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
      ordinal: edge.ordinal,
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
      expressionId: cluster.expressionId,
      clusters: toJson(cluster.clusters) as Prisma.InputJsonValue,
      projectId: cluster.projectId,
      createdByUserId: cluster.createdByUserId,
    },
  })
}

/**
 * Upserts one world LayersAnnotation by its deterministic id. Its `anchor` stores
 * SQL NULL via `Prisma.DbNull` when the annotation carries none (never a JSON `{}`
 * or `null` a `WHERE anchor IS NULL` predicate would miss) — a world annotation
 * attaches to its node via `denotesNodeId` and carries its value on
 * `temporal`/`spatial`, and only a gloss-reference child carries a textSpan anchor.
 *
 * The upsert is idempotent so a row orphaned by an out-of-band node delete (which
 * SetNulls its `denotesNodeId` but leaves the row) is re-adopted rather than
 * colliding on the id a same-id node deterministically derives.
 */
function createAnnotation(prisma: PrismaLike, annotation: MappedWorldAnnotation): Promise<unknown> {
  const anchor = toJson(annotation.anchor) ?? Prisma.DbNull
  const data = {
    layerId: annotation.layerId,
    denotesNodeId: annotation.denotesNodeId,
    parentAnnotationId: annotation.parentAnnotationId,
    label: annotation.label,
    text: annotation.text,
    anchor,
    ontologyTypeRefId: annotation.ontologyTypeRefId,
    arguments: toJson(annotation.arguments),
    temporal: toJson(annotation.temporal),
    spatial: toJson(annotation.spatial),
    confidence: annotation.confidence,
    features: toJson(annotation.features),
  }
  return prisma.layersAnnotation.upsert({
    where: { id: annotation.id },
    update: data,
    create: {
      id: annotation.id,
      projectId: annotation.projectId,
      createdByUserId: annotation.createdByUserId,
      ...data,
    },
  })
}

/**
 * Materializes a projection into a freshly-pruned scope: scaffold, then nodes
 * (a denoted node FK must precede its annotations), edges, clusters, annotations.
 * Nodes are upserted so a pruned-but-kept cross-denoted node is updated rather
 * than colliding.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param projection - the projected world rows
 */
export async function createWorldProjection(
  prisma: PrismaLike,
  projection: WorldLayersProjection,
): Promise<void> {
  await ensureScaffold(prisma, projection)
  for (const node of projection.nodes) await upsertNode(prisma, node)
  for (const edge of projection.edges) await createEdge(prisma, edge)
  for (const cluster of projection.clusters) await createCluster(prisma, cluster)
  for (const annotation of projection.annotations) await createAnnotation(prisma, annotation)
}

/**
 * Merges a projection into a scope's rows in place, guarded by each node's and
 * relation edge's `lockVersion`. Every object is upserted by its own id; rows the
 * projection does not mention are left untouched, so a concurrently-added object
 * is never dropped. The derived rows of each written object (its presence,
 * type-assignment, interpretation, and gloss annotations) are replaced so an edit
 * does not orphan a stale value. On a same-object compare-and-swap miss the whole
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
  const nodeIds = projection.nodes.map((n) => n.id)
  const collectionAnnotationIds = projection.annotations
    .filter((a) => a.denotesNodeId === null)
    .map((a) => a.id)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await ensureScaffold(prisma, projection)

    const existingNodes = new Map(
      (await prisma.graphNode.findMany({ where: { ...where, id: { in: nodeIds } } })).map((n) => [n.id, n]),
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
          data: { ...nodeData(node), lockVersion: { increment: 1 } },
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

    // Replace the derived annotations of every written object, then recreate them.
    if (nodeIds.length > 0) {
      await prisma.layersAnnotation.deleteMany({ where: { layerId, denotesNodeId: { in: nodeIds } } })
    }
    if (collectionAnnotationIds.length > 0) {
      await prisma.layersAnnotation.deleteMany({ where: { id: { in: collectionAnnotationIds } } })
    }
    for (const annotation of projection.annotations) await createAnnotation(prisma, annotation)

    for (const edge of projection.edges) {
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
            ordinal: edge.ordinal,
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
        update: {
          kind: cluster.kind,
          expressionId: cluster.expressionId,
          clusters: toJson(cluster.clusters) as Prisma.InputJsonValue,
        },
        create: {
          id: cluster.id,
          kind: cluster.kind,
          expressionId: cluster.expressionId,
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
