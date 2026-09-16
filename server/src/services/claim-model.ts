/**
 * The shared claim/relation vocabulary over the native layers store (GraphNode +
 * LayersAnnotation + GraphEdge): the view-model types the
 * `/api/summaries/:summaryId/claims` contract exchanges, the native-row projection
 * shapes, the row-level reconstruction from those rows back to a claim or relation,
 * and the tree/scope helpers.
 *
 * A claim materializes as one GraphNode (`nodeType=claim`) carrying its text as the
 * node label, one primary LayersAnnotation denoting that node (the claim text on
 * `text`, confidence on the 0-1000 integer scale, the gloss / claimRelation /
 * claimerGloss as role-tagged `argumentRef`s, the claimer type on `ontologyTypeRefId`
 * plus a `claimer` argumentRef, the summary membership as a `summary` argumentRef, and
 * the parent claim link on the native `parentAnnotationId` self-relation), its
 * discontiguous text spans and video-time groundings as `textSpan` / `temporalSpan`
 * child annotations, and its situation / time / location references as cross-object
 * GraphEdges. A claim relation materializes as one GraphEdge between the two claim
 * nodes, with its source/target spans as `textSpan`-anchored annotations pointing at it.
 *
 * The reconstruction reads those rows directly: {@link claimFromLayers} rebuilds a
 * claim from its GraphNode, primary annotation, span/temporal children, and reference
 * edges; {@link edgeToRelation} rebuilds a relation from its GraphEdge and endpoint-span
 * annotations. The genuinely flat, opaque scalar extension values with no dedicated
 * column (modality tags, extraction provenance, semantic timestamps) ride in flat
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

import { claimAnnotationId } from './layers-id-map.js'

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

/** The labels a claim's text-span / temporal children and relation spans carry. */
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

/** The claim field each cross-object reference edgeType reconstructs. */
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

/** The localId value of an objectRef, or null. */
function localRefValue(ref: unknown): string | null {
  const value = (ref as { localId?: { value?: unknown } } | null)?.localId?.value
  return typeof value === 'string' ? value : null
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

// --- gloss: GlossItem[] ↔ role-tagged argumentRefs ------------------------

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

/** Reads the target id of the first argumentRef carrying an exact role, or null. */
function readObjectArgument(argumentsValue: unknown, role: string): string | null {
  for (const arg of asArray(argumentsValue)) {
    if (arg.role !== role) continue
    return localRefValue(arg.target)
  }
  return null
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
 * `parentAnnotationId` self-relation.
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
