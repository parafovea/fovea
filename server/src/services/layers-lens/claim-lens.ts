/**
 * The FOVEA claim surface as a pair of `@panproto/core` lenses — one per
 * direction â plus a multi-record composition and a record↔row adapter.
 *
 * A FOVEA claim projects onto several layers records: a claim identity
 * `pub.layers.graph.graphNode`, a primary span `pub.layers.annotation` (the
 * claim's bearer, denoting the node) with its discontiguous text-span and
 * video-time child annotations, and cross-object `pub.layers.graph.graphEdge`s for
 * its situation / time / location references. A claim relation projects onto one
 * `graphEdge` between the two claim nodes plus one text-span endpoint annotation per
 * source/target span.
 *
 * The forward lens carries every per-record value/structure/aggregate transform.
 * Anchored at the claim root ({@link CLAIM_LENS_DOC}), it (i) folds the gloss
 * segments to the primary's plain-text `value`, (ii) scales the 0-1 float
 * `confidence` to the layers-native 0-1000 integer, (iii) builds the `arguments`
 * array — each gloss segment of the gloss / claimRelation / claimerGloss fields to a
 * role-tagged argumentRef whose role carries the field prefix and the segment's index
 * (a fold threads the index), interleaved into one array with the summary and claimer
 * object references — (iv) regroups each discontiguous text span's flat character
 * offsets into a `textSpan` anchor with its ordering features, (v) regroups each
 * video-time grounding's seconds into a `temporalSpan` anchor, scaling to
 * milliseconds and materializing its source-annotation references as argumentRefs,
 * and (vi) wraps the source's native `featureEntries` — the open-extension scalars,
 * serialized to their string forms once at the ingress boundary
 * {@link toClaimSource} — into the primary's `features` map. The relation lens
 * ({@link RELATION_LENS_DOC}) nests the endpoint claim ids into `objectRef`s, scales
 * the confidence, builds the edge property entries, and regroups each endpoint span
 * into a `textSpan` anchor pointing at the relation. {@link projectClaimCore} and
 * {@link projectRelationCore} read the transformed records back through `getJson`, so
 * the lens is the mapper, not merely a verified specification of one.
 *
 * The backward direction is carried by a second pair of lenses authored in the
 * reverse orientation ({@link CLAIM_BACK_LENS_DOC}, {@link RELATION_BACK_LENS_DOC}):
 * on `@panproto/core@0.66.0` the JSON `putJson` restore path does not apply a step's
 * inverse expression and reorders record fields, so the reliable value-inverting
 * operation is the forward `getJson` of a lens authored in the reverse direction. The
 * backward claim lens reconstructs each gloss field's `GlossItem[]` from the
 * role-tagged argumentRefs, extracts the summary membership, descales the confidence,
 * and unwraps each text-span / temporal child back to its flat offsets and seconds;
 * the backward relation lens descales the confidence, reads the notes / timestamps off
 * the edge properties, and unwraps each endpoint span. {@link layersToClaimViaLens}
 * and {@link layersToRelationViaLens} run those lenses, then deserialize the
 * `featureEntries` back to the claim's open scalars at the egress boundary.
 *
 * {@link composeClaimRecords} and {@link composeRelationRecords} own only what a
 * single lens cannot: assembling each aggregate into its several layers records —
 * the identity node, the primary bearer, its children, the reference edges, the
 * relation edge, and the endpoint spans — and wiring their cross-record references
 * (the parent link on `parentAnnotationId`, the denotation on `denotesNodeId`, the
 * reference and relation endpoints, and the child ids) by deterministic id from
 * {@link ../layers-id-map}. Their backward counterparts {@link regroupClaimBackRecord}
 * and {@link regroupRelationBackRecord} regroup the N stored rows back into one
 * lens-source record, sorting the children by their span index. The adapters
 * {@link claimRecordsToRows} and {@link relationRecordsToRows} distribute the composed
 * records to the Prisma-row shape the persistence boundary uses, the primary written
 * before its children so a parents-first writer satisfies the child annotations'
 * `parentAnnotationId` foreign key.
 *
 * @module
 */

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'
import { z } from 'zod'

import {
  CLAIM_NODE_TYPE,
  claimScope,
  isClaimNode,
  isClaimRefEdge,
  isPrimaryClaimAnnotation,
  type ClaimLayersScope,
  type StoredClaim,
  type StoredRelation,
  type MappedClaimNode,
  type MappedClaimAnnotation,
  type MappedClaimEdge,
  type ClaimLayersProjection,
  type RelationLayersProjection,
  type ClaimNodeRow,
  type ClaimAnnotationRow,
  type ClaimEdgeRow,
  type ClaimReconstructionContext,
} from '../claim-model.js'
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
/** The exact argument roles carrying a claim's summary, claimer, and time references. */
const ROLE_SUMMARY = 'summary'
const ROLE_CLAIMER = 'claimer'
const ROLE_TIME_ANNOTATION = 'time-annotation'

/** Edge property key discriminating a claim edge's role, and its two values. */
const KEY_EDGE_ROLE = 'edgeRole'
const EDGE_ROLE_CLAIM_REF = 'claim-ref'

/** Child-annotation feature keys carrying span order, sentence, and time source. */
const KEY_SPAN_INDEX = 'spanIndex'
const KEY_SENTENCE_INDEX = 'sentenceIndex'
const KEY_TIME_SOURCE = 'source'
/** Relation endpoint-span side key and its two values. */
const KEY_RELATION_SIDE = 'side'
const RELATION_SIDE_SOURCE = 'source'
const RELATION_SIDE_TARGET = 'target'
/** Relation-edge property keys carrying the flat notes and timestamps. */
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

/** The reference fields a cross-object claim edge can carry, in projection order. */
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

/** A fixed creation timestamp for the composed records (identity is deterministic). */
const COMPOSED_AT = '1970-01-01T00:00:00.000Z'

/** The source-schema vertex a source record roots at for `getJson`. */
const ROOT_VERTEX = 'root'

// --------------------------------------------------------------------------
// Small encoders the composition owns (framing values, and the open extension)
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

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Reads a claim field as a GlossItem[], tolerating null/non-array. */
function glossOf(value: unknown): GlossItem[] {
  return Array.isArray(value) ? (value as GlossItem[]) : []
}

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
}

/**
 * Serializes an object's flat, opaque open-extension scalars — the fields with no
 * dedicated native column — into the layers featureMap-native shape: a list of
 * `{ key, value }` whose value is the field's JSON string. This runs once at the
 * ingress boundary that constructs the claim view-model, so the fovea↔layers lens
 * carries the resulting `featureEntries` as a lossless passthrough (both round-trip
 * laws hold over it). A null value serializes to the JSON literal `null`; an
 * `undefined` value is skipped.
 *
 * @param leftover - the claim's open-extension scalars, keyed by field name
 * @returns the featureMap-native entries the lens wraps into the primary's `features`
 */
function toFeatureEntries(leftover: Record<string, unknown>): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  for (const [key, value] of Object.entries(leftover)) {
    if (value === undefined) continue
    entries.push({ key, value: JSON.stringify(value) })
  }
  return entries
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

/** Wraps a featureMap column's entries in the `{ entries }` shape the back lens binds. */
function normalizeFeatures(features: unknown): { entries: FeatureEntry[] } {
  return { entries: entriesOf(features) }
}

/** Reads one explicit feature value by key, or null. */
function readFeature(entries: FeatureEntry[], key: string): string | null {
  for (const entry of entries) if (entry.key === key) return entry.value
  return null
}

/** The localId value of an objectRef, or null. */
function localRefValue(ref: unknown): string | null {
  const value = (ref as { localId?: { value?: unknown } } | null)?.localId?.value
  return typeof value === 'string' ? value : null
}

/** Reads the target id of the first argumentRef carrying an exact role, or null. */
function readObjectArgument(argumentsValue: unknown, role: string): string | null {
  for (const arg of asArray(argumentsValue)) {
    if (arg.role !== role) continue
    return localRefValue(arg.target)
  }
  return null
}

/**
 * Deserializes the primary's open-extension featureMap entries back onto the claim
 * object at the egress boundary: each entry's JSON string value parses to the field
 * value, an unparseable value falling back to the raw string. The symmetric inverse
 * of {@link toFeatureEntries}.
 *
 * @param object - the claim object under reconstruction
 * @param entries - the primary annotation's featureMap entries
 */
function applyFeatureEntries(object: Record<string, unknown>, entries: FeatureEntry[]): void {
  for (const entry of entries) {
    try {
      object[entry.key] = JSON.parse(entry.value)
    } catch {
      object[entry.key] = entry.value
    }
  }
}

// --------------------------------------------------------------------------
// FOVEA claim view-model (the lens source plus its framing scalars)
// --------------------------------------------------------------------------

/** A gloss segment normalized to the lens-source shape: type/content always present. */
export interface ClaimGlossSegment {
  type: string
  content: string
  refType?: string
  refPersonaId?: string
  refClaimId?: string
}

/** A discontiguous text span in the view-model, with flat character geometry. */
export interface ClaimTextSpanSource {
  charStart: number
  charEnd: number
  spanIndex: number
  sentenceIndex: number | null
}

/** A video-time grounding in the view-model, in seconds (the lens scales to ms). */
export interface ClaimTemporalSpanSource {
  startSeconds: number
  endSeconds: number
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
 * The FOVEA claim view-model the lens and composition map from: the lens-source
 * scalars (id, text, the 0-1 confidence, the claimer type, the summary membership,
 * the three normalized gloss fields, the flat text spans, the seconds-scaled time
 * spans, and the open-extension scalars serialized to the native featureMap-shaped
 * `featureEntries`) plus the framing the composition needs (the parent claim id, the
 * ordered references, and the scope). Built by {@link toClaimSource}.
 */
export interface ClaimSource {
  id: string
  text: string
  /** Confidence as a 0-1 float, or null. */
  confidence: number | null
  claimerType: string | null
  summaryId: string
  gloss: ClaimGlossSegment[]
  claimRelation: ClaimGlossSegment[]
  claimerGloss: ClaimGlossSegment[]
  textSpans: ClaimTextSpanSource[]
  timeSpans: ClaimTemporalSpanSource[]
  /** The open-extension scalars, serialized to the native featureMap shape at ingress. */
  featureEntries: FeatureEntry[]
  parentClaimId: string | null
  refs: ClaimRefSource[]
  scope: ClaimLayersScope
}

/** Normalizes one raw gloss segment to the lens-source shape, dropping non-string refs. */
function normalizeGlossSegment(seg: GlossItem): ClaimGlossSegment {
  const out: ClaimGlossSegment = {
    type: typeof seg.type === 'string' ? seg.type : 'text',
    content: typeof seg.content === 'string' ? seg.content : '',
  }
  if (typeof seg.refType === 'string') out.refType = seg.refType
  if (typeof seg.refPersonaId === 'string') out.refPersonaId = seg.refPersonaId
  if (typeof seg.refClaimId === 'string') out.refClaimId = seg.refClaimId
  return out
}

/** Normalizes a claim field's gloss to the lens-source segment shape. */
function normalizeGloss(value: unknown): ClaimGlossSegment[] {
  return glossOf(value).map(normalizeGlossSegment)
}

/**
 * Builds the FOVEA claim view-model from a stored claim. The gloss normalization
 * (dropping non-string reference ids so the lens's `has_field` guards match the
 * oracle's `typeof` guards), the reference assembly, and the open-extension
 * serialization into the native `featureEntries` are resolved here; the value folds,
 * the confidence and millisecond scales, the argument encoding, the anchor regroups,
 * and the featureMap wrap are left for the lens.
 *
 * @param claim - the stored claim
 * @returns the view-model the lens and composition map from
 */
export function toClaimSource(claim: StoredClaim): ClaimSource {
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
  const timeSpans: ClaimTemporalSpanSource[] = asArray(claim.timeSpans).map((span, index) => ({
    startSeconds: typeof span.start === 'number' ? span.start : 0,
    endSeconds: typeof span.end === 'number' ? span.end : 0,
    spanIndex: index,
    source: typeof span.source === 'string' ? span.source : null,
    annotationIds: Array.isArray(span.annotationIds)
      ? span.annotationIds.filter((id): id is string => typeof id === 'string')
      : [],
  }))
  const refs: ClaimRefSource[] = []
  for (const field of REF_FIELDS) {
    const targetId = claim[field]
    if (typeof targetId === 'string' && targetId.length > 0) refs.push({ field, targetId })
  }

  return {
    id: claim.id,
    text: claim.text,
    confidence: typeof claim.confidence === 'number' ? claim.confidence : null,
    claimerType: typeof claim.claimerType === 'string' ? claim.claimerType : null,
    summaryId: claim.summaryId,
    gloss: normalizeGloss(claim.gloss),
    claimRelation: normalizeGloss(claim.claimRelation),
    claimerGloss: normalizeGloss(claim.claimerGloss),
    textSpans,
    timeSpans,
    featureEntries: toFeatureEntries({
      summaryType: claim.summaryType,
      modelUsed: claim.modelUsed ?? null,
      extractionStrategy: claim.extractionStrategy ?? null,
      audio: claim.audio ?? null,
      video: claim.video ?? null,
      metadata: claim.metadata ?? null,
      comment: claim.comment ?? null,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
    }),
    parentClaimId:
      typeof claim.parentClaimId === 'string' && claim.parentClaimId.length > 0 ? claim.parentClaimId : null,
    refs,
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

/**
 * The FOVEA claim-relation view-model the lens and composition map from: the
 * lens-source scalars (the endpoint claim ids, the relation type, the 0-1
 * confidence, the timestamps, and the notes) with the source/target spans flattened
 * and side-tagged, plus the scope framing.
 */
export interface RelationSource {
  id: string
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
  /** Confidence as a 0-1 float, or null. */
  confidence: number | null
  createdAt: string
  updatedAt: string
  notes: string | null
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
 * scale, the edge property entries, the endpoint objectRefs, and the span anchor
 * regroups are left for the lens; this only gathers the raw scalars and flattens
 * the source/target endpoint spans into one side-tagged list.
 *
 * @param relation - the stored relation
 * @param projectId - the source claim's project scope
 * @returns the view-model the lens and composition map from
 */
export function toRelationSource(relation: StoredRelation, projectId: string | null): RelationSource {
  return {
    id: relation.id,
    sourceClaimId: relation.sourceClaimId,
    targetClaimId: relation.targetClaimId,
    relationTypeId: relation.relationTypeId,
    confidence: typeof relation.confidence === 'number' ? relation.confidence : null,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
    notes: typeof relation.notes === 'string' ? relation.notes : null,
    spans: [
      ...relationSpansOf(relation.sourceSpans, RELATION_SIDE_SOURCE),
      ...relationSpansOf(relation.targetSpans, RELATION_SIDE_TARGET),
    ],
    projectId,
    createdByUserId: relation.createdBy ?? null,
  }
}

// --------------------------------------------------------------------------
// The claim-core lens
// --------------------------------------------------------------------------

/**
 * The Zod schema for the claim core the lens binds to. It carries the lens-source
 * scalars whose value or structure the lens transforms — the gloss fields it folds
 * and encodes, the 0-1 confidence it scales, and the flat text and seconds-scaled
 * time spans it regroups.
 */
export const claimLensSourceSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().nullable(),
  claimerType: z.string().nullable(),
  summaryId: z.string(),
  gloss: z.array(
    z.object({
      type: z.string(),
      content: z.string(),
      refType: z.string().optional(),
      refPersonaId: z.string().optional(),
      refClaimId: z.string().optional(),
    }),
  ),
  claimRelation: z.array(
    z.object({
      type: z.string(),
      content: z.string(),
      refType: z.string().optional(),
      refPersonaId: z.string().optional(),
      refClaimId: z.string().optional(),
    }),
  ),
  claimerGloss: z.array(
    z.object({
      type: z.string(),
      content: z.string(),
      refType: z.string().optional(),
      refPersonaId: z.string().optional(),
      refClaimId: z.string().optional(),
    }),
  ),
  textSpans: z.array(
    z.object({
      charStart: z.number().int(),
      charEnd: z.number().int(),
      spanIndex: z.number().int(),
      sentenceIndex: z.number().int().nullable(),
    }),
  ),
  timeSpans: z.array(
    z.object({
      startSeconds: z.number(),
      endSeconds: z.number(),
      spanIndex: z.number().int(),
      source: z.string().nullable(),
      annotationIds: z.array(z.string()),
    }),
  ),
  featureEntries: z.array(z.object({ key: z.string(), value: z.string() })),
})

/**
 * The expression that encodes one gloss field to its role-tagged argumentRefs. A
 * left fold threads a running index through the segments: each segment's role
 * carries the field `prefix` and its index, its features carry the segment's
 * type/content and any reference ids (in the oracle's order), and a non-text segment
 * additionally points at its target — its refClaimId, or its content when it names
 * no claim. The fold's `out` accumulator holds the arguments in segment order.
 */
function glossArgumentsExpr(prefix: string, field: string): string {
  return (
    `(fold (\\acc seg -> ` +
    `let e0 = [{ key = "segType", value = seg.type }, { key = "segContent", value = seg.content }] in ` +
    `let e1 = if has_field seg "refType" then append e0 { key = "refType", value = seg.refType } else e0 in ` +
    `let e2 = if has_field seg "refPersonaId" then append e1 { key = "refPersonaId", value = seg.refPersonaId } else e1 in ` +
    `let e3 = if has_field seg "refClaimId" then append e2 { key = "refClaimId", value = seg.refClaimId } else e2 in ` +
    `let base = { role = "${prefix}" ++ ":" ++ int_to_str acc.i, features = { entries = e3 } } in ` +
    `let arg = if seg.type == "text" then base else merge base { target = { localId = { value = if has_field seg "refClaimId" then seg.refClaimId else seg.content } } } in ` +
    `{ i = acc.i + 1, out = append acc.out arg }` +
    `) { i = 0, out = [] } ${field}).out`
  )
}

/** The `arguments` expression: the three gloss encodings interleaved with the object refs. */
const CLAIM_ARGUMENTS_EXPR =
  `let g = ${glossArgumentsExpr(ROLE_GLOSS, 'gloss')} in ` +
  `let r = ${glossArgumentsExpr(ROLE_CLAIM_RELATION, 'claimRelation')} in ` +
  `let c = ${glossArgumentsExpr(ROLE_CLAIMER_GLOSS, 'claimerGloss')} in ` +
  `let all = flat_map (\\x -> x) [g, r, c] in ` +
  `let withSummary = append all { role = "summary", target = { localId = { value = summaryId } } } in ` +
  `if is_null claimerType then withSummary else append withSummary { role = "claimer", target = { localId = { value = claimerType } } }`

/** The `value` expression: the gloss segment contents joined, or null when empty. */
const CLAIM_VALUE_EXPR =
  'if length gloss == 0 then Nothing else (let t = join (map (\\s -> s.content) gloss) "" in if len t == 0 then Nothing else t)'

/** The `confidence` expression: the 0-1 float to the layers-native 0-1000 integer. */
const CONFIDENCE_1000_EXPR = 'if is_null confidence then Nothing else clamp (floor (confidence * 1000.0 + 0.5)) 0 1000'

/** The per-item text-span regroup: the flat offsets to a `textSpan` anchor with features. */
const TEXT_SPAN_ITEM_EXPR =
  'map (\\s -> { ' +
  'anchor = { textSpan = { charStart = s.charStart, charEnd = s.charEnd } }, ' +
  'spanIndex = s.spanIndex, ' +
  'features = { entries = (if is_null s.sentenceIndex ' +
  'then [{ key = "spanIndex", value = int_to_str s.spanIndex }] ' +
  'else [{ key = "spanIndex", value = int_to_str s.spanIndex }, { key = "sentenceIndex", value = int_to_str s.sentenceIndex }]) } ' +
  '}) textSpans'

/**
 * The per-item temporal regroup: the seconds scaled to milliseconds and nested into
 * a `temporalSpan` anchor, the extent carried on `startMs`/`endMs`, the ordering and
 * source features assembled, and each source-annotation id materialized as a
 * `time-annotation` argumentRef.
 */
const TIME_SPAN_ITEM_EXPR =
  'map (\\s -> { ' +
  'anchor = { temporalSpan = { start = floor (s.startSeconds * 1000.0 + 0.5), ending = floor (s.endSeconds * 1000.0 + 0.5) } }, ' +
  'spanIndex = s.spanIndex, ' +
  'startMs = floor (s.startSeconds * 1000.0 + 0.5), ' +
  'endMs = floor (s.endSeconds * 1000.0 + 0.5), ' +
  'features = { entries = (if is_null s.source ' +
  'then [{ key = "spanIndex", value = int_to_str s.spanIndex }] ' +
  'else [{ key = "spanIndex", value = int_to_str s.spanIndex }, { key = "source", value = s.source }]) }, ' +
  'arguments = map (\\aid -> { role = "time-annotation", target = { localId = { value = aid } } }) s.annotationIds ' +
  '}) timeSpans'

/** The `features` expression: wraps the native `featureEntries` into a featureMap, or null when empty. */
const CLAIM_FEATURES_EXPR = 'if length featureEntries == 0 then Nothing else { entries = featureEntries }'

/**
 * The lens document for the claim core, anchored at the claim root. Its six
 * `compute_field` steps carry the surface's per-record transforms: the gloss fold to
 * `value`, the `confidence` scale, the interleaved `arguments` encoding, the per-item
 * `textSpans` and `timeSpans` anchor regroups, and the `features` wrap of the native
 * `featureEntries`. Native (its complement requirement is empty) and lawful in both
 * directions over the string, integer, and record leaves it constructs.
 */
export const CLAIM_LENS_DOC = {
  id: 'fovea.claim.core.v1',
  source: 'fovea.claim',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    { compute_field: { target: 'value', expr: CLAIM_VALUE_EXPR } },
    { compute_field: { target: 'confidence', expr: CONFIDENCE_1000_EXPR } },
    { compute_field: { target: 'arguments', expr: CLAIM_ARGUMENTS_EXPR } },
    { compute_field: { target: 'textSpans', expr: TEXT_SPAN_ITEM_EXPR } },
    { compute_field: { target: 'timeSpans', expr: TIME_SPAN_ITEM_EXPR } },
    { compute_field: { target: 'features', expr: CLAIM_FEATURES_EXPR } },
  ],
} as const

/** The body vertex the claim-core lens binds to: the claim record root. */
export const CLAIM_LENS_BODY_VERTEX = 'root'

// --------------------------------------------------------------------------
// The relation-core lens
// --------------------------------------------------------------------------

/**
 * The Zod schema for the relation core the lens binds to: the endpoint claim ids,
 * the relation type, the 0-1 confidence, the timestamps and notes the lens gathers
 * into edge properties, and the side-tagged endpoint spans it regroups.
 */
export const relationLensSourceSchema = z.object({
  id: z.string(),
  sourceClaimId: z.string(),
  targetClaimId: z.string(),
  relationTypeId: z.string(),
  confidence: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  notes: z.string().nullable(),
  spans: z.array(
    z.object({
      charStart: z.number().int(),
      charEnd: z.number().int(),
      side: z.string(),
      spanIndex: z.number().int(),
    }),
  ),
})

/** The edge-property expression: the role marker, timestamps, and the optional notes. */
const RELATION_PROPERTIES_EXPR =
  'let base = [' +
  '{ key = "edgeRole", value = "claim-relation" }, ' +
  '{ key = "createdAt", value = createdAt }, ' +
  '{ key = "updatedAt", value = updatedAt }] in ' +
  '{ entries = (if is_null notes then base else append base { key = "notes", value = notes }) }'

/** The per-item endpoint-span regroup: the anchor, the side/index features, the relation ref. */
const RELATION_SPAN_ITEM_EXPR =
  'map (\\s -> { ' +
  'anchor = { textSpan = { charStart = s.charStart, charEnd = s.charEnd } }, ' +
  'side = s.side, ' +
  'spanIndex = s.spanIndex, ' +
  'features = { entries = [{ key = "side", value = s.side }, { key = "spanIndex", value = int_to_str s.spanIndex }] }, ' +
  'arguments = [{ role = "relation-of", target = { localId = { value = id } } }] ' +
  '}) spans'

/**
 * The lens document for the relation core, anchored at the relation root. Its five
 * `compute_field` steps nest the endpoint claim ids into `source`/`target`
 * objectRefs, scale the `confidence`, gather the edge `properties`, and regroup each
 * endpoint span into a `textSpan`-anchored record pointing at the relation. Native
 * and lawful in both directions.
 */
export const RELATION_LENS_DOC = {
  id: 'fovea.claim.relation-core.v1',
  source: 'fovea.relation',
  target: 'pub.layers.graph.graphEdge',
  steps: [
    { compute_field: { target: 'source', expr: '{ localId = { value = sourceClaimId } }' } },
    { compute_field: { target: 'target', expr: '{ localId = { value = targetClaimId } }' } },
    { compute_field: { target: 'confidence', expr: CONFIDENCE_1000_EXPR } },
    { compute_field: { target: 'properties', expr: RELATION_PROPERTIES_EXPR } },
    { compute_field: { target: 'spans', expr: RELATION_SPAN_ITEM_EXPR } },
  ],
} as const

/** The body vertex the relation-core lens binds to: the relation record root. */
export const RELATION_LENS_BODY_VERTEX = 'root'

// --------------------------------------------------------------------------
// Lens compilation
// --------------------------------------------------------------------------

/** A compiled core lens with its schema-independent chain and native-ness signals. */
export interface CoreLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the view-model source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/** Compiles a core lens document against its source schema and reports its signals. */
async function buildCoreLens(doc: unknown, bodyVertex: string, schema: z.ZodType): Promise<CoreLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(schema)
  const chain = p.compileLensDocument(doc as never, bodyVertex)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

/**
 * Compiles the claim-core lens against its view-model source schema and reports its
 * native-ness signals. The returned {@link CoreLens.lens} answers
 * `getJson`/`putJson` and `checkGetPut`/`checkPutGet` for a source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export function buildClaimLens(): Promise<CoreLens> {
  return buildCoreLens(CLAIM_LENS_DOC, CLAIM_LENS_BODY_VERTEX, claimLensSourceSchema)
}

/**
 * Compiles the relation-core lens against its view-model source schema and reports
 * its native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export function buildRelationLens(): Promise<CoreLens> {
  return buildCoreLens(RELATION_LENS_DOC, RELATION_LENS_BODY_VERTEX, relationLensSourceSchema)
}

let claimLensPromise: Promise<CoreLens> | null = null
let relationLensPromise: Promise<CoreLens> | null = null

/** The claim-core lens, compiled and instantiated once per process. */
export function getClaimLens(): Promise<CoreLens> {
  claimLensPromise ??= buildClaimLens()
  return claimLensPromise
}

/** The relation-core lens, compiled and instantiated once per process. */
export function getRelationLens(): Promise<CoreLens> {
  relationLensPromise ??= buildRelationLens()
  return relationLensPromise
}

// --------------------------------------------------------------------------
// The lens-projected core views (what getJson emits)
// --------------------------------------------------------------------------

/** A text-span child core the lens emits: its `textSpan` anchor and ordering features. */
export interface ClaimCoreTextSpan {
  anchor: { textSpan: { charStart: number; charEnd: number } }
  spanIndex: number
  features: { entries: FeatureEntry[] }
}

/** A temporal child core the lens emits: its `temporalSpan` anchor, extent, and refs. */
export interface ClaimCoreTimeSpan {
  anchor: { temporalSpan: { start: number; ending: number } }
  spanIndex: number
  startMs: number
  endMs: number
  features: { entries: FeatureEntry[] }
  arguments: Record<string, unknown>[]
}

/**
 * The claim core the lens emits: the folded gloss `value`, the scaled `confidence`,
 * the interleaved `arguments`, and the regrouped text-span and temporal children.
 * The passthrough scalars (`text`, `claimerType`) are read from here too.
 */
export interface ClaimCoreView {
  id: string
  text: string
  claimerType: string | null
  value: string | null
  confidence: number | null
  arguments: Record<string, unknown>[]
  textSpans: ClaimCoreTextSpan[]
  timeSpans: ClaimCoreTimeSpan[]
  /** The open-extension featureMap wrapped by the lens, or null when empty. */
  features: { entries: FeatureEntry[] } | null
}

/** An endpoint-span core the relation lens emits: its anchor, features, and relation ref. */
export interface RelationCoreSpan {
  anchor: { textSpan: { charStart: number; charEnd: number } }
  side: string
  spanIndex: number
  features: { entries: FeatureEntry[] }
  arguments: Record<string, unknown>[]
}

/**
 * The relation core the lens emits: the endpoint objectRefs, the scaled confidence,
 * the edge property entries, and the regrouped endpoint spans.
 */
export interface RelationCoreView {
  id: string
  relationTypeId: string
  confidence: number | null
  source: ObjectRef
  target: ObjectRef
  properties: { entries: FeatureEntry[] }
  spans: RelationCoreSpan[]
}

/** Projects the claim view-model's lens fields into the lens source record. */
export function toClaimLensRecord(source: ClaimSource): Record<string, unknown> {
  return {
    id: source.id,
    text: source.text,
    confidence: source.confidence,
    claimerType: source.claimerType,
    summaryId: source.summaryId,
    gloss: source.gloss,
    claimRelation: source.claimRelation,
    claimerGloss: source.claimerGloss,
    textSpans: source.textSpans.map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      spanIndex: s.spanIndex,
      sentenceIndex: s.sentenceIndex,
    })),
    timeSpans: source.timeSpans.map((s) => ({
      startSeconds: s.startSeconds,
      endSeconds: s.endSeconds,
      spanIndex: s.spanIndex,
      source: s.source,
      annotationIds: s.annotationIds,
    })),
    featureEntries: source.featureEntries,
  }
}

/** Projects the relation view-model's lens fields into the lens source record. */
export function toRelationLensRecord(source: RelationSource): Record<string, unknown> {
  return {
    id: source.id,
    sourceClaimId: source.sourceClaimId,
    targetClaimId: source.targetClaimId,
    relationTypeId: source.relationTypeId,
    confidence: source.confidence,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    notes: source.notes,
    spans: source.spans.map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      side: s.side,
      spanIndex: s.spanIndex,
    })),
  }
}

/**
 * Projects the claim view-model through the lens, reading the transformed record
 * back with `getJson`. The returned view carries the folded `value`, the scaled
 * `confidence`, the interleaved `arguments`, and the regrouped children — the lens,
 * not the caller, did the value/structure/aggregate work.
 *
 * @param lens - the instantiated claim-core lens
 * @param source - the view-model
 * @returns the transformed claim core
 */
export function projectClaimCore(lens: LensHandle, source: ClaimSource): ClaimCoreView {
  const { view } = lens.getJson(toClaimLensRecord(source), ROOT_VERTEX)
  return view as ClaimCoreView
}

/**
 * Projects the relation view-model through the lens, reading the transformed record
 * back with `getJson`.
 *
 * @param lens - the instantiated relation-core lens
 * @param source - the view-model
 * @returns the transformed relation core
 */
export function projectRelationCore(lens: LensHandle, source: RelationSource): RelationCoreView {
  const { view } = lens.getJson(toRelationLensRecord(source), ROOT_VERTEX)
  return view as RelationCoreView
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
 * Composes a FOVEA claim view-model and its lens-projected core into the surface's
 * layers records: a claim identity `graphNode`, a primary bearer annotation
 * (denoting the node, bearing the lens-folded `value`, the lens-scaled `confidence`,
 * and the lens-built `arguments`), its discontiguous text-span and video-time child
 * annotations (anchored by the lens-regrouped `textSpan`/`temporalSpan`), and the
 * cross-object reference edges. The cross-record references are wired by
 * deterministic id — the primary and children from {@link claimAnnotationId} and its
 * span variants, the parent link from the parent claim's primary id, and the
 * reference edges from {@link claimRefEdgeId} — so a re-composition reuses the same
 * rows. This owns only the multi-record framing and the id wiring; the per-record
 * value/structure/aggregate work — including the open-extension `features` wrap — is
 * the lens's, read in through `core`.
 *
 * @param source - the view-model (the framing scalars: parent, refs, scope)
 * @param core - the lens-projected claim core (value, confidence, arguments, spans, features)
 * @returns the composed layers records
 */
export function composeClaimRecords(source: ClaimSource, core: ClaimCoreView): ClaimLayersRecords {
  const primaryId = claimAnnotationId(source.id)
  const scope = source.scope

  const primary: ClaimAnnotationObject = {
    uuid: { value: primaryId },
    anchor: null,
    label: LABEL_CLAIM,
    value: core.value,
    text: core.text,
    confidence: core.confidence,
    arguments: core.arguments.length > 0 ? core.arguments : null,
    ontologyTypeRef: core.claimerType,
    parentId: source.parentClaimId !== null ? claimAnnotationId(source.parentClaimId) : null,
    features: core.features,
    _denotesNodeId: source.id,
    _startMs: null,
    _endMs: null,
    _scope: scope,
  }

  const textSpanObjects: ClaimAnnotationObject[] = core.textSpans.map((span) => ({
    uuid: { value: claimTextSpanAnnotationId(source.id, span.spanIndex) },
    anchor: span.anchor,
    label: LABEL_CLAIM_TEXT_SPAN,
    value: null,
    text: null,
    confidence: null,
    arguments: null,
    ontologyTypeRef: null,
    parentId: primaryId,
    features: span.features,
    _denotesNodeId: source.id,
    _startMs: null,
    _endMs: null,
    _scope: scope,
  }))

  const temporalObjects: ClaimAnnotationObject[] = core.timeSpans.map((span) => ({
    uuid: { value: claimTimeSpanAnnotationId(source.id, span.spanIndex) },
    anchor: span.anchor,
    label: LABEL_CLAIM_TIME,
    value: null,
    text: null,
    confidence: null,
    arguments: span.arguments.length > 0 ? span.arguments : null,
    ontologyTypeRef: null,
    parentId: primaryId,
    features: span.features,
    _denotesNodeId: source.id,
    _startMs: span.startMs,
    _endMs: span.endMs,
    _scope: scope,
  }))

  const node: ClaimNodeRecord = {
    $type: 'pub.layers.graph.graphNode',
    nodeType: CLAIM_NODE_TYPE,
    label: core.text,
    createdAt: COMPOSED_AT,
    _id: source.id,
    _properties: null,
    _scope: scope,
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
    _scope: scope,
  }))

  return { node, annotations: [primary, ...textSpanObjects, ...temporalObjects], refEdges }
}

/**
 * Composes a FOVEA relation view-model and its lens-projected core into its layers
 * records: a `graphEdge` between the two claim nodes (bearing the lens-nested
 * endpoint objectRefs, the lens-scaled confidence, and the lens-built property
 * entries) and one `textSpan`-anchored annotation per endpoint span, each pointing
 * at the relation. The cross-record references — the endpoint ids and the endpoint
 * span ids from {@link relationSpanAnnotationId} — are wired here; the per-record
 * work is the lens's, read in through `core`.
 *
 * @param source - the relation view-model (the framing scalars: endpoint ids, scope)
 * @param core - the lens-projected relation core (endpoints, confidence, properties, spans)
 * @returns the composed layers records
 */
export function composeRelationRecords(source: RelationSource, core: RelationCoreView): RelationLayersRecords {
  const scope: ClaimLayersScope = { projectId: source.projectId, createdByUserId: source.createdByUserId }

  const edge: ClaimEdgeRecord = {
    $type: 'pub.layers.graph.graphEdge',
    source: core.source,
    target: core.target,
    edgeType: core.relationTypeId,
    label: core.relationTypeId,
    confidence: core.confidence,
    properties: core.properties,
    createdAt: COMPOSED_AT,
    _id: source.id,
    _sourceLocalId: source.sourceClaimId,
    _targetLocalId: source.targetClaimId,
    _scope: scope,
  }

  const spanAnnotations: ClaimAnnotationObject[] = core.spans.map((span) => ({
    uuid: { value: relationSpanAnnotationId(source.id, span.side, span.spanIndex) },
    anchor: span.anchor,
    label: LABEL_RELATION_SPAN,
    value: null,
    text: null,
    confidence: null,
    arguments: span.arguments,
    ontologyTypeRef: null,
    parentId: null,
    features: span.features,
    _denotesNodeId: null,
    _startMs: null,
    _endMs: null,
    _scope: scope,
  }))

  return { edge, spanAnnotations }
}

// --------------------------------------------------------------------------
// Record ↔ Prisma-row adapter
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
 * annotation objects become the primary + child `LayersAnnotation` rows (the primary
 * first, so a parents-first writer satisfies the child annotations'
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
 * The end-to-end new path for one FOVEA claim: build the view-model, project its
 * core through the lens, compose the layers records, and distribute them to rows.
 * Equivalent, row for row, to the committed hand-rolled forward mapper (the oracle)
 * — the parity test asserts this over a corpus.
 *
 * @param claim - the stored claim
 * @returns the node, annotation, and reference-edge rows
 */
export async function foveaClaimToLayersRows(claim: StoredClaim): Promise<ClaimLayersProjection> {
  const { lens } = await getClaimLens()
  const source = toClaimSource(claim)
  const core = projectClaimCore(lens, source)
  return claimRecordsToRows(composeClaimRecords(source, core))
}

/**
 * The end-to-end new path for one FOVEA claim relation: build the view-model,
 * project its core through the lens, compose the layers records, and distribute them
 * to rows. Equivalent, row for row, to the oracle's `relationToLayers`.
 *
 * @param relation - the stored relation
 * @param projectId - the source claim's project scope
 * @returns the edge and endpoint-span rows
 */
export async function foveaRelationToLayersRows(
  relation: StoredRelation,
  projectId: string | null,
): Promise<RelationLayersProjection> {
  const { lens } = await getRelationLens()
  const source = toRelationSource(relation, projectId)
  const core = projectRelationCore(lens, source)
  return relationRecordsToRows(composeRelationRecords(source, core))
}

// --------------------------------------------------------------------------
// The backward claim + relation lenses (layers -> fovea)
// --------------------------------------------------------------------------

/**
 * A panproto expression that reads one featureMap entry's value by key from a
 * `let es = ...` list in scope, falling back to `def` when the key is absent. The
 * layers featureMap is a list of `{ key, value }`, so a fold over it recovers a
 * value the way a record field access would.
 */
function featureLookupExpr(key: string, def: string): string {
  return `(fold (\\acc e -> if e.key == "${key}" then e.value else acc) "${def}" es)`
}

/** A panproto expression that reports whether an entries list `es` carries a key. */
function featureHasExpr(key: string): string {
  return `(fold (\\acc e -> if e.key == "${key}" then True else acc) False es)`
}

/**
 * The backward expression that reconstructs one gloss field's `GlossItem[]` from the
 * primary's argumentRefs: it filters the arguments to those whose role's prefix (the
 * substring before the `:` index) matches `prefix`, then rebuilds each segment from
 * its feature entries — the `segType`/`segContent` always, and the `refType` /
 * `refPersonaId` / `refClaimId` conditionally, as a merge of present-field-only
 * singletons. The inverse of the forward {@link glossArgumentsExpr}.
 */
function glossReconExpr(prefix: string): string {
  return (
    `map (\\a -> ` +
    `let es = a.features.entries in ` +
    `let base = { type = ${featureLookupExpr('segType', 'text')}, content = ${featureLookupExpr('segContent', '')} } in ` +
    `merge base (merge ` +
    `(if ${featureHasExpr('refType')} then { refType = ${featureLookupExpr('refType', '')} } else {}) ` +
    `(merge ` +
    `(if ${featureHasExpr('refPersonaId')} then { refPersonaId = ${featureLookupExpr('refPersonaId', '')} } else {}) ` +
    `(if ${featureHasExpr('refClaimId')} then { refClaimId = ${featureLookupExpr('refClaimId', '')} } else {})))` +
    `) (filter (\\a -> head (split a.role ":") == "${prefix}") arguments)`
  )
}

/** The backward `confidence` expression: the 0-1000 integer descaled to a 0-1 float. */
const CONFIDENCE_FLOAT_EXPR = 'if is_null confidence then Nothing else int_to_float confidence / 1000.0'

/** The backward `summaryId` expression: the target id of the `summary` argumentRef, or empty. */
const SUMMARY_ID_EXPR = `fold (\\acc a -> if a.role == "${ROLE_SUMMARY}" then a.target.localId.value else acc) "" arguments`

/**
 * The backward text-span expression: each stored text-span child's `textSpan` anchor
 * unwrapped to flat `charStart`/`charEnd`, with the `sentenceIndex` recovered as an
 * integer only when its feature is present; the whole field is null when the claim
 * carries no text-span children. The inverse of the forward {@link TEXT_SPAN_ITEM_EXPR}.
 */
const TEXT_SPAN_RECON_EXPR =
  'if length textSpanChildren == 0 then Nothing else map (\\c -> ' +
  'let es = c.features.entries in ' +
  'let base = { charStart = c.anchor.textSpan.charStart, charEnd = c.anchor.textSpan.charEnd } in ' +
  `merge base (if ${featureHasExpr(KEY_SENTENCE_INDEX)} then { sentenceIndex = str_to_int ${featureLookupExpr(KEY_SENTENCE_INDEX, '0')} } else {})` +
  ') textSpanChildren'

/**
 * The backward temporal expression: each stored temporal child's millisecond extent
 * descaled to seconds, the `source` feature recovered when present, and the
 * `time-annotation` argumentRefs collected back into `annotationIds` when non-empty;
 * null when the claim carries no temporal children. The inverse of the forward
 * {@link TIME_SPAN_ITEM_EXPR}.
 */
const TIME_SPAN_RECON_EXPR =
  'if length timeSpanChildren == 0 then Nothing else map (\\c -> ' +
  'let es = c.features.entries in ' +
  `let annIds = map (\\a -> a.target.localId.value) (filter (\\a -> a.role == "${ROLE_TIME_ANNOTATION}") c.arguments) in ` +
  'let base = { start = int_to_float c.startMs / 1000.0, end = int_to_float c.endMs / 1000.0 } in ' +
  'merge base (merge ' +
  `(if ${featureHasExpr(KEY_TIME_SOURCE)} then { source = ${featureLookupExpr(KEY_TIME_SOURCE, '')} } else {}) ` +
  '(if length annIds == 0 then {} else { annotationIds = annIds }))' +
  ') timeSpanChildren'

/**
 * The Zod schema for the backward claim lens source: the primary's raw argumentRefs
 * and 0-1000 confidence, plus the stored text-span / temporal child rows regrouped
 * (and span-ordered) by {@link regroupClaimBackRecord}. The lens reads these and emits
 * the reconstructed claim value fields.
 */
export const claimBackLensSourceSchema = z.object({
  confidence: z.number().int().nullable(),
  arguments: z.array(
    z.object({
      role: z.string(),
      target: z.object({ localId: z.object({ value: z.string() }) }).optional(),
      features: z.object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) }).optional(),
    }),
  ),
  textSpanChildren: z.array(
    z.object({
      anchor: z.object({ textSpan: z.object({ charStart: z.number().int(), charEnd: z.number().int() }) }),
      features: z.object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) }),
    }),
  ),
  timeSpanChildren: z.array(
    z.object({
      startMs: z.number().int(),
      endMs: z.number().int(),
      features: z.object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) }),
      arguments: z.array(z.object({ role: z.string(), target: z.object({ localId: z.object({ value: z.string() }) }) })),
    }),
  ),
})

/**
 * The lens document for the backward claim core, anchored at the regrouped record
 * root. Its steps invert the forward per-record transforms on `getJson`: the
 * confidence descale, the three gloss-field reconstructions, the summary-membership
 * extraction, and the text-span / temporal unwraps. Native (its complement
 * requirement is empty) and lawful in both directions.
 */
export const CLAIM_BACK_LENS_DOC = {
  id: 'fovea.claim.core.back.v1',
  source: 'pub.layers.annotation.annotationLayer',
  target: 'fovea.claim',
  steps: [
    { compute_field: { target: 'confidence', expr: CONFIDENCE_FLOAT_EXPR } },
    { compute_field: { target: 'gloss', expr: glossReconExpr(ROLE_GLOSS) } },
    { compute_field: { target: 'claimRelation', expr: glossReconExpr(ROLE_CLAIM_RELATION) } },
    { compute_field: { target: 'claimerGloss', expr: glossReconExpr(ROLE_CLAIMER_GLOSS) } },
    { compute_field: { target: 'summaryId', expr: SUMMARY_ID_EXPR } },
    { compute_field: { target: 'textSpans', expr: TEXT_SPAN_RECON_EXPR } },
    { compute_field: { target: 'timeSpans', expr: TIME_SPAN_RECON_EXPR } },
  ],
} as const

/** The body vertex the backward claim lens binds to: the regrouped record root. */
export const CLAIM_BACK_LENS_BODY_VERTEX = 'root'

/**
 * The Zod schema for the backward relation lens source: the edge's 0-1000 confidence
 * and property entries, plus the side-tagged (and span-ordered) endpoint span rows
 * regrouped by {@link regroupRelationBackRecord}.
 */
export const relationBackLensSourceSchema = z.object({
  confidence: z.number().int().nullable(),
  properties: z.object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) }),
  sourceSpanRows: z.array(
    z.object({ anchor: z.object({ textSpan: z.object({ charStart: z.number().int(), charEnd: z.number().int() }) }) }),
  ),
  targetSpanRows: z.array(
    z.object({ anchor: z.object({ textSpan: z.object({ charStart: z.number().int(), charEnd: z.number().int() }) }) }),
  ),
})

/** The backward endpoint-span expression: each side's spans unwrapped, or null when empty. */
function relationSideReconExpr(field: string): string {
  return `if length ${field} == 0 then Nothing else map (\\s -> { charStart = s.anchor.textSpan.charStart, charEnd = s.anchor.textSpan.charEnd }) ${field}`
}

/** A backward relation-edge property lookup by key over `properties.entries`. */
function propertyLookupExpr(key: string, def: string): string {
  return `(fold (\\acc e -> if e.key == "${key}" then e.value else acc) "${def}" properties.entries)`
}

/** Whether a backward relation edge carries a property key. */
function propertyHasExpr(key: string): string {
  return `(fold (\\acc e -> if e.key == "${key}" then True else acc) False properties.entries)`
}

/**
 * The lens document for the backward relation core, anchored at the regrouped record
 * root. Its steps invert the forward relation transforms: the confidence descale, the
 * notes / timestamp recovery off the edge properties, and the source/target endpoint
 * unwraps. Native and lawful in both directions.
 */
export const RELATION_BACK_LENS_DOC = {
  id: 'fovea.claim.relation-core.back.v1',
  source: 'pub.layers.graph.graphEdge',
  target: 'fovea.relation',
  steps: [
    { compute_field: { target: 'confidence', expr: CONFIDENCE_FLOAT_EXPR } },
    { compute_field: { target: 'notes', expr: `if ${propertyHasExpr(KEY_NOTES)} then ${propertyLookupExpr(KEY_NOTES, '')} else Nothing` } },
    { compute_field: { target: 'createdAt', expr: propertyLookupExpr(KEY_CREATED_AT, '') } },
    { compute_field: { target: 'updatedAt', expr: propertyLookupExpr(KEY_UPDATED_AT, '') } },
    { compute_field: { target: 'sourceSpans', expr: relationSideReconExpr('sourceSpanRows') } },
    { compute_field: { target: 'targetSpans', expr: relationSideReconExpr('targetSpanRows') } },
  ],
} as const

/** The body vertex the backward relation lens binds to: the regrouped record root. */
export const RELATION_BACK_LENS_BODY_VERTEX = 'root'

/**
 * Compiles the backward claim lens against its regrouped source schema and reports its
 * native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export function buildClaimBackLens(): Promise<CoreLens> {
  return buildCoreLens(CLAIM_BACK_LENS_DOC, CLAIM_BACK_LENS_BODY_VERTEX, claimBackLensSourceSchema)
}

/**
 * Compiles the backward relation lens against its regrouped source schema and reports
 * its native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export function buildRelationBackLens(): Promise<CoreLens> {
  return buildCoreLens(RELATION_BACK_LENS_DOC, RELATION_BACK_LENS_BODY_VERTEX, relationBackLensSourceSchema)
}

let claimBackLensPromise: Promise<CoreLens> | null = null
let relationBackLensPromise: Promise<CoreLens> | null = null

/** The backward claim lens, compiled and instantiated once per process. */
export function getClaimBackLens(): Promise<CoreLens> {
  claimBackLensPromise ??= buildClaimBackLens()
  return claimBackLensPromise
}

/** The backward relation lens, compiled and instantiated once per process. */
export function getRelationBackLens(): Promise<CoreLens> {
  relationBackLensPromise ??= buildRelationBackLens()
  return relationBackLensPromise
}

/** The claim value fields the backward lens emits from the regrouped record. */
export interface ClaimBackView {
  confidence: number | null
  gloss: GlossItem[]
  claimRelation: GlossItem[]
  claimerGloss: GlossItem[]
  summaryId: string
  textSpans: Record<string, unknown>[] | null
  timeSpans: Record<string, unknown>[] | null
}

/** The relation value fields the backward lens emits from the regrouped record. */
export interface RelationBackView {
  confidence: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  sourceSpans: Record<string, unknown>[] | null
  targetSpans: Record<string, unknown>[] | null
}

/** Unwraps a stored `textSpan` anchor column to a clean flat-offset anchor. */
function cleanTextSpanAnchor(anchor: unknown): { textSpan: { charStart: number; charEnd: number } } {
  const span = (anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
  const charStart = typeof span?.charStart === 'number' ? span.charStart : 0
  const charEnd = typeof span?.charEnd === 'number' ? span.charEnd : charStart
  return { textSpan: { charStart, charEnd } }
}

/** Reads a child annotation's span index off its features, defaulting to zero. */
function spanIndexOf(row: ClaimAnnotationRow): number {
  return Number(readFeature(entriesOf(row.features), KEY_SPAN_INDEX) ?? '0')
}

/**
 * Regroups a claim's stored rows into the single backward-lens source record: the
 * primary's raw arguments and confidence, and its text-span / temporal child rows
 * sorted by span index into the shapes the lens unwraps. This is the inverse of the
 * multi-record composition — assembling N rows into one aggregate is composition, not
 * a lens step — while the per-record value inversions are the lens's.
 *
 * @param primary - the claim's primary bearer annotation
 * @param children - the claim's text-span and temporal child annotations
 * @returns the backward-lens source record
 */
export function regroupClaimBackRecord(
  primary: ClaimAnnotationRow,
  children: ClaimAnnotationRow[],
): Record<string, unknown> {
  const textChildren = children
    .filter((c) => c.label === LABEL_CLAIM_TEXT_SPAN)
    .sort((a, b) => spanIndexOf(a) - spanIndexOf(b))
  const timeChildren = children
    .filter((c) => c.label === LABEL_CLAIM_TIME)
    .sort((a, b) => spanIndexOf(a) - spanIndexOf(b))

  return {
    confidence: typeof primary.confidence === 'number' ? primary.confidence : null,
    arguments: asArray(primary.arguments),
    textSpanChildren: textChildren.map((c) => ({
      anchor: cleanTextSpanAnchor(c.anchor),
      features: normalizeFeatures(c.features),
    })),
    timeSpanChildren: timeChildren.map((c) => ({
      startMs: typeof c.startMs === 'number' ? c.startMs : 0,
      endMs: typeof c.endMs === 'number' ? c.endMs : 0,
      features: normalizeFeatures(c.features),
      arguments: asArray(c.arguments),
    })),
  }
}

/**
 * Reconstructs the FOVEA claim from its stored layers rows through the backward lens —
 * the lens-native inverse of {@link foveaClaimToLayersRows}, matching the oracle's
 * `claimFromLayers` row for row. The lens descales the confidence, rebuilds each gloss
 * field from the argumentRefs, extracts the summary membership, and unwraps the
 * text-span / temporal children; this egress boundary then deserializes the
 * open-extension `featureEntries` back to the claim's flat scalars, applies the claimer
 * type from the primary's `ontologyTypeRefId`, reads the parent claim id and the
 * cross-object references off the regrouped context, and fills the identity and scope
 * from the node and primary. The backward-parity test asserts this equals the oracle
 * reconstruction over a corpus.
 *
 * @param node - the claim GraphNode row
 * @param primary - the claim's primary bearer annotation
 * @param context - the child annotations, ref edges, and resolved parent claim id
 * @returns the reconstructed FOVEA claim
 */
export async function layersToClaimViaLens(
  node: ClaimNodeRow,
  primary: ClaimAnnotationRow,
  context: ClaimReconstructionContext,
): Promise<StoredClaim> {
  const { lens } = await getClaimBackLens()
  const record = regroupClaimBackRecord(primary, context.children)
  const view = lens.getJson(record, ROOT_VERTEX).view as ClaimBackView

  const object: Record<string, unknown> = {
    id: node.id,
    gloss: view.gloss,
    parentClaimId: context.parentClaimId,
    textSpans: view.textSpans ?? null,
    timeSpans: view.timeSpans ?? null,
    claimerType: null,
    claimerGloss: null,
    claimRelation: null,
    claimEventId: null,
    claimTimeId: null,
    claimLocationId: null,
    confidence: view.confidence,
  }

  applyFeatureEntries(object, entriesOf(primary.features))
  for (const field of FLAT_CLAIM_FIELDS) if (!(field in object)) object[field] = null

  object.summaryId = view.summaryId
  object.text = primary.text ?? node.label ?? ''
  object.createdBy = primary.createdByUserId ?? node.createdByUserId ?? null
  object.projectId = primary.projectId ?? node.projectId ?? null

  if (view.claimRelation.length > 0) object.claimRelation = view.claimRelation
  if (view.claimerGloss.length > 0) object.claimerGloss = view.claimerGloss

  const claimerType = primary.ontologyTypeRefId ?? readObjectArgument(primary.arguments, ROLE_CLAIMER)
  if (claimerType !== null) object.claimerType = claimerType

  for (const edge of context.refEdges) {
    if (readFeature(entriesOf(edge.properties), KEY_EDGE_ROLE) !== EDGE_ROLE_CLAIM_REF) continue
    const field = FIELD_BY_REF_EDGE_TYPE[edge.edgeType]
    if (field && typeof edge.targetLocalId === 'string' && edge.targetLocalId.length > 0) {
      object[field] = edge.targetLocalId
    }
  }

  return object as unknown as StoredClaim
}

/**
 * Regroups a relation's stored rows into the single backward-lens source record: the
 * edge's confidence and properties, and its endpoint-span annotations partitioned by
 * side and sorted by span index into the anchor shapes the lens unwraps.
 *
 * @param edge - the relation GraphEdge row
 * @param spans - the relation's endpoint-span annotations
 * @returns the backward-lens source record
 */
export function regroupRelationBackRecord(
  edge: ClaimEdgeRow,
  spans: ClaimAnnotationRow[],
): Record<string, unknown> {
  const side = (want: string): Array<{ anchor: { textSpan: { charStart: number; charEnd: number } } }> =>
    spans
      .filter((s) => readFeature(entriesOf(s.features), KEY_RELATION_SIDE) === want)
      .sort((a, b) => spanIndexOf(a) - spanIndexOf(b))
      .map((s) => ({ anchor: cleanTextSpanAnchor(s.anchor) }))

  return {
    confidence: typeof edge.confidence === 'number' ? edge.confidence : null,
    properties: normalizeFeatures(edge.properties),
    sourceSpanRows: side(RELATION_SIDE_SOURCE),
    targetSpanRows: side(RELATION_SIDE_TARGET),
  }
}

/**
 * Reconstructs the FOVEA claim relation from its stored layers rows through the
 * backward lens — the lens-native inverse of {@link foveaRelationToLayersRows},
 * matching the oracle's `edgeToRelation` row for row. The lens descales the confidence,
 * reads the notes / timestamps off the edge properties, and unwraps the endpoint spans;
 * this egress boundary fills the endpoint claim ids and the relation type from the edge
 * columns.
 *
 * @param edge - the relation GraphEdge row
 * @param spans - the relation's endpoint-span annotations
 * @returns the reconstructed FOVEA relation
 */
export async function layersToRelationViaLens(
  edge: ClaimEdgeRow,
  spans: ClaimAnnotationRow[] = [],
): Promise<StoredRelation> {
  const { lens } = await getRelationBackLens()
  const record = regroupRelationBackRecord(edge, spans)
  const view = lens.getJson(record, ROOT_VERTEX).view as RelationBackView

  return {
    id: edge.id,
    sourceClaimId: edge.sourceLocalId ?? '',
    targetClaimId: edge.targetLocalId ?? '',
    relationTypeId: edge.edgeType,
    sourceSpans: view.sourceSpans ?? null,
    targetSpans: view.targetSpans ?? null,
    confidence: view.confidence,
    notes: view.notes ?? null,
    createdBy: edge.createdByUserId ?? null,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  }
}

// --------------------------------------------------------------------------
// Production drop-ins (the claim surface's write + read entry points)
// --------------------------------------------------------------------------

/**
 * Projects one FOVEA claim onto its native layers rows through the lens: the identity
 * `graphNode`, the primary bearer annotation, its text-span and temporal child
 * annotations, and the cross-object reference edges. The primary is emitted before its
 * children, so a parents-first writer satisfies the child annotations'
 * `parentAnnotationId` foreign key. Async because the claim-core lens compiles once
 * per process.
 *
 * @param claim - the stored claim
 * @returns the node, annotation, and reference-edge rows
 */
export function claimToLayersViaLens(claim: StoredClaim): Promise<ClaimLayersProjection> {
  return foveaClaimToLayersRows(claim)
}

/**
 * Projects one FOVEA claim relation onto its native layers rows through the lens: a
 * `graphEdge` between the two claim nodes and one `textSpan`-anchored annotation per
 * source/target endpoint span. Async because the relation-core lens compiles once per
 * process.
 *
 * @param relation - the stored relation
 * @param projectId - the source claim's project scope
 * @returns the edge and endpoint-span rows
 */
export function relationToLayersViaLens(
  relation: StoredRelation,
  projectId: string | null,
): Promise<RelationLayersProjection> {
  return foveaRelationToLayersRows(relation, projectId)
}

/**
 * Reconstructs every claim in one summary's claim-span layer from its native rows
 * through the backward lens: the claim `graphNode`s, the layer's annotations (primaries
 * plus text-span / temporal children), and the claims' outgoing cross-object reference
 * edges. Each claim's parent link is recovered from its primary's `parentAnnotationId`
 * self-relation, mapping back to the parent claim id. Async because the backward
 * claim-core lens compiles once per process.
 *
 * @param nodes - the claim `graphNode` rows
 * @param annotations - every annotation in the summary's claim-span layer
 * @param refEdges - the claims' outgoing edges (ref edges are consumed, others skipped)
 * @returns the reconstructed flat claims
 */
export async function reconstructClaimsViaLens(
  nodes: ClaimNodeRow[],
  annotations: ClaimAnnotationRow[],
  refEdges: ClaimEdgeRow[],
): Promise<StoredClaim[]> {
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
      await layersToClaimViaLens(node, primary, {
        children: childrenByParent.get(primary.id) ?? [],
        refEdges: edgesBySource.get(claimId) ?? [],
        parentClaimId,
      }),
    )
  }
  return claims
}

/**
 * Reconstructs a shallow claim from a claim `graphNode` alone: its id, text, and scope.
 * The rich fields (gloss, spans, confidence, summary membership, ...) are absent — this
 * is the shape scope-only callers need, not the full contract shape. The node carries
 * no annotation payload, so this needs no lens and stays synchronous.
 *
 * @param node - the claim `graphNode` row
 * @returns the shallow claim, or null when the row is not a claim node
 */
export function nodeToClaimViaLens(node: ClaimNodeRow): StoredClaim | null {
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
