/**
 * Bidirectional conversion between the hierarchical Claim tree the
 * `/api/summaries/:summaryId/claims` contract exchanges and the native layers
 * store (GraphNode + LayersAnnotation + GraphEdge).
 *
 * Every claim construct lands in an existing layers primitive — no verbatim blob,
 * no whole-object stash:
 *
 *   - A claim is one GraphNode (`nodeType=claim`) carrying only identity: its text
 *     as the node label and its summary membership as flat feature scalars.
 *   - Its bearer is ONE primary LayersAnnotation (`subkind=claim`) denoting that
 *     node: the claim text on `text`, confidence on `confidence` (0-1000 integer
 *     scale), the gloss / claimRelation / claimerGloss as role-tagged
 *     `argumentRef`s in `arguments` (the flattened primary gloss also on `value`),
 *     the claimer type on `ontologyTypeRefId` + a `claimer` argumentRef, the parent
 *     claim link on `parentAnnotationId`, and the (first) text span on `anchor`.
 *   - Its video-time groundings become temporal-anchored sibling annotations, and
 *     its situation/time/location references become cross-object GraphEdges.
 *   - A ClaimRelation is one GraphEdge between the two claim nodes, `edgeType` the
 *     relation type and `confidence` on the integer scale.
 *
 * Fields with no dedicated native column ride in flat featureMap entries (residual
 * leaf scalars, never a nested blob): a residual codec flattens the leftover of
 * each claim / relation — everything the native projection did not consume — into
 * per-leaf `feature` entries and rebuilds it on read, so the tree round-trips
 * losslessly without a sidecar. Subclaims are separate nodes linked by the parent
 * annotation; `nestClaims` reassembles the tree.
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

import { claimAnnotationId, claimTimeSpanAnnotationId, claimRefEdgeId } from './layers-id-map.js'

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

/** A LayersAnnotation create payload a claim materializes to (primary or temporal). */
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
  denotesNodeId: string
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
  /** The primary claim annotation followed by its temporal-grounding siblings. */
  annotations: MappedClaimAnnotation[]
  /** The cross-object reference edges (situation / time / location). */
  refEdges: MappedClaimEdge[]
}

// --- constants ---------------------------------------------------------------

/** Node feature keys that carry a claim's summary membership. */
const KEY_SUMMARY_ID = 'fovea.summaryId'
const KEY_SUMMARY_TYPE = 'fovea.summaryType'

/** Edge feature keys discriminating claim edges and naming their role. */
const KEY_EDGE_ROLE = 'fovea.edgeRole'
const KEY_REF_FIELD = 'fovea.refField'
const EDGE_ROLE_CLAIM_RELATION = 'claim-relation'
const EDGE_ROLE_CLAIM_REF = 'claim-ref'

/** Annotation feature keys the native projection stamps explicitly (never residual). */
const KEY_MODALITY_AUDIO = 'modality.audio'
const KEY_MODALITY_VIDEO = 'modality.video'
const KEY_MODALITY_METADATA = 'modality.metadata'

/** The label a primary claim annotation carries, and its temporal siblings. */
const LABEL_CLAIM = 'claim'
const LABEL_CLAIM_TIME = 'claim-time'

/** The argument-role prefixes each gloss-bearing field encodes under. */
const ROLE_GLOSS = 'gloss'
const ROLE_CLAIM_RELATION = 'claim-relation'
const ROLE_CLAIMER_GLOSS = 'claimer-gloss'
const ROLE_CLAIMER = 'claimer'

/** The reference fields a cross-object claim edge can carry. */
const REF_FIELDS = ['claimEventId', 'claimTimeId', 'claimLocationId'] as const
type RefField = (typeof REF_FIELDS)[number]

/** The graph edgeType each reference field projects to. */
const REF_EDGE_TYPE: Record<RefField, string> = {
  claimEventId: 'describes',
  claimTimeId: 'occurs-at',
  claimLocationId: 'located-at',
}

/** The residual-codec path separator; never appears in a JSON object key. */
const NUL = ''

// --- small readers -----------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
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

// --- residual codec: flatten leftover leaf scalars ---------------------------

/**
 * Flattens a JSON value into per-leaf featureMap entries under a `\0`-prefixed
 * key space, so the leftover of a claim / relation — everything the native
 * projection did not consume — round-trips as flat scalars rather than a nested
 * structured blob. Container shape (array length, object keys) rides in a marker
 * entry so the exact structure, including empty arrays and objects, reconstructs.
 */
function flattenResidual(value: unknown): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  const walk = (path: string, node: unknown): void => {
    if (Array.isArray(node)) {
      entries.push({ key: `${path}${NUL}#`, value: `a${node.length}` })
      node.forEach((item, index) => walk(`${path}${NUL}${index}`, item))
    } else if (node !== null && typeof node === 'object') {
      const keys = Object.keys(node as Record<string, unknown>)
      entries.push({ key: `${path}${NUL}#`, value: `o${JSON.stringify(keys)}` })
      for (const key of keys) walk(`${path}${NUL}k:${key}`, (node as Record<string, unknown>)[key])
    } else {
      entries.push({ key: path, value: JSON.stringify(node) })
    }
  }
  walk(NUL, value)
  return entries
}

/** Rebuilds a JSON value from its residual featureMap entries. */
function unflattenResidual(entries: FeatureEntry[]): unknown {
  const map = new Map<string, string>()
  for (const entry of entries) if (entry.key.startsWith(NUL)) map.set(entry.key, entry.value)
  const build = (path: string): unknown => {
    const marker = map.get(`${path}${NUL}#`)
    if (marker === undefined) {
      const leaf = map.get(path)
      return leaf === undefined ? undefined : (JSON.parse(leaf) as unknown)
    }
    if (marker[0] === 'a') {
      const length = Number(marker.slice(1))
      const out: unknown[] = []
      for (let index = 0; index < length; index += 1) out.push(build(`${path}${NUL}${index}`))
      return out
    }
    const keys = JSON.parse(marker.slice(1)) as string[]
    const out: Record<string, unknown> = {}
    for (const key of keys) out[key] = build(`${path}${NUL}k:${key}`)
    return out
  }
  return build(NUL)
}

/** True when a featureMap holds any residual (leftover) entry. */
function hasResidual(entries: FeatureEntry[]): boolean {
  return entries.some((entry) => entry.key.startsWith(NUL))
}

/** The reconstructed residual object, or an empty object when none was stored. */
function residualObject(entries: FeatureEntry[]): Record<string, unknown> {
  if (!hasResidual(entries)) return {}
  const rebuilt = unflattenResidual(entries)
  return rebuilt !== null && typeof rebuilt === 'object' && !Array.isArray(rebuilt)
    ? (rebuilt as Record<string, unknown>)
    : {}
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

/** The claimer-type argumentRef (role `claimer`), or an empty list when absent. */
function claimerArgument(claimerType: string | null): Record<string, unknown>[] {
  if (claimerType === null) return []
  return [{ role: ROLE_CLAIMER, target: localRef(claimerType) }]
}

/** Reads the claimer type from the `claimer` argumentRef, or null. */
function readClaimerArgument(argumentsValue: unknown): string | null {
  for (const arg of asArray(argumentsValue)) {
    if (arg.role !== ROLE_CLAIMER) continue
    const value = (arg as { target?: { localId?: { value?: unknown } } }).target?.localId?.value
    return typeof value === 'string' ? value : null
  }
  return null
}

// --- modality ----------------------------------------------------------------

/** Builds the modality feature entries for a claim's audio/video/metadata tags. */
function modalityEntries(claim: StoredClaim): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  const push = (key: string, value: unknown): void => {
    if (Array.isArray(value) && value.length > 0) {
      entries.push({ key, value: value.map((v) => String(v)).join(',') })
    }
  }
  push(KEY_MODALITY_AUDIO, claim.audio)
  push(KEY_MODALITY_VIDEO, claim.video)
  push(KEY_MODALITY_METADATA, claim.metadata)
  return entries
}

// --- write: claim -> layers --------------------------------------------------

/** The textSpan anchor for a claim's first text span, or null. */
function firstSpanAnchor(textSpans: unknown): unknown {
  const spans = asArray(textSpans)
  if (spans.length === 0) return null
  const span = spans[0]
  const charStart = typeof span.charStart === 'number' ? span.charStart : 0
  const charEnd = typeof span.charEnd === 'number' ? span.charEnd : 0
  return { textSpan: { byteStart: charStart, byteEnd: charEnd, charStart, charEnd } }
}

/** Builds the temporal-grounding sibling annotations a claim's timeSpans project to. */
function temporalAnnotations(claim: StoredClaim, scope: ClaimLayersScope): MappedClaimAnnotation[] {
  return asArray(claim.timeSpans).map((span, index) => {
    const start = typeof span.start === 'number' ? span.start : 0
    const end = typeof span.end === 'number' ? span.end : 0
    const startMs = Math.round(start * 1000)
    const endMs = Math.round(end * 1000)
    const entries: FeatureEntry[] = [{ key: 'fovea.spanIndex', value: String(index) }]
    if (typeof span.source === 'string') entries.push({ key: 'fovea.timeSource', value: span.source })
    return {
      id: claimTimeSpanAnnotationId(claim.id, index),
      anchor: { temporalSpan: { start: startMs, ending: endMs } },
      label: LABEL_CLAIM_TIME,
      text: null,
      value: null,
      confidence: null,
      arguments: null,
      ontologyTypeRefId: null,
      parentAnnotationId: null,
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
      properties: featureMap([
        { key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_REF },
        { key: KEY_REF_FIELD, value: field },
      ]),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  }
  return edges
}

/**
 * Projects one claim onto its native rows: an identity GraphNode, the primary
 * bearer annotation (plus temporal-grounding siblings), and the cross-object
 * reference edges. The primary annotation is authoritative for text, confidence,
 * gloss/claimer, and the parent link; everything with no lossless native column
 * rides in the annotation's residual featureMap.
 *
 * @param claim - the claim to project (its subclaims are their own nodes)
 * @returns the node, annotations, and reference edges to persist
 */
export function claimToLayers(claim: StoredClaim): ClaimLayersProjection {
  const scope = claimScope(claim)

  // The residual: the claim leftover minus every field with a native home.
  const residual = { ...claim } as Record<string, unknown>
  delete residual.subclaims
  delete residual.sourceClaimRelations
  delete residual.targetClaimRelations
  delete residual.id
  delete residual.text
  delete residual.summaryId
  delete residual.summaryType
  delete residual.createdBy
  delete residual.projectId

  const gloss = glossOf(claim.gloss)
  const claimRelation = glossOf(claim.claimRelation)
  const claimerGloss = glossOf(claim.claimerGloss)
  if (gloss.length > 0) delete residual.gloss
  if (claimRelation.length > 0) delete residual.claimRelation
  if (claimerGloss.length > 0) delete residual.claimerGloss

  const claimerType = typeof claim.claimerType === 'string' ? claim.claimerType : null
  if (claimerType !== null) delete residual.claimerType

  if (typeof claim.confidence === 'number') delete residual.confidence

  const argumentsList: Record<string, unknown>[] = [
    ...glossToArguments(ROLE_GLOSS, gloss),
    ...glossToArguments(ROLE_CLAIM_RELATION, claimRelation),
    ...glossToArguments(ROLE_CLAIMER_GLOSS, claimerGloss),
    ...claimerArgument(claimerType),
  ]

  const featureEntries: FeatureEntry[] = [...modalityEntries(claim), ...flattenResidual(residual)]

  const primary: MappedClaimAnnotation = {
    id: claimAnnotationId(claim.id),
    anchor: firstSpanAnchor(claim.textSpans),
    label: LABEL_CLAIM,
    text: claim.text,
    value: glossToText(gloss),
    confidence: typeof claim.confidence === 'number' ? toMilli(claim.confidence) : null,
    arguments: argumentsList.length > 0 ? argumentsList : null,
    ontologyTypeRefId: claimerType,
    // The parent link rides in the residual `parentClaimId` scalar (reconstructed
    // by `nestClaims`), NOT the `parentAnnotationId` self-relation FK: a parent's
    // bearer annotation may not be persisted yet (import / backfill order) and its
    // deletion would `SetNull` a live child link, so the hard FK is left unset —
    // mirroring the ontology gloss avoiding the `denotesNodeId` FK.
    parentAnnotationId: null,
    temporal: null,
    startMs: null,
    endMs: null,
    denotesNodeId: claim.id,
    features: featureMap(featureEntries),
    projectId: scope.projectId,
    createdByUserId: scope.createdByUserId,
  }

  const node: MappedClaimNode = {
    id: claim.id,
    nodeType: CLAIM_NODE_TYPE,
    label: claim.text,
    properties: featureMap([
      { key: KEY_SUMMARY_ID, value: claim.summaryId },
      { key: KEY_SUMMARY_TYPE, value: claim.summaryType },
    ]),
    projectId: scope.projectId,
    createdByUserId: scope.createdByUserId,
  }

  return {
    node,
    annotations: [primary, ...temporalAnnotations(claim, scope)],
    refEdges: claimRefEdges(claim, scope),
  }
}

/**
 * Projects one claim relation onto its GraphEdge between the two claim nodes. The
 * relation type is the edgeType, its confidence rides on the integer scale, and
 * its span endpoints / notes ride in the edge's residual featureMap (flat leaf
 * scalars, never a blob). The edge carries the `claim-relation` role tag so a
 * read discriminates it from a world or type-assignment edge.
 *
 * @param relation - the relation to project
 * @param projectId - the source claim's project scope (relations carry no scope
 *   field of their own; the edge inherits its endpoint claim's project)
 * @returns the GraphEdge create payload
 */
export function relationToEdge(relation: StoredRelation, projectId: string | null): MappedClaimEdge {
  const residual = { ...relation } as Record<string, unknown>
  delete residual.id
  delete residual.sourceClaimId
  delete residual.targetClaimId
  delete residual.relationTypeId
  delete residual.createdBy
  if (typeof relation.confidence === 'number') delete residual.confidence

  return {
    id: relation.id,
    source: localRef(relation.sourceClaimId),
    target: localRef(relation.targetClaimId),
    sourceLocalId: relation.sourceClaimId,
    targetLocalId: relation.targetClaimId,
    edgeType: relation.relationTypeId,
    label: relation.relationTypeId,
    confidence: typeof relation.confidence === 'number' ? toMilli(relation.confidence) : null,
    properties: featureMap([
      { key: KEY_EDGE_ROLE, value: EDGE_ROLE_CLAIM_RELATION },
      ...flattenResidual(residual),
    ]),
    projectId,
    createdByUserId: relation.createdBy ?? null,
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

/** The primary claim annotation id for a claim node's id. */
export function primaryAnnotationId(claimId: string): string {
  return claimAnnotationId(claimId)
}

/**
 * Reconstructs a shallow claim from a claim GraphNode alone: its id, summary
 * membership, text, and scope. The rich fields (gloss, spans, confidence, …) are
 * absent — this is the shape the import authorizer and scope-only callers need,
 * not the full contract shape (see {@link claimFromLayers}).
 *
 * @param node - the claim GraphNode row
 * @returns the shallow claim, or null when the row is not a claim node
 */
export function nodeToClaim(node: ClaimNodeRow): StoredClaim | null {
  if (!isClaimNode(node)) return null
  const entries = entriesOf(node.properties)
  return {
    id: node.id,
    summaryId: readFeature(entries, KEY_SUMMARY_ID) ?? '',
    summaryType: readFeature(entries, KEY_SUMMARY_TYPE) ?? '',
    text: node.label ?? '',
    gloss: [],
    createdBy: node.createdByUserId ?? null,
    projectId: node.projectId ?? null,
    createdAt: '',
    updatedAt: '',
  }
}

/**
 * Reconstructs the full claim from its GraphNode and its primary bearer
 * annotation. The residual featureMap rebuilds every field with no lossless
 * native column (textSpans, timeSpans, event/time/location refs, modality,
 * parentClaimId, extraction provenance, timestamps); the native columns supply
 * text, confidence, gloss, claimRelation, claimer, and claimerGloss.
 *
 * @param node - the claim GraphNode row
 * @param primary - the claim's primary bearer annotation
 * @returns the reconstructed claim
 */
export function claimFromLayers(node: ClaimNodeRow, primary: ClaimAnnotationRow): StoredClaim {
  const nodeEntries = entriesOf(node.properties)
  const annEntries = entriesOf(primary.features)
  const object = residualObject(annEntries) as Partial<StoredClaim> & Record<string, unknown>

  object.id = node.id
  object.summaryId = readFeature(nodeEntries, KEY_SUMMARY_ID) ?? ''
  object.summaryType = readFeature(nodeEntries, KEY_SUMMARY_TYPE) ?? ''
  object.text = primary.text ?? node.label ?? ''
  object.createdBy = primary.createdByUserId ?? node.createdByUserId ?? null
  object.projectId = primary.projectId ?? node.projectId ?? null

  if (typeof primary.confidence === 'number') object.confidence = fromMilli(primary.confidence)

  const gloss = argumentsToGloss(primary.arguments, ROLE_GLOSS)
  if (gloss.length > 0) object.gloss = gloss
  const claimRelation = argumentsToGloss(primary.arguments, ROLE_CLAIM_RELATION)
  if (claimRelation.length > 0) object.claimRelation = claimRelation
  const claimerGloss = argumentsToGloss(primary.arguments, ROLE_CLAIMER_GLOSS)
  if (claimerGloss.length > 0) object.claimerGloss = claimerGloss

  const claimerType = primary.ontologyTypeRefId ?? readClaimerArgument(primary.arguments)
  if (claimerType !== null) object.claimerType = claimerType

  return object as StoredClaim
}

/**
 * Reconstructs a claim relation from its GraphEdge. The relation type is the
 * edgeType, confidence recovers from the integer scale, and the span
 * endpoints / notes rebuild from the edge's residual featureMap.
 *
 * @param edge - the relation GraphEdge row
 * @returns the reconstructed relation, or null when it is not a claim relation
 */
export function edgeToRelation(edge: ClaimEdgeRow): StoredRelation | null {
  if (!isClaimRelationEdge(edge)) return null
  const entries = entriesOf(edge.properties)
  const object = residualObject(entries) as Partial<StoredRelation> & Record<string, unknown>
  object.id = edge.id
  object.sourceClaimId = edge.sourceLocalId ?? ''
  object.targetClaimId = edge.targetLocalId ?? ''
  object.relationTypeId = edge.edgeType
  object.createdBy = edge.createdByUserId ?? null
  if (typeof edge.confidence === 'number') object.confidence = fromMilli(edge.confidence)
  return object as StoredRelation
}

// --- tree assembly -----------------------------------------------------------

/**
 * Nests a flat claim list into the hierarchical tree the read paths return,
 * ordering siblings by creation time then id for a stable result. Claims whose
 * `parentClaimId` names a claim outside the list are treated as roots.
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
 * Collects a claim's id and every descendant subclaim id from a flat list.
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
