/**
 * The shared persona-ontology vocabulary over the native layers store: the
 * aggregate and row shapes the `/api/ontology` contract and the ontology write/read
 * paths exchange, the gloss stand-off helpers that flatten a type's gloss to an
 * Expression + span-layer + reference-annotation projection and reconstruct it back,
 * and the ontology-relation recovery from a native graph edge.
 *
 * A persona ontology carries four type buckets (entity / event / role / relation
 * types). Each type's `gloss` (a GlossItem[] of rich-text and reference segments)
 * projects onto a stand-off: an Expression holding the flattened gloss text, a span
 * AnnotationLayer over that text, and one reference-segment annotation per non-text
 * segment (a typeRef sets `ontologyTypeRefId`; object/claim/annotation refs point at
 * their target through `arguments`, never a hard foreign key). {@link glossStandoffFor}
 * builds those rows and {@link glossFromStandoff} reconstructs the GlossItem[] from
 * the flattened text and its reference annotations, walking the covered ranges as
 * reference segments and the uncovered gaps as plain-text segments.
 *
 * @module
 */

import type { TypeDef as PrismaTypeDef } from '@prisma/client'

import type { GlossItem } from '@models/types.js'

import {
  glossExpressionId,
  glossLayerId,
  glossRefAnnotationId,
  ontologyRelationEdgeId,
} from './layers-id-map.js'

/**
 * A persona's ontology in the aggregate shape: the four type-array buckets,
 * named for the ontology types they hold. Every element is an opaque JSON
 * object; the mapper preserves each verbatim.
 */
export interface PersonaOntologyAggregate {
  entityTypes: unknown[]
  eventTypes: unknown[]
  roleTypes: unknown[]
  relationTypes: unknown[]
}

/** An empty ontology aggregate with every bucket present. */
export function emptyOntology(): PersonaOntologyAggregate {
  return { entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] }
}

/** The scope columns every produced row carries. */
export interface OntologyLayersScope {
  projectId: string | null
  createdByUserId: string | null
}

/** The persona-derived metadata a produced LayersOntology carries. */
export interface OntologyMeta {
  name: string
  description: string | null
  domain: string | null
}

/** A LayersOntology create payload the ontology save persists. */
export interface MappedOntology {
  id: string
  name: string
  description: string | null
  domain: string | null
  personaId: string
  projectId: string | null
  createdByUserId: string | null
}

/** A TypeDef create payload the ontology save persists. */
export interface MappedTypeDef {
  /** The original type id, preserved through the flat `features.typeId`. */
  id: string
  ontologyId: string
  name: string
  typeKind: string
  /** The flattened rendered gloss text. */
  gloss: string | null
  /** The parsed gloss segments, source of the stand-off rows on write. */
  glossItems: GlossItem[]
  /** The original parent type id (mapped to the derived row id on write). */
  parentTypeId: string | null
  allowedRoles: unknown
  allowedValues: unknown
  knowledgeRefs: unknown
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The ontology and type definitions a persona ontology projects to. */
export interface OntologyLayersProjection {
  ontology: MappedOntology
  typeDefs: MappedTypeDef[]
}

// --- gloss: flatten and stand-off -------------------------------------------

/**
 * Flattens a gloss (rich-text/reference segments) to plain text by concatenating
 * each segment's content. Returns null for an empty or absent gloss.
 */
export function glossToText(gloss: GlossItem[]): string | null {
  if (gloss.length === 0) return null
  const text = gloss.map((segment) => (typeof segment.content === 'string' ? segment.content : '')).join('')
  return text.length > 0 ? text : null
}

/** True when a gloss carries at least one non-text (reference) segment. */
function hasReferenceSegments(gloss: GlossItem[]): boolean {
  return gloss.some((segment) => segment.type !== 'text')
}

/** A gloss Expression create payload (the flattened gloss text of one type). */
export interface MappedGlossExpression {
  id: string
  layersId: string
  kind: string
  text: string
  sourceKind: string
  projectId: string | null
  createdByUserId: string | null
}

/** A gloss span-AnnotationLayer create payload over one type's gloss text. */
export interface MappedGlossLayer {
  id: string
  expressionId: string
  kind: string
  subkind: string
  ontologyId: string
  personaId: string
  projectId: string | null
  createdByUserId: string | null
}

/** A gloss reference-segment span annotation create payload. */
export interface MappedGlossAnnotation {
  id: string
  layerId: string
  anchor: unknown
  label: string
  text: string
  ontologyTypeRefId: string | null
  arguments: unknown
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The stand-off rows a reference-bearing gloss projects to. */
export interface GlossStandoff {
  expression: MappedGlossExpression
  layer: MappedGlossLayer
  annotations: MappedGlossAnnotation[]
}

/** The `sourceKind` and expression `kind` a gloss expression carries. */
export const GLOSS_SOURCE_KIND = 'ontology-gloss'
const GLOSS_EXPRESSION_KIND = 'phrase'

/**
 * Projects a type's gloss onto stand-off rows, or null when the gloss carries no
 * reference segments (a text-only gloss round-trips from `TypeDef.gloss` alone).
 *
 * Each reference segment becomes one span annotation anchored by its byte/char
 * offsets in the flattened text: a typeRef sets `ontologyTypeRefId` and carries
 * its refType/refPersonaId as flat features; object/claim/annotation refs point
 * at their target through `arguments` (never the `denotesNodeId` FK, so a gloss
 * referencing a not-yet-persisted world object cannot violate the foreign key).
 *
 * @param typeDefRowId - the derived TypeDef row id the ids fan out from
 * @param gloss - the type's gloss segments
 * @param ontologyId - the owning ontology, bound onto the span layer
 * @param personaId - the persona whose ontology owns the layer
 * @param scope - the scope columns every produced row carries
 * @returns the stand-off rows, or null for a text-only or empty gloss
 */
export function glossStandoffFor(
  typeDefRowId: string,
  gloss: GlossItem[],
  ontologyId: string,
  personaId: string,
  scope: OntologyLayersScope,
): GlossStandoff | null {
  const text = glossToText(gloss)
  if (text === null || !hasReferenceSegments(gloss)) return null

  const expressionId = glossExpressionId(typeDefRowId)
  const layerId = glossLayerId(typeDefRowId)

  const annotations: MappedGlossAnnotation[] = []
  let charCursor = 0
  let byteCursor = 0
  gloss.forEach((segment, index) => {
    const content = typeof segment.content === 'string' ? segment.content : ''
    const charStart = charCursor
    const byteStart = byteCursor
    charCursor += content.length
    byteCursor += Buffer.byteLength(content, 'utf8')
    if (segment.type === 'text') return

    const featureEntries: Array<{ key: string; value: string }> = []
    if (typeof segment.refType === 'string') featureEntries.push({ key: 'fovea.refType', value: segment.refType })
    if (segment.refPersonaId != null) featureEntries.push({ key: 'fovea.refPersonaId', value: segment.refPersonaId })
    if (typeof segment.refClaimId === 'string') featureEntries.push({ key: 'fovea.refClaimId', value: segment.refClaimId })

    // typeRefs carry the referenced type id in the soft-FK ontologyTypeRefId
    // column; every other reference kind points at its target via arguments so
    // no hard foreign key can dangle.
    const isTypeRef = segment.type === 'typeRef'
    annotations.push({
      id: glossRefAnnotationId(typeDefRowId, index),
      layerId,
      anchor: { textSpan: { byteStart, byteEnd: byteCursor, charStart, charEnd: charCursor } },
      label: segment.type,
      text: content,
      ontologyTypeRefId: isTypeRef ? content : null,
      arguments: isTypeRef
        ? null
        : [{ role: 'denotes', target: { localId: { value: segment.refClaimId ?? content } } }],
      features: featureEntries.length > 0 ? { entries: featureEntries } : null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  return {
    expression: {
      id: expressionId,
      layersId: expressionId,
      kind: GLOSS_EXPRESSION_KIND,
      text,
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

/** One reference-segment span annotation as read back from the store. */
export interface GlossRefRow {
  anchor: unknown
  label: string | null
  text: string | null
  ontologyTypeRefId: string | null
  arguments: unknown
  features: unknown
}

/** Reads a feature entry's value from an annotation's featureMap, or null. */
function readFeature(features: unknown, key: string): string | null {
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

/** Reads a span annotation's char offsets, defaulting to a zero-width span. */
function readCharSpan(anchor: unknown): { charStart: number; charEnd: number } {
  const textSpan = (anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
  const charStart = typeof textSpan?.charStart === 'number' ? textSpan.charStart : 0
  const charEnd = typeof textSpan?.charEnd === 'number' ? textSpan.charEnd : charStart
  return { charStart, charEnd }
}

/**
 * Reconstructs a GlossItem[] from a gloss expression's flattened text and its
 * reference-segment span annotations. Covered ranges become reference segments
 * (their type/content/refType recovered from the annotation), and the uncovered
 * gaps between them become plain-text segments. A zero-width reference segment
 * (an empty-content ref, `charStart === charEnd`) is preserved rather than
 * dropped, so an empty `objectRef`/`typeRef`/`claimRef` round-trips; ties on
 * `charStart` order the zero-width ref first so it survives an adjacent span.
 *
 * @param text - the flattened gloss text
 * @param refs - the reference-segment span annotations over that text
 * @returns the reconstructed gloss segments in offset order
 */
export function glossFromStandoff(text: string, refs: GlossRefRow[]): GlossItem[] {
  const ordered = refs
    .map((ref) => ({ ...ref, ...readCharSpan(ref.anchor) }))
    .sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd)

  const items: GlossItem[] = []
  let cursor = 0
  const pushText = (from: number, to: number): void => {
    if (to > from) items.push({ type: 'text', content: text.slice(from, to) })
  }

  for (const ref of ordered) {
    if (ref.charStart < cursor) continue // overlapping/duplicate; skip
    pushText(cursor, ref.charStart)
    const content = ref.text ?? text.slice(ref.charStart, ref.charEnd)
    const type = (ref.label ?? 'text') as GlossItem['type']
    const item: GlossItem = { type, content }
    const refType = readFeature(ref.features, 'fovea.refType')
    if (refType !== null) item.refType = refType as GlossItem['refType']
    const refPersonaId = readFeature(ref.features, 'fovea.refPersonaId')
    if (refPersonaId !== null) item.refPersonaId = refPersonaId
    const refClaimId = readFeature(ref.features, 'fovea.refClaimId') ?? (type === 'claimRef' ? readDenotesTarget(ref.arguments) : null)
    if (refClaimId !== null) item.refClaimId = refClaimId
    items.push(item)
    cursor = ref.charEnd
  }
  pushText(cursor, text.length)
  return items
}

// --- reconstruction row shape -----------------------------------------------

/** The TypeDef columns the ontology reconstruction reads. */
export type TypeDefRow = Pick<
  PrismaTypeDef,
  'id' | 'name' | 'typeKind' | 'gloss' | 'parentTypeId' | 'allowedRoles' | 'allowedValues' | 'knowledgeRefs' | 'features'
>

// --- OntologyRelation <-> GraphEdge -----------------------------------------

/** A FOVEA ontology-relation instance between two ontology-level objects. */
export interface StoredOntologyRelation {
  id: string
  relationTypeId: string
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

/** A graph-edge row an ontology relation is recovered from. */
export interface OntologyRelationEdgeRow {
  edgeType: string
  sourceLocalId: string | null
  targetLocalId: string | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Recovers a FOVEA ontology relation from a relation-type graph edge, or null.
 *
 * The relation's id derives from the (source, target, relationType) triple, and
 * the endpoint ids come straight off the edge's native `sourceLocalId` /
 * `targetLocalId`. Endpoint kinds have no native home on the edge row alone —
 * they are derived by the caller from the referenced nodes' own `nodeType` — so
 * they are left empty here rather than read from a flat `fovea.*` property.
 */
export function edgeToOntologyRelation(edge: OntologyRelationEdgeRow): StoredOntologyRelation | null {
  if (!edge.sourceLocalId || !edge.targetLocalId) return null
  const relation: StoredOntologyRelation = {
    id: ontologyRelationEdgeId(edge.sourceLocalId, edge.targetLocalId, edge.edgeType),
    relationTypeId: edge.edgeType,
    sourceType: '',
    sourceId: edge.sourceLocalId,
    targetType: '',
    targetId: edge.targetLocalId,
  }
  if (edge.createdAt) relation.createdAt = edge.createdAt.toISOString()
  if (edge.updatedAt) relation.updatedAt = edge.updatedAt.toISOString()
  return relation
}
