/**
 * Bidirectional conversion between the hierarchical Claim tree the
 * `/api/summaries/:summaryId/claims` contract exchanges and the native layers
 * store (GraphNode + LayersAnnotation + GraphEdge).
 *
 * Every claim construct lands in an existing layers primitive — no verbatim blob,
 * no whole-object stash, no shredded feature map:
 *
 *   - A claim is one GraphNode (`nodeType=claim`) carrying only identity: its text
 *     as the node label.
 *   - Its bearer is ONE primary LayersAnnotation (`subkind=claim`) denoting that
 *     node: the claim text on `text`, confidence on `confidence` (0-1000 integer
 *     scale), the gloss / claimRelation / claimerGloss as role-tagged
 *     `argumentRef`s in `arguments`, the claimer type on `ontologyTypeRefId` + a
 *     `claimer` argumentRef, the summary membership as a `summary` argumentRef, and
 *     the parent claim link on the native `parentAnnotationId` self-relation (the
 *     parent's bearer annotation id).
 *   - Its discontiguous text spans become `textSpan`-anchored child annotations
 *     (one per span), and its video-time groundings become `temporalSpan`-anchored
 *     child annotations — both children of the primary via `parentAnnotationId`.
 *   - Its situation / time / location references become cross-object GraphEdges
 *     (`describes` / `occurs-at` / `located-at`), read back on reconstruction.
 *   - A ClaimRelation is one GraphEdge between the two claim nodes, `edgeType` the
 *     relation type and `confidence` on the integer scale; its source/target spans
 *     become `textSpan`-anchored annotations pointing at the relation.
 *
 * Reconstruction is native: the read path queries the primary annotation, its
 * span/temporal child annotations (via `parentAnnotationId`), the cross-object ref
 * GraphEdges, and the relation-span annotations — never a residual it also wrote.
 * Only genuinely flat, opaque scalar extension values with no dedicated column
 * (modality tags, the extraction provenance, the semantic timestamps) ride in flat
 * `feature` entries, one entry per field keyed by the field name.
 *
 * @module
 */

import type {
  GraphNode as PrismaGraphNode,
  GraphEdge as PrismaGraphEdge,
  LayersAnnotation as PrismaLayersAnnotation,
} from '@prisma/client'

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'

import {
  claimAnnotationId,
  claimTimeSpanAnnotationId,
  claimTextSpanAnnotationId,
  claimRefEdgeId,
  relationSpanAnnotationId,
} from './layers-id-map.js'

/** The nodeType every claim GraphNode carries. */
export const CLAIM_NODE_TYPE = 'claim'

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

// --- projection shapes -------------------------------------------------------

/** A GraphNode create payload a claim materialization persists. */
export interface MappedClaimNode {
  id: string
  nodeType: string
  label: string | null
  properties: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A LayersAnnotation create payload a claim materializes to (primary, child, or relation span). */
export interface MappedClaimAnnotation {
  id: string
  anchor: unknown
  label: string
  text: string | null
  value: string | null
  confidence: number | null
  arguments: unknown
  ontologyTypeRefId: string | null
  parentAnnotationId: string | null
  temporal: unknown
  startMs: number | null
  endMs: number | null
  denotesNodeId: string | null
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A GraphEdge create payload a claim reference or relation materializes to. */
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

/** The native rows one claim projects to. */
export interface ClaimLayersProjection {
  node: MappedClaimNode
  /** The primary claim annotation followed by its text-span and temporal children. */
  annotations: MappedClaimAnnotation[]
  /** The cross-object reference edges (situation / time / location). */
  refEdges: MappedClaimEdge[]
}

/** The native rows one claim relation projects to. */
export interface RelationLayersProjection {
  edge: MappedClaimEdge
  /** The source/target span annotations pointing at the relation. */
  spanAnnotations: MappedClaimAnnotation[]
}

// --- constants ---------------------------------------------------------------

/** Edge property key discriminating a claim edge's role (flat scalar, mirrors worldRole). */
const KEY_EDGE_ROLE = 'edgeRole'
const EDGE_ROLE_CLAIM_RELATION = 'claim-relation'
const EDGE_ROLE_CLAIM_REF = 'claim-ref'

/** The label a primary claim annotation carries, and its children / relation spans. */
const LABEL_CLAIM = 'claim'
const LABEL_CLAIM_TIME = 'claim-time'
const LABEL_CLAIM_TEXT_SPAN = 'claim-text-span'
const LABEL_RELATION_SPAN = 'relation-span'

/** The argument-role prefixes each gloss-bearing field encodes under. */
const ROLE_GLOSS = 'gloss'
const ROLE_CLAIM_RELATION = 'claim-relation'
const ROLE_CLAIMER_GLOSS = 'claimer-gloss'
/** Exact argument roles carrying a claim's references. */
const ROLE_CLAIMER = 'claimer'
const ROLE_SUMMARY = 'summary'
const ROLE_TIME_ANNOTATION = 'time-annotation'
const ROLE_RELATION = 'relation-of'

/** Flat child-annotation feature keys (order + provenance scalars, no reference). */
const KEY_SPAN_INDEX = 'spanIndex'
const KEY_SENTENCE_INDEX = 'sentenceIndex'
const KEY_TIME_SOURCE = 'source'
const KEY_RELATION_SIDE = 'side'
const RELATION_SIDE_SOURCE = 'source'
const RELATION_SIDE_TARGET = 'target'

/** Flat relation-edge property keys (genuinely flat scalars only). */
const KEY_NOTES = 'notes'
const KEY_CREATED_AT = 'createdAt'
const KEY_UPDATED_AT = 'updatedAt'

/** The genuinely-flat, opaque scalar claim fields with no dedicated native column. */
const FLAT_CLAIM_FIELDS = [
  'summaryType',
  'modelUsed',
  'extractionStrategy',
  'audio',
  'video',
  'metadata',
  'comment',
  'createdAt',
  'updatedAt',
] as const

/** The reference fields a cross-object claim edge can carry. */
const REF_FIELDS = ['claimEventId', 'claimTimeId', 'claimLocationId'] as const
type RefField = (typeof REF_FIELDS)[number]

/** The graph edgeType each reference field projects to (bijective). */
const REF_EDGE_TYPE: Record<RefField, string> = {
  claimEventId: 'describes',
  claimTimeId: 'occurs-at',
  claimLocationId: 'located-at',
}

/** The claim field each reference edgeType reconstructs (inverse of {@link REF_EDGE_TYPE}). */
const FIELD_BY_REF_EDGE_TYPE: Record<string, RefField> = {
  describes: 'claimEventId',
  'occurs-at': 'claimTimeId',
  'located-at': 'claimLocationId',
}

// --- small readers -----------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
}

/** The localId value of an objectRef, or null. */
function localRefValue(ref: unknown): string | null {
  const value = (ref as { localId?: { value?: unknown } } | null)?.localId?.value
  return typeof value === 'string' ? value : null
}

/** Rounds a 0-1 float to the layers 0-1000 integer confidence scale. */
function toMilli(value: number): number {
  return Math.min(1000, Math.max(0, Math.round(value * 1000)))
}

/** Recovers a 0-1 float from the layers 0-1000 integer confidence scale. */
function fromMilli(value: number): number {
  return value / 1000
}

/** The scope columns a claim projects to (its owner and project). */
export function claimScope(claim: StoredClaim): ClaimLayersScope {
  return { projectId: claim.projectId ?? null, createdByUserId: claim.createdBy ?? null }
}

// --- feature maps ------------------------------------------------------------

/** A single featureMap entry. */
interface FeatureEntry {
  key: string
  value: string
}

/** Wraps feature entries in a featureMap, or null when empty. */
function featureMap(entries: FeatureEntry[]): { entries: FeatureEntry[] } | null {
  return entries.length > 0 ? { entries } : null
}

/** Reads the entries of a featureMap column, tolerating null/non-object. */
function entriesOf(features: unknown): FeatureEntry[] {
  if (features === null || typeof features !== 'object') return []
  const entries = (features as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return []
  const out: FeatureEntry[] = []
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const key = (entry as { key?: unknown }).key
      const value = (entry as { value?: unknown }).value
      if (typeof key === 'string' && typeof value === 'string') out.push({ key, value })
    }
  }
  return out
}

/** Reads one explicit feature value by key, or null. */
function readFeature(entries: FeatureEntry[], key: string): string | null {
  for (const entry of entries) if (entry.key === key) return entry.value
  return null
}

// --- open extension: leftover flat scalars as flat feature entries -----------

/**
 * Encodes an object's flat, opaque leftover — the genuinely open scalar fields
 * with no dedicated native column — as flat featureMap entries: one entry per
 * field, keyed by the field name, valued as its JSON. This is a flat key/value
 * map (never a nested shredded structure), the layers-native home for genuinely
 * open extension data. A null value round-trips as the JSON literal `null`; an
 * `undefined` value is skipped.
 */
function openExtensionEntries(leftover: Record<string, unknown>): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  for (const [key, value] of Object.entries(leftover)) {
    if (value === undefined) continue
    entries.push({ key, value: JSON.stringify(value) })
  }
  return entries
}

/** Applies open-extension feature entries back onto an object, skipping reserved keys. */
function applyOpenExtension(
  object: Record<string, unknown>,
  entries: FeatureEntry[],
  reserved: ReadonlySet<string>,
): void {
  for (const entry of entries) {
    if (reserved.has(entry.key)) continue
    try {
      object[entry.key] = JSON.parse(entry.value)
    } catch {
      object[entry.key] = entry.value
    }
  }
}

// --- gloss: GlossItem[] <-> role-tagged argumentRefs ------------------------

/** Reads a claim field as a GlossItem[], tolerating null/non-array. */
function glossOf(value: unknown): GlossItem[] {
  return Array.isArray(value) ? (value as GlossItem[]) : []
}

/** Flattens a gloss to plain text by concatenating each segment's content. */
function glossToText(gloss: GlossItem[]): string | null {
  if (gloss.length === 0) return null
  const text = gloss.map((seg) => (typeof seg.content === 'string' ? seg.content : '')).join('')
  return text.length > 0 ? text : null
}

/**
 * Projects one gloss onto role-tagged argumentRefs, one per segment: the role
 * carries the field prefix and the segment index (so interleaving order
 * round-trips), and the features carry the segment's type/content and any
 * reference identifiers. A non-text segment additionally points at its target
 * through an objectRef.
 */
function glossToArguments(rolePrefix: string, gloss: GlossItem[]): Record<string, unknown>[] {
  return gloss.map((seg, index) => {
    const entries: FeatureEntry[] = [
      { key: 'segType', value: typeof seg.type === 'string' ? seg.type : 'text' },
      { key: 'segContent', value: typeof seg.content === 'string' ? seg.content : '' },
    ]
    if (typeof seg.refType === 'string') entries.push({ key: 'refType', value: seg.refType })
    if (typeof seg.refPersonaId === 'string') entries.push({ key: 'refPersonaId', value: seg.refPersonaId })
    if (typeof seg.refClaimId === 'string') entries.push({ key: 'refClaimId', value: seg.refClaimId })
    const arg: Record<string, unknown> = {
      role: `${rolePrefix}:${index}`,
      features: { entries },
    }
    if (seg.type !== 'text') {
      arg.target = localRef(seg.refClaimId ?? (typeof seg.content === 'string' ? seg.content : ''))
    }
    return arg
  })
}

/** Reconstructs a gloss's segments from the argumentRefs carrying its role prefix. */
function argumentsToGloss(argumentsValue: unknown, rolePrefix: string): GlossItem[] {
  const prefix = `${rolePrefix}:`
  const matched: Array<{ index: number; arg: Record<string, unknown> }> = []
  for (const arg of asArray(argumentsValue)) {
    const role = typeof arg.role === 'string' ? arg.role : ''
    if (!role.startsWith(prefix)) continue
    const index = Number(role.slice(prefix.length))
    matched.push({ index: Number.isFinite(index) ? index : matched.length, arg })
  }
  matched.sort((a, b) => a.index - b.index)
  return matched.map(({ arg }) => {
    const entries = entriesOf(arg.features)
    const item: GlossItem = {
      type: (readFeature(entries, 'segType') ?? 'text') as GlossItem['type'],
      content: readFeature(entries, 'segContent') ?? '',
    }
    const refType = readFeature(entries, 'refType')
    if (refType !== null) item.refType = refType as GlossItem['refType']
    const refPersonaId = readFeature(entries, 'refPersonaId')
    if (refPersonaId !== null) item.refPersonaId = refPersonaId
    const refClaimId = readFeature(entries, 'refClaimId')
    if (refClaimId !== null) item.refClaimId = refClaimId
    return item
  })
}

/** The argumentRef pointing at a same-record object by id under an exact role. */
function objectArgument(role: string, id: string): Record<string, unknown> {
  return { role, target: localRef(id) }
}

/** Reads the target id of the first argumentRef carrying an exact role, or null. */
function readObjectArgument(argumentsValue: unknown, role: string): string | null {
  for (const arg of asArray(argumentsValue)) {
    if (arg.role !== role) continue
    return localRefValue(arg.target)
  }
  return null
}

// --- write: claim -> layers --------------------------------------------------

/** Builds the discontiguous text-span child annotations a claim's textSpans project to. */
function textSpanAnnotations(claim: StoredClaim, scope: ClaimLayersScope): MappedClaimAnnotation[] {
  const primaryId = claimAnnotationId(claim.id)
  return asArray(claim.textSpans).map((span, index) => {
    const charStart = typeof span.charStart === 'number' ? span.charStart : 0
    const charEnd = typeof span.charEnd === 'number' ? span.charEnd : charStart
    const entries: FeatureEntry[] = [{ key: KEY_SPAN_INDEX, value: String(index) }]
    if (typeof span.sentenceIndex === 'number') {
      entries.push({ key: KEY_SENTENCE_INDEX, value: String(span.sentenceIndex) })
    }
    return {
      id: claimTextSpanAnnotationId(claim.id, index),
      // byteStart/byteEnd are omitted: the mapper has no source text, so only the
      // character extent is known. A char-only textSpan is preferable to fabricated
      // byte offsets (which would misplace any non-ASCII span for a byte consumer).
      anchor: { textSpan: { charStart, charEnd } },
      label: LABEL_CLAIM_TEXT_SPAN,
      text: null,
      value: null,
      confidence: null,
      arguments: null,
      ontologyTypeRefId: null,
      parentAnnotationId: primaryId,
      temporal: null,
      startMs: null,
      endMs: null,
      denotesNodeId: claim.id,
      features: featureMap(entries),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

/** Builds the temporal-grounding child annotations a claim's timeSpans project to. */
function temporalAnnotations(claim: StoredClaim, scope: ClaimLayersScope): MappedClaimAnnotation[] {
  const primaryId = claimAnnotationId(claim.id)
  return asArray(claim.timeSpans).map((span, index) => {
    const start = typeof span.start === 'number' ? span.start : 0
    const end = typeof span.end === 'number' ? span.end : 0
    const startMs = Math.round(start * 1000)
    const endMs = Math.round(end * 1000)
    const entries: FeatureEntry[] = [{ key: KEY_SPAN_INDEX, value: String(index) }]
    if (typeof span.source === 'string') entries.push({ key: KEY_TIME_SOURCE, value: span.source })
    // A time span's source annotation ids are references, so they ride as argumentRefs.
    const annotationIds = Array.isArray(span.annotationIds)
      ? span.annotationIds.filter((id): id is string => typeof id === 'string')
      : []
    const args = annotationIds.map((id) => objectArgument(ROLE_TIME_ANNOTATION, id))
    return {
      id: claimTimeSpanAnnotationId(claim.id, index),
      anchor: { temporalSpan: { start: startMs, ending: endMs } },
      label: LABEL_CLAIM_TIME,
      text: null,
      value: null,
      confidence: null,
      arguments: args.length > 0 ? args : null,
      ontologyTypeRefId: null,
      parentAnnotationId: primaryId,
      temporal: null,
      startMs,
      endMs,
      denotesNodeId: claim.id,
      features: featureMap(entries),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

/** Builds the cross-object reference edges for a claim's situation/time/location. */
function claimRefEdges(claim: StoredClaim, scope: ClaimLayersScope): MappedClaimEdge[] {
  const edges: MappedClaimEdge[] = []
  for (const field of REF_FIELDS) {
    const targetId = claim[field]
    if (typeof targetId !== 'string' || targetId.length === 0) continue
    edges.push({
      id: claimRefEdgeId(claim.id, field),
      source: localRef(claim.id),
      target: localRef(targetId),
      sourceLocalId: claim.id,
      targetLocalId: targetId,
      edgeType: REF_EDGE_TYPE[field],
      label: REF_EDGE_TYPE[field],
      confidence: null,
      properties: featureMap([{ key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_REF }]),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  }
  return edges
}

/**
 * Projects one claim onto its native rows: an identity GraphNode, the primary
 * bearer annotation, its text-span and temporal-grounding child annotations, and
 * the cross-object reference edges. The primary annotation is authoritative for
 * text, confidence, gloss/claimer, summary membership, and the parent link (the
 * native `parentAnnotationId` self-relation).
 *
 * @param claim - the claim to project (its subclaims are their own nodes)
 * @returns the node, annotations, and reference edges to persist
 */
export function claimToLayers(claim: StoredClaim): ClaimLayersProjection {
  const scope = claimScope(claim)

  const gloss = glossOf(claim.gloss)
  const claimRelation = glossOf(claim.claimRelation)
  const claimerGloss = glossOf(claim.claimerGloss)
  const claimerType = typeof claim.claimerType === 'string' ? claim.claimerType : null

  const argumentsList: Record<string, unknown>[] = [
    ...glossToArguments(ROLE_GLOSS, gloss),
    ...glossToArguments(ROLE_CLAIM_RELATION, claimRelation),
    ...glossToArguments(ROLE_CLAIMER_GLOSS, claimerGloss),
    // The summary membership and (optional) claimer type are references, so each
    // rides as an argumentRef rather than a flat feature key.
    objectArgument(ROLE_SUMMARY, claim.summaryId),
  ]
  if (claimerType !== null) argumentsList.push(objectArgument(ROLE_CLAIMER, claimerType))

  // Genuinely flat, opaque scalars with no native column ride in flat features.
  const flatLeftover: Record<string, unknown> = {
    summaryType: claim.summaryType,
    modelUsed: claim.modelUsed ?? null,
    extractionStrategy: claim.extractionStrategy ?? null,
    audio: claim.audio ?? null,
    video: claim.video ?? null,
    metadata: claim.metadata ?? null,
    comment: claim.comment ?? null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  }

  const primary: MappedClaimAnnotation = {
    id: claimAnnotationId(claim.id),
    anchor: null,
    label: LABEL_CLAIM,
    text: claim.text,
    value: glossToText(gloss),
    confidence: typeof claim.confidence === 'number' ? toMilli(claim.confidence) : null,
    arguments: argumentsList.length > 0 ? argumentsList : null,
    ontologyTypeRefId: claimerType,
    // The parent link is the native self-relation: the parent claim's bearer
    // annotation id. `nestClaims` walks the reconstructed `parentClaimId`, which
    // the read path recovers from this FK.
    parentAnnotationId:
      typeof claim.parentClaimId === 'string' && claim.parentClaimId.length > 0
        ? claimAnnotationId(claim.parentClaimId)
        : null,
    temporal: null,
    startMs: null,
    endMs: null,
    denotesNodeId: claim.id,
    features: featureMap(openExtensionEntries(flatLeftover)),
    projectId: scope.projectId,
    createdByUserId: scope.createdByUserId,
  }

  const node: MappedClaimNode = {
    id: claim.id,
    nodeType: CLAIM_NODE_TYPE,
    label: claim.text,
    properties: null,
    projectId: scope.projectId,
    createdByUserId: scope.createdByUserId,
  }

  return {
    node,
    annotations: [primary, ...textSpanAnnotations(claim, scope), ...temporalAnnotations(claim, scope)],
    refEdges: claimRefEdges(claim, scope),
  }
}

/** Builds the endpoint-span annotations a relation's source/target spans project to. */
function relationSpanAnnotations(
  relation: StoredRelation,
  side: string,
  spans: unknown,
  projectId: string | null,
): MappedClaimAnnotation[] {
  return asArray(spans).map((span, index) => {
    const charStart = typeof span.charStart === 'number' ? span.charStart : 0
    const charEnd = typeof span.charEnd === 'number' ? span.charEnd : charStart
    return {
      id: relationSpanAnnotationId(relation.id, side, index),
      anchor: { textSpan: { charStart, charEnd } },
      label: LABEL_RELATION_SPAN,
      text: null,
      value: null,
      confidence: null,
      arguments: [objectArgument(ROLE_RELATION, relation.id)],
      ontologyTypeRefId: null,
      parentAnnotationId: null,
      temporal: null,
      startMs: null,
      endMs: null,
      denotesNodeId: null,
      features: featureMap([
        { key: KEY_RELATION_SIDE, value: side },
        { key: KEY_SPAN_INDEX, value: String(index) },
      ]),
      projectId,
      createdByUserId: relation.createdBy ?? null,
    }
  })
}

/**
 * Projects one claim relation onto its native rows: a GraphEdge between the two
 * claim nodes carrying the relation type as `edgeType`, its confidence on the
 * integer scale, and its notes / semantic timestamps as flat scalar properties;
 * plus one `textSpan`-anchored annotation per source/target endpoint span, each
 * pointing at the relation via an argumentRef.
 *
 * @param relation - the relation to project
 * @param projectId - the source claim's project scope
 * @returns the edge and endpoint-span annotations to persist
 */
export function relationToLayers(relation: StoredRelation, projectId: string | null): RelationLayersProjection {
  const properties: FeatureEntry[] = [
    { key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_RELATION },
    { key: KEY_CREATED_AT, value: relation.createdAt },
    { key: KEY_UPDATED_AT, value: relation.updatedAt },
  ]
  if (typeof relation.notes === 'string') properties.push({ key: KEY_NOTES, value: relation.notes })

  const edge: MappedClaimEdge = {
    id: relation.id,
    source: localRef(relation.sourceClaimId),
    target: localRef(relation.targetClaimId),
    sourceLocalId: relation.sourceClaimId,
    targetLocalId: relation.targetClaimId,
    edgeType: relation.relationTypeId,
    label: relation.relationTypeId,
    confidence: typeof relation.confidence === 'number' ? toMilli(relation.confidence) : null,
    properties: featureMap(properties),
    projectId,
    createdByUserId: relation.createdBy ?? null,
  }

  return {
    edge,
    spanAnnotations: [
      ...relationSpanAnnotations(relation, RELATION_SIDE_SOURCE, relation.sourceSpans, projectId),
      ...relationSpanAnnotations(relation, RELATION_SIDE_TARGET, relation.targetSpans, projectId),
    ],
  }
}

// --- read: layers -> claim ---------------------------------------------------

/** The GraphNode columns a claim reconstruction reads. */
export type ClaimNodeRow = Pick<
  PrismaGraphNode,
  'id' | 'nodeType' | 'label' | 'properties' | 'projectId' | 'createdByUserId'
>

/** The LayersAnnotation columns a claim reconstruction reads. */
export type ClaimAnnotationRow = Pick<
  PrismaLayersAnnotation,
  | 'id'
  | 'anchor'
  | 'label'
  | 'text'
  | 'value'
  | 'confidence'
  | 'arguments'
  | 'ontologyTypeRefId'
  | 'parentAnnotationId'
  | 'temporal'
  | 'startMs'
  | 'endMs'
  | 'denotesNodeId'
  | 'features'
  | 'projectId'
  | 'createdByUserId'
>

/** The GraphEdge columns a relation reconstruction reads. */
export type ClaimEdgeRow = Pick<
  PrismaGraphEdge,
  'id' | 'edgeType' | 'sourceLocalId' | 'targetLocalId' | 'confidence' | 'properties' | 'createdByUserId'
>

/** The native rows a claim reconstruction reads beyond its node and primary annotation. */
export interface ClaimReconstructionContext {
  /** The claim's child annotations (text-span + temporal), keyed by parentAnnotationId. */
  children: ClaimAnnotationRow[]
  /** The claim's outgoing cross-object reference edges. */
  refEdges: ClaimEdgeRow[]
  /** The parent claim id, recovered from the primary's parentAnnotationId self-relation. */
  parentClaimId: string | null
}

/** True when a graph node row is a claim node. */
export function isClaimNode(row: { nodeType: string }): boolean {
  return row.nodeType === CLAIM_NODE_TYPE
}

/** True when a graph edge row is a claim-relation edge. */
export function isClaimRelationEdge(row: { properties: unknown }): boolean {
  return readFeature(entriesOf(row.properties), KEY_EDGE_ROLE) === EDGE_ROLE_CLAIM_RELATION
}

/** True when a graph edge row is a claim cross-object reference edge. */
export function isClaimRefEdge(row: { properties: unknown }): boolean {
  return readFeature(entriesOf(row.properties), KEY_EDGE_ROLE) === EDGE_ROLE_CLAIM_REF
}

/** True when an annotation is a claim's primary bearer (denotes its claim node directly). */
export function isPrimaryClaimAnnotation(row: { id: string; denotesNodeId: string | null }): boolean {
  return row.denotesNodeId !== null && row.id === claimAnnotationId(row.denotesNodeId)
}

/** The primary claim annotation id for a claim node's id. */
export function primaryAnnotationId(claimId: string): string {
  return claimAnnotationId(claimId)
}

/**
 * Reconstructs a shallow claim from a claim GraphNode alone: its id, text, and
 * scope. The rich fields (gloss, spans, confidence, summary membership, …) are
 * absent — this is the shape scope-only callers need, not the full contract shape
 * (see {@link claimFromLayers}).
 *
 * @param node - the claim GraphNode row
 * @returns the shallow claim, or null when the row is not a claim node
 */
export function nodeToClaim(node: ClaimNodeRow): StoredClaim | null {
  if (!isClaimNode(node)) return null
  return {
    id: node.id,
    summaryId: '',
    summaryType: 'video',
    text: node.label ?? '',
    gloss: [],
    createdBy: node.createdByUserId ?? null,
    projectId: node.projectId ?? null,
    createdAt: '',
    updatedAt: '',
  }
}

/** Reconstructs a claim's discontiguous text spans from its text-span child annotations. */
function readTextSpans(children: ClaimAnnotationRow[]): Record<string, unknown>[] | null {
  const spanChildren = children.filter((c) => c.label === LABEL_CLAIM_TEXT_SPAN)
  if (spanChildren.length === 0) return null
  return spanChildren
    .map((child) => {
      const entries = entriesOf(child.features)
      const span = (child.anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
      const charStart = typeof span?.charStart === 'number' ? span.charStart : 0
      const charEnd = typeof span?.charEnd === 'number' ? span.charEnd : charStart
      const out: Record<string, unknown> = { charStart, charEnd }
      const sentenceIndex = readFeature(entries, KEY_SENTENCE_INDEX)
      if (sentenceIndex !== null) out.sentenceIndex = Number(sentenceIndex)
      return { index: Number(readFeature(entries, KEY_SPAN_INDEX) ?? '0'), out }
    })
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.out)
}

/** Reconstructs a claim's video-time groundings from its temporal child annotations. */
function readTimeSpans(children: ClaimAnnotationRow[]): Record<string, unknown>[] | null {
  const timeChildren = children.filter((c) => c.label === LABEL_CLAIM_TIME)
  if (timeChildren.length === 0) return null
  return timeChildren
    .map((child) => {
      const entries = entriesOf(child.features)
      const out: Record<string, unknown> = {
        start: (child.startMs ?? 0) / 1000,
        end: (child.endMs ?? 0) / 1000,
      }
      const source = readFeature(entries, KEY_TIME_SOURCE)
      if (source !== null) out.source = source
      const annotationIds: string[] = []
      for (const arg of asArray(child.arguments)) {
        if (arg.role === ROLE_TIME_ANNOTATION) {
          const id = localRefValue(arg.target)
          if (id !== null) annotationIds.push(id)
        }
      }
      if (annotationIds.length > 0) out.annotationIds = annotationIds
      return { index: Number(readFeature(entries, KEY_SPAN_INDEX) ?? '0'), out }
    })
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.out)
}

/**
 * Reconstructs the full claim from its native rows: the GraphNode, its primary
 * bearer annotation, its text-span / temporal child annotations, its cross-object
 * reference edges, and the parent claim id recovered from the primary's
 * `parentAnnotationId` self-relation. No residual is read.
 *
 * @param node - the claim GraphNode row
 * @param primary - the claim's primary bearer annotation
 * @param context - the child annotations, ref edges, and resolved parent claim id
 * @returns the reconstructed claim
 */
export function claimFromLayers(
  node: ClaimNodeRow,
  primary: ClaimAnnotationRow,
  context: ClaimReconstructionContext,
): StoredClaim {
  // Defaults matching the buildClaim shape (null vs empty distinctions preserved).
  const object: Record<string, unknown> = {
    id: node.id,
    gloss: [],
    parentClaimId: context.parentClaimId,
    textSpans: null,
    timeSpans: null,
    claimerType: null,
    claimerGloss: null,
    claimRelation: null,
    claimEventId: null,
    claimTimeId: null,
    claimLocationId: null,
    confidence: null,
  }

  // Flat, opaque scalar extension fields (modality, provenance, timestamps).
  applyOpenExtension(object, entriesOf(primary.features), new Set())
  for (const field of FLAT_CLAIM_FIELDS) if (!(field in object)) object[field] = null

  object.summaryId = readObjectArgument(primary.arguments, ROLE_SUMMARY) ?? ''
  object.text = primary.text ?? node.label ?? ''
  object.createdBy = primary.createdByUserId ?? node.createdByUserId ?? null
  object.projectId = primary.projectId ?? node.projectId ?? null

  if (typeof primary.confidence === 'number') object.confidence = fromMilli(primary.confidence)

  object.gloss = argumentsToGloss(primary.arguments, ROLE_GLOSS)
  const claimRelation = argumentsToGloss(primary.arguments, ROLE_CLAIM_RELATION)
  if (claimRelation.length > 0) object.claimRelation = claimRelation
  const claimerGloss = argumentsToGloss(primary.arguments, ROLE_CLAIMER_GLOSS)
  if (claimerGloss.length > 0) object.claimerGloss = claimerGloss

  const claimerType = primary.ontologyTypeRefId ?? readObjectArgument(primary.arguments, ROLE_CLAIMER)
  if (claimerType !== null) object.claimerType = claimerType

  const textSpans = readTextSpans(context.children)
  if (textSpans !== null) object.textSpans = textSpans
  const timeSpans = readTimeSpans(context.children)
  if (timeSpans !== null) object.timeSpans = timeSpans

  for (const edge of context.refEdges) {
    if (!isClaimRefEdge(edge)) continue
    const field = FIELD_BY_REF_EDGE_TYPE[edge.edgeType]
    if (field && typeof edge.targetLocalId === 'string' && edge.targetLocalId.length > 0) {
      object[field] = edge.targetLocalId
    }
  }

  return object as unknown as StoredClaim
}

/**
 * Reconstructs every claim in one summary's claim-span layer from its native
 * rows: the claim GraphNodes, the layer's annotations (primaries + text-span /
 * temporal children), and the claims' outgoing cross-object reference edges. Each
 * claim's parent link is recovered from its primary's `parentAnnotationId`
 * self-relation.
 *
 * @param nodes - the claim GraphNode rows
 * @param annotations - every annotation in the summary's claim-span layer
 * @param refEdges - the claims' outgoing edges (ref edges are consumed, others skipped)
 * @returns the reconstructed flat claims
 */
export function reconstructClaims(
  nodes: ClaimNodeRow[],
  annotations: ClaimAnnotationRow[],
  refEdges: ClaimEdgeRow[],
): StoredClaim[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const primaries = annotations.filter(isPrimaryClaimAnnotation)

  // Map each primary annotation id to the claim it denotes, so a child claim's
  // parentAnnotationId resolves back to the parent claim id natively.
  const claimIdByAnnId = new Map(primaries.map((p) => [p.id, p.denotesNodeId as string]))

  const childrenByParent = new Map<string, ClaimAnnotationRow[]>()
  for (const ann of annotations) {
    if (isPrimaryClaimAnnotation(ann) || ann.parentAnnotationId === null) continue
    const list = childrenByParent.get(ann.parentAnnotationId) ?? []
    list.push(ann)
    childrenByParent.set(ann.parentAnnotationId, list)
  }

  const edgesBySource = new Map<string, ClaimEdgeRow[]>()
  for (const edge of refEdges) {
    if (!isClaimRefEdge(edge) || edge.sourceLocalId === null) continue
    const list = edgesBySource.get(edge.sourceLocalId) ?? []
    list.push(edge)
    edgesBySource.set(edge.sourceLocalId, list)
  }

  const claims: StoredClaim[] = []
  for (const primary of primaries) {
    const claimId = primary.denotesNodeId as string
    const node = nodeById.get(claimId)
    if (!node) continue
    const parentClaimId =
      primary.parentAnnotationId !== null ? claimIdByAnnId.get(primary.parentAnnotationId) ?? null : null
    claims.push(
      claimFromLayers(node, primary, {
        children: childrenByParent.get(primary.id) ?? [],
        refEdges: edgesBySource.get(claimId) ?? [],
        parentClaimId,
      }),
    )
  }
  return claims
}

/** True when an annotation is a claim relation's endpoint-span annotation. */
export function isRelationSpanAnnotation(row: { label: string | null }): boolean {
  return row.label === LABEL_RELATION_SPAN
}

/** The summary a claim belongs to, from its primary annotation's `summary` argumentRef. */
export function claimSummaryId(row: { arguments: unknown }): string | null {
  return readObjectArgument(row.arguments, ROLE_SUMMARY)
}

/** The relation id an endpoint-span annotation points at (its `relation-of` argumentRef), or null. */
export function relationSpanRelationId(row: { arguments: unknown }): string | null {
  return readObjectArgument(row.arguments, ROLE_RELATION)
}

/** Reconstructs a relation's endpoint spans from its side-tagged span annotations. */
function readRelationSpans(
  spans: ClaimAnnotationRow[],
  side: string,
): Record<string, unknown>[] | null {
  const sideSpans = spans.filter((s) => readFeature(entriesOf(s.features), KEY_RELATION_SIDE) === side)
  if (sideSpans.length === 0) return null
  return sideSpans
    .map((child) => {
      const entries = entriesOf(child.features)
      const anchor = (child.anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
      const charStart = typeof anchor?.charStart === 'number' ? anchor.charStart : 0
      const charEnd = typeof anchor?.charEnd === 'number' ? anchor.charEnd : charStart
      return { index: Number(readFeature(entries, KEY_SPAN_INDEX) ?? '0'), out: { charStart, charEnd } }
    })
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.out)
}

/**
 * Reconstructs a claim relation from its GraphEdge and its endpoint-span
 * annotations. The relation type is the edgeType, confidence recovers from the
 * integer scale, and the notes / timestamps recover from the edge's flat scalar
 * properties; source/target spans recover from the side-tagged span annotations.
 *
 * @param edge - the relation GraphEdge row
 * @param spans - the relation's endpoint-span annotations (empty when not loaded)
 * @returns the reconstructed relation, or null when it is not a claim relation
 */
export function edgeToRelation(edge: ClaimEdgeRow, spans: ClaimAnnotationRow[] = []): StoredRelation | null {
  if (!isClaimRelationEdge(edge)) return null
  const entries = entriesOf(edge.properties)
  const relation: StoredRelation = {
    id: edge.id,
    sourceClaimId: edge.sourceLocalId ?? '',
    targetClaimId: edge.targetLocalId ?? '',
    relationTypeId: edge.edgeType,
    sourceSpans: readRelationSpans(spans, RELATION_SIDE_SOURCE),
    targetSpans: readRelationSpans(spans, RELATION_SIDE_TARGET),
    confidence: typeof edge.confidence === 'number' ? fromMilli(edge.confidence) : null,
    notes: readFeature(entries, KEY_NOTES),
    createdBy: edge.createdByUserId ?? null,
    createdAt: readFeature(entries, KEY_CREATED_AT) ?? '',
    updatedAt: readFeature(entries, KEY_UPDATED_AT) ?? '',
  }
  return relation
}

// --- tree assembly -----------------------------------------------------------

/**
 * Nests a flat claim list into the hierarchical tree the read paths return,
 * ordering siblings by creation time then id for a stable result. Claims whose
 * `parentClaimId` names a claim outside the list are treated as roots. The
 * `parentClaimId` is recovered natively from each claim's `parentAnnotationId`
 * self-relation on reconstruction.
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
 * Collects a claim's id and every descendant subclaim id from a flat list, walking
 * the natively-reconstructed `parentClaimId` links.
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
