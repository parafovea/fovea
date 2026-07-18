/**
 * Bidirectional conversion between the WorldState aggregate the `/api/world`
 * contract exchanges and the native layers store.
 *
 * Every world construct lands in an existing layers primitive — no verbatim blob,
 * no whole-object stash, no shredded feature map:
 *
 *   - Entities / Locations / Events / Times become GraphNodes (nodeType
 *     `entity` / `location` / `situation` / `time`). Identity is the node id, the
 *     display name is the node label, and external groundings — `wikidataId` and
 *     each `metadata.externalIds` entry — become `knowledgeRefs`.
 *   - Every world node carries one presence LayersAnnotation in the scope's world
 *     scaffold layer. It is the native marker distinguishing a world-authored node
 *     from a video-object-annotation denotation stub (which has none), and it
 *     carries the node's typed value: a Time's calendar/vagueness/deictic via a
 *     `temporalExpression`, a Location's coordinates/bounds via a
 *     `spatialExpression`, and an Entity/Event description as stand-off gloss text
 *     with one child annotation per reference segment.
 *   - Type assignments become LayersAnnotations (`ontologyTypeRefId` = the type,
 *     an `argumentRef` role `persona` carrying the persona) denoting the object
 *     node, or — for a collection — carrying the collection in an `argumentRef`
 *     role `subject`.
 *   - Event interpretations become LayersAnnotations (`ontologyTypeRefId` = the
 *     situation type, `argumentRef`s for the persona and each typed participant,
 *     `denotesNodeId` = the event node).
 *   - Entity / event / time collections become ClusterSets bound to the world
 *     scaffold expression, membership being the cluster's `members` objectRefs.
 *   - Relations become GraphEdges, reusing the relation id, with the endpoint
 *     kinds on flat `sourceKind`/`targetKind` properties and array order on the
 *     native `ordinal` column.
 *
 * Genuinely open, unstructured extension data with no first-class native home
 * (a Time's `metadata`, an Entity's `metadata.alternateNames`/`properties`, a
 * collection's `aggregateProperties`, a relation's `metadata`) rides in flat
 * featureMap entries — one entry per top-level field, keyed by the field name,
 * valued as its JSON — never a nested shredded structure.
 *
 * @module
 */

import type {
  GraphNode as PrismaGraphNode,
  GraphEdge as PrismaGraphEdge,
  ClusterSet as PrismaClusterSet,
  LayersAnnotation as PrismaLayersAnnotation,
} from '@prisma/client'

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'

import {
  deriveId,
  worldScaffoldExpressionId,
  worldScaffoldLayerId,
  worldNodeAnnotationId,
  worldInterpretationAnnotationId,
  worldTypeAssignmentAnnotationId,
  worldCollectionDescriptionAnnotationId,
  worldGlossRefAnnotationId,
} from './layers-id-map.js'

/**
 * The WorldState aggregate exchanged by the `/api/world` contract: the six
 * object/collection buckets plus the relation instances. Every element is an
 * opaque JSON object the mapper reconstructs field-for-field.
 */
export interface WorldStateAggregate {
  entities: unknown[]
  events: unknown[]
  times: unknown[]
  entityCollections: unknown[]
  eventCollections: unknown[]
  timeCollections: unknown[]
  relations: unknown[]
}

/** An empty aggregate with every bucket present. */
export function emptyWorldState(): WorldStateAggregate {
  return {
    entities: [],
    events: [],
    times: [],
    entityCollections: [],
    eventCollections: [],
    timeCollections: [],
    relations: [],
  }
}

/** The scope columns every produced row carries. */
export interface WorldLayersScope {
  projectId: string | null
  createdByUserId: string | null
}

// --- projection shapes -------------------------------------------------------

/** A GraphNode create payload the world save persists. */
export interface MappedWorldNode {
  id: string
  nodeType: string
  label: string | null
  properties: unknown
  knowledgeRefs: unknown
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A GraphEdge create payload the world save persists. */
export interface MappedWorldEdge {
  id: string
  source: ObjectRef
  target: ObjectRef
  sourceLocalId: string | null
  targetLocalId: string | null
  edgeType: string
  label: string | null
  ordinal: number
  confidence: number | null
  properties: unknown
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A ClusterSet create payload a world collection projects to. */
export interface MappedWorldCluster {
  id: string
  kind: string
  expressionId: string
  clusters: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The per-scope scaffold Expression + AnnotationLayer world annotations hang off. */
export interface MappedWorldScaffold {
  expressionId: string
  layerId: string
  projectId: string | null
  createdByUserId: string | null
}

/** A world LayersAnnotation create payload (presence / type / interpretation / gloss). */
export interface MappedWorldAnnotation {
  id: string
  layerId: string
  denotesNodeId: string | null
  parentAnnotationId: string | null
  label: string
  text: string | null
  anchor: unknown
  ontologyTypeRefId: string | null
  arguments: unknown
  temporal: unknown
  spatial: unknown
  confidence: number | null
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The native rows a WorldState aggregate projects to. */
export interface WorldLayersProjection {
  nodes: MappedWorldNode[]
  edges: MappedWorldEdge[]
  clusters: MappedWorldCluster[]
  scaffold: MappedWorldScaffold | null
  annotations: MappedWorldAnnotation[]
}

// --- constants ---------------------------------------------------------------

/** The nodeTypes a world save owns: entities/locations, situations, times. */
export const WORLD_NODE_TYPES = ['entity', 'location', 'situation', 'time'] as const

/** Presence-annotation labels marking a node's world membership and kind. */
const LABEL_ENTITY = 'entity'
const LABEL_LOCATION = 'location'
const LABEL_SITUATION = 'situation'
const LABEL_TIME = 'time'
/** A time that exists only as a collection member, excluded from the top-level times bucket. */
const LABEL_COLLECTION_TIME = 'collection-time'
const PRESENCE_LABELS = [LABEL_ENTITY, LABEL_LOCATION, LABEL_SITUATION, LABEL_TIME, LABEL_COLLECTION_TIME]

const LABEL_TYPE_ASSIGNMENT = 'type-assignment'
const LABEL_INTERPRETATION = 'interpretation'
const LABEL_COLLECTION_DESCRIPTION = 'collection-description'

/** The argumentRef roles a world annotation uses. */
const ROLE_PERSONA = 'persona'
const ROLE_SUBJECT = 'subject'
const ROLE_DENOTES = 'denotes'

/**
 * The flat edge-property marking a graph edge as a world-model relation. It is
 * the native world-edge discriminator: a claim-relation or ontology-relation edge
 * (which connect claim / type nodes) carries none, so an edge sharing an edgeType
 * is never mistaken for a world relation. A relation's endpoint kinds ride
 * alongside it when known.
 */
const KEY_WORLD_ROLE = 'worldRole'
const WORLD_ROLE_RELATION = 'relation'
const KEY_SOURCE_KIND = 'sourceKind'
const KEY_TARGET_KIND = 'targetKind'

/**
 * Flat cluster-feature keys recording which aggregate bucket a collection belongs
 * to and which field name it kept its members under. The bucket cannot always be
 * derived from member node types (a collection may reference not-yet-materialized
 * members) so it is recorded explicitly; the member-field name lets a collection
 * that used `members`, `entityIds`, `eventIds`, or `times` round-trip verbatim.
 */
const KEY_BUCKET = 'bucket'
const KEY_MEMBER_FIELD = 'memberField'

/** Flat gloss-reference feature keys. */
const KEY_REF_TYPE = 'refType'
const KEY_REF_PERSONA_ID = 'refPersonaId'
const KEY_REF_CLAIM_ID = 'refClaimId'

// --- small readers -----------------------------------------------------------

/** Reads a JSON column expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/** Builds an ObjectRef pointing at a same-record object by id. */
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

/** Reads one feature value by key, or null. */
function readFeature(entries: FeatureEntry[], key: string): string | null {
  for (const entry of entries) if (entry.key === key) return entry.value
  return null
}

// --- open extension: leftover open scalars as flat feature entries -----------

/**
 * Encodes an object's open, unstructured leftover — the fields the native
 * projection did not consume — as flat featureMap entries: one entry per
 * top-level field, keyed by the field name, valued as its JSON. This is a flat
 * key/value map (never a nested shredded structure), the layers-native home for
 * genuinely open extension data with no dedicated column.
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

// --- knowledge refs ----------------------------------------------------------

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** The reserved knowledgeRef sources the native projection owns. */
const WIKIBASE_LABEL = 'wikibase'

/**
 * Builds an object's knowledgeRefs from its wikidata/wikibase groundings and its
 * `metadata.externalIds` map, or null when it has none.
 */
function knowledgeRefsFor(object: Record<string, unknown>): KnowledgeRef[] | null {
  const refs: KnowledgeRef[] = []
  const wikidataId = stringField(object, 'wikidataId')
  if (wikidataId) {
    const ref: KnowledgeRef = { source: 'wikidata', identifier: wikidataId }
    const url = stringField(object, 'wikidataUrl')
    if (url) ref.uri = url
    refs.push(ref)
  }
  const wikibaseId = stringField(object, 'wikibaseId')
  if (wikibaseId) refs.push({ source: 'custom', identifier: wikibaseId, label: WIKIBASE_LABEL })

  const metadata = object.metadata
  const externalIds = (metadata as { externalIds?: unknown } | null)?.externalIds
  if (externalIds !== null && typeof externalIds === 'object' && !Array.isArray(externalIds)) {
    for (const [source, identifier] of Object.entries(externalIds as Record<string, unknown>)) {
      if (typeof identifier === 'string') refs.push({ source, identifier, label: 'externalId' })
    }
  }
  return refs.length > 0 ? refs : null
}

/** The groundings recovered from a node's knowledgeRefs. */
interface RecoveredGroundings {
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  externalIds?: Record<string, string>
}

/** Recovers the wikidata/wikibase/externalIds groundings a node's knowledgeRefs carry. */
function recoverGroundings(knowledgeRefs: unknown): RecoveredGroundings {
  const out: RecoveredGroundings = {}
  for (const raw of asArray(knowledgeRefs)) {
    const source = stringField(raw, 'source')
    const identifier = stringField(raw, 'identifier')
    const uri = stringField(raw, 'uri')
    const label = stringField(raw, 'label')
    if (!source || !identifier) continue
    if (source === 'wikidata' && label !== 'externalId') {
      out.wikidataId = identifier
      if (uri) out.wikidataUrl = uri
    } else if (source === 'custom' && label === WIKIBASE_LABEL) {
      out.wikibaseId = identifier
    } else if (label === 'externalId') {
      out.externalIds = out.externalIds ?? {}
      out.externalIds[source] = identifier
    }
  }
  return out
}

// --- gloss stand-off (Entity/Event/Collection description) -------------------

/** Concatenates a gloss's segment contents into its plain text, or null when empty. */
function glossToText(gloss: unknown): string | null {
  if (!Array.isArray(gloss) || gloss.length === 0) return null
  return gloss
    .map((seg) => {
      const content = (seg as { content?: unknown }).content
      return typeof content === 'string' ? content : ''
    })
    .join('')
}

/**
 * Builds the child reference annotations for a description gloss: one per
 * non-text segment, anchored by a textSpan into the parent text. typeRefs carry
 * the type id in `ontologyTypeRefId`; every other reference points at its target
 * via an `argumentRef` role `denotes`.
 */
function glossRefAnnotations(
  objectId: string,
  gloss: unknown,
  layerId: string,
  parentId: string,
  denotesNodeId: string | null,
  scope: WorldLayersScope,
): MappedWorldAnnotation[] {
  if (!Array.isArray(gloss)) return []
  const annotations: MappedWorldAnnotation[] = []
  let charCursor = 0
  let byteCursor = 0
  gloss.forEach((raw, index) => {
    const segment = raw as GlossItem
    const content = typeof segment.content === 'string' ? segment.content : ''
    const charStart = charCursor
    const byteStart = byteCursor
    charCursor += content.length
    byteCursor += Buffer.byteLength(content, 'utf8')
    if (segment.type === 'text') return

    const featureEntries: FeatureEntry[] = []
    if (typeof segment.refType === 'string') featureEntries.push({ key: KEY_REF_TYPE, value: segment.refType })
    if (segment.refPersonaId != null) featureEntries.push({ key: KEY_REF_PERSONA_ID, value: segment.refPersonaId })
    if (typeof segment.refClaimId === 'string') featureEntries.push({ key: KEY_REF_CLAIM_ID, value: segment.refClaimId })

    const isTypeRef = segment.type === 'typeRef'
    annotations.push({
      id: worldGlossRefAnnotationId(objectId, index),
      layerId,
      denotesNodeId,
      parentAnnotationId: parentId,
      label: segment.type,
      text: content,
      anchor: { textSpan: { byteStart, byteEnd: byteCursor, charStart, charEnd: charCursor } },
      ontologyTypeRefId: isTypeRef ? content : null,
      arguments: isTypeRef ? null : [{ role: ROLE_DENOTES, target: localRef(segment.refClaimId ?? content) }],
      temporal: null,
      spatial: null,
      confidence: null,
      features: featureMap(featureEntries),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })
  return annotations
}

/** Reads the char span of a gloss child's textSpan anchor. */
function readCharSpan(anchor: unknown): { charStart: number; charEnd: number } {
  const span = (anchor as { textSpan?: { charStart?: unknown; charEnd?: unknown } } | null)?.textSpan
  const charStart = typeof span?.charStart === 'number' ? span.charStart : 0
  const charEnd = typeof span?.charEnd === 'number' ? span.charEnd : charStart
  return { charStart, charEnd }
}

/** A reconstructed gloss reference child. */
interface GlossChild {
  anchor: unknown
  label: string | null
  text: string | null
  ontologyTypeRefId: string | null
  arguments: unknown
  features: unknown
}

/** Reconstructs a description gloss from its plain text and reference children. */
function glossFromParts(text: string | null, children: GlossChild[]): GlossItem[] {
  if (text === null && children.length === 0) return []
  const base = text ?? ''
  const ordered = children
    .map((child) => ({ ...child, ...readCharSpan(child.anchor) }))
    .sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd)

  const items: GlossItem[] = []
  let cursor = 0
  const pushText = (from: number, to: number): void => {
    if (to > from) items.push({ type: 'text', content: base.slice(from, to) })
  }

  for (const child of ordered) {
    if (child.charStart < cursor) continue
    pushText(cursor, child.charStart)
    const content = child.text ?? base.slice(child.charStart, child.charEnd)
    const type = (child.label ?? 'text') as GlossItem['type']
    const item: GlossItem = { type, content }
    const entries = entriesOf(child.features)
    const refType = readFeature(entries, KEY_REF_TYPE)
    if (refType !== null) item.refType = refType as GlossItem['refType']
    const refPersonaId = readFeature(entries, KEY_REF_PERSONA_ID)
    if (refPersonaId !== null) item.refPersonaId = refPersonaId
    const denotesTarget = localRefValue(asArray(child.arguments).find((a) => a.role === ROLE_DENOTES)?.target)
    const refClaimId = readFeature(entries, KEY_REF_CLAIM_ID) ?? (type === 'claimRef' ? denotesTarget : null)
    if (refClaimId !== null) item.refClaimId = refClaimId
    items.push(item)
    cursor = Math.max(cursor, child.charEnd)
  }
  pushText(cursor, base.length)
  return items
}

// --- temporal value objects --------------------------------------------------

/** Maps a FOVEA temporal granularity to a layers `temporalEntity.granularity` slug. */
const GRANULARITIES = new Set([
  'millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year',
])

/**
 * Builds the temporalExpression value a Time projects onto its presence
 * annotation, modeling the deep temporal constructs with their typed layers
 * value-objects: the calendar value on `temporalEntity`, vagueness on
 * `temporalModifier.mod` plus `earliest`/`latest`/`granularity`, and a deictic
 * reference on `anchorRef`.
 */
function temporalExpressionFor(time: Record<string, unknown>): {
  temporal: Record<string, unknown> | null
  confidence: number | null
} {
  const type = stringField(time, 'type')
  const entity: Record<string, unknown> = {}
  const instant = stringField(time, 'timestamp')
  const start = stringField(time, 'startTime')
  const end = stringField(time, 'endTime')
  if (instant) entity.instant = instant
  if (start) entity.intervalStart = start
  if (end) entity.intervalEnd = end

  const temporal: Record<string, unknown> = { type: type === 'interval' ? 'interval' : 'time' }

  // Vagueness -> temporalModifier.mod + temporalEntity.earliest/latest/granularity.
  const vagueness = time.vagueness
  if (vagueness !== null && typeof vagueness === 'object') {
    const v = vagueness as Record<string, unknown>
    const modifier: Record<string, unknown> = {}
    if (typeof v.type === 'string') modifier.mod = v.type
    if (typeof v.description === 'string') modifier.features = { entries: [{ key: 'description', value: v.description }] }
    if (Object.keys(modifier).length > 0) temporal.modifier = modifier
    const bounds = v.bounds
    if (bounds !== null && typeof bounds === 'object') {
      const b = bounds as Record<string, unknown>
      if (typeof b.earliest === 'string') entity.earliest = b.earliest
      if (typeof b.latest === 'string') entity.latest = b.latest
      if (typeof b.typical === 'string') {
        entity.features = { entries: [{ key: 'typical', value: b.typical }] }
      }
    }
    if (typeof v.granularity === 'string' && GRANULARITIES.has(v.granularity)) entity.granularity = v.granularity
  }

  // Deictic -> temporalExpression.anchorRef (+ its scalars on the expression features).
  const deictic = time.deictic
  if (deictic !== null && typeof deictic === 'object') {
    const d = deictic as Record<string, unknown>
    if (typeof d.anchorType === 'string') temporal.anchorRef = localRef(d.anchorType)
    const deicticEntries: FeatureEntry[] = []
    if (typeof d.anchorTime === 'string') deicticEntries.push({ key: 'deicticAnchorTime', value: d.anchorTime })
    if (typeof d.expression === 'string') deicticEntries.push({ key: 'deicticExpression', value: d.expression })
    if (deicticEntries.length > 0) temporal.features = { entries: deicticEntries }
  }

  if (Object.keys(entity).length > 0) temporal.value = entity

  const certainty = typeof time.certainty === 'number' ? time.certainty : null
  return { temporal, confidence: certainty === null ? null : toMilli(certainty) }
}

/** Recovers a Time's calendar, vagueness, deictic, and certainty from its presence annotation. */
function readTemporal(annotation: WorldAnnotationRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const temporal = annotation.temporal as Record<string, unknown> | null
  const type = typeof temporal?.type === 'string' ? temporal.type : null
  out.type = type === 'interval' ? 'interval' : 'instant'

  const value = (temporal?.value as Record<string, unknown> | undefined) ?? undefined
  if (value) {
    if (type === 'interval') {
      if (typeof value.intervalStart === 'string') out.startTime = value.intervalStart
      if (typeof value.intervalEnd === 'string') out.endTime = value.intervalEnd
    } else if (typeof value.instant === 'string') {
      out.timestamp = value.instant
    }
  }

  // Vagueness.
  const modifier = temporal?.modifier as Record<string, unknown> | undefined
  const vagueness: Record<string, unknown> = {}
  if (typeof modifier?.mod === 'string') vagueness.type = modifier.mod
  const modDescription = readFeature(entriesOf(modifier?.features), 'description')
  if (modDescription !== null) vagueness.description = modDescription
  const bounds: Record<string, unknown> = {}
  if (value && typeof value.earliest === 'string') bounds.earliest = value.earliest
  if (value && typeof value.latest === 'string') bounds.latest = value.latest
  const typical = readFeature(entriesOf(value?.features), 'typical')
  if (typical !== null) bounds.typical = typical
  if (Object.keys(bounds).length > 0) vagueness.bounds = bounds
  if (value && typeof value.granularity === 'string') vagueness.granularity = value.granularity
  if (Object.keys(vagueness).length > 0) out.vagueness = vagueness

  // Deictic.
  const anchorType = localRefValue(temporal?.anchorRef)
  const deicticEntries = entriesOf(temporal?.features)
  const anchorTime = readFeature(deicticEntries, 'deicticAnchorTime')
  const expression = readFeature(deicticEntries, 'deicticExpression')
  if (anchorType !== null || anchorTime !== null || expression !== null) {
    const deictic: Record<string, unknown> = {}
    if (anchorType !== null) deictic.anchorType = anchorType
    if (anchorTime !== null) deictic.anchorTime = anchorTime
    if (expression !== null) deictic.expression = expression
    out.deictic = deictic
  }

  if (typeof annotation.confidence === 'number') out.certainty = fromMilli(annotation.confidence)
  return out
}

// --- spatial value objects ---------------------------------------------------

/** Extracts a WKT `POINT(...)` coordinate list, or null. */
function parseWktPoint(geometry: unknown): number[] | null {
  if (typeof geometry !== 'string') return null
  const match = /^POINT\s*\(([^)]*)\)$/i.exec(geometry.trim())
  if (!match) return null
  return match[1].trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n))
}

/** Extracts a WKT `POLYGON((...))` ring of coordinate pairs, or null. */
function parseWktPolygon(geometry: unknown): number[][] | null {
  if (typeof geometry !== 'string') return null
  const match = /^POLYGON\s*\(\((.*)\)\)$/i.exec(geometry.trim())
  if (!match) return null
  return match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n)))
    .filter((pair) => pair.length >= 2)
}

/** Maps a FOVEA coordinate system to a layers `spatialEntity.crs` slug, bijectively. */
function crsForSystem(system: string | null): string {
  if (system === 'cartesian') return 'pixel'
  if (system === 'relative') return 'percentage'
  return 'wgs84'
}

/** Recovers a FOVEA coordinate system from a layers `spatialEntity.crs` slug. */
function systemForCrs(crs: string | null): string {
  if (crs === 'pixel') return 'cartesian'
  if (crs === 'percentage') return 'relative'
  return 'GPS'
}

/** Orders a coordinate object into a numeric tuple per the coordinate system. */
function orderedCoordinates(coordinates: Record<string, unknown>, system: string | null): number[] {
  const ordered =
    system === 'cartesian' || system === 'relative'
      ? [coordinates.x, coordinates.y, coordinates.z]
      : [coordinates.latitude, coordinates.longitude, coordinates.altitude]
  return ordered.filter((v): v is number => typeof v === 'number')
}

/** Reconstructs a coordinate object from a numeric tuple per the coordinate system. */
function coordinatesFromNumbers(numbers: number[], system: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = system === 'cartesian' || system === 'relative' ? ['x', 'y', 'z'] : ['latitude', 'longitude', 'altitude']
  numbers.forEach((n, i) => {
    if (keys[i]) out[keys[i]] = n
  })
  return out
}

/**
 * Builds the spatialExpression value a Location projects onto its presence
 * annotation: a point's coordinates as a WKT POINT, an extent's boundary as a WKT
 * POLYGON, both carrying the coordinate system on `spatialEntity.crs`.
 */
function spatialExpressionFor(location: Record<string, unknown>): Record<string, unknown> | null {
  const locationType = stringField(location, 'locationType')
  if (locationType === null) return null
  const system = stringField(location, 'coordinateSystem')
  const crs = crsForSystem(system)
  const type = locationType === 'extent' ? 'region' : 'location'
  const value: Record<string, unknown> = { crs, geometryFormat: 'wkt' }

  if (locationType === 'extent') {
    const boundary = asArray(location.boundary)
    if (boundary.length > 0) {
      const ring = boundary.map((point) => orderedCoordinates(point, system))
      value.geometry = `POLYGON((${ring.map((p) => p.join(' ')).join(', ')}))`
      value.type = 'polygon'
      value.dimensions = ring[0] && ring[0].length >= 3 ? 3 : 2
    }
  } else {
    const coordinates = location.coordinates
    if (coordinates !== null && typeof coordinates === 'object') {
      const numbers = orderedCoordinates(coordinates as Record<string, unknown>, system)
      if (numbers.length >= 2) {
        value.geometry = `POINT(${numbers.map(String).join(' ')})`
        value.type = 'point'
        value.dimensions = numbers.length >= 3 ? 3 : 2
      }
    }
  }
  return { type, value }
}

/** Recovers a Location's locationType, coordinateSystem, and coordinates/boundary. */
function readSpatial(annotation: WorldAnnotationRow): Record<string, unknown> {
  const spatial = annotation.spatial as { type?: unknown; value?: Record<string, unknown> } | null
  const value = spatial?.value
  const crs = typeof value?.crs === 'string' ? value.crs : null
  const system = systemForCrs(crs)
  const out: Record<string, unknown> = { coordinateSystem: system }
  if (spatial?.type === 'region') {
    out.locationType = 'extent'
    const ring = parseWktPolygon(value?.geometry)
    if (ring) out.boundary = ring.map((pair) => coordinatesFromNumbers(pair, system))
  } else {
    out.locationType = 'point'
    const numbers = parseWktPoint(value?.geometry)
    if (numbers) out.coordinates = coordinatesFromNumbers(numbers, system)
  }
  return out
}

// --- write: aggregate -> layers ---------------------------------------------

/** A type assignment on an entity, event, or collection. */
interface TypeAssignmentInput {
  personaId?: string
  entityTypeId?: string
  eventTypeId?: string
  confidence?: number
  justification?: string
}

/** Builds the type-assignment annotations a type-assignment list projects to. */
function typeAssignmentAnnotations(
  subjectId: string,
  denotesNodeId: string | null,
  assignments: Record<string, unknown>[],
  typeField: 'entityTypeId' | 'eventTypeId',
  layerId: string,
  scope: WorldLayersScope,
): MappedWorldAnnotation[] {
  return assignments.map((raw, index) => {
    const assignment = raw as TypeAssignmentInput
    const personaId = typeof assignment.personaId === 'string' ? assignment.personaId : ''
    const typeId = typeof assignment[typeField] === 'string' ? (assignment[typeField] as string) : ''
    const args: Array<Record<string, unknown>> = [{ role: ROLE_PERSONA, target: localRef(personaId) }]
    if (denotesNodeId === null) args.push({ role: ROLE_SUBJECT, target: localRef(subjectId) })
    // The type id, persona, and confidence have native homes; every other field
    // (justification, or a foreign `typeId` naming) rides in open-extension features.
    const leftover = leftoverAfter(raw, ['personaId', typeField, 'confidence'])
    return {
      id: worldTypeAssignmentAnnotationId(subjectId, typeId, personaId, index),
      layerId,
      denotesNodeId,
      parentAnnotationId: null,
      label: LABEL_TYPE_ASSIGNMENT,
      text: null,
      anchor: null,
      ontologyTypeRefId: typeId || null,
      arguments: args,
      temporal: null,
      spatial: null,
      confidence: typeof assignment.confidence === 'number' ? toMilli(assignment.confidence) : null,
      features: featureMap(openExtensionEntries(leftover)),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

/** The leftover of an object after its natively-homed fields are removed. */
function leftoverAfter(object: Record<string, unknown>, homed: string[]): Record<string, unknown> {
  const leftover: Record<string, unknown> = { ...object }
  for (const key of homed) delete leftover[key]
  return leftover
}

/** The leftover metadata of an object with its natively-homed `externalIds` removed. */
function metadataLeftover(object: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = object.metadata
  if (metadata === null || metadata === undefined || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined
  }
  const clone = { ...(metadata as Record<string, unknown>) }
  delete clone.externalIds
  return clone
}

/**
 * Projects a WorldState aggregate onto its native layers rows.
 *
 * @param world - the WorldState aggregate to project
 * @param scope - the scope columns every produced row carries
 * @returns the nodes, edges, clusters, scaffold, and annotations to persist
 */
export function worldStateToLayers(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
): WorldLayersProjection {
  const nodes: MappedWorldNode[] = []
  const edges: MappedWorldEdge[] = []
  const clusters: MappedWorldCluster[] = []
  const annotations: MappedWorldAnnotation[] = []
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const materializedTimeIds = new Set<string>()

  /** Emits a node's presence annotation carrying its description, temporal, or spatial value. */
  const pushNode = (
    node: MappedWorldNode,
    presenceLabel: string,
    object: Record<string, unknown>,
    temporal: unknown,
    spatial: unknown,
    confidence: number | null,
  ): void => {
    nodes.push(node)
    const presenceId = worldNodeAnnotationId(node.id)
    const gloss = object.description
    annotations.push({
      id: presenceId,
      layerId,
      denotesNodeId: node.id,
      parentAnnotationId: null,
      label: presenceLabel,
      text: glossToText(gloss),
      anchor: null,
      ontologyTypeRefId: null,
      arguments: null,
      temporal,
      spatial,
      confidence,
      features: null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
    annotations.push(...glossRefAnnotations(node.id, gloss, layerId, presenceId, node.id, scope))
  }

  // Entities and Locations (both live in the entities bucket).
  asArray(world.entities).forEach((entity) => {
    const id = stringField(entity, 'id')
    if (id === null) return
    const isLocation = typeof entity.locationType === 'string'
    const label = stringField(entity, 'name')

    const assignments = asArray(entity.typeAssignments)
    annotations.push(
      ...typeAssignmentAnnotations(id, id, assignments, 'entityTypeId', layerId, scope),
    )

    const spatial = isLocation ? spatialExpressionFor(entity) : null
    const homed = [
      'id', 'name', 'description', 'wikidataId', 'wikidataUrl', 'wikibaseId', 'typeAssignments',
      'metadata', 'locationType', 'coordinateSystem', 'coordinates', 'boundary',
    ]
    const leftover = leftoverAfter(entity, homed)
    const metaLeftover = metadataLeftover(entity)
    if (metaLeftover !== undefined) leftover.metadata = metaLeftover

    pushNode(
      {
        id,
        nodeType: isLocation ? 'location' : 'entity',
        label,
        properties: featureMap(openExtensionEntries(leftover)),
        knowledgeRefs: knowledgeRefsFor(entity),
        metadata: null,
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      },
      isLocation ? LABEL_LOCATION : LABEL_ENTITY,
      entity,
      null,
      spatial,
      null,
    )
  })

  // Events (situations).
  asArray(world.events).forEach((event) => {
    const id = stringField(event, 'id')
    if (id === null) return
    const label = stringField(event, 'name')

    asArray(event.personaInterpretations).forEach((raw, index) => {
      const personaId = stringField(raw, 'personaId') ?? ''
      const eventTypeId = stringField(raw, 'eventTypeId') ?? ''
      const args: Array<Record<string, unknown>> = [{ role: ROLE_PERSONA, target: localRef(personaId) }]
      for (const p of asArray(raw.participants)) {
        args.push({ role: stringField(p, 'roleTypeId') ?? '', target: localRef(stringField(p, 'entityId') ?? '') })
      }
      const features: FeatureEntry[] = []
      const justification = stringField(raw, 'justification')
      if (justification !== null) features.push({ key: 'justification', value: justification })
      annotations.push({
        id: worldInterpretationAnnotationId(id, personaId, eventTypeId, index),
        layerId,
        denotesNodeId: id,
        parentAnnotationId: null,
        label: LABEL_INTERPRETATION,
        text: null,
        anchor: null,
        ontologyTypeRefId: eventTypeId || null,
        arguments: args,
        temporal: null,
        spatial: null,
        confidence: typeof raw.confidence === 'number' ? toMilli(raw.confidence) : null,
        features: featureMap(features),
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    })

    const leftover = leftoverAfter(event, ['id', 'name', 'description', 'personaInterpretations'])
    pushNode(
      {
        id,
        nodeType: 'situation',
        label,
        properties: featureMap(openExtensionEntries(leftover)),
        knowledgeRefs: knowledgeRefsFor(event),
        metadata: null,
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      },
      LABEL_SITUATION,
      event,
      null,
      null,
      null,
    )
  })

  /** Emits a time node with its presence temporal value; `presenceLabel` marks top-level vs member-only. */
  const pushTime = (time: Record<string, unknown>, presenceLabel: string): void => {
    const id = stringField(time, 'id')
    if (id === null || materializedTimeIds.has(id)) return
    materializedTimeIds.add(id)
    const { temporal, confidence } = temporalExpressionFor(time)
    const leftover = leftoverAfter(time, [
      'id', 'type', 'timestamp', 'startTime', 'endTime', 'certainty', 'vagueness', 'deictic',
    ])
    pushNode(
      {
        id,
        nodeType: 'time',
        label: null,
        properties: featureMap(openExtensionEntries(leftover)),
        knowledgeRefs: knowledgeRefsFor(time),
        metadata: null,
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      },
      presenceLabel,
      time,
      temporal,
      null,
      confidence,
    )
  }

  // Times (top-level).
  asArray(world.times).forEach((time) => pushTime(time, LABEL_TIME))

  // Collections -> ClusterSets bound to the world scaffold expression.
  const expressionId = worldScaffoldExpressionId(scope.createdByUserId, scope.projectId)
  const collectionBucket = (
    bucket: 'entityCollections' | 'eventCollections' | 'timeCollections',
    idFields: Array<'entityIds' | 'eventIds' | 'members'>,
    typeField: 'entityTypeId' | 'eventTypeId',
  ): void => {
    // A collection keeps its members under one of several field names depending on
    // the surface that authored it (the API uses `entityIds`/`eventIds`/`times`,
    // the interchange uses `members`); the chosen name round-trips so the exact
    // field is restored.
    const candidates = bucket === 'timeCollections' ? (['times', 'members'] as const) : idFields
    asArray(world[bucket]).forEach((collection) => {
      const id = stringField(collection, 'id')
      if (id === null) return
      const canonicalLabel = stringField(collection, 'name')
      const memberField = candidates.find((f) => Array.isArray(collection[f])) ?? candidates[0]

      let members: ObjectRef[] = []
      if (memberField === 'times') {
        // Each member Time object is materialized as its own node so it round-trips
        // in full; a member that is not also a top-level time is marked collection-only.
        members = asArray(collection.times)
          .map((time) => {
            const memberId = stringField(time, 'id')
            if (memberId === null) return null
            if (!materializedTimeIds.has(memberId)) pushTime(time, LABEL_COLLECTION_TIME)
            return localRef(memberId)
          })
          .filter((ref): ref is ObjectRef => ref !== null)
      } else {
        const ids = Array.isArray(collection[memberField]) ? (collection[memberField] as unknown[]) : []
        members = ids.filter((mid): mid is string => typeof mid === 'string').map(localRef)
      }

      annotations.push(
        ...typeAssignmentAnnotations(id, null, asArray(collection.typeAssignments), typeField, layerId, scope),
      )

      // A description with content hangs off a collection-description annotation;
      // an empty or absent description stays in open-extension so its presence (or
      // absence) round-trips exactly.
      const gloss = collection.description
      const glossText = glossToText(gloss)
      const glossHasContent = glossText !== null || asArray(gloss).some((s) => s.type !== 'text')
      if (glossHasContent) {
        const descId = worldCollectionDescriptionAnnotationId(id)
        annotations.push({
          id: descId,
          layerId,
          denotesNodeId: null,
          parentAnnotationId: null,
          label: LABEL_COLLECTION_DESCRIPTION,
          text: glossText,
          anchor: null,
          ontologyTypeRefId: null,
          arguments: [{ role: ROLE_SUBJECT, target: localRef(id) }],
          temporal: null,
          spatial: null,
          confidence: null,
          features: null,
          projectId: scope.projectId,
          createdByUserId: scope.createdByUserId,
        })
        annotations.push(...glossRefAnnotations(id, gloss, layerId, descId, null, scope))
      }

      const homed = ['id', 'name', memberField, 'typeAssignments']
      if (glossHasContent) homed.push('description')
      const leftover = leftoverAfter(collection, homed)
      const features: FeatureEntry[] = [
        { key: KEY_BUCKET, value: bucket },
        { key: KEY_MEMBER_FIELD, value: memberField },
        ...openExtensionEntries(leftover),
      ]
      const cluster: Record<string, unknown> = { uuid: { value: id }, members, features: { entries: features } }
      if (canonicalLabel !== null) cluster.canonicalLabel = canonicalLabel

      clusters.push({
        id,
        kind: 'clustering',
        expressionId,
        clusters: [cluster],
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    })
  }
  collectionBucket('entityCollections', ['entityIds', 'members'], 'entityTypeId')
  collectionBucket('eventCollections', ['eventIds', 'members'], 'eventTypeId')
  collectionBucket('timeCollections', ['members'], 'entityTypeId')

  // Relations -> GraphEdges (reusing the relation id).
  asArray(world.relations).forEach((relation, index) => {
    const id = stringField(relation, 'id')
    if (id === null) return
    const sourceId = stringField(relation, 'sourceId') ?? ''
    const targetId = stringField(relation, 'targetId') ?? ''
    const edgeType =
      stringField(relation, 'relationTypeId') ?? stringField(relation, 'relationType') ?? 'related'
    const sourceType = stringField(relation, 'sourceType')
    const targetType = stringField(relation, 'targetType')
    const entries: FeatureEntry[] = [{ key: KEY_WORLD_ROLE, value: WORLD_ROLE_RELATION }]
    if (sourceType !== null) entries.push({ key: KEY_SOURCE_KIND, value: sourceType })
    if (targetType !== null) entries.push({ key: KEY_TARGET_KIND, value: targetType })
    const leftover = leftoverAfter(relation, [
      'id', 'relationTypeId', 'relationType', 'sourceId', 'targetId', 'sourceType', 'targetType',
    ])
    entries.push(...openExtensionEntries(leftover))
    edges.push({
      id,
      source: localRef(sourceId),
      target: localRef(targetId),
      sourceLocalId: sourceId || null,
      targetLocalId: targetId || null,
      edgeType,
      label: edgeType,
      ordinal: index,
      confidence: null,
      properties: featureMap(entries),
      metadata: null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  const scaffold: MappedWorldScaffold | null =
    nodes.length > 0 || clusters.length > 0
      ? { expressionId, layerId, projectId: scope.projectId, createdByUserId: scope.createdByUserId }
      : null

  return { nodes, edges, clusters, scaffold, annotations }
}

// --- read: layers -> aggregate ----------------------------------------------

/** The GraphNode columns the reconstruction reads. */
export type WorldNodeRow = Pick<
  PrismaGraphNode,
  'id' | 'nodeType' | 'label' | 'properties' | 'knowledgeRefs' | 'metadata'
>

/** The GraphEdge columns the reconstruction reads. */
export type WorldEdgeRow = Pick<
  PrismaGraphEdge,
  'id' | 'edgeType' | 'sourceLocalId' | 'targetLocalId' | 'ordinal' | 'confidence' | 'properties' | 'metadata'
>

/** The ClusterSet columns the reconstruction reads. */
export type WorldClusterRow = Pick<PrismaClusterSet, 'id' | 'kind' | 'clusters'>

/** The LayersAnnotation columns the reconstruction reads. */
export type WorldAnnotationRow = Pick<
  PrismaLayersAnnotation,
  | 'id'
  | 'denotesNodeId'
  | 'parentAnnotationId'
  | 'label'
  | 'text'
  | 'anchor'
  | 'ontologyTypeRefId'
  | 'arguments'
  | 'temporal'
  | 'spatial'
  | 'confidence'
  | 'features'
>

/** The native rows a world reconstruction reads from a single scope. */
export interface WorldLayersRows {
  nodes: WorldNodeRow[]
  edges: WorldEdgeRow[]
  clusters: WorldClusterRow[]
  annotations: WorldAnnotationRow[]
}

// --- discrimination ----------------------------------------------------------

/** True when a graph node belongs to a world save (by its nodeType). */
export function isWorldNode(node: { nodeType: string }): boolean {
  return (WORLD_NODE_TYPES as readonly string[]).includes(node.nodeType)
}

/**
 * True when a graph edge is a world relation: it carries the world-role property
 * the projection stamps on every relation edge. A claim-relation or
 * ontology-relation edge carries none, so an edge sharing an edgeType is not
 * mistaken for a world relation.
 */
export function isWorldEdge(edge: { properties: unknown }): boolean {
  return readFeature(entriesOf(edge.properties), KEY_WORLD_ROLE) === WORLD_ROLE_RELATION
}

/** True when an annotation marks a node's world membership (a presence annotation). */
export function isWorldPresence(annotation: { label: string | null; parentAnnotationId: string | null }): boolean {
  return annotation.parentAnnotationId === null && annotation.label !== null && PRESENCE_LABELS.includes(annotation.label)
}

// --- reconstruction ----------------------------------------------------------

/** Rebuilds a type assignment from its LayersAnnotation. */
function readTypeAssignment(annotation: WorldAnnotationRow, typeField: 'entityTypeId' | 'eventTypeId'): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const personaId = localRefValue(asArray(annotation.arguments).find((a) => a.role === ROLE_PERSONA)?.target)
  out.personaId = personaId ?? ''
  applyOpenExtension(out, entriesOf(annotation.features), new Set())
  if (annotation.ontologyTypeRefId) out[typeField] = annotation.ontologyTypeRefId
  if (typeof annotation.confidence === 'number') out.confidence = fromMilli(annotation.confidence)
  return out
}

/** Rebuilds an event interpretation from its LayersAnnotation. */
function readInterpretation(annotation: WorldAnnotationRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const args = asArray(annotation.arguments)
  const personaId = localRefValue(args.find((a) => a.role === ROLE_PERSONA)?.target)
  out.personaId = personaId ?? ''
  if (annotation.ontologyTypeRefId) out.eventTypeId = annotation.ontologyTypeRefId
  out.participants = args
    .filter((a) => a.role !== ROLE_PERSONA)
    .map((a) => ({ entityId: localRefValue(a.target) ?? '', roleTypeId: typeof a.role === 'string' ? a.role : '' }))
  if (typeof annotation.confidence === 'number') out.confidence = fromMilli(annotation.confidence)
  const justification = readFeature(entriesOf(annotation.features), 'justification')
  if (justification !== null) out.justification = justification
  return out
}

/** A gloss child as a {@link GlossChild}. */
function toGlossChild(annotation: WorldAnnotationRow): GlossChild {
  return {
    anchor: annotation.anchor,
    label: annotation.label,
    text: annotation.text,
    ontologyTypeRefId: annotation.ontologyTypeRefId,
    arguments: annotation.arguments,
    features: annotation.features,
  }
}

/** The annotations denoting or describing a single world node. */
interface NodeAnnotations {
  presence: WorldAnnotationRow | null
  typeAssignments: WorldAnnotationRow[]
  interpretations: WorldAnnotationRow[]
  glossChildren: WorldAnnotationRow[]
}

/**
 * Reconstructs the WorldState aggregate from its native layers rows.
 *
 * @param rows - the world nodes, edges, clusters, and annotations in one scope
 * @returns the reconstructed WorldState aggregate
 */
export function layersToWorldState(rows: WorldLayersRows): WorldStateAggregate {
  const aggregate = emptyWorldState()

  // Index the annotations by the node they denote, and by their gloss parent.
  const byNode = new Map<string, NodeAnnotations>()
  const glossByParent = new Map<string, WorldAnnotationRow[]>()
  const collectionAssignments = new Map<string, WorldAnnotationRow[]>()
  const collectionDescription = new Map<string, WorldAnnotationRow>()

  const nodeBucket = (nodeId: string): NodeAnnotations => {
    let entry = byNode.get(nodeId)
    if (!entry) {
      entry = { presence: null, typeAssignments: [], interpretations: [], glossChildren: [] }
      byNode.set(nodeId, entry)
    }
    return entry
  }

  for (const annotation of rows.annotations) {
    if (annotation.parentAnnotationId !== null) {
      const list = glossByParent.get(annotation.parentAnnotationId) ?? []
      list.push(annotation)
      glossByParent.set(annotation.parentAnnotationId, list)
      continue
    }
    const nodeId = annotation.denotesNodeId
    if (annotation.label === LABEL_TYPE_ASSIGNMENT) {
      if (nodeId) nodeBucket(nodeId).typeAssignments.push(annotation)
      else {
        const subject = localRefValue(asArray(annotation.arguments).find((a) => a.role === ROLE_SUBJECT)?.target)
        if (subject) {
          const list = collectionAssignments.get(subject) ?? []
          list.push(annotation)
          collectionAssignments.set(subject, list)
        }
      }
    } else if (annotation.label === LABEL_INTERPRETATION) {
      if (nodeId) nodeBucket(nodeId).interpretations.push(annotation)
    } else if (annotation.label === LABEL_COLLECTION_DESCRIPTION) {
      const subject = localRefValue(asArray(annotation.arguments).find((a) => a.role === ROLE_SUBJECT)?.target)
      if (subject) collectionDescription.set(subject, annotation)
    } else if (nodeId && PRESENCE_LABELS.includes(annotation.label ?? '')) {
      nodeBucket(nodeId).presence = annotation
    }
  }

  // Gloss children are indexed by their parent annotation id; attach them to the
  // owning node's presence bucket for description reconstruction.
  const glossChildrenOf = (parentId: string | null): WorldAnnotationRow[] =>
    parentId === null ? [] : (glossByParent.get(parentId) ?? [])

  const describeFrom = (presence: WorldAnnotationRow | null): GlossItem[] =>
    glossFromParts(presence?.text ?? null, glossChildrenOf(presence?.id ?? null).map(toGlossChild))

  // Reconstruct every world node; remember time nodes for collection dereference.
  const timeById = new Map<string, Record<string, unknown>>()
  const entities: Record<string, unknown>[] = []
  const events: Record<string, unknown>[] = []
  const times: Record<string, unknown>[] = []

  for (const node of rows.nodes) {
    const anns = byNode.get(node.id)
    if (!anns || !anns.presence) continue // not a world-authored node (e.g. a video stub)
    const label = anns.presence.label

    if (label === LABEL_TIME || label === LABEL_COLLECTION_TIME) {
      const object: Record<string, unknown> = { id: node.id }
      applyOpenExtension(object, entriesOf(node.properties), new Set())
      Object.assign(object, readTemporal(anns.presence))
      timeById.set(node.id, object)
      if (label === LABEL_TIME) times.push(object)
      continue
    }

    const object: Record<string, unknown> = { id: node.id }
    if (node.label !== null) object.name = node.label
    applyOpenExtension(object, entriesOf(node.properties), new Set())
    object.description = describeFrom(anns.presence)

    const grounds = recoverGroundings(node.knowledgeRefs)
    if (grounds.wikidataId) object.wikidataId = grounds.wikidataId
    if (grounds.wikidataUrl) object.wikidataUrl = grounds.wikidataUrl
    if (grounds.wikibaseId) object.wikibaseId = grounds.wikibaseId
    if (grounds.externalIds) {
      const metadata =
        object.metadata && typeof object.metadata === 'object' && !Array.isArray(object.metadata)
          ? (object.metadata as Record<string, unknown>)
          : {}
      metadata.externalIds = grounds.externalIds
      object.metadata = metadata
    }

    if (label === LABEL_SITUATION) {
      object.personaInterpretations = anns.interpretations.map(readInterpretation)
      events.push(object)
    } else {
      object.typeAssignments = anns.typeAssignments.map((a) => readTypeAssignment(a, 'entityTypeId'))
      if (label === LABEL_LOCATION && anns.presence.spatial !== null) {
        Object.assign(object, readSpatial(anns.presence))
      }
      entities.push(object)
    }
  }

  aggregate.entities = entities
  aggregate.events = events
  aggregate.times = times

  // Collections from ClusterSets. The bucket and member-field name are recorded
  // on the cluster (a collection may reference not-yet-materialized members), so
  // no derivation from member node types is needed.
  for (const clusterSet of rows.clusters) {
    const first = asArray(clusterSet.clusters)[0]
    if (!first) continue
    const featureEntries = entriesOf(first.features)
    const bucket = readFeature(featureEntries, KEY_BUCKET)
    if (bucket !== 'entityCollections' && bucket !== 'eventCollections' && bucket !== 'timeCollections') continue
    const memberField = readFeature(featureEntries, KEY_MEMBER_FIELD) ?? 'members'

    const object: Record<string, unknown> = { id: clusterSet.id }
    applyOpenExtension(object, featureEntries, new Set([KEY_BUCKET, KEY_MEMBER_FIELD]))
    const canonicalLabel = first.canonicalLabel
    if (typeof canonicalLabel === 'string') object.name = canonicalLabel

    const desc = collectionDescription.get(clusterSet.id)
    if (desc) object.description = glossFromParts(desc.text ?? null, glossChildrenOf(desc.id).map(toGlossChild))

    const memberIds = asArray(first.members)
      .map((m) => localRefValue(m))
      .filter((mid): mid is string => mid !== null)

    if (bucket === 'entityCollections') {
      object.typeAssignments = (collectionAssignments.get(clusterSet.id) ?? []).map((a) =>
        readTypeAssignment(a, 'entityTypeId'),
      )
    } else if (bucket === 'eventCollections') {
      object.typeAssignments = (collectionAssignments.get(clusterSet.id) ?? []).map((a) =>
        readTypeAssignment(a, 'eventTypeId'),
      )
    }

    // Members reconstruct under the recorded field name: a `times` field carries
    // full member Time objects, every other field carries member ids.
    if (memberField === 'times') object.times = memberIds.map((id) => timeById.get(id) ?? { id })
    else object[memberField] = memberIds

    aggregate[bucket].push(object)
  }

  // Relations from the endpoint-kind-tagged edges.
  const relations = rows.edges
    .filter((edge) => isWorldEdge(edge))
    .slice()
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .map((edge) => {
      const entries = entriesOf(edge.properties)
      const object: Record<string, unknown> = { id: edge.id }
      applyOpenExtension(object, entries, new Set([KEY_WORLD_ROLE, KEY_SOURCE_KIND, KEY_TARGET_KIND]))
      object.relationTypeId = edge.edgeType
      if (edge.sourceLocalId) object.sourceId = edge.sourceLocalId
      if (edge.targetLocalId) object.targetId = edge.targetLocalId
      const sourceKind = readFeature(entries, KEY_SOURCE_KIND)
      if (sourceKind !== null) object.sourceType = sourceKind
      const targetKind = readFeature(entries, KEY_TARGET_KIND)
      if (targetKind !== null) object.targetType = targetKind
      return object
    })
  aggregate.relations = relations

  return aggregate
}

// --- synthetic world-state ids ----------------------------------------------

/**
 * The synthetic WorldState id the `/api/world` response reports for a user.
 *
 * The layers store keys world objects by scope rather than by a single
 * WorldState row, so the aggregate has no natural id. A deterministic uuid keeps
 * the response's `id` stable across reads without persisting a placeholder row.
 *
 * @param userId - the owning user's id
 * @returns a deterministic uuid for the user's personal world state
 */
export function personalWorldStateId(userId: string): string {
  return deriveId('worldstate:user', userId)
}

/**
 * The synthetic WorldState id the project world-state contract reports for a
 * (user, project) pair. As with {@link personalWorldStateId}, the layers store
 * keys world objects by scope rather than by a single row, so a deterministic
 * uuid keeps the response's `id` stable across reads.
 *
 * @param userId - the owning user's id
 * @param projectId - the project the world is scoped to
 * @returns a deterministic uuid for the project-scoped world state
 */
export function projectWorldStateId(userId: string, projectId: string): string {
  return deriveId('worldstate:project', userId, projectId)
}
