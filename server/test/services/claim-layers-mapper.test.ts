import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

import {
  claimToLayers,
  claimFromLayers,
  relationToLayers,
  edgeToRelation,
  isClaimNode,
  isClaimRelationEdge,
  isClaimRefEdge,
  type StoredClaim,
  type StoredRelation,
  type ClaimNodeRow,
  type ClaimAnnotationRow,
  type ClaimEdgeRow,
} from '../../src/services/claim-layers-mapper.js'
import { claimAnnotationId } from '../../src/services/layers-id-map.js'

/**
 * Pure round-trip tests for the native claim mapper.
 *
 * These exercise the mapper without a database: a claim (or relation) is projected
 * to native layers rows (GraphNode identity + a primary bearer LayersAnnotation +
 * text-span/temporal child annotations + cross-object GraphEdges), the projection
 * is serialized the way the store would persist it, and the rows are reconstructed
 * back into the claim by querying those native rows. The reconstruction must equal
 * the original — the native form is lossless with no residual sidecar. (The parent
 * claim link is the `parentAnnotationId` self-relation, whose resolution to the
 * parent claim id is a database-caller concern exercised in the route tests; the
 * pure mapper is handed the resolved id.)
 */

/** Mimics a JSON column round-tripping through the database (strips undefined). */
function jsonColumn(value: unknown): Prisma.JsonValue {
  return (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))) as Prisma.JsonValue
}

/** Maps a projected annotation to the row shape the store would persist. */
function annotationRow(mapped: ReturnType<typeof claimToLayers>['annotations'][number]): ClaimAnnotationRow {
  return {
    id: mapped.id,
    anchor: jsonColumn(mapped.anchor),
    label: mapped.label,
    text: mapped.text,
    value: mapped.value,
    confidence: mapped.confidence,
    arguments: jsonColumn(mapped.arguments),
    ontologyTypeRefId: mapped.ontologyTypeRefId,
    parentAnnotationId: mapped.parentAnnotationId,
    temporal: jsonColumn(mapped.temporal),
    startMs: mapped.startMs,
    endMs: mapped.endMs,
    denotesNodeId: mapped.denotesNodeId,
    features: jsonColumn(mapped.features),
    projectId: mapped.projectId,
    createdByUserId: mapped.createdByUserId,
  }
}

/** Maps a projected edge to the row shape the store would persist. */
function edgeRow(mapped: ReturnType<typeof claimToLayers>['refEdges'][number]): ClaimEdgeRow {
  return {
    id: mapped.id,
    edgeType: mapped.edgeType,
    sourceLocalId: mapped.sourceLocalId,
    targetLocalId: mapped.targetLocalId,
    confidence: mapped.confidence,
    properties: jsonColumn(mapped.properties),
    createdByUserId: mapped.createdByUserId,
  }
}

/** Projects a claim and reads back all of its native rows. */
function persistClaim(claim: StoredClaim): {
  node: ClaimNodeRow
  primary: ClaimAnnotationRow
  children: ClaimAnnotationRow[]
  refEdges: ClaimEdgeRow[]
} {
  const projection = claimToLayers(claim)
  const node: ClaimNodeRow = {
    id: projection.node.id,
    nodeType: projection.node.nodeType,
    label: projection.node.label,
    properties: jsonColumn(projection.node.properties),
    projectId: projection.node.projectId,
    createdByUserId: projection.node.createdByUserId,
  }
  const [primaryMapped, ...childrenMapped] = projection.annotations
  return {
    node,
    primary: annotationRow(primaryMapped),
    children: childrenMapped.map(annotationRow),
    refEdges: projection.refEdges.map(edgeRow),
  }
}

/** Projects a claim and reconstructs it through the simulated store. */
function roundTrip(claim: StoredClaim): StoredClaim {
  const { node, primary, children, refEdges } = persistClaim(claim)
  return claimFromLayers(node, primary, { children, refEdges, parentClaimId: claim.parentClaimId ?? null })
}

const richClaim: StoredClaim = {
  id: 'claim-1',
  summaryId: 'summary-1',
  summaryType: 'video',
  text: 'The sky is blue.',
  gloss: [
    { type: 'text', content: 'means ' },
    { type: 'typeRef', content: 'et-color', refType: 'entity', refPersonaId: 'p-1' },
    { type: 'text', content: ' of the sky' },
  ],
  parentClaimId: null,
  textSpans: [
    { sentenceIndex: 0, charStart: 0, charEnd: 16 },
    { charStart: 20, charEnd: 25 },
  ],
  timeSpans: [{ start: 1.5, end: 2.5, source: 'annotation', annotationIds: ['a-1', 'a-2'] }],
  claimerType: 'person',
  claimerGloss: [{ type: 'text', content: 'the narrator' }],
  claimRelation: [
    { type: 'text', content: 'asserts via ' },
    { type: 'claimRef', content: 'that claim', refClaimId: 'claim-9' },
  ],
  claimEventId: 'event-1',
  claimTimeId: 'time-1',
  claimLocationId: 'loc-1',
  confidence: 0.912,
  modelUsed: 'gpt-x',
  extractionStrategy: 'semantic-units',
  audio: ['speech'],
  video: ['text'],
  metadata: ['non-text'],
  comment: 'a reviewer note',
  createdBy: 'user-1',
  projectId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
}

const minimalClaim: StoredClaim = {
  id: 'claim-2',
  summaryId: 'summary-1',
  summaryType: 'video',
  text: 'Grass is green.',
  gloss: [],
  parentClaimId: 'claim-1',
  textSpans: null,
  timeSpans: null,
  claimerType: null,
  claimerGloss: null,
  claimRelation: null,
  claimEventId: null,
  claimTimeId: null,
  claimLocationId: null,
  confidence: null,
  modelUsed: null,
  extractionStrategy: 'manual',
  audio: null,
  video: null,
  metadata: null,
  comment: null,
  createdBy: 'user-1',
  projectId: null,
  createdAt: '2024-01-03T00:00:00.000Z',
  updatedAt: '2024-01-03T00:00:00.000Z',
}

describe('claim-layers-mapper native round trip', () => {
  it('reconstructs a fully populated claim losslessly', () => {
    expect(roundTrip(richClaim)).toEqual(richClaim)
  })

  it('reconstructs a minimal claim, preserving null-vs-empty distinctions', () => {
    expect(roundTrip(minimalClaim)).toEqual(minimalClaim)
  })

  it('projects the claim onto native primitives, not a residual sidecar', () => {
    const projection = claimToLayers(richClaim)

    // The node is claim identity only — no structured blob in its properties.
    expect(isClaimNode(projection.node)).toBe(true)
    expect(projection.node.properties).toBeNull()

    // The primary bearer, one text-span child per span, and one temporal child.
    expect(projection.annotations).toHaveLength(4)
    const [primary, ...children] = projection.annotations
    expect(primary.denotesNodeId).toBe('claim-1')
    expect(primary.text).toBe('The sky is blue.')
    expect(primary.confidence).toBe(912) // 0.912 -> 0-1000 integer scale
    // The primary carries no anchor; the spans live in child annotations.
    expect(primary.anchor).toBeNull()

    // No `fovea.`-prefixed feature key and no U+0001 shredding survive anywhere.
    const serialized = JSON.stringify(projection)
    expect(serialized).not.toContain('fovea.')
    expect(serialized).not.toContain(String.fromCharCode(1))

    const textSpanChildren = children.filter((c) => c.label === 'claim-text-span')
    expect(textSpanChildren).toHaveLength(2)
    for (const child of textSpanChildren) {
      const anchor = child.anchor as { textSpan?: { charStart?: number; byteStart?: number } }
      expect(typeof anchor.textSpan?.charStart).toBe('number')
      // Byte offsets are omitted (no source text) rather than set to char offsets.
      expect(anchor.textSpan?.byteStart).toBeUndefined()
      expect(child.parentAnnotationId).toBe(primary.id)
    }

    const temporalChildren = children.filter((c) => c.label === 'claim-time')
    expect(temporalChildren).toHaveLength(1)
    expect(temporalChildren[0].startMs).toBe(1500)
    expect(temporalChildren[0].endMs).toBe(2500)
    expect(temporalChildren[0].parentAnnotationId).toBe(primary.id)

    // The claimer is a role='claimer' argumentRef + the ontologyTypeRef soft FK,
    // the summary membership is a role='summary' argumentRef, and the gloss rides
    // as role='gloss:*' argumentRefs.
    expect(primary.ontologyTypeRefId).toBe('person')
    const args = primary.arguments as Array<{ role: string; target?: { localId?: { value?: string } } }>
    expect(args.some((a) => a.role === 'claimer')).toBe(true)
    expect(args.some((a) => a.role.startsWith('gloss:'))).toBe(true)
    const summaryArg = args.find((a) => a.role === 'summary')
    expect(summaryArg?.target?.localId?.value).toBe('summary-1')

    // The situation/time/location references are cross-object edges.
    expect(projection.refEdges).toHaveLength(3)
    for (const edge of projection.refEdges) {
      expect(isClaimRefEdge(edge)).toBe(true)
      expect(edge.sourceLocalId).toBe('claim-1')
    }
    expect(projection.refEdges.map((e) => e.targetLocalId).sort()).toEqual(['event-1', 'loc-1', 'time-1'])
  })

  it('links a subclaim to its parent via the native parentAnnotationId self-relation', () => {
    const projection = claimToLayers(minimalClaim)
    expect(projection.annotations[0].parentAnnotationId).toBe(claimAnnotationId('claim-1'))
  })

  it('quantizes confidence once to the integer scale', () => {
    const claim: StoredClaim = { ...minimalClaim, confidence: 0.5 }
    const { primary } = persistClaim(claim)
    expect(primary.confidence).toBe(500)
    expect(roundTrip(claim).confidence).toBe(0.5)
  })
})

const relation: StoredRelation = {
  id: 'rel-1',
  sourceClaimId: 'claim-1',
  targetClaimId: 'claim-2',
  relationTypeId: 'supports',
  sourceSpans: [{ charStart: 0, charEnd: 5 }],
  targetSpans: null,
  confidence: 0.8,
  notes: 'both about color',
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

/** Reads a projected relation back as its edge row and endpoint-span rows. */
function persistRelation(
  rel: StoredRelation,
  projectId: string | null,
): { edge: ClaimEdgeRow; spans: ClaimAnnotationRow[] } {
  const { edge, spanAnnotations } = relationToLayers(rel, projectId)
  return { edge: edgeRow(edge), spans: spanAnnotations.map(annotationRow) }
}

describe('claim-layers-mapper relation round trip', () => {
  it('reconstructs a relation losslessly from its edge and endpoint-span annotations', () => {
    const { edge, spans } = persistRelation(relation, null)
    expect(isClaimRelationEdge(edge)).toBe(true)
    expect(edge.edgeType).toBe('supports') // lossless: the relation type is the edgeType
    expect(edge.confidence).toBe(800)
    expect(edgeToRelation(edge, spans)).toEqual(relation)
  })

  it('rejects a non-claim-relation edge', () => {
    const { edge } = persistRelation(relation, null)
    const worldish: ClaimEdgeRow = { ...edge, properties: { entries: [{ key: 'worldRole', value: 'relation' }] } }
    expect(isClaimRelationEdge(worldish)).toBe(false)
    expect(edgeToRelation(worldish)).toBeNull()
  })
})
