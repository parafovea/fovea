import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

import {
  claimToLayers,
  relationToLayers,
  claimFromLayers,
  edgeToRelation,
  type StoredClaim,
  type StoredRelation,
  type ClaimLayersProjection,
  type RelationLayersProjection,
  type ClaimNodeRow,
  type ClaimAnnotationRow,
  type ClaimEdgeRow,
} from '../../claim-layers-mapper.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import { assertOracleParity, type LayersRow } from '../oracle-parity.js'
import {
  buildClaimTextSpanRegroupLens,
  buildClaimTemporalRegroupLens,
  toClaimSource,
  foveaClaimToLayersRows,
  foveaRelationToLayersRows,
  claimTextSpanRegroupSourceSchema,
  claimTemporalRegroupSourceSchema,
} from '../claim-lens.js'

/**
 * Verifies the FOVEA claim surface's lens+adapter path against the committed
 * hand-rolled forward mapper (the oracle): the text-span and temporal anchor
 * regroups compile to native panproto lenses whose round-trip laws hold, and the
 * composition + adapter reproduce the oracle's rows exactly over a corpus of
 * representative claims and relations. The corpus reuses the fixtures from the
 * oracle's co-located test.
 */

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

/** A projected-with-a-project claim, to exercise the scope columns on every row. */
const scopedClaim: StoredClaim = {
  ...richClaim,
  id: 'claim-3',
  parentClaimId: 'claim-1',
  projectId: 'project-9',
  createdBy: 'user-2',
}

const CLAIM_CORPUS: Array<{ name: string; claim: StoredClaim }> = [
  { name: 'fully populated claim', claim: richClaim },
  { name: 'minimal subclaim', claim: minimalClaim },
  { name: 'project-scoped subclaim', claim: scopedClaim },
]

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

/** A two-sided, note-free relation, to exercise the target-side spans and null notes. */
const twoSidedRelation: StoredRelation = {
  id: 'rel-2',
  sourceClaimId: 'claim-1',
  targetClaimId: 'claim-3',
  relationTypeId: 'contradicts',
  sourceSpans: [{ charStart: 0, charEnd: 3 }],
  targetSpans: [
    { charStart: 4, charEnd: 8 },
    { charStart: 10, charEnd: 14 },
  ],
  confidence: null,
  notes: null,
  createdBy: 'user-2',
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-02T00:00:00.000Z',
}

const RELATION_CORPUS: Array<{ name: string; relation: StoredRelation; projectId: string | null }> = [
  { name: 'one-sided relation with notes', relation, projectId: null },
  { name: 'two-sided relation, project-scoped', relation: twoSidedRelation, projectId: 'project-9' },
]

/** Flattens a claim projection into tagged Prisma-table rows for comparison. */
function claimProjectionToRows(p: ClaimLayersProjection): LayersRow[] {
  return [
    { __table: 'GraphNode', ...p.node },
    ...p.annotations.map((a) => ({ __table: 'LayersAnnotation', ...a })),
    ...p.refEdges.map((e) => ({ __table: 'GraphEdge', ...e })),
  ]
}

/** Flattens a relation projection into tagged Prisma-table rows for comparison. */
function relationProjectionToRows(p: RelationLayersProjection): LayersRow[] {
  return [
    { __table: 'GraphEdge', ...p.edge },
    ...p.spanAnnotations.map((a) => ({ __table: 'LayersAnnotation', ...a })),
  ]
}

describe('claim-lens span-anchor regroup lenses', () => {
  it('compiles a native text-span regroup lens carrying the anchor field transform', async () => {
    const { requirementKind, fieldTransforms } = await buildClaimTextSpanRegroupLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain('root.textSpans:items')
  })

  it('compiles a native temporal regroup lens carrying the anchor field transform', async () => {
    const { requirementKind, fieldTransforms } = await buildClaimTemporalRegroupLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain('root.timeSpans:items')
  })

  it("holds the text-span round-trip laws over every corpus claim's spans", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(claimTextSpanRegroupSourceSchema)
    const { lens } = await buildClaimTextSpanRegroupLens()

    for (const { name, claim } of CLAIM_CORPUS) {
      const vm = toClaimSource(claim)
      const record = {
        id: vm.id,
        textSpans: vm.textSpans.map((s) => ({ charStart: s.charStart, charEnd: s.charEnd })),
      }
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `text-span GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `text-span PutGet for ${name}`).toBe(true)
    }
  })

  it("holds the temporal round-trip laws over every corpus claim's spans", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(claimTemporalRegroupSourceSchema)
    const { lens } = await buildClaimTemporalRegroupLens()

    for (const { name, claim } of CLAIM_CORPUS) {
      const vm = toClaimSource(claim)
      const record = {
        id: vm.id,
        timeSpans: vm.timeSpans.map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
      }
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `temporal GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `temporal PutGet for ${name}`).toBe(true)
    }
  })
})

describe('claim-lens oracle parity', () => {
  it('reproduces the oracle rows for every corpus claim', () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { claim } of CLAIM_CORPUS) {
      oracleRows.push(...claimProjectionToRows(claimToLayers(claim)))
      lensRows.push(...claimProjectionToRows(foveaClaimToLayersRows(claim)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('reproduces the oracle rows for every corpus relation', () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { relation: rel, projectId } of RELATION_CORPUS) {
      oracleRows.push(...relationProjectionToRows(relationToLayers(rel, projectId)))
      lensRows.push(...relationProjectionToRows(foveaRelationToLayersRows(rel, projectId)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('composes the claim record types with deterministic-id cross-refs', () => {
    const rows = foveaClaimToLayersRows(richClaim)
    // The identity node, the primary bearer denoting it, two text-span children,
    // one temporal child, and three cross-object reference edges.
    expect(rows.node.nodeType).toBe('claim')
    expect(rows.annotations).toHaveLength(4)
    const [primary, ...children] = rows.annotations
    expect(primary.denotesNodeId).toBe('claim-1')
    // Every child links to the primary by its deterministic id.
    for (const child of children) expect(child.parentAnnotationId).toBe(primary.id)
    expect(rows.refEdges.map((e) => e.targetLocalId).sort()).toEqual(['event-1', 'loc-1', 'time-1'])
  })
})

// --- reconstruction parity (through the oracle's backward mapper) ------------

/** Mimics a JSON column round-tripping through the database (strips undefined). */
function jsonColumn(value: unknown): Prisma.JsonValue {
  return (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))) as Prisma.JsonValue
}

/** Maps a projected annotation to the row shape the store would persist. */
function annotationRow(mapped: ClaimLayersProjection['annotations'][number]): ClaimAnnotationRow {
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
function edgeRow(mapped: ClaimLayersProjection['refEdges'][number]): ClaimEdgeRow {
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

/** Reconstructs a claim from a projection through the oracle's backward mapper. */
function reconstruct(projection: ClaimLayersProjection, parentClaimId: string | null): StoredClaim {
  const node: ClaimNodeRow = {
    id: projection.node.id,
    nodeType: projection.node.nodeType,
    label: projection.node.label,
    properties: jsonColumn(projection.node.properties),
    projectId: projection.node.projectId,
    createdByUserId: projection.node.createdByUserId,
  }
  const [primaryMapped, ...childrenMapped] = projection.annotations
  return claimFromLayers(node, annotationRow(primaryMapped), {
    children: childrenMapped.map(annotationRow),
    refEdges: projection.refEdges.map(edgeRow),
    parentClaimId,
  })
}

describe('claim-lens reconstruction parity', () => {
  it('reconstructs identically to the oracle backward mapper from the composed rows', () => {
    for (const { name, claim } of CLAIM_CORPUS) {
      const parentClaimId = claim.parentClaimId ?? null
      const fromOracle = reconstruct(claimToLayers(claim), parentClaimId)
      const fromLens = reconstruct(foveaClaimToLayersRows(claim), parentClaimId)
      expect(fromLens, `reconstruction for ${name}`).toEqual(fromOracle)
      // And the reconstruction is faithful to the original claim.
      expect(fromLens, `round trip for ${name}`).toEqual(claim)
    }
  })

  it('reconstructs relations identically to the oracle backward mapper', () => {
    for (const { name, relation: rel, projectId } of RELATION_CORPUS) {
      const oracle = relationToLayers(rel, projectId)
      const lens = foveaRelationToLayersRows(rel, projectId)
      const oracleSpans = oracle.spanAnnotations.map(annotationRow)
      const lensSpans = lens.spanAnnotations.map(annotationRow)
      const fromOracle = edgeToRelation(edgeRow(oracle.edge), oracleSpans)
      const fromLens = edgeToRelation(edgeRow(lens.edge), lensSpans)
      expect(fromLens, `relation reconstruction for ${name}`).toEqual(fromOracle)
      expect(fromLens, `relation round trip for ${name}`).toEqual(rel)
    }
  })
})
