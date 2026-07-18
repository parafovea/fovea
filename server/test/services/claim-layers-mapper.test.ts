import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

import {
  claimToLayers,
  claimFromLayers,
  relationToEdge,
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

/**
 * Pure round-trip tests for the native claim mapper.
 *
 * These exercise the mapper without a database: a claim (or relation) is
 * projected to native layers rows (GraphNode identity + a primary bearer
 * LayersAnnotation + temporal siblings + cross-object GraphEdges), the projection
 * is serialized the way the store would persist it, and the rows are
 * reconstructed back into the claim. The reconstruction must equal the original —
 * the native form is lossless with no `foveaClaim` sidecar blob.
 */

/** Mimics a JSON column round-tripping through the database (strips undefined). */
function jsonColumn(value: unknown): Prisma.JsonValue {
  return (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))) as Prisma.JsonValue
}

/** Projects a claim and reads back the node + its primary bearer annotation. */
function persistClaim(claim: StoredClaim): { node: ClaimNodeRow; primary: ClaimAnnotationRow } {
  const projection = claimToLayers(claim)
  const node: ClaimNodeRow = {
    id: projection.node.id,
    nodeType: projection.node.nodeType,
    label: projection.node.label,
    properties: jsonColumn(projection.node.properties),
    projectId: projection.node.projectId,
    createdByUserId: projection.node.createdByUserId,
  }
  const p = projection.annotations[0]
  const primary: ClaimAnnotationRow = {
    id: p.id,
    anchor: jsonColumn(p.anchor),
    label: p.label,
    text: p.text,
    value: p.value,
    confidence: p.confidence,
    arguments: jsonColumn(p.arguments),
    ontologyTypeRefId: p.ontologyTypeRefId,
    parentAnnotationId: p.parentAnnotationId,
    temporal: jsonColumn(p.temporal),
    startMs: p.startMs,
    endMs: p.endMs,
    denotesNodeId: p.denotesNodeId,
    features: jsonColumn(p.features),
    projectId: p.projectId,
    createdByUserId: p.createdByUserId,
  }
  return { node, primary }
}

/** Projects a claim and reconstructs it through the simulated store. */
function roundTrip(claim: StoredClaim): StoredClaim {
  const { node, primary } = persistClaim(claim)
  return claimFromLayers(node, primary)
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

  it('projects the claim onto native primitives, not a foveaClaim sidecar', () => {
    const projection = claimToLayers(richClaim)

    // The node is claim identity only — no structured blob in its properties.
    expect(isClaimNode(projection.node)).toBe(true)
    expect(JSON.stringify(projection.node.properties ?? {})).not.toContain('foveaClaim')

    // Exactly one primary bearer annotation plus one temporal-grounding sibling.
    expect(projection.annotations).toHaveLength(2)
    const [primary, temporal] = projection.annotations
    expect(primary.denotesNodeId).toBe('claim-1')
    expect(primary.text).toBe('The sky is blue.')
    expect(primary.confidence).toBe(912) // 0.912 -> 0-1000 integer scale
    expect(temporal.temporal === null && temporal.anchor !== null).toBe(true)
    expect(temporal.startMs).toBe(1500)
    expect(temporal.endMs).toBe(2500)
    expect(JSON.stringify(primary.features ?? {})).not.toContain('foveaClaim')

    // The claimer is a role='claimer' argumentRef + the ontologyTypeRef soft FK.
    expect(primary.ontologyTypeRefId).toBe('person')
    const args = primary.arguments as Array<{ role: string }>
    expect(args.some((a) => a.role === 'claimer')).toBe(true)
    expect(args.some((a) => a.role.startsWith('gloss:'))).toBe(true)

    // The situation/time/location references are cross-object edges.
    expect(projection.refEdges).toHaveLength(3)
    for (const edge of projection.refEdges) {
      expect(isClaimRefEdge(edge)).toBe(true)
      expect(edge.sourceLocalId).toBe('claim-1')
    }
    expect(projection.refEdges.map((e) => e.targetLocalId).sort()).toEqual(['event-1', 'loc-1', 'time-1'])
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

/** Reads a projected relation edge back as a store row. */
function persistRelation(rel: StoredRelation, projectId: string | null): ClaimEdgeRow {
  const edge = relationToEdge(rel, projectId)
  return {
    id: edge.id,
    edgeType: edge.edgeType,
    sourceLocalId: edge.sourceLocalId,
    targetLocalId: edge.targetLocalId,
    confidence: edge.confidence,
    properties: jsonColumn(edge.properties),
    createdByUserId: edge.createdByUserId,
  }
}

describe('claim-layers-mapper relation round trip', () => {
  it('reconstructs a relation losslessly from its edge', () => {
    const edge = persistRelation(relation, null)
    expect(isClaimRelationEdge(edge)).toBe(true)
    expect(edge.confidence).toBe(800)
    expect(edgeToRelation(edge)).toEqual(relation)
  })

  it('rejects a non-claim-relation edge', () => {
    const edge = persistRelation(relation, null)
    const worldish: ClaimEdgeRow = { ...edge, properties: { entries: [{ key: 'fovea.edgeRole', value: 'relation' }] } }
    expect(isClaimRelationEdge(worldish)).toBe(false)
    expect(edgeToRelation(worldish)).toBeNull()
  })
})
