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
  type ClaimReconstructionContext,
} from '../../claim-layers-mapper.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import { assertOracleParity, assertBackwardParity, type LayersRow } from '../oracle-parity.js'
import {
  buildClaimLens,
  buildRelationLens,
  getClaimLens,
  getRelationLens,
  toClaimSource,
  toRelationSource,
  toClaimLensRecord,
  toRelationLensRecord,
  projectClaimCore,
  projectRelationCore,
  foveaClaimToLayersRows,
  foveaRelationToLayersRows,
  claimLensSourceSchema,
  relationLensSourceSchema,
  CLAIM_LENS_BODY_VERTEX,
  RELATION_LENS_BODY_VERTEX,
  buildClaimBackLens,
  buildRelationBackLens,
  getClaimBackLens,
  getRelationBackLens,
  layersToClaimViaLens,
  layersToRelationViaLens,
  regroupClaimBackRecord,
  regroupRelationBackRecord,
  claimBackLensSourceSchema,
  relationBackLensSourceSchema,
  CLAIM_BACK_LENS_BODY_VERTEX,
  RELATION_BACK_LENS_BODY_VERTEX,
} from '../claim-lens.js'

/**
 * Verifies the FOVEA claim surface's lens+adapter path against the committed
 * hand-rolled forward mapper (the oracle): the claim-core and relation-core lenses
 * compile to native panproto lenses whose round-trip laws hold and whose `getJson`
 * output already carries the gloss fold, the confidence scale, the interleaved
 * argument encoding, and the text-span / temporal anchor regroups; and the
 * composition + adapter reproduce the oracle's rows exactly over a corpus of
 * representative claims and relations, reconstructing identically through the
 * oracle's backward mapper.
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

describe('claim-lens core lenses', () => {
  it('compiles a native claim lens carrying the value, confidence, argument, and span transforms', async () => {
    const { requirementKind, fieldTransforms } = await buildClaimLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain(CLAIM_LENS_BODY_VERTEX)
    const rootTransforms = fieldTransforms[CLAIM_LENS_BODY_VERTEX] as Array<{ ComputeField?: { target_key?: string } }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(expect.arrayContaining(['value', 'confidence', 'arguments', 'textSpans', 'timeSpans']))
  })

  it('compiles a native relation lens carrying the endpoint, confidence, property, and span transforms', async () => {
    const { requirementKind, fieldTransforms } = await buildRelationLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain(RELATION_LENS_BODY_VERTEX)
    const rootTransforms = fieldTransforms[RELATION_LENS_BODY_VERTEX] as Array<{ ComputeField?: { target_key?: string } }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(expect.arrayContaining(['source', 'target', 'confidence', 'properties', 'spans']))
  })

  it("holds the claim lens round-trip laws over every corpus claim's core", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(claimLensSourceSchema)
    const { lens } = await getClaimLens()
    for (const { name, claim } of CLAIM_CORPUS) {
      const record = toClaimLensRecord(toClaimSource(claim))
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `claim GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `claim PutGet for ${name}`).toBe(true)
    }
  })

  it("holds the relation lens round-trip laws over every corpus relation's core", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(relationLensSourceSchema)
    const { lens } = await getRelationLens()
    for (const { name, relation: rel, projectId } of RELATION_CORPUS) {
      const record = toRelationLensRecord(toRelationSource(rel, projectId))
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `relation GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `relation PutGet for ${name}`).toBe(true)
    }
  })

  it('emits the gloss fold, confidence scale, interleaved arguments, and regrouped spans', async () => {
    const { lens } = await getClaimLens()
    const core = projectClaimCore(lens, toClaimSource(richClaim))

    // The gloss segments were folded to the plain-text value, and the 0-1
    // confidence scaled to the layers-native 0-1000 integer, by the lens.
    expect(core.value).toBe('means et-color of the sky')
    expect(core.confidence).toBe(912)

    // The three gloss fields were index-keyed and interleaved with the object refs.
    const roles = core.arguments.map((a) => (a as { role: string }).role)
    expect(roles).toEqual(['gloss:0', 'gloss:1', 'gloss:2', 'claim-relation:0', 'claim-relation:1', 'claimer-gloss:0', 'summary', 'claimer'])
    // A non-text segment points at its target through a localId objectRef.
    const typeRefArg = core.arguments[1] as { target?: { localId: { value: string } }; features: { entries: Array<{ key: string; value: string }> } }
    expect(typeRefArg.target?.localId.value).toBe('et-color')
    expect(typeRefArg.features.entries).toEqual([
      { key: 'segType', value: 'typeRef' },
      { key: 'segContent', value: 'et-color' },
      { key: 'refType', value: 'entity' },
      { key: 'refPersonaId', value: 'p-1' },
    ])

    // The flat character offsets were nested under a textSpan anchor, the sentence
    // index carried as a feature only when present.
    expect(core.textSpans[0].anchor).toEqual({ textSpan: { charStart: 0, charEnd: 16 } })
    expect(core.textSpans[0].features.entries).toEqual([
      { key: 'spanIndex', value: '0' },
      { key: 'sentenceIndex', value: '0' },
    ])
    expect(core.textSpans[1].features.entries).toEqual([{ key: 'spanIndex', value: '1' }])

    // The seconds were scaled to milliseconds and nested under a temporalSpan
    // anchor; the source-annotation ids became time-annotation argumentRefs.
    expect(core.timeSpans[0].anchor).toEqual({ temporalSpan: { start: 1500, ending: 2500 } })
    expect(core.timeSpans[0].startMs).toBe(1500)
    expect(core.timeSpans[0].endMs).toBe(2500)
    expect(core.timeSpans[0].arguments.map((a) => (a as { target: { localId: { value: string } } }).target.localId.value)).toEqual([
      'a-1',
      'a-2',
    ])
  })

  it('emits a null value and a null confidence for a glossless, confidenceless claim', async () => {
    const { lens } = await getClaimLens()
    const core = projectClaimCore(lens, toClaimSource(minimalClaim))
    expect(core.value).toBeNull()
    expect(core.confidence).toBeNull()
    // The summary object reference is always present, even with no gloss.
    expect(core.arguments.map((a) => (a as { role: string }).role)).toEqual(['summary'])
    expect(core.textSpans).toEqual([])
    expect(core.timeSpans).toEqual([])
  })

  it('emits the nested endpoints, scaled confidence, property entries, and relation-referencing spans', async () => {
    const { lens } = await getRelationLens()
    const core = projectRelationCore(lens, toRelationSource(relation, null))

    expect(core.source).toEqual({ localId: { value: 'claim-1' } })
    expect(core.target).toEqual({ localId: { value: 'claim-2' } })
    expect(core.confidence).toBe(800)
    expect(core.properties.entries).toEqual([
      { key: 'edgeRole', value: 'claim-relation' },
      { key: 'createdAt', value: '2024-01-01T00:00:00.000Z' },
      { key: 'updatedAt', value: '2024-01-01T00:00:00.000Z' },
      { key: 'notes', value: 'both about color' },
    ])
    // Each endpoint span points back at the relation by the root relation id.
    expect(core.spans[0].anchor).toEqual({ textSpan: { charStart: 0, charEnd: 5 } })
    expect(core.spans[0].arguments).toEqual([{ role: 'relation-of', target: { localId: { value: 'rel-1' } } }])

    // A null-notes relation omits the notes property entry.
    const bare = projectRelationCore(lens, toRelationSource(twoSidedRelation, 'project-9'))
    expect(bare.confidence).toBeNull()
    expect(bare.properties.entries.map((e) => e.key)).toEqual(['edgeRole', 'createdAt', 'updatedAt'])
  })
})

describe('claim-lens oracle parity', () => {
  it('reproduces the oracle rows for every corpus claim', async () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { claim } of CLAIM_CORPUS) {
      oracleRows.push(...claimProjectionToRows(claimToLayers(claim)))
      lensRows.push(...claimProjectionToRows(await foveaClaimToLayersRows(claim)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('reproduces the oracle rows for every corpus relation', async () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { relation: rel, projectId } of RELATION_CORPUS) {
      oracleRows.push(...relationProjectionToRows(relationToLayers(rel, projectId)))
      lensRows.push(...relationProjectionToRows(await foveaRelationToLayersRows(rel, projectId)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('composes the claim record types with deterministic-id cross-refs', async () => {
    const rows = await foveaClaimToLayersRows(richClaim)
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

// --- reconstruction: stored-row projection ----------------------------------

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

/** The stored node/primary/children/ref-edge rows a claim projection persists to. */
interface ClaimRows {
  node: ClaimNodeRow
  primary: ClaimAnnotationRow
  context: ClaimReconstructionContext
}

/** Projects a claim projection into the stored rows a read path would load back. */
function claimRows(projection: ClaimLayersProjection, parentClaimId: string | null): ClaimRows {
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
    context: {
      children: childrenMapped.map(annotationRow),
      refEdges: projection.refEdges.map(edgeRow),
      parentClaimId,
    },
  }
}

// --- backward core lenses ----------------------------------------------------

describe('claim-lens backward core lenses', () => {
  it('compiles a native backward claim lens carrying the value inversions', async () => {
    const { requirementKind, fieldTransforms } = await buildClaimBackLens()
    expect(requirementKind).toBe('empty')
    const rootTransforms = fieldTransforms[CLAIM_BACK_LENS_BODY_VERTEX] as Array<{ ComputeField?: { target_key?: string } }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(
      expect.arrayContaining(['confidence', 'gloss', 'claimRelation', 'claimerGloss', 'summaryId', 'textSpans', 'timeSpans']),
    )
  })

  it('compiles a native backward relation lens carrying the value inversions', async () => {
    const { requirementKind, fieldTransforms } = await buildRelationBackLens()
    expect(requirementKind).toBe('empty')
    const rootTransforms = fieldTransforms[RELATION_BACK_LENS_BODY_VERTEX] as Array<{ ComputeField?: { target_key?: string } }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(
      expect.arrayContaining(['confidence', 'notes', 'createdAt', 'updatedAt', 'sourceSpans', 'targetSpans']),
    )
  })

  it("holds the backward claim lens round-trip laws over every corpus claim's regrouped rows", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(claimBackLensSourceSchema)
    const { lens } = await getClaimBackLens()
    for (const { name, claim } of CLAIM_CORPUS) {
      const { primary, context } = claimRows(await foveaClaimToLayersRows(claim), claim.parentClaimId ?? null)
      const record = regroupClaimBackRecord(primary, context.children)
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `backward claim GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `backward claim PutGet for ${name}`).toBe(true)
    }
  })

  it("holds the backward relation lens round-trip laws over every corpus relation's regrouped rows", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(relationBackLensSourceSchema)
    const { lens } = await getRelationBackLens()
    for (const { name, relation: rel, projectId } of RELATION_CORPUS) {
      const projection = await foveaRelationToLayersRows(rel, projectId)
      const record = regroupRelationBackRecord(edgeRow(projection.edge), projection.spanAnnotations.map(annotationRow))
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `backward relation GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `backward relation PutGet for ${name}`).toBe(true)
    }
  })
})

// --- reconstruction parity (through the backward lens, not the oracle) -------

describe('claim-lens reconstruction parity', () => {
  it('reconstructs each claim through the backward lens, matching the oracle and the original', async () => {
    for (const { name, claim } of CLAIM_CORPUS) {
      const parentClaimId = claim.parentClaimId ?? null
      // The oracle reconstruction is the parity target; the lens path never calls it.
      const oracleRows = claimRows(claimToLayers(claim), parentClaimId)
      const oracleClaim = claimFromLayers(oracleRows.node, oracleRows.primary, oracleRows.context)

      const lensRows = claimRows(await foveaClaimToLayersRows(claim), parentClaimId)
      const lensClaim = await layersToClaimViaLens(lensRows.node, lensRows.primary, lensRows.context)

      assertBackwardParity(oracleClaim, lensClaim)
      // And the lens reconstruction is faithful to the original claim.
      expect(lensClaim, `round trip for ${name}`).toEqual(claim)
    }
  })

  it('reconstructs each relation through the backward lens, matching the oracle and the original', async () => {
    for (const { name, relation: rel, projectId } of RELATION_CORPUS) {
      const oracle = relationToLayers(rel, projectId)
      const oracleRelation = edgeToRelation(edgeRow(oracle.edge), oracle.spanAnnotations.map(annotationRow))

      const lens = await foveaRelationToLayersRows(rel, projectId)
      const lensRelation = await layersToRelationViaLens(edgeRow(lens.edge), lens.spanAnnotations.map(annotationRow))

      assertBackwardParity(oracleRelation, lensRelation)
      expect(lensRelation, `relation round trip for ${name}`).toEqual(rel)
    }
  })
})
