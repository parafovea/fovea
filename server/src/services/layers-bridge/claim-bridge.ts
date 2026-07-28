/**
 * Claim bridge over the unified layers store.
 *
 * Reconstructs a summary's claims and claim relations (the shapes the
 * `/api/summaries/:summaryId/claims` contract exchanges) from the layers store
 * (GraphNode claim rows + span LayersAnnotations + child text-span/temporal
 * annotations + GraphEdge relation/reference rows), and materializes claims and
 * relations into it. Reads query the native rows only; writes create claim nodes,
 * their span/temporal annotations, and relation/reference edges. Mirrors the
 * structure of `claim-service.ts`.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import {
  claimFromLayers,
  edgeToRelation,
  isClaimNode,
  isClaimRelationEdge,
  isPrimaryClaimAnnotation,
  relationSpanRelationId,
  claimSummaryId,
  type StoredClaim,
  type StoredRelation,
  type ClaimAnnotationRow,
  type ClaimLayersProjection,
} from '../claim-model.js'
import {
  claimToLayersViaLens,
  nodeToClaimViaLens,
  reconstructClaimsViaLens,
  relationToLayersViaLens,
} from '../layers-lens/claim-lens.js'
import { claimAnnotationId, claimSpanLayerId, expressionTranscriptId } from '../layers-id-map.js'
import { getOrCreateVideoExpression } from '../video-expression-service.js'
import { requiredJson, toJson, type PrismaLike } from './util.js'

/** The summary fields the claim writers need to resolve scope and anchoring. */
export interface ClaimSummaryContext {
  id: string
  videoId: string
  projectId: string | null
  createdBy: string | null
}

/** The reconstructed flat claims and relations for a summary. */
export interface SummaryClaimsRead {
  claims: StoredClaim[]
  relations: StoredRelation[]
}

/**
 * Reads a summary's claims from the layers store. Claims are scoped natively by
 * their bearer annotations living in the summary's claim-span layer (its id a pure
 * function of the summary id). Each claim reconstructs from its GraphNode, its
 * primary + child annotations, and its outgoing reference edges.
 */
async function findSummaryClaimNodes(prisma: PrismaLike, summaryId: string): Promise<StoredClaim[]> {
  const layerId = claimSpanLayerId(summaryId)
  const annotations = await prisma.layersAnnotation.findMany({ where: { layerId } })
  const primaries = annotations.filter(isPrimaryClaimAnnotation)
  if (primaries.length === 0) return []

  const nodeIds = [...new Set(primaries.map((ann) => ann.denotesNodeId as string))]
  const nodes = await prisma.graphNode.findMany({ where: { id: { in: nodeIds }, nodeType: 'claim' } })
  const edges = await prisma.graphEdge.findMany({ where: { sourceLocalId: { in: nodeIds } } })

  return (await reconstructClaimsViaLens(nodes, annotations, edges)).filter((claim) => claim.summaryId === summaryId)
}

/** Loads a summary's relation endpoint-span annotations grouped by relation id. */
async function loadRelationSpans(
  prisma: PrismaLike,
  summaryId: string,
): Promise<Map<string, ClaimAnnotationRow[]>> {
  const layerId = claimSpanLayerId(summaryId)
  const spans = await prisma.layersAnnotation.findMany({ where: { layerId, label: 'relation-span' } })
  const byRelation = new Map<string, ClaimAnnotationRow[]>()
  for (const span of spans) {
    const relationId = relationSpanRelationId(span)
    if (relationId === null) continue
    const list = byRelation.get(relationId) ?? []
    list.push(span)
    byRelation.set(relationId, list)
  }
  return byRelation
}

/**
 * Reads a summary's claim-relation GraphEdges as stored relations. Relations are
 * scoped by their source claim belonging to the summary; each relation's endpoint
 * spans reconstruct from its side-tagged span annotations.
 */
async function findSummaryRelationEdges(
  prisma: PrismaLike,
  summaryId: string,
): Promise<StoredRelation[]> {
  const claimIds = (await findSummaryClaimNodes(prisma, summaryId)).map((claim) => claim.id)
  if (claimIds.length === 0) return []
  const edges = await prisma.graphEdge.findMany({ where: { sourceLocalId: { in: claimIds } } })
  const relationEdges = edges.filter(isClaimRelationEdge)
  if (relationEdges.length === 0) return []
  const spansByRelation = await loadRelationSpans(prisma, summaryId)
  const relations: StoredRelation[] = []
  for (const edge of relationEdges) {
    const relation = edgeToRelation(edge, spansByRelation.get(edge.id) ?? [])
    if (relation) relations.push(relation)
  }
  return relations
}

/**
 * Reads a summary's flat claims and relations from the layers store.
 *
 * @param prisma - the Prisma client
 * @param summaryId - the VideoSummary id
 * @returns the flat claims and relations
 */
export async function readSummaryClaims(
  prisma: PrismaLike,
  summaryId: string,
): Promise<SummaryClaimsRead> {
  return {
    claims: await findSummaryClaimNodes(prisma, summaryId),
    relations: await findSummaryRelationEdges(prisma, summaryId),
  }
}

/** Resolves the expression a summary's claim-span layer anchors over. */
async function resolveClaimSpanExpressionId(
  prisma: PrismaLike,
  summary: ClaimSummaryContext,
): Promise<string> {
  const transcriptId = expressionTranscriptId(summary.id)
  const hasTranscript = (await prisma.expression.count({ where: { id: transcriptId } })) > 0
  if (hasTranscript) return transcriptId
  const { expressionId } = await getOrCreateVideoExpression(prisma, summary.videoId)
  return expressionId
}

/** Finds or creates the per-summary claim-span marker layer, returning its id. */
async function ensureClaimSpanLayer(
  prisma: PrismaLike,
  summary: ClaimSummaryContext,
): Promise<string> {
  const layerId = claimSpanLayerId(summary.id)
  const existing = await prisma.annotationLayer.findUnique({ where: { id: layerId } })
  if (existing) return layerId
  const expressionId = await resolveClaimSpanExpressionId(prisma, summary)
  await prisma.annotationLayer.create({
    data: {
      id: layerId,
      expressionId,
      kind: 'span',
      subkind: 'claim',
      projectId: summary.projectId,
      createdByUserId: summary.createdBy,
    },
  })
  return layerId
}

/** Creates one LayersAnnotation from a mapped claim annotation under a layer. */
async function createClaimAnnotation(
  prisma: PrismaLike,
  layerId: string,
  ann: ClaimLayersProjection['annotations'][number],
): Promise<void> {
  await prisma.layersAnnotation.create({
    data: {
      id: ann.id,
      layerId,
      // An anchor-less primary omits the field so the column stores SQL NULL.
      anchor: ann.anchor === null ? undefined : requiredJson(ann.anchor),
      label: ann.label,
      text: ann.text,
      value: ann.value,
      confidence: ann.confidence,
      arguments: toJson(ann.arguments),
      ontologyTypeRefId: ann.ontologyTypeRefId,
      parentAnnotationId: ann.parentAnnotationId,
      temporal: toJson(ann.temporal),
      startMs: ann.startMs,
      endMs: ann.endMs,
      denotesNodeId: ann.denotesNodeId,
      features: toJson(ann.features),
      projectId: ann.projectId,
      createdByUserId: ann.createdByUserId,
    },
  })
}

/**
 * Recomputes a parent claim's native `childIds` denormalization from the current
 * child claim primaries linked to it via `parentAnnotationId`. Self-correcting:
 * called after a subclaim is written or a subtree is removed so the reverse link
 * stays consistent with the authoritative self-relation.
 */
export async function syncChildIds(prisma: PrismaLike, parentClaimId: string): Promise<void> {
  const parentPrimaryId = claimAnnotationId(parentClaimId)
  const children = await prisma.layersAnnotation.findMany({
    where: { parentAnnotationId: parentPrimaryId },
    select: { id: true, denotesNodeId: true },
  })
  const childIds = children.filter(isPrimaryClaimAnnotation).map((child) => child.id)
  await prisma.layersAnnotation.updateMany({
    where: { id: parentPrimaryId },
    data: { childIds: childIds.length > 0 ? childIds : Prisma.DbNull },
  })
}

/** Creates a claim node, its bearer + child annotations, and its reference edges. */
async function persistClaimNode(
  prisma: PrismaLike,
  layerId: string,
  claim: StoredClaim,
): Promise<void> {
  const projection = await claimToLayersViaLens(claim)
  await prisma.graphNode.create({
    data: {
      id: projection.node.id,
      nodeType: projection.node.nodeType,
      label: projection.node.label,
      properties: toJson(projection.node.properties),
      projectId: projection.node.projectId,
      createdByUserId: projection.node.createdByUserId,
    },
  })
  for (const ann of projection.annotations) {
    await createClaimAnnotation(prisma, layerId, ann)
  }
  for (const edge of projection.refEdges) {
    await prisma.graphEdge.create({
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
        projectId: edge.projectId,
        createdByUserId: edge.createdByUserId,
      },
    })
  }
  if (typeof claim.parentClaimId === 'string' && claim.parentClaimId.length > 0) {
    await syncChildIds(prisma, claim.parentClaimId)
  }
}

/**
 * Materializes one claim into the layers store, ensuring the summary's claim-span
 * marker layer exists first. Used by the import and extraction writers.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param summary - the summary the claim belongs to (scope + anchoring)
 * @param claim - the claim to persist
 */
export async function writeClaim(
  prisma: PrismaLike,
  summary: ClaimSummaryContext,
  claim: StoredClaim,
): Promise<void> {
  const layerId = await ensureClaimSpanLayer(prisma, summary)
  await persistClaimNode(prisma, layerId, claim)
}

/** Resolves the layer a relation's endpoint-span annotations live in (its source claim's layer). */
async function relationSpanLayerId(prisma: PrismaLike, sourceClaimId: string): Promise<string | null> {
  const sourcePrimary = await prisma.layersAnnotation.findUnique({
    where: { id: claimAnnotationId(sourceClaimId) },
    select: { layerId: true },
  })
  return sourcePrimary?.layerId ?? null
}

/**
 * Materializes one claim relation into the layers store: a GraphEdge between the
 * two claim nodes plus one endpoint-span annotation per source/target span. The
 * span annotations live in the source claim's claim-span layer, resolved natively
 * from the source claim's bearer annotation.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param relation - the relation to persist
 * @param summaryId - retained for the stable caller signature; the span layer is
 *   resolved natively from the source claim
 * @param projectId - the source claim's project scope
 */
export async function writeClaimRelation(
  prisma: PrismaClient,
  relation: StoredRelation,
  summaryId: string,
  projectId: string | null,
): Promise<void> {
  void summaryId
  const { edge, spanAnnotations } = await relationToLayersViaLens(relation, projectId)
  await prisma.graphEdge.create({
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
      projectId: edge.projectId,
      createdByUserId: edge.createdByUserId,
    },
  })
  if (spanAnnotations.length > 0) {
    const layerId = await relationSpanLayerId(prisma, relation.sourceClaimId)
    if (layerId) {
      for (const ann of spanAnnotations) await createClaimAnnotation(prisma, layerId, ann)
    }
  }
}

/**
 * Deletes a summary's model-extracted claims from the layers store, preserving
 * manually authored ones. Removes the extracted claim nodes (extractionStrategy
 * other than "manual"), their span/temporal annotations, and any relation/
 * reference edges incident to them. Used by the claim-extraction worker to make
 * re-extraction idempotent.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param summaryId - the VideoSummary id
 * @returns the number of extracted claim nodes removed
 */
export async function deleteExtractedSummaryClaims(
  prisma: PrismaLike,
  summaryId: string,
): Promise<number> {
  const claims = await findSummaryClaimNodes(prisma, summaryId)
  const extracted = claims.filter((claim) => (claim.extractionStrategy ?? 'manual') !== 'manual')
  const extractedIds = new Set(extracted.map((claim) => claim.id))
  if (extractedIds.size === 0) return 0
  const ids = [...extractedIds]

  // Bearer + child annotations first (deleting the node would only null their FK),
  // then the relation and reference edges incident to any removed claim, then the
  // nodes. Relation endpoint-span annotations of the removed relations go too.
  await prisma.layersAnnotation.deleteMany({ where: { denotesNodeId: { in: ids } } })
  const incidentEdgeIds = (
    await prisma.graphEdge.findMany({
      where: { OR: [{ sourceLocalId: { in: ids } }, { targetLocalId: { in: ids } }] },
      select: { id: true },
    })
  ).map((edge) => edge.id)
  await prisma.graphEdge.deleteMany({
    where: { OR: [{ sourceLocalId: { in: ids } }, { targetLocalId: { in: ids } }] },
  })
  if (incidentEdgeIds.length > 0) {
    await deleteRelationSpans(prisma, summaryId, incidentEdgeIds)
  }
  const result = await prisma.graphNode.deleteMany({ where: { id: { in: ids } } })

  // Keep surviving parents' childIds consistent with the removed subclaims.
  const survivingParents = new Set(
    extracted
      .map((claim) => claim.parentClaimId ?? null)
      .filter((parentId): parentId is string => parentId !== null && !extractedIds.has(parentId)),
  )
  for (const parentId of survivingParents) await syncChildIds(prisma, parentId)

  return result.count
}

/** Deletes the endpoint-span annotations of the given relation ids in a summary's layer. */
async function deleteRelationSpans(
  prisma: PrismaLike,
  summaryId: string,
  relationIds: string[],
): Promise<void> {
  const spansByRelation = await loadRelationSpans(prisma, summaryId)
  const spanIds: string[] = []
  for (const relationId of relationIds) {
    for (const span of spansByRelation.get(relationId) ?? []) spanIds.push(span.id)
  }
  if (spanIds.length > 0) {
    await prisma.layersAnnotation.deleteMany({ where: { id: { in: spanIds } } })
  }
}

/**
 * Reads a single claim by id from the layers store, or null when no claim with
 * that id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the claim id
 * @returns the reconstructed claim, or null
 */
export async function readClaimById(prisma: PrismaClient, id: string): Promise<StoredClaim | null> {
  const node = await prisma.graphNode.findUnique({ where: { id } })
  if (!node || !isClaimNode(node)) return null
  const primary = await prisma.layersAnnotation.findUnique({ where: { id: claimAnnotationId(id) } })
  if (!primary) return nodeToClaimViaLens(node)
  const children = await prisma.layersAnnotation.findMany({ where: { parentAnnotationId: primary.id } })
  const refEdges = await prisma.graphEdge.findMany({ where: { sourceLocalId: id } })
  const parentClaimId = await resolveParentClaimId(prisma, primary.parentAnnotationId)
  return claimFromLayers(node, primary, { children, refEdges, parentClaimId })
}

/** Resolves a child claim's parent claim id from the parent annotation's denoted node. */
async function resolveParentClaimId(
  prisma: PrismaLike,
  parentAnnotationId: string | null,
): Promise<string | null> {
  if (parentAnnotationId === null) return null
  const parent = await prisma.layersAnnotation.findUnique({
    where: { id: parentAnnotationId },
    select: { denotesNodeId: true },
  })
  return parent?.denotesNodeId ?? null
}

/**
 * Returns the owner user id of a claim in the layers store, or null when no
 * claim with that id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the claim id
 * @returns the owner user id, or null
 */
export async function claimOwner(prisma: PrismaClient, id: string): Promise<string | null> {
  const node = await prisma.graphNode.findUnique({
    where: { id },
    select: { nodeType: true, createdByUserId: true },
  })
  if (node && node.nodeType === 'claim') return node.createdByUserId
  return null
}

/**
 * True when a claim with the given id exists in the layers store.
 *
 * @param prisma - the Prisma client
 * @param id - the claim id
 * @returns whether the claim exists
 */
export async function claimExists(prisma: PrismaClient, id: string): Promise<boolean> {
  return (await prisma.graphNode.count({ where: { id, nodeType: 'claim' } })) > 0
}

/**
 * Lists every claim id paired with its summary id in the layers store, for import
 * conflict detection. The summary membership is read from each claim's primary
 * annotation `summary` argumentRef.
 *
 * @param prisma - the Prisma client
 * @returns claim id / summary id pairs
 */
export async function readAllClaimRefs(
  prisma: PrismaClient,
): Promise<Array<{ id: string; summaryId: string }>> {
  const nodes = (await prisma.graphNode.findMany({ where: { nodeType: 'claim' } })).filter(isClaimNode)
  if (nodes.length === 0) return []
  const primaries = await prisma.layersAnnotation.findMany({
    where: { id: { in: nodes.map((node) => claimAnnotationId(node.id)) } },
    select: { denotesNodeId: true, arguments: true },
  })
  const summaryByClaim = new Map<string, string>()
  for (const primary of primaries) {
    if (primary.denotesNodeId === null) continue
    summaryByClaim.set(primary.denotesNodeId, claimSummaryId(primary) ?? '')
  }

  const refs: Array<{ id: string; summaryId: string }> = []
  const seen = new Set<string>()
  for (const node of nodes) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    refs.push({ id: node.id, summaryId: summaryByClaim.get(node.id) ?? '' })
  }
  return refs
}

/**
 * Lists every claim-relation id paired with its source claim id in the layers
 * store, for import conflict detection.
 *
 * @param prisma - the Prisma client
 * @returns relation id / source claim id pairs
 */
export async function readAllClaimRelationRefs(
  prisma: PrismaClient,
): Promise<Array<{ id: string; sourceClaimId: string }>> {
  const refs: Array<{ id: string; sourceClaimId: string }> = []
  const seen = new Set<string>()
  const edges = await prisma.graphEdge.findMany({})
  for (const edge of edges) {
    if (!isClaimRelationEdge(edge)) continue
    const relation = edgeToRelation(edge)
    if (relation && !seen.has(relation.id)) {
      seen.add(relation.id)
      refs.push({ id: relation.id, sourceClaimId: relation.sourceClaimId })
    }
  }
  return refs
}
