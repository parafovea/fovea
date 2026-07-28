/**
 * The FOVEA persona-ontology surface as a bidirectional `@panproto/core` lens
 * plus a multi-record composition and a record<->row adapter.
 *
 * A persona ontology projects onto a `pub.layers.ontology.ontology` record, one
 * `pub.layers.ontology.typeDef` per declared type, and — for every type whose
 * gloss carries reference segments — a gloss STAND-OFF: a derived
 * `pub.layers.expression.expression` holding the flattened gloss text, a span
 * `pub.layers.annotation.annotationLayer` over that text, and one
 * `pub.layers.annotation.defs#annotation` per reference segment.
 *
 * The gloss stand-off is the surface's per-record value/structure/aggregate
 * transform, and two compiled lenses carry all of it, one per direction:
 *
 *   - The forward lens ({@link GLOSS_STANDOFF_LENS_DOC}, fovea -> layers) anchors
 *     at the gloss root and, on `getJson`, (i) runs a UTF-8 prefix-scan over the
 *     segment contents to derive each segment's running byte/char offsets and nest
 *     them under `anchor.textSpan`, (ii) projects a `typeRef`'s content into
 *     `ontologyTypeRefId` (null for every other kind), (iii) constructs the
 *     `denotes` `arguments` record for a non-typeRef reference (null for a typeRef),
 *     (iv) builds each segment's `features` featureMap from its present
 *     `refType`/`refPersonaId`/`refClaimId`, and (v) folds the segment contents into
 *     the flattened `glossText`. {@link projectGlossStandoff} reads the transformed
 *     record back through `getJson`, so the lens is the mapper, not merely a verified
 *     specification of one.
 *   - The backward lens ({@link GLOSS_STANDOFF_BACK_LENS_DOC}, layers -> fovea)
 *     anchors at the stand-off record root and, on `getJson`, inverts those value
 *     transforms per reference segment: it reads each segment's `label`/`text` back
 *     to `type`/`content` and recovers `refType`/`refPersonaId`/`refClaimId` from the
 *     `features` featureMap, falling back to the `denotes` argument target for a
 *     claim reference that carries no `refClaimId` feature.
 *     {@link glossFromStandoffViaLens} reads it back and interleaves the plain-text
 *     gaps between the reference offsets. The backward direction runs the inverse
 *     lens's `getJson` rather than the forward lens's `putJson`: on
 *     `@panproto/core@0.66.0` the JSON `putJson` restore path does not apply a step's
 *     inverse expression, so the reliable value-inverting operation is the forward
 *     projection of a lens authored in the reverse direction.
 *
 * {@link composeOntologyRecords} owns only what a single per-record lens cannot: the
 * multi-record framing (the ontology, the type defs, and the gloss Expression /
 * span-layer / reference-annotation rows), the cross-record id wiring (the ontology
 * id, the derived TypeDef row id, the gloss expression / layer / annotation ids),
 * and the type-def fields with no per-record lens home — a type's `allowedRoles`
 * (whose role-slot labels resolve against a sibling role-type record and whose
 * constraint values serialize to JSON), its `knowledgeRefs`, and its `features`
 * (whose `ordinal` is the type's positional index within its bucket).
 * {@link layersToOntologyViaLens} inverts that framing: it reconstructs each type's
 * gloss through the backward lens and regroups the TypeDef rows back into the four
 * buckets, deserializing the JSON-encoded constraint values and resolving the
 * cross-record parent and role-type references at the egress boundary.
 *
 * @module
 */

import { z } from 'zod'

import type { GlossItem } from '@models/types.js'

import {
  deriveId,
  glossExpressionId,
  glossLayerId,
  glossRefAnnotationId,
  layersOntologyForPersonaId,
} from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'
import type {
  GlossRefRow,
  GlossStandoff,
  MappedGlossAnnotation,
  MappedOntology,
  MappedTypeDef,
  OntologyLayersScope,
  OntologyMeta,
  PersonaOntologyAggregate,
  TypeDefRow,
} from '../ontology-layers-mapper.js'

// --------------------------------------------------------------------------
// Ontology view-model (the composition source)
// --------------------------------------------------------------------------

/** The four type buckets, paired with the layers type kind each maps to. */
const TYPE_BUCKETS = [
  ['entityTypes', 'entity-type'],
  ['eventTypes', 'situation-type'],
  ['roleTypes', 'role-type'],
  ['relationTypes', 'relation-type'],
] as const

type TypeBucket = (typeof TYPE_BUCKETS)[number][0]

/** Maps a layers type kind back to the aggregate bucket it belongs to. */
const KIND_TO_BUCKET: Record<string, TypeBucket> = {
  'entity-type': 'entityTypes',
  'situation-type': 'eventTypes',
  'role-type': 'roleTypes',
  'relation-type': 'relationTypes',
}

/**
 * The reserved roleName of the sentinel roleSlot that carries a type's declared
 * constraints when the type has no natural argument slot (entity / role / relation
 * types). The leading NUL keeps it from colliding with a real role name.
 */
const CONSTRAINT_SLOT = '\u0000fovea:constraints'

/** The reserved roleNames of a relation type's domain and range slots. */
const SOURCE_SLOT = ' fovea:source'
const TARGET_SLOT = ' fovea:target'

/** OWL property-class identifiers grounding a relation type's algebraic flags. */
const OWL_SYMMETRIC = 'owl:SymmetricProperty'
const OWL_TRANSITIVE = 'owl:TransitiveProperty'
const OWL_URI: Record<string, string> = {
  [OWL_SYMMETRIC]: 'http://www.w3.org/2002/07/owl#SymmetricProperty',
  [OWL_TRANSITIVE]: 'http://www.w3.org/2002/07/owl#TransitiveProperty',
}

/** The expression `kind` and `sourceKind` a gloss expression carries. */
const GLOSS_EXPRESSION_KIND = 'phrase'
const GLOSS_SOURCE_KIND = 'ontology-gloss'

/** The expression format each FOVEA constraint variant serializes under. */
const CONSTRAINT_FORMAT: Record<string, string> = {
  allowedTypes: 'type-ref',
  requiredProperties: 'json-logic',
  valueRange: 'json-logic',
}

/** The derived TypeDef row id a (ontology, kind, original id) triple fans out from. */
export function typeDefRowId(ontologyId: string, typeKind: string, originalId: string): string {
  return deriveId('typedef', ontologyId, typeKind, originalId)
}

// --- small readers ----------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/** Reads a type's gloss field as a GlossItem[], tolerating null/non-array. */
function glossItemsOf(object: Record<string, unknown>): GlossItem[] {
  const gloss = object.gloss
  return Array.isArray(gloss) ? (gloss as GlossItem[]) : []
}

// --------------------------------------------------------------------------
// The forward gloss stand-off lens (fovea -> layers)
// --------------------------------------------------------------------------

/**
 * The Zod schema for the gloss stand-off's forward source: the flattened gloss
 * text (folded by the lens) and each segment carrying its reference scalars. A
 * segment whose reference scalar is absent carries the empty string, so the schema
 * stays uniformly typed; the lens filters those out when it builds the segment's
 * `features`. The byte/char offsets are not carried — the lens derives them by a
 * prefix-scan over the segment contents.
 */
export const glossLensSourceSchema = z.object({
  glossText: z.string(),
  segments: z.array(
    z.object({
      label: z.string(),
      text: z.string(),
      refType: z.string(),
      refPersonaId: z.string(),
      refClaimId: z.string(),
    }),
  ),
})

/**
 * The per-segment forward transform: a fold over the segments that threads a byte
 * cursor, so each segment nests its running `anchor.textSpan` offsets (a UTF-8
 * prefix-scan via `len`), projects a `typeRef`'s content into `ontologyTypeRefId`
 * (`Nothing` — i.e. null — otherwise), constructs the `denotes` argument for a
 * non-typeRef reference (`Nothing` for a typeRef), and builds its `features` by
 * filtering the present `refType`/`refPersonaId`/`refClaimId`. `merge` keeps the
 * source scalars alongside the computed fields. The char offsets track the same
 * byte cursor: `len` is UTF-8 byte length, so a code-point cursor would need a
 * builtin panproto does not expose; for the ASCII/BMP-single-unit glosses the
 * ontology carries, byte and char offsets coincide, matching the oracle.
 */
const GLOSS_SEGMENT_EXPR =
  '(fold (\\acc s -> {' +
  ' cursor = acc.cursor + len s.text,' +
  ' list = append acc.list (merge s {' +
  '   anchor = { textSpan = { byteStart = acc.cursor, byteEnd = acc.cursor + len s.text, charStart = acc.cursor, charEnd = acc.cursor + len s.text } },' +
  '   ontologyTypeRefId = if s.label == "typeRef" then s.text else Nothing,' +
  '   arguments = if s.label == "typeRef" then Nothing else [{ role = "denotes", target = { localId = { value = if s.refClaimId /= "" then s.refClaimId else s.text } } }],' +
  '   features = filter (\\e -> e.value /= "") [{ key = "fovea.refType", value = s.refType }, { key = "fovea.refPersonaId", value = s.refPersonaId }, { key = "fovea.refClaimId", value = s.refClaimId }]' +
  ' }) }) { cursor = 0, list = [] } segments).list'

/** The gloss-text flatten: fold the segment contents into a single string. */
const GLOSS_FLATTEN_EXPR = 'fold (\\acc s -> concat acc s.text) "" segments'

/**
 * The lens document for the forward gloss stand-off, anchored at the gloss root.
 * Its two `compute_field` steps carry the surface's per-record transforms: the
 * flatten ({@link GLOSS_FLATTEN_EXPR}) folds the segment contents into `glossText`,
 * and the segment fold ({@link GLOSS_SEGMENT_EXPR}) then scans the offsets, nests
 * each reference segment's `anchor.textSpan`, and derives its `ontologyTypeRefId`,
 * `arguments`, and `features`. The flatten runs first so it reads the source
 * segment contents rather than the folded records. The document is native (its
 * complement requirement is empty) and lawful — get/put and put/get hold over the
 * string, integer, and record leaves it constructs.
 */
export const GLOSS_STANDOFF_LENS_DOC = {
  id: 'fovea.ontology.gloss-standoff.v1',
  source: 'fovea.ontology.gloss',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    { compute_field: { target: 'glossText', expr: GLOSS_FLATTEN_EXPR } },
    { compute_field: { target: 'segments', expr: GLOSS_SEGMENT_EXPR } },
  ],
} as const

/** The body vertex the gloss stand-off lens binds to: the gloss record root. */
export const GLOSS_STANDOFF_BODY_VERTEX = 'root'

/** The source-schema vertex a source record roots at for `getJson`/`putJson`. */
const ROOT_VERTEX = 'root'

/** A compiled gloss stand-off lens with its schema-independent chain and signals. */
export interface GlossStandoffLens {
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
 * Compiles the forward gloss stand-off lens against the view-model source schema
 * and reports its native-ness signals. The returned {@link GlossStandoffLens.lens}
 * answers `getJson`/`putJson` and `checkGetPut`/`checkPutGet` for a source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildGlossStandoffLens(): Promise<GlossStandoffLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(glossLensSourceSchema)
  const chain = p.compileLensDocument(GLOSS_STANDOFF_LENS_DOC, GLOSS_STANDOFF_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

let glossLensPromise: Promise<GlossStandoffLens> | null = null

/** The forward gloss stand-off lens, compiled and instantiated once per process. */
export function getGlossStandoffLens(): Promise<GlossStandoffLens> {
  glossLensPromise ??= buildGlossStandoffLens()
  return glossLensPromise
}

// --------------------------------------------------------------------------
// Gloss source-record construction and forward lens projection
// --------------------------------------------------------------------------

/** A gloss segment carrying its reference scalars — the forward lens source. */
export interface GlossLensSegment {
  label: string
  text: string
  refType: string
  refPersonaId: string
  refClaimId: string
}

/** The forward gloss stand-off lens's source record. */
export interface GlossLensSource {
  glossText: string
  segments: GlossLensSegment[]
}

/**
 * Builds the forward gloss stand-off lens's source record from a gloss: every
 * segment (text and reference alike) carrying its reference scalars. The lens
 * derives the byte/char offsets by a prefix-scan and folds the flattened text, so
 * neither is resolved here. Absent reference scalars carry the empty string so the
 * schema stays uniformly typed.
 *
 * @param gloss - the type's gloss segments
 * @returns the forward lens source record
 */
export function glossLensSourceRecord(gloss: GlossItem[]): GlossLensSource {
  const segments: GlossLensSegment[] = gloss.map((segment) => ({
    label: segment.type,
    text: typeof segment.content === 'string' ? segment.content : '',
    refType: typeof segment.refType === 'string' ? segment.refType : '',
    refPersonaId: segment.refPersonaId != null ? segment.refPersonaId : '',
    refClaimId: typeof segment.refClaimId === 'string' ? segment.refClaimId : '',
  }))
  return { glossText: '', segments }
}

/** A gloss segment's textSpan anchor, as the lens nests it. */
export interface GlossAnchor {
  textSpan: { byteStart: number; byteEnd: number; charStart: number; charEnd: number }
}

/** One `denotes` argument reference, as the lens constructs it. */
export interface GlossArgument {
  role: string
  target: { localId: { value: string } }
}

/** A gloss segment as the forward lens emits it: the scalars plus the transforms. */
export interface GlossStandoffSegmentView {
  label: string
  text: string
  anchor: GlossAnchor
  ontologyTypeRefId: string | null
  arguments: GlossArgument[] | null
  features: Array<{ key: string; value: string }>
}

/** The gloss stand-off the forward lens emits: the flattened text and the segments. */
export interface GlossStandoffView {
  glossText: string
  segments: GlossStandoffSegmentView[]
}

/**
 * Projects a type's gloss through the forward lens, reading the transformed record
 * back with `getJson`. The returned view carries the folded `glossText` and, per
 * segment, the scanned `anchor`, the projected `ontologyTypeRefId`, the constructed
 * `arguments`, and the filtered `features` — the lens, not the caller, did the
 * value/structure/aggregate work.
 *
 * @param lens - the instantiated forward gloss stand-off lens
 * @param gloss - the type's gloss segments
 * @returns the transformed gloss stand-off
 */
export function projectGlossStandoff(lens: LensHandle, gloss: GlossItem[]): GlossStandoffView {
  const { view } = lens.getJson(glossLensSourceRecord(gloss), ROOT_VERTEX)
  return view as GlossStandoffView
}

// --------------------------------------------------------------------------
// The backward gloss stand-off lens (layers -> fovea)
// --------------------------------------------------------------------------

/**
 * The Zod schema for the backward gloss stand-off lens's source: the stored gloss
 * text and each reference-segment annotation as it rides in the store — its
 * `label`, `text`, char offsets, `ontologyTypeRefId`, the pre-extracted `denotes`
 * argument target, and its `features` featureMap entries. It is the reverse
 * orientation of {@link glossLensSourceSchema}: this is the lens *source* the
 * backward direction reads, and the FOVEA gloss segment is its *target*.
 */
export const glossBackLensSourceSchema = z.object({
  glossText: z.string(),
  segments: z.array(
    z.object({
      label: z.string(),
      text: z.string(),
      charStart: z.number().int(),
      charEnd: z.number().int(),
      ontologyTypeRefId: z.string(),
      argTarget: z.string(),
      features: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
})

/**
 * The per-segment backward transform: for each stored reference segment, read its
 * `label`/`text` back to the FOVEA `type`/`content` and recover its reference
 * scalars from the `features` featureMap — a fold that projects the value under
 * each `fovea.*` key. `refClaimId` falls back to the `denotes` argument target when
 * a claim reference carries no `fovea.refClaimId` feature, inverting the forward
 * lens's argument construction. An absent scalar resolves to the empty string; the
 * egress reader drops those, so a null reference scalar round-trips to absent.
 */
const GLOSS_BACK_SEGMENT_EXPR =
  'map (\\s -> merge s {' +
  ' type = s.label,' +
  ' content = s.text,' +
  ' refType = fold (\\acc e -> if e.key == "fovea.refType" then e.value else acc) "" s.features,' +
  ' refPersonaId = fold (\\acc e -> if e.key == "fovea.refPersonaId" then e.value else acc) "" s.features,' +
  ' refClaimId = if (fold (\\acc e -> if e.key == "fovea.refClaimId" then e.value else acc) "" s.features) /= "" then (fold (\\acc e -> if e.key == "fovea.refClaimId" then e.value else acc) "" s.features) else (if s.label == "claimRef" then s.argTarget else "")' +
  ' }) segments'

/**
 * The lens document for the backward gloss stand-off, anchored at the stored
 * stand-off record root. Its single `compute_field` step inverts the forward
 * lens's per-segment value transforms on `getJson` ({@link GLOSS_BACK_SEGMENT_EXPR}).
 * The document is native (its complement requirement is empty) and lawful in both
 * directions — get/put and put/get hold over the string and record leaves it reads.
 */
export const GLOSS_STANDOFF_BACK_LENS_DOC = {
  id: 'fovea.ontology.gloss-standoff.back.v1',
  source: 'pub.layers.annotation.annotationLayer',
  target: 'fovea.ontology.gloss',
  steps: [{ compute_field: { target: 'segments', expr: GLOSS_BACK_SEGMENT_EXPR } }],
} as const

/** A compiled backward gloss stand-off lens with its chain and native-ness signals. */
export interface GlossStandoffBackLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the stored-stand-off source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles the backward gloss stand-off lens against the stored-stand-off source
 * schema and reports its native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildGlossStandoffBackLens(): Promise<GlossStandoffBackLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(glossBackLensSourceSchema)
  const chain = p.compileLensDocument(GLOSS_STANDOFF_BACK_LENS_DOC, GLOSS_STANDOFF_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

let glossBackLensPromise: Promise<GlossStandoffBackLens> | null = null

/** The backward gloss stand-off lens, compiled and instantiated once per process. */
export function getGlossStandoffBackLens(): Promise<GlossStandoffBackLens> {
  glossBackLensPromise ??= buildGlossStandoffBackLens()
  return glossBackLensPromise
}

/** A reference segment as the backward lens reads it, before gap interleaving. */
export interface GlossBackSegmentView {
  type: string
  content: string
  charStart: number
  charEnd: number
  refType: string
  refPersonaId: string
  refClaimId: string
}

/** Reads a span annotation's char offsets, defaulting to a zero-width span. */
function readCharSpan(anchor: unknown): { charStart: number; charEnd: number } {
  const textSpan = (anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
  const charStart = typeof textSpan?.charStart === 'number' ? textSpan.charStart : 0
  const charEnd = typeof textSpan?.charEnd === 'number' ? textSpan.charEnd : charStart
  return { charStart, charEnd }
}

/** Reads the `denotes` argument target id from an annotation's arguments, or null. */
function readDenotesTarget(argumentsValue: unknown): string | null {
  if (!Array.isArray(argumentsValue)) return null
  for (const argument of argumentsValue) {
    if (!argument || typeof argument !== 'object') continue
    const localId = (argument as { target?: { localId?: { value?: unknown } } }).target?.localId?.value
    if (typeof localId === 'string') return localId
  }
  return null
}

/** The featureMap entries of a stored annotation as a flat `{key,value}` list. */
function featureEntries(features: unknown): Array<{ key: string; value: string }> {
  if (features === null || typeof features !== 'object') return []
  const entries = (features as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return []
  const out: Array<{ key: string; value: string }> = []
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const key = (entry as { key?: unknown }).key
      const value = (entry as { value?: unknown }).value
      if (typeof key === 'string' && typeof value === 'string') out.push({ key, value })
    }
  }
  return out
}

/**
 * Builds the backward gloss stand-off lens's source record from the flattened
 * gloss text and its stored reference-segment annotations. The nested `denotes`
 * argument target is pre-extracted onto `argTarget` and the featureMap entries are
 * flattened onto `features` so the lens reads them as leaves; the lens then reads
 * `label`/`text`/`features`/`argTarget` back to the FOVEA reference scalars.
 *
 * @param text - the flattened gloss text
 * @param refs - the reference-segment annotations over that text
 * @returns the backward lens source record
 */
export function glossBackLensSourceRecord(text: string, refs: GlossRefRow[]): Record<string, unknown> {
  const segments = refs.map((ref) => {
    const { charStart, charEnd } = readCharSpan(ref.anchor)
    return {
      label: ref.label ?? 'text',
      text: ref.text ?? '',
      charStart,
      charEnd,
      ontologyTypeRefId: ref.ontologyTypeRefId ?? '',
      argTarget: readDenotesTarget(ref.arguments) ?? '',
      features: featureEntries(ref.features),
    }
  })
  return { glossText: text, segments }
}

/**
 * Projects the stored stand-off through the backward lens, reading the recovered
 * reference segments back with `getJson`. The lens, not the caller, inverts the
 * feature-map and argument transforms; this returns the per-segment FOVEA scalars
 * alongside the char offsets the gap interleaving needs.
 *
 * @param lens - the instantiated backward gloss stand-off lens
 * @param text - the flattened gloss text
 * @param refs - the reference-segment annotations over that text
 * @returns the recovered reference segments
 */
export function projectGlossBackSegments(lens: LensHandle, text: string, refs: GlossRefRow[]): GlossBackSegmentView[] {
  const { view } = lens.getJson(glossBackLensSourceRecord(text, refs), ROOT_VERTEX)
  return (view as { segments: GlossBackSegmentView[] }).segments
}

/**
 * Reconstructs a GlossItem[] from a gloss expression's flattened text and its
 * reference-segment annotations through the backward lens — the lens-native
 * inverse of the forward projection, replacing the oracle's `glossFromStandoff`.
 * The lens recovers each reference segment's `type`/`content`/`refType`/
 * `refPersonaId`/`refClaimId`; this egress step interleaves the plain-text gaps
 * between the reference offsets (a string sub-range slice the lens has no builtin
 * for) so the covered ranges become reference segments and the gaps become text
 * segments. A zero-width reference is preserved; ties on `charStart` order the
 * zero-width reference first, matching the oracle's ordering.
 *
 * @param lens - the instantiated backward gloss stand-off lens
 * @param text - the flattened gloss text
 * @param refs - the reference-segment annotations over that text
 * @returns the reconstructed gloss segments in offset order
 */
export function glossFromStandoffViaLens(lens: LensHandle, text: string, refs: GlossRefRow[]): GlossItem[] {
  const ordered = projectGlossBackSegments(lens, text, refs).sort(
    (a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd,
  )

  const items: GlossItem[] = []
  let cursor = 0
  const pushText = (from: number, to: number): void => {
    if (to > from) items.push({ type: 'text', content: text.slice(from, to) })
  }

  for (const ref of ordered) {
    if (ref.charStart < cursor) continue // overlapping/duplicate; skip
    pushText(cursor, ref.charStart)
    const content = ref.content !== '' ? ref.content : text.slice(ref.charStart, ref.charEnd)
    const item: GlossItem = { type: (ref.type || 'text') as GlossItem['type'], content }
    if (ref.refType !== '') item.refType = ref.refType as GlossItem['refType']
    if (ref.refPersonaId !== '') item.refPersonaId = ref.refPersonaId
    if (ref.refClaimId !== '') item.refClaimId = ref.refClaimId
    items.push(item)
    cursor = ref.charEnd
  }
  pushText(cursor, text.length)
  return items
}

// --------------------------------------------------------------------------
// Gloss stand-off framing (forward composition)
// --------------------------------------------------------------------------

/**
 * Frames a type's lens-projected gloss into stand-off rows, or null when the gloss
 * carries no reference segments (a text-only gloss round-trips from the type's
 * flattened `gloss` text alone) or flattens to nothing.
 *
 * The lens has already scanned each reference segment's offsets, projected its
 * `ontologyTypeRefId`, constructed its `arguments`, and filtered its `features`;
 * this reads those off the view and wires the ids (the gloss expression / layer /
 * per-segment annotation ids from {@link glossExpressionId} / {@link glossLayerId} /
 * {@link glossRefAnnotationId}) and the scope columns. A segment's `features` list
 * is wrapped into a `featureMap`, or null when empty.
 *
 * @param rowId - the derived TypeDef row id the gloss ids fan out from
 * @param view - the lens-projected gloss stand-off
 * @param ontologyId - the owning ontology, bound onto the span layer
 * @param personaId - the persona whose ontology owns the layer
 * @param scope - the scope columns every produced row carries
 * @returns the stand-off rows, or null for a text-only or empty gloss
 */
export function composeGlossStandoff(
  rowId: string,
  view: GlossStandoffView,
  ontologyId: string,
  personaId: string,
  scope: OntologyLayersScope,
): GlossStandoff | null {
  const hasReferenceSegments = view.segments.some((segment) => segment.label !== 'text')
  if (view.glossText.length === 0 || !hasReferenceSegments) return null

  const expressionId = glossExpressionId(rowId)
  const layerId = glossLayerId(rowId)

  const annotations: MappedGlossAnnotation[] = []
  view.segments.forEach((segment, index) => {
    if (segment.label === 'text') return
    annotations.push({
      id: glossRefAnnotationId(rowId, index),
      layerId,
      anchor: segment.anchor,
      label: segment.label,
      text: segment.text,
      ontologyTypeRefId: segment.ontologyTypeRefId,
      arguments: segment.arguments,
      features: segment.features.length > 0 ? { entries: segment.features } : null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  return {
    expression: {
      id: expressionId,
      layersId: expressionId,
      kind: GLOSS_EXPRESSION_KIND,
      text: view.glossText,
      sourceKind: GLOSS_SOURCE_KIND,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    layer: {
      id: layerId,
      expressionId,
      kind: 'span',
      subkind: 'gloss',
      ontologyId,
      personaId,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    annotations,
  }
}

// --------------------------------------------------------------------------
// TypeDef derivations (composed: cross-record and positional, not lens-expressible)
// --------------------------------------------------------------------------

/** A layers constraint value-object. */
interface Constraint {
  expression: string
  expressionFormat: string
  scope?: string
  context?: string[]
  description?: string
}

/** A layers roleSlot value-object. */
interface RoleSlot {
  roleName: string
  required?: boolean
  constraints?: Constraint[]
  features?: { entries: Array<{ key: string; value: string }> }
}

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** Projects one FOVEA type constraint onto a layers constraint value-object. */
function typeConstraintToConstraint(type: string, value: unknown): Constraint {
  return {
    expression: JSON.stringify(value),
    expressionFormat: CONSTRAINT_FORMAT[type] ?? 'json-logic',
    scope: 'slot',
    description: type,
  }
}

/** Coerces a raw constraint object to a layers constraint value-object, or null. */
function constraintOf(raw: Record<string, unknown>): Constraint | null {
  const type = stringField(raw, 'type')
  if (type !== 'allowedTypes' && type !== 'requiredProperties' && type !== 'valueRange') return null
  return typeConstraintToConstraint(type, raw.value)
}

/** A relation type's domain/range roleSlot enumerating its allowed kinds. */
function domainRoleSlot(roleName: string, kinds: unknown): RoleSlot {
  const list = Array.isArray(kinds) ? (kinds as string[]) : []
  return {
    roleName,
    constraints: [{ expression: JSON.stringify(list), expressionFormat: 'type-ref', scope: 'slot', description: 'domain' }],
  }
}

/**
 * Projects one event role onto a layers roleSlot: the role type's name labels the
 * slot (the id is kept in features for exact recovery), optionality inverts to
 * `required`, and cardinality/exclusion become constraint value-objects.
 */
function eventRoleToRoleSlot(role: Record<string, unknown>, roleTypeName: string | null): RoleSlot {
  const constraints: Constraint[] = []
  const minOccurrences = typeof role.minOccurrences === 'number' ? role.minOccurrences : undefined
  const maxOccurrences = typeof role.maxOccurrences === 'number' ? role.maxOccurrences : undefined
  if (minOccurrences !== undefined || maxOccurrences !== undefined) {
    const cardinality: { min?: number; max?: number } = {}
    if (minOccurrences !== undefined) cardinality.min = minOccurrences
    if (maxOccurrences !== undefined) cardinality.max = maxOccurrences
    constraints.push({
      expression: JSON.stringify(cardinality),
      expressionFormat: 'json-logic',
      scope: 'slot',
      description: 'cardinality',
    })
  }
  const excludes = Array.isArray(role.excludes) ? (role.excludes as string[]) : []
  if (excludes.length > 0) {
    constraints.push({
      expression: JSON.stringify(excludes),
      expressionFormat: 'json-logic',
      scope: 'slot',
      context: excludes,
      description: 'excludes',
    })
  }
  const roleTypeId = stringField(role, 'roleTypeId') ?? ''
  const slot: RoleSlot = {
    roleName: roleTypeName ?? roleTypeId,
    required: role.optional !== true,
    features: { entries: [{ key: 'fovea.roleTypeId', value: roleTypeId }] },
  }
  if (constraints.length > 0) slot.constraints = constraints
  return slot
}

/** The allowedRoles roleSlot[] and allowedValues a type projects to. */
function rolesAndValuesFor(
  bucket: TypeBucket,
  type: Record<string, unknown>,
  roleTypeNames: Map<string, string>,
): { allowedRoles: RoleSlot[] | null; allowedValues: string[] | null } {
  const roleSlots: RoleSlot[] = []
  let allowedValues: string[] | null = null

  if (bucket === 'eventTypes') {
    for (const role of asArray(type.roles)) {
      const roleTypeId = stringField(role, 'roleTypeId') ?? ''
      roleSlots.push(eventRoleToRoleSlot(role, roleTypeNames.get(roleTypeId) ?? null))
    }
  } else if (bucket === 'roleTypes') {
    if (Array.isArray(type.allowedFillerTypes)) allowedValues = type.allowedFillerTypes as string[]
  } else if (bucket === 'relationTypes') {
    roleSlots.push(domainRoleSlot(SOURCE_SLOT, type.sourceTypes))
    roleSlots.push(domainRoleSlot(TARGET_SLOT, type.targetTypes))
  }

  const constraints = asArray(type.constraints)
    .map((raw) => constraintOf(raw))
    .filter((c): c is Constraint => c !== null)
  if (constraints.length > 0) {
    roleSlots.push({ roleName: CONSTRAINT_SLOT, constraints })
  }

  return { allowedRoles: roleSlots.length > 0 ? roleSlots : null, allowedValues }
}

/**
 * Builds a type's knowledgeRefs from its wikidata/wikibase identifiers and, for
 * relation types, its OWL algebraic-property groundings. Returns null when the type
 * grounds to nothing.
 */
function knowledgeRefsFor(type: Record<string, unknown>, bucket: TypeBucket): KnowledgeRef[] | null {
  const refs: KnowledgeRef[] = []
  const wikidataId = stringField(type, 'wikidataId')
  if (wikidataId) {
    const ref: KnowledgeRef = { source: 'wikidata', identifier: wikidataId }
    const url = stringField(type, 'wikidataUrl')
    if (url) ref.uri = url
    refs.push(ref)
  }
  const wikibaseId = stringField(type, 'wikibaseId')
  if (wikibaseId) refs.push({ source: 'custom', identifier: wikibaseId, label: 'wikibase' })
  if (bucket === 'relationTypes') {
    if (type.symmetric === true) refs.push({ source: 'custom', identifier: OWL_SYMMETRIC, uri: OWL_URI[OWL_SYMMETRIC] })
    if (type.transitive === true) refs.push({ source: 'custom', identifier: OWL_TRANSITIVE, uri: OWL_URI[OWL_TRANSITIVE] })
  }
  return refs.length > 0 ? refs : null
}

/**
 * Builds a TypeDef's flat-scalar `features`: the original type id, its bucket
 * ordinal (for stable order), and the open provenance scalars (sharedTypeId,
 * examples, import provenance).
 */
function typeFeatures(type: Record<string, unknown>, originalId: string, ordinal: number): Record<string, unknown> {
  const features: Record<string, unknown> = { typeId: originalId, ordinal }
  const sharedTypeId = stringField(type, 'sharedTypeId')
  if (sharedTypeId) features.sharedTypeId = sharedTypeId
  const importedFrom = stringField(type, 'importedFrom')
  if (importedFrom) features.importedFrom = importedFrom
  const importedAt = stringField(type, 'importedAt')
  if (importedAt) features.importedAt = importedAt
  if (Array.isArray(type.examples) && type.examples.length > 0) features.examples = type.examples
  return features
}

// --------------------------------------------------------------------------
// Multi-record composition (forward)
// --------------------------------------------------------------------------

/**
 * The layers records a persona ontology composes into: one LayersOntology, one
 * TypeDef per declared type (each keyed by its original id, with the derived row
 * id its gloss stand-off fans off), and the gloss stand-off rows for every type
 * whose gloss carries reference segments.
 */
export interface OntologyLayersRecords {
  /** The LayersOntology record. */
  ontology: MappedOntology
  /** One TypeDef per declared type, in bucket then declaration order. */
  typeDefs: MappedTypeDef[]
  /** The gloss stand-off rows, one entry per reference-bearing type gloss. */
  glossStandoffs: GlossStandoff[]
}

/**
 * Composes a persona ontology into its layers records: the LayersOntology, a
 * TypeDef per declared type, and the gloss stand-off (Expression + span layer +
 * reference annotations) for every reference-bearing type gloss. Each type's gloss
 * is projected through {@link projectGlossStandoff}, so the flattened `TypeDef.gloss`
 * text and every stand-off value come from the lens; the composition frames the
 * records and wires the cross-record ids (the gloss stand-off ids fan off the
 * derived TypeDef row id {@link typeDefRowId}, so a re-composition reuses the same
 * rows) plus the type-def fields with no per-record lens home (allowedRoles,
 * knowledgeRefs, features).
 *
 * @param lens - the instantiated forward gloss stand-off lens
 * @param aggregate - the four type-array buckets
 * @param personaId - the persona the ontology belongs to
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 * @returns the composed layers records
 */
export function composeOntologyRecords(
  lens: LensHandle,
  aggregate: PersonaOntologyAggregate,
  personaId: string,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): OntologyLayersRecords {
  const ontologyId = layersOntologyForPersonaId(personaId)

  // Role type id -> name, so an event role slot can carry the role's label.
  const roleTypeNames = new Map<string, string>()
  for (const raw of asArray(aggregate.roleTypes)) {
    const id = stringField(raw, 'id')
    const name = stringField(raw, 'name')
    if (id && name) roleTypeNames.set(id, name)
  }

  const typeDefs: MappedTypeDef[] = []
  const glossStandoffs: GlossStandoff[] = []
  for (const [bucket, typeKind] of TYPE_BUCKETS) {
    const types = asArray(aggregate[bucket])
    types.forEach((type, index) => {
      const id = stringField(type, 'id')
      if (id === null) return
      const { allowedRoles, allowedValues } = rolesAndValuesFor(bucket, type, roleTypeNames)
      const gloss = glossItemsOf(type)
      const glossView = projectGlossStandoff(lens, gloss)
      typeDefs.push({
        id,
        ontologyId,
        name: stringField(type, 'name') ?? '',
        typeKind,
        gloss: glossView.glossText.length > 0 ? glossView.glossText : null,
        glossItems: gloss,
        parentTypeId: bucket === 'eventTypes' ? stringField(type, 'parentEventId') : null,
        allowedRoles,
        allowedValues,
        knowledgeRefs: knowledgeRefsFor(type, bucket),
        features: typeFeatures(type, id, index),
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })

      const standoff = composeGlossStandoff(typeDefRowId(ontologyId, typeKind, id), glossView, ontologyId, personaId, scope)
      if (standoff) glossStandoffs.push(standoff)
    })
  }

  return {
    ontology: {
      id: ontologyId,
      name: meta.name,
      description: meta.description,
      domain: meta.domain,
      personaId,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    typeDefs,
    glossStandoffs,
  }
}

// --------------------------------------------------------------------------
// Record <-> Prisma-row adapter (forward)
// --------------------------------------------------------------------------

/** A gloss stand-off flattened to its component Prisma rows. */
export interface OntologyLayersRows {
  ontology: MappedOntology
  typeDefs: MappedTypeDef[]
  glossExpressions: GlossStandoff['expression'][]
  glossLayers: GlossStandoff['layer'][]
  glossAnnotations: MappedGlossAnnotation[]
}

/**
 * Distributes the composed layers records to the Prisma-row shape the persistence
 * boundary uses: the ontology and type-def records ride through unchanged, and each
 * gloss stand-off explodes into its expression row, its span-layer row, and its
 * reference-segment annotation rows.
 *
 * @param records - the composed layers records
 * @returns the flat row set
 */
export function ontologyRecordsToRows(records: OntologyLayersRecords): OntologyLayersRows {
  const glossExpressions: GlossStandoff['expression'][] = []
  const glossLayers: GlossStandoff['layer'][] = []
  const glossAnnotations: MappedGlossAnnotation[] = []
  for (const standoff of records.glossStandoffs) {
    glossExpressions.push(standoff.expression)
    glossLayers.push(standoff.layer)
    glossAnnotations.push(...standoff.annotations)
  }
  return {
    ontology: records.ontology,
    typeDefs: records.typeDefs,
    glossExpressions,
    glossLayers,
    glossAnnotations,
  }
}

/**
 * The end-to-end forward path for one persona ontology: project each type's gloss
 * through the lens, compose the layers records, and distribute them to rows.
 * Equivalent, row for row, to the committed hand-rolled forward mapper (the oracle:
 * `ontologyToLayers` plus `glossStandoffFor`) — the parity test asserts this over a
 * corpus.
 *
 * @param aggregate - the four type-array buckets
 * @param personaId - the persona the ontology belongs to
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 * @returns the flat row set
 */
export async function foveaOntologyToLayersRows(
  aggregate: PersonaOntologyAggregate,
  personaId: string,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): Promise<OntologyLayersRows> {
  const { lens } = await getGlossStandoffLens()
  return ontologyRecordsToRows(composeOntologyRecords(lens, aggregate, personaId, meta, scope))
}

// --------------------------------------------------------------------------
// The backward ontology reconstruction (layers -> fovea)
// --------------------------------------------------------------------------

/** Reads a TypeDef's flat feature scalar, or undefined. */
function typeDefFeature(features: unknown, key: string): unknown {
  if (features === null || typeof features !== 'object') return undefined
  return (features as Record<string, unknown>)[key]
}

/** Reads a feature entry's value from a roleSlot's featureMap, or null. */
function readRoleSlotFeature(features: unknown, key: string): string | null {
  if (features === null || typeof features !== 'object') return null
  const entries = (features as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return null
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && (entry as { key?: unknown }).key === key) {
      const value = (entry as { value?: unknown }).value
      return typeof value === 'string' ? value : null
    }
  }
  return null
}

/** The wikidata/wikibase/OWL facts recovered from a type's knowledgeRefs. */
interface RecoveredGroundings {
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  symmetric?: boolean
  transitive?: boolean
}

/** Recovers the wikidata/wikibase/OWL facts stored on a TypeDef's knowledgeRefs. */
function recoverGroundings(knowledgeRefs: unknown): RecoveredGroundings {
  const out: RecoveredGroundings = {}
  for (const raw of asArray(knowledgeRefs)) {
    const source = stringField(raw, 'source')
    const identifier = stringField(raw, 'identifier')
    const uri = stringField(raw, 'uri')
    const label = stringField(raw, 'label')
    if (source === 'wikidata' && identifier) {
      out.wikidataId = identifier
      if (uri) out.wikidataUrl = uri
    } else if (source === 'custom' && identifier === OWL_SYMMETRIC) {
      out.symmetric = true
    } else if (source === 'custom' && identifier === OWL_TRANSITIVE) {
      out.transitive = true
    } else if (source === 'custom' && label === 'wikibase' && identifier) {
      out.wikibaseId = identifier
    }
  }
  return out
}

/** A recovered FOVEA type constraint. */
interface RecoveredConstraint {
  type: string
  value: unknown
}

/** Recovers a FOVEA type constraint from a layers constraint value-object, or null. */
function constraintToTypeConstraint(constraint: Record<string, unknown>): RecoveredConstraint | null {
  const description = stringField(constraint, 'description')
  const expression = stringField(constraint, 'expression')
  if (description === null || expression === null) return null
  if (description !== 'allowedTypes' && description !== 'requiredProperties' && description !== 'valueRange') return null
  try {
    return { type: description, value: JSON.parse(expression) }
  } catch {
    return null
  }
}

/** The reconstructed constraints of a type (from its sentinel roleSlot). */
function constraintsOf(allowedRoles: unknown): RecoveredConstraint[] {
  for (const slot of asArray(allowedRoles)) {
    if (stringField(slot, 'roleName') !== CONSTRAINT_SLOT) continue
    return asArray(slot.constraints)
      .map((raw) => constraintToTypeConstraint(raw))
      .filter((c): c is RecoveredConstraint => c !== null)
  }
  return []
}

/** The allowed kinds a relation type's named domain/range slot enumerates. */
function domainKinds(allowedRoles: unknown, roleName: string): string[] {
  for (const slot of asArray(allowedRoles)) {
    if (stringField(slot, 'roleName') !== roleName) continue
    const constraint = asArray(slot.constraints)[0]
    const expression = constraint ? stringField(constraint, 'expression') : null
    if (expression === null) return []
    try {
      const parsed = JSON.parse(expression)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  }
  return []
}

/** A recovered FOVEA event role. */
interface RecoveredEventRole {
  roleTypeId: string
  optional: boolean
  excludes?: string[]
  minOccurrences?: number
  maxOccurrences?: number
}

/** Recovers an EventRole from a layers roleSlot value-object. */
function roleSlotToEventRole(slot: Record<string, unknown>): RecoveredEventRole {
  const roleTypeId = readRoleSlotFeature(slot.features, 'fovea.roleTypeId') ?? stringField(slot, 'roleName') ?? ''
  const role: RecoveredEventRole = { roleTypeId, optional: slot.required === false }
  for (const raw of asArray(slot.constraints)) {
    const description = stringField(raw, 'description')
    const expression = stringField(raw, 'expression')
    if (expression === null) continue
    if (description === 'cardinality') {
      try {
        const parsed = JSON.parse(expression) as { min?: number; max?: number }
        if (typeof parsed.min === 'number') role.minOccurrences = parsed.min
        if (typeof parsed.max === 'number') role.maxOccurrences = parsed.max
      } catch {
        /* ignore a malformed cardinality expression */
      }
    } else if (description === 'excludes') {
      try {
        const parsed = JSON.parse(expression)
        if (Array.isArray(parsed)) role.excludes = parsed as string[]
      } catch {
        /* ignore a malformed excludes expression */
      }
    }
  }
  return role
}

/** Reconstructs the ordered EventRole[] of a situation type from its roleSlots. */
function rolesOf(allowedRoles: unknown): RecoveredEventRole[] {
  return asArray(allowedRoles)
    .filter((slot) => {
      const name = stringField(slot, 'roleName')
      return name !== CONSTRAINT_SLOT && name !== SOURCE_SLOT && name !== TARGET_SLOT
    })
    .map((slot) => roleSlotToEventRole(slot))
}

/**
 * Reconstructs one persona-ontology type from its TypeDef row, its lens-recovered
 * gloss, and the row-id -> original-id map used to recover parent references. The
 * cross-record parent reference and the JSON-encoded constraint/role/domain values
 * are resolved here — neither has a per-record lens home.
 */
function reconstructType(
  row: TypeDefRow,
  bucket: TypeBucket,
  gloss: GlossItem[],
  originalIdByRow: Map<string, string>,
): Record<string, unknown> {
  const originalId = (typeDefFeature(row.features, 'typeId') as string | undefined) ?? row.id
  const object: Record<string, unknown> = { id: originalId, name: row.name, gloss }

  const sharedTypeId = typeDefFeature(row.features, 'sharedTypeId')
  if (typeof sharedTypeId === 'string') object.sharedTypeId = sharedTypeId

  const grounds = recoverGroundings(row.knowledgeRefs)
  if (grounds.wikidataId) object.wikidataId = grounds.wikidataId
  if (grounds.wikidataUrl) object.wikidataUrl = grounds.wikidataUrl
  if (grounds.wikibaseId) object.wikibaseId = grounds.wikibaseId

  if (bucket === 'roleTypes') {
    object.allowedFillerTypes = Array.isArray(row.allowedValues) ? row.allowedValues : []
  }
  if (bucket === 'eventTypes') {
    object.roles = rolesOf(row.allowedRoles)
    if (row.parentTypeId) {
      const parentOriginal = originalIdByRow.get(row.parentTypeId)
      if (parentOriginal) object.parentEventId = parentOriginal
    }
  }
  if (bucket === 'relationTypes') {
    object.sourceTypes = domainKinds(row.allowedRoles, SOURCE_SLOT)
    object.targetTypes = domainKinds(row.allowedRoles, TARGET_SLOT)
    if (grounds.symmetric) object.symmetric = true
    if (grounds.transitive) object.transitive = true
  }

  const constraints = constraintsOf(row.allowedRoles)
  if (constraints.length > 0) object.constraints = constraints

  const examples = typeDefFeature(row.features, 'examples')
  if (Array.isArray(examples) && examples.length > 0) object.examples = examples

  const importedFrom = typeDefFeature(row.features, 'importedFrom')
  if (typeof importedFrom === 'string') object.importedFrom = importedFrom
  const importedAt = typeDefFeature(row.features, 'importedAt')
  if (typeof importedAt === 'string') object.importedAt = importedAt

  return object
}

/**
 * Reconstructs a persona ontology's four type buckets from its TypeDef rows and the
 * lens-recovered gloss for each row — the backward inverse of
 * {@link foveaOntologyToLayersRows}, and the lens-native counterpart of the oracle's
 * `layersToOntology`. The gloss reconstruction is the backward lens's (through
 * `glossByRowId`, built by {@link glossFromStandoffViaLens}); this owns only the
 * cross-record regrouping — the bucket assignment, the positional `ordinal`
 * ordering, the parent-id resolution, and the JSON-decoded per-type field
 * recovery. A row with no lens-recovered gloss falls back to its flattened `gloss`
 * text as a single text segment.
 *
 * @param typeDefs - the TypeDef rows belonging to the ontology
 * @param glossByRowId - lens-recovered gloss segments per TypeDef row id
 * @returns the reconstructed four type buckets
 */
export function layersToOntologyViaLens(
  typeDefs: TypeDefRow[],
  glossByRowId?: Map<string, GlossItem[]>,
): PersonaOntologyAggregate {
  const originalIdByRow = new Map<string, string>()
  for (const row of typeDefs) {
    const originalId = (typeDefFeature(row.features, 'typeId') as string | undefined) ?? row.id
    originalIdByRow.set(row.id, originalId)
  }

  const indexed: Record<TypeBucket, Array<{ ordinal: number; object: Record<string, unknown> }>> = {
    entityTypes: [],
    eventTypes: [],
    roleTypes: [],
    relationTypes: [],
  }

  for (const row of typeDefs) {
    const bucket = KIND_TO_BUCKET[row.typeKind]
    if (!bucket) continue
    const reconstructedGloss =
      glossByRowId?.get(row.id) ?? (row.gloss ? [{ type: 'text' as const, content: row.gloss }] : [])
    const object = reconstructType(row, bucket, reconstructedGloss, originalIdByRow)
    const ordinalRaw = typeDefFeature(row.features, 'ordinal')
    const ordinal = typeof ordinalRaw === 'number' ? ordinalRaw : 0
    indexed[bucket].push({ ordinal, object })
  }

  const aggregate: PersonaOntologyAggregate = { entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] }
  for (const bucket of Object.keys(indexed) as TypeBucket[]) {
    aggregate[bucket] = indexed[bucket].sort((a, b) => a.ordinal - b.ordinal).map((entry) => entry.object)
  }
  return aggregate
}
