/**
 * Claim bridge over the unified layers store.
 *
 * Reconstructs a summary's claims and claim relations (the shapes the
 * `/api/summaries/:summaryId/claims` contract exchanges) from the layers store
 * (GraphNode claim rows + span LayersAnnotations + GraphEdge relation rows), and
 * materializes claims and relations into it. Reads read the layers store only;
 * writes create claim nodes, their span annotations, and relation edges. Mirrors
 * the structure of `claim-service.ts`.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import {
  claimFromLayers,
  claimToLayers,
  edgeToRelation,
  isClaimNode,
  isClaimRelationEdge,
  nodeToClaim,
  relationToEdge,
  type StoredClaim,
  type StoredRelation,
} from '../claim-layers-mapper.js'
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
 * their bearer annotations living in the summary's claim-span layer (its id a
 * pure function of the summary id); each primary annotation reconstructs its full
 * claim from its denoted node.
 */
async function findSummaryClaimNodes(prisma: PrismaLike, summaryId: string): Promise<StoredClaim[]> {
  const layerId = claimSpanLayerId(summaryId)
  const annotations = await prisma.layersAnnotation.findMany({ where: { layerId } })
  const primaries = annotations.filter(
    (ann) => ann.denotesNodeId !== null && ann.id === claimAnnotationId(ann.denotesNodeId),
  )
  if (primaries.length === 0) return []

  const nodeIds = [...new Set(primaries.map((ann) => ann.denotesNodeId as string))]
  const nodes = await prisma.graphNode.findMany({ where: { id: { in: nodeIds }, nodeType: 'claim' } })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const claims: StoredClaim[] = []
  for (const primary of primaries) {
    const node = nodeById.get(primary.denotesNodeId as string)
    if (!node) continue
    const claim = claimFromLayers(node, primary)
    if (claim.summaryId === summaryId) claims.push(claim)
  }
  return claims
}

/**
 * Reads a summary's claim-relation GraphEdges as stored relations. Relations are
 * scoped by their source claim belonging to the summary (the edge's source
 * endpoint is one of the summary's claim nodes).
 */
async function findSummaryRelationEdges(
  prisma: PrismaLike,
  summaryId: string,
): Promise<StoredRelation[]> {
  const claimIds = (await findSummaryClaimNodes(prisma, summaryId)).map((claim) => claim.id)
  if (claimIds.length === 0) return []
  const edges = await prisma.graphEdge.findMany({ where: { sourceLocalId: { in: claimIds } } })
  const relations: StoredRelation[] = []
  for (const edge of edges) {
    if (!isClaimRelationEdge(edge)) continue
    const relation = edgeToRelation(edge)
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

/** Creates a claim node, its bearer annotations, and its reference edges. */
async function persistClaimNode(
  prisma: PrismaLike,
  layerId: string,
  claim: StoredClaim,
): Promise<void> {
  const projection = claimToLayers(claim)
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
    await prisma.layersAnnotation.create({
      data: {
        id: ann.id,
        layerId,
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

/**
 * Materializes one claim relation into the layers store as a GraphEdge.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param relation - the relation to persist
 * @param summaryId - the source claim's summary id (relations are scoped
 *   natively by their source claim node, so this is retained only for the stable
 *   caller signature)
 * @param projectId - the source claim's project scope
 */
export async function writeClaimRelation(
  prisma: PrismaClient,
  relation: StoredRelation,
  summaryId: string,
  projectId: string | null,
): Promise<void> {
  void summaryId
  const edge = relationToEdge(relation, projectId)
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

/**
 * Deletes a summary's model-extracted claims from the layers store, preserving
 * manually authored ones. Removes the extracted claim nodes (extractionStrategy
 * other than "manual"), their span annotations, and any relation edges incident
 * to them. Used by the claim-extraction worker to make re-extraction idempotent.
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
  const extractedIds = claims
    .filter((claim) => (claim.extractionStrategy ?? 'manual') !== 'manual')
    .map((claim) => claim.id)
  if (extractedIds.length === 0) return 0

  // Bearer + temporal annotations first (deleting the node would only null their
  // FK), then the relation and reference edges incident to any removed claim,
  // then the nodes.
  await prisma.layersAnnotation.deleteMany({ where: { denotesNodeId: { in: extractedIds } } })
  await prisma.graphEdge.deleteMany({
    where: {
      OR: [{ sourceLocalId: { in: extractedIds } }, { targetLocalId: { in: extractedIds } }],
    },
  })
  const result = await prisma.graphNode.deleteMany({ where: { id: { in: extractedIds } } })
  return result.count
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
  return primary ? claimFromLayers(node, primary) : nodeToClaim(node)
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
 * Lists every claim id paired with its summary id in the layers store, for
 * import conflict detection.
 *
 * @param prisma - the Prisma client
 * @returns claim id / summary id pairs
 */
export async function readAllClaimRefs(
  prisma: PrismaClient,
): Promise<Array<{ id: string; summaryId: string }>> {
  const refs: Array<{ id: string; summaryId: string }> = []
  const seen = new Set<string>()
  const nodes = await prisma.graphNode.findMany({ where: { nodeType: 'claim' } })
  for (const node of nodes) {
    if (!isClaimNode(node)) continue
    const claim = nodeToClaim(node)
    if (claim && !seen.has(claim.id)) {
      seen.add(claim.id)
      refs.push({ id: claim.id, summaryId: claim.summaryId })
    }
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
