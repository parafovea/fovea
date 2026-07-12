/**
 * Backfills a legacy Claim and its relations into the layers store.
 *
 * A Claim becomes a GraphNode(nodeType=claim) reusing the Claim's id. Each of
 * the Claim's text spans becomes a span LayersAnnotation (a textSpan anchor over
 * the summary's transcript expression) that denotes the claim node, grouped
 * under one claim-span AnnotationLayer per summary. A ClaimRelation becomes a
 * GraphEdge reusing the relation id, linking the two claim nodes.
 *
 * @module
 */

import { PrismaClient, type Claim, type ClaimRelation } from '@prisma/client'

import {
  claimSpanAnnotationId,
  claimSpanLayerId,
  expressionTranscriptId,
  reuseClaimNodeId,
  reuseClaimRelationEdgeId,
} from './id-map.js'
import {
  toJson,
  requiredJson,
  type LegacyTextSpan,
  type StepStats,
} from './helpers.js'

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): unknown {
  return { localId: { value: id } }
}

/** Reads a JSON column expected to hold text spans, tolerating null/non-array. */
function readTextSpans(value: unknown): LegacyTextSpan[] {
  return Array.isArray(value) ? (value as LegacyTextSpan[]) : []
}

/**
 * Backfills one Claim into a claim GraphNode plus its text-span annotations.
 *
 * @param prisma - the Prisma client
 * @param claim - the legacy Claim row
 * @returns the created/updated tally
 */
export async function backfillClaim(prisma: PrismaClient, claim: Claim): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  const scope = { projectId: claim.projectId, createdByUserId: claim.createdBy ?? null }

  // GraphNode(nodeType=claim): the claim as a world object.
  const nodeId = reuseClaimNodeId(claim.id)
  const nodeData = {
    nodeType: 'claim',
    label: claim.text,
    properties: toJson({ gloss: claim.gloss, summaryId: claim.summaryId }),
    ...scope,
  }
  const nodeExisted = (await prisma.graphNode.count({ where: { id: nodeId } })) > 0
  await prisma.graphNode.upsert({
    where: { id: nodeId },
    create: { id: nodeId, ...nodeData },
    update: nodeData,
  })
  nodeExisted ? (stats.updated += 1) : (stats.created += 1)

  // Span annotations denoting the claim, anchored on the summary's transcript.
  const spans = readTextSpans(claim.textSpans)
  const expressionId = expressionTranscriptId(claim.summaryId)
  const hasExpression = (await prisma.expression.count({ where: { id: expressionId } })) > 0
  if (spans.length > 0 && hasExpression) {
    const layerId = claimSpanLayerId(claim.summaryId)
    const layerExisted = (await prisma.annotationLayer.count({ where: { id: layerId } })) > 0
    await prisma.annotationLayer.upsert({
      where: { id: layerId },
      create: {
        id: layerId,
        expressionId,
        kind: 'span',
        subkind: 'claim',
        ...scope,
      },
      update: { expressionId, kind: 'span', subkind: 'claim' },
    })
    layerExisted ? (stats.updated += 1) : (stats.created += 1)

    for (let index = 0; index < spans.length; index += 1) {
      const span = spans[index]
      const annId = claimSpanAnnotationId(claim.id, index)
      // Legacy text spans carry character offsets; byte offsets fall back to the
      // same values (exact for ASCII, a safe approximation otherwise).
      const anchor = {
        textSpan: {
          byteStart: span.charStart,
          byteEnd: span.charEnd,
          charStart: span.charStart,
          charEnd: span.charEnd,
        },
      }
      const annData = {
        layerId,
        anchor: requiredJson(anchor),
        label: 'claim-span',
        denotesNodeId: nodeId,
        features: toJson(
          span.sentenceIndex != null
            ? { entries: [{ key: 'fovea.sentenceIndex', value: String(span.sentenceIndex) }] }
            : undefined,
        ),
        ...scope,
      }
      const annExisted = (await prisma.layersAnnotation.count({ where: { id: annId } })) > 0
      await prisma.layersAnnotation.upsert({
        where: { id: annId },
        create: { id: annId, ...annData },
        update: annData,
      })
      annExisted ? (stats.updated += 1) : (stats.created += 1)
    }
  }

  return stats
}

/**
 * Backfills one ClaimRelation into a GraphEdge linking the two claim nodes.
 *
 * @param prisma - the Prisma client
 * @param relation - the legacy ClaimRelation row
 * @returns the created/updated tally
 */
export async function backfillClaimRelation(
  prisma: PrismaClient,
  relation: ClaimRelation,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }

  const sourceClaim = await prisma.claim.findUnique({ where: { id: relation.sourceClaimId } })
  const scope = {
    projectId: sourceClaim?.projectId ?? null,
    createdByUserId: relation.createdBy ?? null,
  }

  const edgeId = reuseClaimRelationEdgeId(relation.id)
  const edgeData = {
    source: requiredJson(localRef(relation.sourceClaimId)),
    target: requiredJson(localRef(relation.targetClaimId)),
    sourceLocalId: relation.sourceClaimId,
    targetLocalId: relation.targetClaimId,
    edgeType: relation.relationTypeId,
    label: relation.relationTypeId,
    confidence: relation.confidence != null ? Math.round(relation.confidence * 1000) : null,
    properties: toJson({ sourceSpans: relation.sourceSpans, targetSpans: relation.targetSpans }),
    ...scope,
  }
  const existed = (await prisma.graphEdge.count({ where: { id: edgeId } })) > 0
  await prisma.graphEdge.upsert({
    where: { id: edgeId },
    create: { id: edgeId, ...edgeData },
    update: edgeData,
  })
  existed ? (stats.updated += 1) : (stats.created += 1)

  return stats
}

/**
 * Backfills a batch of claims and a batch of claim relations, aggregating their
 * tallies. Claims are processed before relations so both endpoints of every edge
 * already exist as claim nodes.
 *
 * @param prisma - the Prisma client
 * @param claims - the legacy Claim rows
 * @param relations - the legacy ClaimRelation rows
 * @returns the aggregate created/updated tally
 */
export async function backfillClaims(
  prisma: PrismaClient,
  claims: Claim[],
  relations: ClaimRelation[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const claim of claims) {
    const step = await backfillClaim(prisma, claim)
    stats.created += step.created
    stats.updated += step.updated
  }
  for (const relation of relations) {
    const step = await backfillClaimRelation(prisma, relation)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
