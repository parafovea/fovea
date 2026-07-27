/**
 * The FOVEA claim surface as a `@panproto/core` lens plus a multi-record
 * composition and a record<->row adapter.
 *
 * A FOVEA claim projects onto several layers records: a claim identity
 * `pub.layers.graph.graphNode`, a primary span `pub.layers.annotation`
 * (the claim's bearer, denoting the node) with its discontiguous text-span and
 * video-time child annotations, and cross-object `pub.layers.graph.graphEdge`s
 * for its situation / time / location references. A claim relation projects onto
 * one `graphEdge` between the two claim nodes plus one text-span endpoint
 * annotation per source/target span. This module builds those records from the
 * FOVEA claim view-model and distributes them to the Prisma-row shape the
 * persistence boundary uses, wiring the cross-record references (the parent link
 * on `parentAnnotationId`, the child denotation on `denotesNodeId`, the reference
 * endpoints, and the relation `relation-of` argument) by deterministic id.
 *
 * The value/structure transform a panproto lens expresses here is the per-span
 * anchor regroup: the view-model carries each span's extent as flat scalars
 * (`charStart`/`charEnd` for a text span, `startMs`/`endMs` for a temporal span),
 * and the layers annotation nests that extent under an `anchor` — `textSpan` for
 * character offsets, `temporalSpan` for media time. {@link buildClaimTextSpanRegroupLens}
 * and {@link buildClaimTemporalRegroupLens} author those regroups as panproto
 * lens documents (a `compute_field` anchored at the span item vertex) whose
 * round-trip laws hold and whose complement requirement is empty; the lenses are
 * the verified specification of the regroups. {@link composeClaimRecords} applies
 * the same regroups to move data, because the installed `@panproto/core` (0.65.0)
 * does not surface a value-transform lens's output to JavaScript.
 *
 * The gloss encoding (each gloss segment to a role-tagged `argumentRef` whose role
 * carries the segment's index, interleaving three gloss-bearing fields into one
 * arguments array) and the open-extension encoding (each leftover scalar to a flat
 * feature entry keyed by the field name, valued as its JSON) are resolved in the
 * composition rather than the lens: the expression language exposes no element
 * index in `map` (and a per-item lens vertex has no access to its own array
 * position), so an index-keyed role is not lens-expressible, and it has no
 * JSON-serialize builtin for encoding an arbitrary value into a string feature.
 * These, like the frame-to-time resolution the video surface performs before its
 * lens, are resolved into the view-model and around it.
 *
 * @module
 */

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'
import { z } from 'zod'

import {
  CLAIM_NODE_TYPE,
  claimScope,
  type ClaimLayersScope,
  type StoredClaim,
  type StoredRelation,
  type MappedClaimNode,
  type MappedClaimAnnotation,
  type MappedClaimEdge,
  type ClaimLayersProjection,
  type RelationLayersProjection,
} from '../claim-layers-mapper.js'
import {
  claimAnnotationId,
  claimTextSpanAnnotationId,
  claimTimeSpanAnnotationId,
  claimRefEdgeId,
  relationSpanAnnotationId,
} from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'

// --------------------------------------------------------------------------
// Labels, roles, and feature keys (the claim vocabulary the rows carry)
// --------------------------------------------------------------------------

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

/** Edge property key discriminating a claim edge's role, and its two values. */
const KEY_EDGE_ROLE = 'edgeRole'
const EDGE_ROLE_CLAIM_RELATION = 'claim-relation'
const EDGE_ROLE_CLAIM_REF = 'claim-ref'

/** Flat relation-edge property keys (genuinely flat scalars only). */
const KEY_NOTES = 'notes'
const KEY_CREATED_AT = 'createdAt'
const KEY_UPDATED_AT = 'updatedAt'

/** The reference fields a cross-object claim edge can carry, in projection order. */
const REF_FIELDS = ['claimEventId', 'claimTimeId', 'claimLocationId'] as const
type RefField = (typeof REF_FIELDS)[number]

/** The graph edgeType each reference field projects to (bijective). */
const REF_EDGE_TYPE: Record<RefField, string> = {
  claimEventId: 'describes',
  claimTimeId: 'occurs-at',
  claimLocationId: 'located-at',
}

/** A fixed creation timestamp for the composed records (identity is deterministic). */
const COMPOSED_AT = '1970-01-01T00:00:00.000Z'

// --------------------------------------------------------------------------
// Small encoders (the non-lens value encodings the composition owns)
// --------------------------------------------------------------------------

/** A single featureMap entry. */
interface FeatureEntry {
  key: string
  value: string
}

/** Wraps feature entries in a featureMap, or null when empty. */
function featureMap(entries: FeatureEntry[]): { entries: FeatureEntry[] } | null {
  return entries.length > 0 ? { entries } : null
}

/** Rounds a 0-1 float to the layers 0-1000 integer confidence scale. */
function toMilli(value: number): number {
  return Math.min(1000, Math.max(0, Math.round(value * 1000)))
}

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

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

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
}

/** The argumentRef pointing at a same-record object by id under an exact role. */
function objectArgument(role: string, id: string): Record<string, unknown> {
  return { role, target: localRef(id) }
}

/**
 * Projects one gloss onto role-tagged argumentRefs, one per segment: the role
 * carries the field prefix and the segment index (so interleaving order
 * round-trips), and the features carry the segment's type/content and any
 * reference identifiers. A non-text segment additionally points at its target
 * through an objectRef. The index-keyed role is why this rides in the composition,
 * not the lens (see the module note).
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

/**
 * Encodes an object's flat, opaque leftover — the genuinely open scalar fields
 * with no dedicated native column — as flat featureMap entries: one entry per
 * field, keyed by the field name, valued as its JSON. A null value round-trips as
 * the JSON literal `null`; an `undefined` value is skipped. This rides in the
 * composition, not the lens: the expression language has no JSON-serialize
 * builtin to encode an arbitrary value into a string feature (see the module note).
 */
function openExtensionEntries(leftover: Record<string, unknown>): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  for (const [key, value] of Object.entries(leftover)) {
    if (value === undefined) continue
    entries.push({ key, value: JSON.stringify(value) })
  }
  return entries
}

// --------------------------------------------------------------------------
// FOVEA claim view-model (the lens/composition source)
// --------------------------------------------------------------------------

/** A discontiguous text span in the view-model, with flat character geometry. */
export interface ClaimTextSpanSource {
  charStart: number
  charEnd: number
  spanIndex: number
  sentenceIndex: number | null
}

/** A video-time grounding in the view-model, pre-scaled to milliseconds. */
export interface ClaimTemporalSpanSource {
  startMs: number
  endMs: number
  spanIndex: number
  source: string | null
  annotationIds: string[]
}

/** A resolved cross-object reference (situation / time / location) in the view-model. */
export interface ClaimRefSource {
  field: RefField
  targetId: string
}

/**
 * The FOVEA claim view-model the lens and composition map from: FOVEA-native
 * scalars with the confidence pre-quantized to the 0-1000 integer scale, the
 * temporal spans pre-scaled to milliseconds, the gloss text pre-folded (a
 * parent-level fold over the gloss segments, which a per-item lens step cannot
 * express, so it is carried), the reference fields resolved to an ordered list,
 * and the flat leftover assembled for the open-extension encoding. Built by
 * {@link toClaimSource}.
 */
export interface ClaimSource {
  id: string
  text: string
  summaryId: string
  parentClaimId: string | null
  /** Confidence on the 0-1000 integer scale, or null. */
  confidence1000: number | null
  claimerType: string | null
  /** The gloss text (concatenated segment contents), carried for the primary's `value`. */
  glossValue: string | null
  gloss: GlossItem[]
  claimRelation: GlossItem[]
  claimerGloss: GlossItem[]
  textSpans: ClaimTextSpanSource[]
  timeSpans: ClaimTemporalSpanSource[]
  refs: ClaimRefSource[]
  flatLeftover: Record<string, unknown>
  scope: ClaimLayersScope
}

/**
 * Builds the FOVEA claim view-model from a stored claim. The scalar conversions —
 * the confidence quantize and the seconds-to-milliseconds scale — are resolved
 * here rather than in the lens, because a lossy round would carry a non-empty lens
 * complement and so read as non-native; the lens is reserved for the lossless
 * anchor regroups. The gloss text fold, the reference-field resolution, and the
 * flat-leftover assembly are resolved here too, for the composition to encode.
 *
 * @param claim - the stored claim
 * @returns the view-model the lens and composition map from
 */
export function toClaimSource(claim: StoredClaim): ClaimSource {
  const gloss = glossOf(claim.gloss)
  const textSpans: ClaimTextSpanSource[] = asArray(claim.textSpans).map((span, index) => {
    const charStart = typeof span.charStart === 'number' ? span.charStart : 0
    const charEnd = typeof span.charEnd === 'number' ? span.charEnd : charStart
    return {
      charStart,
      charEnd,
      spanIndex: index,
      sentenceIndex: typeof span.sentenceIndex === 'number' ? span.sentenceIndex : null,
    }
  })
  const timeSpans: ClaimTemporalSpanSource[] = asArray(claim.timeSpans).map((span, index) => {
    const start = typeof span.start === 'number' ? span.start : 0
    const end = typeof span.end === 'number' ? span.end : 0
    const annotationIds = Array.isArray(span.annotationIds)
      ? span.annotationIds.filter((id): id is string => typeof id === 'string')
      : []
    return {
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      spanIndex: index,
      source: typeof span.source === 'string' ? span.source : null,
      annotationIds,
    }
  })
  const refs: ClaimRefSource[] = []
  for (const field of REF_FIELDS) {
    const targetId = claim[field]
    if (typeof targetId === 'string' && targetId.length > 0) refs.push({ field, targetId })
  }

  return {
    id: claim.id,
    text: claim.text,
    summaryId: claim.summaryId,
    parentClaimId:
      typeof claim.parentClaimId === 'string' && claim.parentClaimId.length > 0 ? claim.parentClaimId : null,
    confidence1000: typeof claim.confidence === 'number' ? toMilli(claim.confidence) : null,
    claimerType: typeof claim.claimerType === 'string' ? claim.claimerType : null,
    glossValue: glossToText(gloss),
    gloss,
    claimRelation: glossOf(claim.claimRelation),
    claimerGloss: glossOf(claim.claimerGloss),
    textSpans,
    timeSpans,
    refs,
    flatLeftover: {
      summaryType: claim.summaryType,
      modelUsed: claim.modelUsed ?? null,
      extractionStrategy: claim.extractionStrategy ?? null,
      audio: claim.audio ?? null,
      video: claim.video ?? null,
      metadata: claim.metadata ?? null,
      comment: claim.comment ?? null,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
    },
    scope: claimScope(claim),
  }
}

/** The FOVEA relation view-model, with the endpoint spans flattened and side-tagged. */
export interface RelationSpanSource {
  charStart: number
  charEnd: number
  side: string
  spanIndex: number
}

/** The FOVEA claim-relation view-model the composition maps from. */
export interface RelationSource {
  id: string
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
  confidence1000: number | null
  properties: FeatureEntry[]
  spans: RelationSpanSource[]
  projectId: string | null
  createdByUserId: string | null
}

/** Flattens one side's endpoint spans into side-tagged view-model spans. */
function relationSpansOf(spans: unknown, side: string): RelationSpanSource[] {
  return asArray(spans).map((span, index) => {
    const charStart = typeof span.charStart === 'number' ? span.charStart : 0
    const charEnd = typeof span.charEnd === 'number' ? span.charEnd : charStart
    return { charStart, charEnd, side, spanIndex: index }
  })
}

/**
 * Builds the FOVEA relation view-model from a stored relation. The confidence
 * quantize is resolved here (as for a claim), the edge's flat scalar properties
 * are assembled in projection order, and the source/target endpoint spans are
 * flattened and side-tagged for the shared text-span anchor regroup.
 *
 * @param relation - the stored relation
 * @param projectId - the source claim's project scope
 * @returns the view-model the composition maps from
 */
export function toRelationSource(relation: StoredRelation, projectId: string | null): RelationSource {
  const properties: FeatureEntry[] = [
    { key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_RELATION },
    { key: KEY_CREATED_AT, value: relation.createdAt },
    { key: KEY_UPDATED_AT, value: relation.updatedAt },
  ]
  if (typeof relation.notes === 'string') properties.push({ key: KEY_NOTES, value: relation.notes })

  return {
    id: relation.id,
    sourceClaimId: relation.sourceClaimId,
    targetClaimId: relation.targetClaimId,
    relationTypeId: relation.relationTypeId,
    confidence1000: typeof relation.confidence === 'number' ? toMilli(relation.confidence) : null,
    properties,
    spans: [
      ...relationSpansOf(relation.sourceSpans, RELATION_SIDE_SOURCE),
      ...relationSpansOf(relation.targetSpans, RELATION_SIDE_TARGET),
    ],
    projectId,
    createdByUserId: relation.createdBy ?? null,
  }
}

// --------------------------------------------------------------------------
// The span-anchor regroup lenses
// --------------------------------------------------------------------------

/**
 * The Zod schema for the text-span regroup's spatial core: an array of spans with
 * flat character geometry. The lens nests each item's `charStart`/`charEnd` under
 * a `textSpan` anchor; the surrounding scalars pass through.
 */
export const claimTextSpanRegroupSourceSchema = z.object({
  id: z.string(),
  textSpans: z.array(
    z.object({
      charStart: z.number().int(),
      charEnd: z.number().int(),
    }),
  ),
})

/**
 * The Zod schema for the temporal regroup's core: an array of spans with flat
 * millisecond geometry. The lens nests each item's `startMs`/`endMs` under a
 * `temporalSpan` anchor.
 */
export const claimTemporalRegroupSourceSchema = z.object({
  id: z.string(),
  timeSpans: z.array(
    z.object({
      startMs: z.number().int(),
      endMs: z.number().int(),
    }),
  ),
})

/**
 * The lens document for the text-span regroup: anchored at the text-span item
 * vertex, it computes an `anchor` record nesting the item's flat character offsets
 * under `textSpan`. This is the claim surface's core structural transform, shared
 * by a claim's discontiguous text-span children and a relation's endpoint spans —
 * its round-trip laws hold and its complement requirement is empty (native).
 */
export const CLAIM_TEXT_SPAN_REGROUP_LENS_DOC = {
  id: 'fovea.claim.textspan-regroup.v1',
  source: 'fovea.claim.textspan',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    {
      compute_field: {
        target: 'anchor',
        expr: '{ textSpan = { charStart = charStart, charEnd = charEnd } }',
      },
    },
  ],
} as const

/** The body vertex the text-span regroup binds to: each text-span array item. */
export const CLAIM_TEXT_SPAN_REGROUP_BODY_VERTEX = 'root.textSpans:items'

/**
 * The lens document for the temporal regroup: anchored at the temporal item
 * vertex, it computes an `anchor` record nesting the item's flat millisecond
 * offsets under `temporalSpan`. Native — its round-trip laws hold and its
 * complement requirement is empty.
 */
export const CLAIM_TEMPORAL_REGROUP_LENS_DOC = {
  id: 'fovea.claim.temporal-regroup.v1',
  source: 'fovea.claim.temporal',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    {
      compute_field: {
        target: 'anchor',
        expr: '{ temporalSpan = { start = startMs, ending = endMs } }',
      },
    },
  ],
} as const

/** The body vertex the temporal regroup binds to: each temporal array item. */
export const CLAIM_TEMPORAL_REGROUP_BODY_VERTEX = 'root.timeSpans:items'

/** A compiled span-anchor regroup lens with its schema-independent chain. */
export interface SpanRegroupLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the view-model source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles the text-span regroup lens against its view-model source schema and
 * reports its native-ness signals. The returned {@link SpanRegroupLens.lens}
 * answers `checkGetPut`/`checkPutGet` for a parsed source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildClaimTextSpanRegroupLens(): Promise<SpanRegroupLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(claimTextSpanRegroupSourceSchema)
  const chain = p.compileLensDocument(CLAIM_TEXT_SPAN_REGROUP_LENS_DOC, CLAIM_TEXT_SPAN_REGROUP_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

/**
 * Compiles the temporal regroup lens against its view-model source schema and
 * reports its native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildClaimTemporalRegroupLens(): Promise<SpanRegroupLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(claimTemporalRegroupSourceSchema)
  const chain = p.compileLensDocument(CLAIM_TEMPORAL_REGROUP_LENS_DOC, CLAIM_TEMPORAL_REGROUP_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

/**
 * Regroups a flat text span into a layers `textSpan` anchor. This is the
 * executable image of {@link CLAIM_TEXT_SPAN_REGROUP_LENS_DOC}: the lens verifies
 * the regroup is a lawful bidirectional transform, and this reproduces it to move
 * data, because `@panproto/core` 0.65.0 does not surface a `compute_field` lens's
 * output to JavaScript. Only the character extent is carried — the byte offsets
 * are omitted, since the mapper has no source text.
 */
function textSpanAnchor(span: ClaimTextSpanSource | RelationSpanSource): { textSpan: { charStart: number; charEnd: number } } {
  return { textSpan: { charStart: span.charStart, charEnd: span.charEnd } }
}

/**
 * Regroups a flat temporal span into a layers `temporalSpan` anchor. The
 * executable image of {@link CLAIM_TEMPORAL_REGROUP_LENS_DOC}.
 */
function temporalSpanAnchor(span: ClaimTemporalSpanSource): { temporalSpan: { start: number; ending: number } } {
  return { temporalSpan: { start: span.startMs, ending: span.endMs } }
}

// --------------------------------------------------------------------------
// Multi-record composition
// --------------------------------------------------------------------------

/** A claim identity `pub.layers.graph.graphNode` record with its carried id and scope. */
export interface ClaimNodeRecord {
  $type: 'pub.layers.graph.graphNode'
  nodeType: string
  label: string | null
  createdAt: string
  /** The deterministic node id (the claim id). */
  _id: string
  /** The node properties (claim identity carries none). */
  _properties: unknown
  _scope: ClaimLayersScope
}

/**
 * A claim's `pub.layers.annotation` object: the wire annotation fields the lens
 * shapes (`uuid`, `anchor`, `label`, `value`, `text`, `confidence`, `arguments`,
 * `ontologyTypeRef`, `parentId`, `features`) plus the row-only columns carried
 * alongside (the denoted node, the temporal extent, the scope).
 */
export interface ClaimAnnotationObject {
  uuid: { value: string }
  anchor: unknown
  label: string
  value: string | null
  text: string | null
  confidence: number | null
  arguments: unknown[] | null
  ontologyTypeRef: string | null
  parentId: string | null
  features: { entries: FeatureEntry[] } | null
  _denotesNodeId: string | null
  _startMs: number | null
  _endMs: number | null
  _scope: ClaimLayersScope
}

/** A cross-object `pub.layers.graph.graphEdge` record with its carried id and endpoints. */
export interface ClaimEdgeRecord {
  $type: 'pub.layers.graph.graphEdge'
  source: ObjectRef
  target: ObjectRef
  edgeType: string
  label: string | null
  confidence: number | null
  properties: { entries: FeatureEntry[] } | null
  createdAt: string
  /** The deterministic edge id. */
  _id: string
  _sourceLocalId: string | null
  _targetLocalId: string | null
  _scope: ClaimLayersScope
}

/** The layers records a single FOVEA claim composes into. */
export interface ClaimLayersRecords {
  /** The claim identity node. */
  node: ClaimNodeRecord
  /** The primary bearer annotation followed by its text-span and temporal children. */
  annotations: ClaimAnnotationObject[]
  /** The cross-object reference edges (situation / time / location). */
  refEdges: ClaimEdgeRecord[]
}

/** The layers records a single FOVEA claim relation composes into. */
export interface RelationLayersRecords {
  /** The relation edge between the two claim nodes. */
  edge: ClaimEdgeRecord
  /** The source/target endpoint-span annotations pointing at the relation. */
  spanAnnotations: ClaimAnnotationObject[]
}

/**
 * Composes a FOVEA claim view-model into its layers records: a claim identity
 * `graphNode`, a primary bearer annotation (denoting the node, carrying the claim
 * text, gloss/claimer/summary arguments, and the flat leftover), its discontiguous
 * text-span and video-time child annotations (anchored by the regrouped
 * `textSpan`/`temporalSpan`), and the cross-object reference edges. The
 * cross-record references are wired by deterministic id — the primary and children
 * from {@link claimAnnotationId} and its span variants, the parent link from the
 * parent claim's primary id, and the reference edges from {@link claimRefEdgeId} —
 * so a re-composition of the same claim reuses the same rows.
 *
 * @param source - the view-model
 * @returns the composed layers records
 */
export function composeClaimRecords(source: ClaimSource): ClaimLayersRecords {
  const primaryId = claimAnnotationId(source.id)

  const argumentsList: Record<string, unknown>[] = [
    ...glossToArguments(ROLE_GLOSS, source.gloss),
    ...glossToArguments(ROLE_CLAIM_RELATION, source.claimRelation),
    ...glossToArguments(ROLE_CLAIMER_GLOSS, source.claimerGloss),
    objectArgument(ROLE_SUMMARY, source.summaryId),
  ]
  if (source.claimerType !== null) argumentsList.push(objectArgument(ROLE_CLAIMER, source.claimerType))

  const primary: ClaimAnnotationObject = {
    uuid: { value: primaryId },
    anchor: null,
    label: LABEL_CLAIM,
    value: source.glossValue,
    text: source.text,
    confidence: source.confidence1000,
    arguments: argumentsList.length > 0 ? argumentsList : null,
    ontologyTypeRef: source.claimerType,
    parentId: source.parentClaimId !== null ? claimAnnotationId(source.parentClaimId) : null,
    features: featureMap(openExtensionEntries(source.flatLeftover)),
    _denotesNodeId: source.id,
    _startMs: null,
    _endMs: null,
    _scope: source.scope,
  }

  const textSpanObjects: ClaimAnnotationObject[] = source.textSpans.map((span) => {
    const entries: FeatureEntry[] = [{ key: KEY_SPAN_INDEX, value: String(span.spanIndex) }]
    if (span.sentenceIndex !== null) entries.push({ key: KEY_SENTENCE_INDEX, value: String(span.sentenceIndex) })
    return {
      uuid: { value: claimTextSpanAnnotationId(source.id, span.spanIndex) },
      anchor: textSpanAnchor(span),
      label: LABEL_CLAIM_TEXT_SPAN,
      value: null,
      text: null,
      confidence: null,
      arguments: null,
      ontologyTypeRef: null,
      parentId: primaryId,
      features: featureMap(entries),
      _denotesNodeId: source.id,
      _startMs: null,
      _endMs: null,
      _scope: source.scope,
    }
  })

  const temporalObjects: ClaimAnnotationObject[] = source.timeSpans.map((span) => {
    const entries: FeatureEntry[] = [{ key: KEY_SPAN_INDEX, value: String(span.spanIndex) }]
    if (span.source !== null) entries.push({ key: KEY_TIME_SOURCE, value: span.source })
    const args = span.annotationIds.map((id) => objectArgument(ROLE_TIME_ANNOTATION, id))
    return {
      uuid: { value: claimTimeSpanAnnotationId(source.id, span.spanIndex) },
      anchor: temporalSpanAnchor(span),
      label: LABEL_CLAIM_TIME,
      value: null,
      text: null,
      confidence: null,
      arguments: args.length > 0 ? args : null,
      ontologyTypeRef: null,
      parentId: primaryId,
      features: featureMap(entries),
      _denotesNodeId: source.id,
      _startMs: span.startMs,
      _endMs: span.endMs,
      _scope: source.scope,
    }
  })

  const node: ClaimNodeRecord = {
    $type: 'pub.layers.graph.graphNode',
    nodeType: CLAIM_NODE_TYPE,
    label: source.text,
    createdAt: COMPOSED_AT,
    _id: source.id,
    _properties: null,
    _scope: source.scope,
  }

  const refEdges: ClaimEdgeRecord[] = source.refs.map((ref) => ({
    $type: 'pub.layers.graph.graphEdge',
    source: localRef(source.id),
    target: localRef(ref.targetId),
    edgeType: REF_EDGE_TYPE[ref.field],
    label: REF_EDGE_TYPE[ref.field],
    confidence: null,
    properties: featureMap([{ key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_REF }]),
    createdAt: COMPOSED_AT,
    _id: claimRefEdgeId(source.id, ref.field),
    _sourceLocalId: source.id,
    _targetLocalId: ref.targetId,
    _scope: source.scope,
  }))

  return { node, annotations: [primary, ...textSpanObjects, ...temporalObjects], refEdges }
}

/**
 * Composes a FOVEA relation view-model into its layers records: a `graphEdge`
 * between the two claim nodes carrying the relation type as `edgeType`, its
 * confidence on the integer scale, and its notes / semantic timestamps as flat
 * scalar properties; plus one `textSpan`-anchored annotation per source/target
 * endpoint span, each pointing at the relation via a `relation-of` argumentRef.
 *
 * @param source - the relation view-model
 * @returns the composed layers records
 */
export function composeRelationRecords(source: RelationSource): RelationLayersRecords {
  const scope: ClaimLayersScope = { projectId: source.projectId, createdByUserId: source.createdByUserId }

  const edge: ClaimEdgeRecord = {
    $type: 'pub.layers.graph.graphEdge',
    source: localRef(source.sourceClaimId),
    target: localRef(source.targetClaimId),
    edgeType: source.relationTypeId,
    label: source.relationTypeId,
    confidence: source.confidence1000,
    properties: featureMap(source.properties),
    createdAt: COMPOSED_AT,
    _id: source.id,
    _sourceLocalId: source.sourceClaimId,
    _targetLocalId: source.targetClaimId,
    _scope: scope,
  }

  const spanAnnotations: ClaimAnnotationObject[] = source.spans.map((span) => ({
    uuid: { value: relationSpanAnnotationId(source.id, span.side, span.spanIndex) },
    anchor: textSpanAnchor(span),
    label: LABEL_RELATION_SPAN,
    value: null,
    text: null,
    confidence: null,
    arguments: [objectArgument(ROLE_RELATION, source.id)],
    ontologyTypeRef: null,
    parentId: null,
    features: featureMap([
      { key: KEY_RELATION_SIDE, value: span.side },
      { key: KEY_SPAN_INDEX, value: String(span.spanIndex) },
    ]),
    _denotesNodeId: null,
    _startMs: null,
    _endMs: null,
    _scope: scope,
  }))

  return { edge, spanAnnotations }
}

// --------------------------------------------------------------------------
// Record <-> Prisma-row adapter
// --------------------------------------------------------------------------

/** Distributes a claim annotation object to its `LayersAnnotation` row. */
function annotationObjectToRow(object: ClaimAnnotationObject): MappedClaimAnnotation {
  return {
    id: object.uuid.value,
    anchor: object.anchor,
    label: object.label,
    text: object.text,
    value: object.value,
    confidence: object.confidence,
    arguments: object.arguments,
    ontologyTypeRefId: object.ontologyTypeRef,
    parentAnnotationId: object.parentId,
    temporal: null,
    startMs: object._startMs,
    endMs: object._endMs,
    denotesNodeId: object._denotesNodeId,
    features: object.features,
    projectId: object._scope.projectId,
    createdByUserId: object._scope.createdByUserId,
  }
}

/** Distributes a graph edge record to its `GraphEdge` row. */
function edgeRecordToRow(edge: ClaimEdgeRecord): MappedClaimEdge {
  return {
    id: edge._id,
    source: edge.source,
    target: edge.target,
    sourceLocalId: edge._sourceLocalId,
    targetLocalId: edge._targetLocalId,
    edgeType: edge.edgeType,
    label: edge.label,
    confidence: edge.confidence,
    properties: edge.properties,
    projectId: edge._scope.projectId,
    createdByUserId: edge._scope.createdByUserId,
  }
}

/**
 * Distributes the composed claim records to the Prisma-row shape the persistence
 * boundary uses: the `graphNode` record becomes the claim identity row, its
 * annotation objects become the primary + child `LayersAnnotation` rows (the
 * primary first, so a parents-first writer satisfies the child annotations'
 * `parentAnnotationId` foreign key), and the reference-edge records become the
 * cross-object `GraphEdge` rows. The wire `createdAt` and the atproto reference
 * framing are dropped; the deterministic ids and scope carried alongside fill the
 * row identity columns.
 *
 * @param records - the composed claim records
 * @returns the node, annotation, and reference-edge rows
 */
export function claimRecordsToRows(records: ClaimLayersRecords): ClaimLayersProjection {
  const node: MappedClaimNode = {
    id: records.node._id,
    nodeType: records.node.nodeType,
    label: records.node.label,
    properties: records.node._properties,
    projectId: records.node._scope.projectId,
    createdByUserId: records.node._scope.createdByUserId,
  }
  return {
    node,
    annotations: records.annotations.map(annotationObjectToRow),
    refEdges: records.refEdges.map(edgeRecordToRow),
  }
}

/** Distributes the composed relation records to their `GraphEdge` + span rows. */
export function relationRecordsToRows(records: RelationLayersRecords): RelationLayersProjection {
  return {
    edge: edgeRecordToRow(records.edge),
    spanAnnotations: records.spanAnnotations.map(annotationObjectToRow),
  }
}

/**
 * The end-to-end new path for one FOVEA claim: build the view-model, compose the
 * layers records, and distribute them to rows. Equivalent, row for row, to the
 * committed hand-rolled forward mapper (the oracle) — the parity test asserts this
 * over a corpus.
 *
 * @param claim - the stored claim
 * @returns the node, annotation, and reference-edge rows
 */
export function foveaClaimToLayersRows(claim: StoredClaim): ClaimLayersProjection {
  return claimRecordsToRows(composeClaimRecords(toClaimSource(claim)))
}

/**
 * The end-to-end new path for one FOVEA claim relation: build the view-model,
 * compose the layers records, and distribute them to rows. Equivalent, row for
 * row, to the oracle's `relationToLayers`.
 *
 * @param relation - the stored relation
 * @param projectId - the source claim's project scope
 * @returns the edge and endpoint-span rows
 */
export function foveaRelationToLayersRows(
  relation: StoredRelation,
  projectId: string | null,
): RelationLayersProjection {
  return relationRecordsToRows(composeRelationRecords(toRelationSource(relation, projectId)))
}
