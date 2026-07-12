/**
 * Claim bridge over the unified layers store.
 *
 * Reconstructs a summary's claims and claim relations (the shapes the
 * `/api/summaries/:summaryId/claims` contract exchanges) from the layers store
 * (GraphNode claim rows + span LayersAnnotations + GraphEdge relation rows), and
 * materializes claims and relations into it. Reads are layers-first with a
 * legacy Claim/ClaimRelation read-through gated by a per-summary marker layer;
 * writes create claim nodes, their span annotations, and relation edges. Mirrors
 * the read-through structure of `claim-service.ts`.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import {
  claimSpanAnnotations,
  claimToNode,
  edgeToRelation,
  isClaimNode,
  isClaimRelationEdge,
  nodeToClaim,
  relationToEdge,
  type StoredClaim,
  type StoredRelation,
} from '../claim-layers-mapper.js'
import { claimSpanLayerId, expressionTranscriptId } from '../layers-id-map.js'
import { getOrCreateVideoExpression } from '../video-expression-service.js'
import { requiredJson, toJson } from './util.js'

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
  materialized: boolean
}

/** Reads a summary's claim GraphNodes as stored claims. */
async function findSummaryClaimNodes(prisma: PrismaClient, summaryId: string): Promise<StoredClaim[]> {
  const nodes = await prisma.graphNode.findMany({
    where: {
      nodeType: 'claim',
      properties: { path: ['foveaClaim', 'summaryId'], equals: summaryId },
    },
  })
  const claims: StoredClaim[] = []
  for (const node of nodes) {
    if (!isClaimNode(node)) continue
    const claim = nodeToClaim(node)
    if (claim && claim.summaryId === summaryId) claims.push(claim)
  }
  return claims
}

/** Reads a summary's claim-relation GraphEdges as stored relations. */
async function findSummaryRelationEdges(
  prisma: PrismaClient,
  summaryId: string,
): Promise<StoredRelation[]> {
  const edges = await prisma.graphEdge.findMany({
    where: { properties: { path: ['foveaClaimRelation', 'summaryId'], equals: summaryId } },
  })
  const relations: StoredRelation[] = []
  for (const edge of edges) {
    if (!isClaimRelationEdge(edge)) continue
    const relation = edgeToRelation(edge)
    if (relation) relations.push(relation)
  }
  return relations
}

/** True when the per-summary claim-span marker layer exists. */
async function claimSpanLayerExists(prisma: PrismaClient, summaryId: string): Promise<boolean> {
  const layer = await prisma.annotationLayer.findUnique({ where: { id: claimSpanLayerId(summaryId) } })
  return layer !== null
}

/**
 * True when a summary's claims live in the layers store: it has claim nodes, or
 * its marker layer exists (the case when every claim was deleted).
 */
export async function isSummaryMaterialized(prisma: PrismaClient, summaryId: string): Promise<boolean> {
  const nodes = await findSummaryClaimNodes(prisma, summaryId)
  if (nodes.length > 0) return true
  return claimSpanLayerExists(prisma, summaryId)
}

/** Converts a legacy Claim row to the storable claim shape. */
function fromLegacyClaim(claim: {
  id: string
  summaryId: string
  summaryType: string
  text: string
  gloss: Prisma.JsonValue
  parentClaimId: string | null
  textSpans: Prisma.JsonValue
  timeSpans: Prisma.JsonValue
  claimerType: string | null
  claimerGloss: Prisma.JsonValue
  claimRelation: Prisma.JsonValue
  claimEventId: string | null
  claimTimeId: string | null
  claimLocationId: string | null
  confidence: number | null
  modelUsed: string | null
  extractionStrategy: string | null
  audio: Prisma.JsonValue
  video: Prisma.JsonValue
  metadata: Prisma.JsonValue
  comment: string | null
  createdBy: string | null
  projectId: string | null
  createdAt: Date
  updatedAt: Date
}): StoredClaim {
  return {
    id: claim.id,
    summaryId: claim.summaryId,
    summaryType: claim.summaryType,
    text: claim.text,
    gloss: claim.gloss ?? [],
    parentClaimId: claim.parentClaimId ?? null,
    textSpans: claim.textSpans ?? null,
    timeSpans: claim.timeSpans ?? null,
    claimerType: claim.claimerType ?? null,
    claimerGloss: claim.claimerGloss ?? null,
    claimRelation: claim.claimRelation ?? null,
    claimEventId: claim.claimEventId ?? null,
    claimTimeId: claim.claimTimeId ?? null,
    claimLocationId: claim.claimLocationId ?? null,
    confidence: claim.confidence ?? null,
    modelUsed: claim.modelUsed ?? null,
    extractionStrategy: claim.extractionStrategy ?? null,
    audio: claim.audio ?? null,
    video: claim.video ?? null,
    metadata: claim.metadata ?? null,
    comment: claim.comment ?? null,
    createdBy: claim.createdBy ?? null,
    projectId: claim.projectId ?? null,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  }
}

/** Converts a legacy ClaimRelation row to the storable relation shape. */
function fromLegacyRelation(relation: {
  id: string
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
  sourceSpans: Prisma.JsonValue
  targetSpans: Prisma.JsonValue
  confidence: number | null
  notes: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}): StoredRelation {
  return {
    id: relation.id,
    sourceClaimId: relation.sourceClaimId,
    targetClaimId: relation.targetClaimId,
    relationTypeId: relation.relationTypeId,
    sourceSpans: relation.sourceSpans ?? null,
    targetSpans: relation.targetSpans ?? null,
    confidence: relation.confidence ?? null,
    notes: relation.notes ?? null,
    createdBy: relation.createdBy ?? null,
    createdAt: relation.createdAt.toISOString(),
    updatedAt: relation.updatedAt.toISOString(),
  }
}

/**
 * Reads a summary's flat claims and relations, from the layers store when the
 * summary is materialized and from the legacy Claim/ClaimRelation rows otherwise.
 *
 * @param prisma - the Prisma client
 * @param summaryId - the VideoSummary id
 * @returns the flat claims, relations, and whether the summary is materialized
 */
export async function readSummaryClaims(
  prisma: PrismaClient,
  summaryId: string,
): Promise<SummaryClaimsRead> {
  if (await isSummaryMaterialized(prisma, summaryId)) {
    return {
      claims: await findSummaryClaimNodes(prisma, summaryId),
      relations: await findSummaryRelationEdges(prisma, summaryId),
      materialized: true,
    }
  }
  const legacyClaims = await prisma.claim.findMany({ where: { summaryId } })
  const claims = legacyClaims.map(fromLegacyClaim)
  const legacyRelations =
    legacyClaims.length > 0
      ? await prisma.claimRelation.findMany({
          where: { sourceClaimId: { in: legacyClaims.map((c) => c.id) } },
        })
      : []
  return { claims, relations: legacyRelations.map(fromLegacyRelation), materialized: false }
}

/** Resolves the expression a summary's claim-span layer anchors over. */
async function resolveClaimSpanExpressionId(
  prisma: PrismaClient,
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
  prisma: PrismaClient,
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

/** Creates a claim node and its span annotations under the given layer. */
async function persistClaimNode(
  prisma: PrismaClient,
  layerId: string,
  claim: StoredClaim,
): Promise<void> {
  const node = claimToNode(claim)
  await prisma.graphNode.create({
    data: {
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      properties: toJson(node.properties),
      projectId: node.projectId,
      createdByUserId: node.createdByUserId,
    },
  })
  for (const ann of claimSpanAnnotations(claim)) {
    await prisma.layersAnnotation.create({
      data: {
        id: ann.id,
        layerId,
        anchor: requiredJson(ann.anchor),
        label: ann.label,
        denotesNodeId: ann.denotesNodeId,
        features: toJson(ann.features),
        projectId: ann.projectId,
        createdByUserId: ann.createdByUserId,
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
  prisma: PrismaClient,
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
 * @param summaryId - the source claim's summary id, denormalized for scoping
 * @param projectId - the source claim's project scope
 */
export async function writeClaimRelation(
  prisma: PrismaClient,
  relation: StoredRelation,
  summaryId: string,
  projectId: string | null,
): Promise<void> {
  const edge = relationToEdge(relation, summaryId, projectId)
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
 * Reads a single claim by id across both stores, or null when no claim with that
 * id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the claim id
 * @returns the reconstructed claim, or null
 */
export async function readClaimById(prisma: PrismaClient, id: string): Promise<StoredClaim | null> {
  const node = await prisma.graphNode.findUnique({ where: { id } })
  if (node && isClaimNode(node)) {
    const claim = nodeToClaim(node)
    if (claim) return claim
  }
  const legacy = await prisma.claim.findUnique({ where: { id } })
  return legacy ? fromLegacyClaim(legacy) : null
}

/**
 * Returns the owner user id of a claim across both stores, or null when no claim
 * with that id exists.
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
  const legacy = await prisma.claim.findUnique({ where: { id }, select: { createdBy: true } })
  return legacy ? legacy.createdBy : null
}

/**
 * True when a claim with the given id exists in either store.
 *
 * @param prisma - the Prisma client
 * @param id - the claim id
 * @returns whether the claim exists
 */
export async function claimExists(prisma: PrismaClient, id: string): Promise<boolean> {
  if ((await prisma.graphNode.count({ where: { id, nodeType: 'claim' } })) > 0) return true
  return (await prisma.claim.count({ where: { id } })) > 0
}

/**
 * Lists every claim id paired with its summary id across both stores, for import
 * conflict detection.
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
  const legacy = await prisma.claim.findMany({ select: { id: true, summaryId: true } })
  for (const row of legacy) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      refs.push({ id: row.id, summaryId: row.summaryId })
    }
  }
  return refs
}

/**
 * Lists every claim-relation id paired with its source claim id across both
 * stores, for import conflict detection.
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
  const legacy = await prisma.claimRelation.findMany({ select: { id: true, sourceClaimId: true } })
  for (const row of legacy) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      refs.push({ id: row.id, sourceClaimId: row.sourceClaimId })
    }
  }
  return refs
}
