/**
 * Bidirectional conversion between the hierarchical Claim tree the
 * `/api/summaries/:summaryId/claims` contract exchanges and the layers store
 * (GraphNode + LayersAnnotation + GraphEdge).
 *
 * The forward direction (`claimsToLayers`) mirrors the backfill in
 * `prisma/backfill/backfill-claims.ts`: each Claim becomes one GraphNode
 * (nodeType=claim) reusing the Claim's id, each Claim text span becomes one span
 * LayersAnnotation denoting the claim node, and each ClaimRelation becomes one
 * GraphEdge reusing the relation id. Where the backfill flattens each claim to a
 * handful of layers-native columns and drops the rest, this mapper additionally
 * stashes the complete original claim under `properties.foveaClaim.object` and
 * the complete original relation under `properties.foveaClaimRelation.object`.
 * The reverse direction (`layersToClaims`) reconstructs each claim and relation
 * verbatim from those stashes, so glosses, text spans, time spans, claimer
 * fields, world-object references, modality arrays, and confidence all survive
 * the round trip exactly. Subclaims are separate nodes linked by the stashed
 * `parentClaimId`; `nestClaims` reassembles the tree.
 *
 * @module
 */

import type { GraphNode as PrismaGraphNode, GraphEdge as PrismaGraphEdge } from '@prisma/client'

import type { ObjectRef } from '@fovea/layers-schema'

import { claimSpanAnnotationId } from './layers-id-map.js'

/** The nodeType every claim GraphNode carries. */
export const CLAIM_NODE_TYPE = 'claim'

/** The marker key stamped into a claim node's `properties`. */
export const CLAIM_MARKER = 'foveaClaim'

/** The marker key stamped into a claim-relation edge's `properties`. */
export const CLAIM_RELATION_MARKER = 'foveaClaimRelation'

/** The scope columns every produced row carries. */
export interface ClaimLayersScope {
  projectId: string | null
  createdByUserId: string | null
}

/**
 * A claim in the flat, storable shape: every field the contract exchanges plus
 * the internal scope columns (`projectId`, `createdBy`). Timestamps are ISO
 * strings. `subclaims` is present only on the nested tree shape.
 */
export interface StoredClaim {
  id: string
  summaryId: string
  summaryType: string
  text: string
  gloss: unknown
  parentClaimId?: string | null
  textSpans?: unknown
  timeSpans?: unknown
  claimerType?: string | null
  claimerGloss?: unknown
  claimRelation?: unknown
  claimEventId?: string | null
  claimTimeId?: string | null
  claimLocationId?: string | null
  confidence?: number | null
  modelUsed?: string | null
  extractionStrategy?: string | null
  audio?: unknown
  video?: unknown
  metadata?: unknown
  comment?: string | null
  createdBy?: string | null
  projectId?: string | null
  createdAt: string
  updatedAt: string
}

/** A claim with its nested subclaim tree, the shape the read paths return. */
export interface StoredClaimNode extends StoredClaim {
  subclaims: StoredClaimNode[]
}

/** A claim relation in the flat, storable shape the contract exchanges. */
export interface StoredRelation {
  id: string
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
  sourceSpans?: unknown
  targetSpans?: unknown
  confidence?: number | null
  notes?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

/** A GraphNode create payload a claim materialization persists. */
export interface MappedClaimNode {
  id: string
  nodeType: string
  label: string | null
  properties: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A LayersAnnotation create payload a claim text span materializes to. */
export interface MappedClaimAnnotation {
  id: string
  anchor: unknown
  label: string
  denotesNodeId: string
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A GraphEdge create payload a claim relation materializes to. */
export interface MappedClaimEdge {
  id: string
  source: ObjectRef
  target: ObjectRef
  sourceLocalId: string | null
  targetLocalId: string | null
  edgeType: string
  label: string | null
  confidence: number | null
  properties: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
}

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** The scope columns a claim projects to (its owner and project). */
export function claimScope(claim: StoredClaim): ClaimLayersScope {
  return { projectId: claim.projectId ?? null, createdByUserId: claim.createdBy ?? null }
}

/**
 * Projects one claim onto its GraphNode, stashing the complete claim (minus its
 * subclaims, which are their own nodes) under `properties.foveaClaim.object`.
 *
 * @param claim - the claim to project (subclaims are ignored)
 * @returns the GraphNode create payload
 */
export function claimToNode(claim: StoredClaim): MappedClaimNode {
  // Strip the nested tree and any relation arrays; the tree is reassembled from
  // parentClaimId and relations live in their own edges.
  const object = { ...claim } as StoredClaim & {
    subclaims?: unknown
    sourceClaimRelations?: unknown
    targetClaimRelations?: unknown
  }
  delete object.subclaims
  delete object.sourceClaimRelations
  delete object.targetClaimRelations

  return {
    id: claim.id,
    nodeType: CLAIM_NODE_TYPE,
    label: claim.text,
    properties: {
      [CLAIM_MARKER]: {
        summaryId: claim.summaryId,
        parentClaimId: claim.parentClaimId ?? null,
        object,
      },
    },
    projectId: claim.projectId ?? null,
    createdByUserId: claim.createdBy ?? null,
  }
}

/**
 * Projects a claim's text spans onto span LayersAnnotations denoting the claim
 * node. Character offsets double as byte offsets (exact for ASCII, a safe
 * approximation otherwise), mirroring the backfill.
 *
 * @param claim - the claim whose text spans to project
 * @returns one annotation payload per text span
 */
export function claimSpanAnnotations(claim: StoredClaim): MappedClaimAnnotation[] {
  const spans = asArray(claim.textSpans)
  const scope = claimScope(claim)
  return spans.map((span, index) => {
    const charStart = typeof span.charStart === 'number' ? span.charStart : 0
    const charEnd = typeof span.charEnd === 'number' ? span.charEnd : 0
    const sentenceIndex = span.sentenceIndex
    return {
      id: claimSpanAnnotationId(claim.id, index),
      anchor: {
        textSpan: { byteStart: charStart, byteEnd: charEnd, charStart, charEnd },
      },
      label: 'claim-span',
      denotesNodeId: claim.id,
      features:
        sentenceIndex != null
          ? { entries: [{ key: 'fovea.sentenceIndex', value: String(sentenceIndex) }] }
          : null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

/**
 * Projects one claim relation onto its GraphEdge, stashing the complete relation
 * under `properties.foveaClaimRelation.object`.
 *
 * @param relation - the relation to project
 * @param summaryId - the source claim's summary id, denormalized for scoping
 * @param projectId - the source claim's project scope
 * @returns the GraphEdge create payload
 */
export function relationToEdge(
  relation: StoredRelation,
  summaryId: string,
  projectId: string | null,
): MappedClaimEdge {
  return {
    id: relation.id,
    source: localRef(relation.sourceClaimId),
    target: localRef(relation.targetClaimId),
    sourceLocalId: relation.sourceClaimId,
    targetLocalId: relation.targetClaimId,
    edgeType: relation.relationTypeId,
    label: relation.relationTypeId,
    confidence: relation.confidence != null ? Math.round(relation.confidence * 1000) : null,
    properties: {
      [CLAIM_RELATION_MARKER]: { summaryId, object: relation },
    },
    projectId,
    createdByUserId: relation.createdBy ?? null,
  }
}

/** The stash a claim node carries under `properties.foveaClaim`. */
interface ClaimStash {
  summaryId: string
  parentClaimId: string | null
  object: StoredClaim
}

/** Extracts the claim stash from a node's `properties`, or null when absent. */
function readClaimStash(properties: unknown): ClaimStash | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[CLAIM_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  if (record.object === null || typeof record.object !== 'object') return null
  return {
    summaryId: typeof record.summaryId === 'string' ? record.summaryId : '',
    parentClaimId: typeof record.parentClaimId === 'string' ? record.parentClaimId : null,
    object: record.object as StoredClaim,
  }
}

/** The stash a claim-relation edge carries under `properties.foveaClaimRelation`. */
interface RelationStash {
  summaryId: string
  object: StoredRelation
}

/** Extracts the relation stash from an edge's `properties`, or null when absent. */
function readRelationStash(properties: unknown): RelationStash | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[CLAIM_RELATION_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  if (record.object === null || typeof record.object !== 'object') return null
  return {
    summaryId: typeof record.summaryId === 'string' ? record.summaryId : '',
    object: record.object as StoredRelation,
  }
}

/** True when a graph node row is a claim node. */
export function isClaimNode(row: { nodeType: string; properties: unknown }): boolean {
  return row.nodeType === CLAIM_NODE_TYPE && readClaimStash(row.properties) !== null
}

/** True when a graph edge row is a claim-relation edge. */
export function isClaimRelationEdge(row: { properties: unknown }): boolean {
  return readRelationStash(row.properties) !== null
}

/** Reconstructs the verbatim claim stashed on a claim node, or null. */
export function nodeToClaim(node: Pick<PrismaGraphNode, 'properties'>): StoredClaim | null {
  const stash = readClaimStash(node.properties)
  return stash ? stash.object : null
}

/** Reconstructs the verbatim relation stashed on a claim-relation edge, or null. */
export function edgeToRelation(edge: Pick<PrismaGraphEdge, 'properties'>): StoredRelation | null {
  const stash = readRelationStash(edge.properties)
  return stash ? stash.object : null
}

/**
 * Reconstructs the flat claim list and relation list from a summary's graph
 * nodes and edges. Rows without the claim/relation marker are ignored.
 *
 * @param nodes - the summary's claim graph nodes
 * @param edges - the summary's claim-relation graph edges
 * @returns the reconstructed flat claims and relations
 */
export function layersToClaims(
  nodes: Pick<PrismaGraphNode, 'properties'>[],
  edges: Pick<PrismaGraphEdge, 'properties'>[],
): { claims: StoredClaim[]; relations: StoredRelation[] } {
  const claims: StoredClaim[] = []
  for (const node of nodes) {
    const claim = nodeToClaim(node)
    if (claim) claims.push(claim)
  }
  const relations: StoredRelation[] = []
  for (const edge of edges) {
    const relation = edgeToRelation(edge)
    if (relation) relations.push(relation)
  }
  return { claims, relations }
}

/**
 * Nests a flat claim list into the hierarchical tree the read paths return,
 * ordering siblings by creation time then id for a stable result. Claims whose
 * `parentClaimId` names a claim outside the list are treated as roots.
 *
 * @param flat - the flat claim list
 * @returns the root claims, each carrying its nested subclaims
 */
export function nestClaims(flat: StoredClaim[]): StoredClaimNode[] {
  const byId = new Map<string, StoredClaimNode>()
  for (const claim of flat) {
    byId.set(claim.id, { ...claim, subclaims: [] })
  }

  const roots: StoredClaimNode[] = []
  for (const node of byId.values()) {
    const parentId = node.parentClaimId ?? null
    const parent = parentId ? byId.get(parentId) : undefined
    if (parent) {
      parent.subclaims.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: StoredClaimNode[]): void => {
    nodes.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    for (const child of nodes) sortNodes(child.subclaims)
  }
  sortNodes(roots)

  return roots
}

/**
 * Collects a claim's id and every descendant subclaim id from a flat list.
 *
 * @param flat - the flat claim list
 * @param rootId - the id of the claim whose subtree to collect
 * @returns the id set of the claim and all its descendants
 */
export function collectSubtreeIds(flat: StoredClaim[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const claim of flat) {
    const parentId = claim.parentClaimId ?? null
    if (!parentId) continue
    const list = childrenOf.get(parentId) ?? []
    list.push(claim.id)
    childrenOf.set(parentId, list)
  }

  const ids = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (ids.has(id)) continue
    ids.add(id)
    for (const childId of childrenOf.get(id) ?? []) stack.push(childId)
  }
  return ids
}
