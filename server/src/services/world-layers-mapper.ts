/**
 * Bidirectional conversion between the WorldState aggregate the `/api/world`
 * contract exchanges and the native layers store.
 *
 * Every world construct lands in an existing layers primitive — no verbatim
 * blob, no whole-object stash:
 *
 *   - Entities / Locations / Events / Times become GraphNodes (nodeType
 *     `entity` / `location` / `situation` / `time`). Identity is the node id,
 *     the display name is the node label, and external groundings become
 *     `knowledgeRefs`.
 *   - Type assignments become instance-of GraphEdges (object -> type objectRef,
 *     `metadata.personaRef` carrying the persona, `confidence` on the 0-1000
 *     integer scale).
 *   - Event interpretations become LayersAnnotations (`ontologyTypeRefId` = the
 *     situation type, `arguments` = the typed participants, `denotesNodeId` = the
 *     event node) hung off a per-scope world scaffold layer.
 *   - A Location's coordinates become a `spatialExpression` value on an
 *     annotation denoting the location node; a Time's calendar value becomes a
 *     `temporalExpression` on an annotation denoting the time node.
 *   - Entity / event / time collections become ClusterSets, membership being the
 *     cluster's `members` objectRefs.
 *   - Relations become GraphEdges, reusing the relation id.
 *
 * Fields with no dedicated native home ride in flat featureMap entries (residual
 * leaf scalars, never a nested structured object): a residual codec flattens the
 * leftover of each object — everything the native projection did not consume —
 * into per-leaf `feature` entries and rebuilds it on read, so the aggregate
 * round-trips losslessly without a sidecar.
 *
 * @module
 */

import type {
  GraphNode as PrismaGraphNode,
  GraphEdge as PrismaGraphEdge,
  ClusterSet as PrismaClusterSet,
  LayersAnnotation as PrismaLayersAnnotation,
} from '@prisma/client'

import type { ObjectRef } from '@fovea/layers-schema'

import {
  deriveId,
  worldScaffoldExpressionId,
  worldScaffoldLayerId,
  worldTemporalAnnotationId,
  worldSpatialAnnotationId,
  worldInterpretationAnnotationId,
  worldTypeAssignmentEdgeId,
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

/** A world-denoting LayersAnnotation create payload (temporal / spatial / interpretation). */
export interface MappedWorldAnnotation {
  id: string
  layerId: string
  denotesNodeId: string
  label: string
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

/** Feature keys the native projection stamps explicitly (never residual). */
const KEY_ORDINAL = 'fovea.ordinal'
const KEY_EDGE_ROLE = 'fovea.edgeRole'
const KEY_BUCKET = 'fovea.bucket'
const KEY_TIME_TYPE = 'fovea.time.type'
const KEY_LOC_TYPE = 'fovea.loc.locationType'
const KEY_LOC_SYSTEM = 'fovea.loc.coordinateSystem'
const KEY_SOURCE_TYPE = 'fovea.sourceType'
const KEY_TARGET_TYPE = 'fovea.targetType'
const KEY_TYPE_FIELD = 'fovea.typeField'
const KEY_PERSONA_REF = 'fovea.personaRef'

/** The edgeRole discriminating a relation edge from an instance-of edge. */
const EDGE_ROLE_RELATION = 'relation'
const EDGE_ROLE_TYPE_ASSIGNMENT = 'type-assignment'

/** The residual-codec path separator; never appears in a JSON object key. */
const NUL = '\u0001'

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

/** Reads one explicit feature value by key, or null. */
function readFeature(entries: FeatureEntry[], key: string): string | null {
  for (const entry of entries) if (entry.key === key) return entry.value
  return null
}

// --- residual codec: flatten leftover leaf scalars ---------------------------

/**
 * Flattens a JSON value into per-leaf featureMap entries under a `\0`-prefixed
 * key space, so the leftover of a world object — everything the native
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

// --- knowledge refs ----------------------------------------------------------

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** Builds an object's knowledgeRefs from its wikidata/wikibase groundings, or null. */
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
  if (wikibaseId) refs.push({ source: 'custom', identifier: wikibaseId, label: 'wikibase' })
  return refs.length > 0 ? refs : null
}

/** The groundings recovered from a node's knowledgeRefs. */
interface RecoveredGroundings {
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
}

/** Recovers the wikidata/wikibase groundings a node's knowledgeRefs carry. */
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
    } else if (source === 'custom' && label === 'wikibase' && identifier) {
      out.wikibaseId = identifier
    }
  }
  return out
}

/** Deletes the natively-homed grounding keys from a residual clone. */
function stripGroundings(residual: Record<string, unknown>): void {
  delete residual.wikidataId
  delete residual.wikidataUrl
  delete residual.wikibaseId
}

// --- write: aggregate -> layers ---------------------------------------------

/** A type assignment on an entity or collection. */
interface TypeAssignmentInput {
  personaId?: string
  entityTypeId?: string
  eventTypeId?: string
  confidence?: number
  justification?: string
}

/** Builds the instance-of edges a type-assignment list projects to. */
function typeAssignmentEdges(
  objectId: string,
  assignments: Record<string, unknown>[],
  typeField: 'entityTypeId' | 'eventTypeId',
  scope: WorldLayersScope,
): MappedWorldEdge[] {
  const edges: MappedWorldEdge[] = []
  assignments.forEach((raw, index) => {
    const assignment = raw as TypeAssignmentInput
    const personaId = typeof assignment.personaId === 'string' ? assignment.personaId : ''
    const typeId = typeof assignment[typeField] === 'string' ? (assignment[typeField] as string) : ''
    const residual: Record<string, unknown> = { ...raw }
    delete residual.personaId
    delete residual[typeField]
    delete residual.confidence
    const entries: FeatureEntry[] = [
      { key: KEY_EDGE_ROLE, value: EDGE_ROLE_TYPE_ASSIGNMENT },
      { key: KEY_TYPE_FIELD, value: typeField },
      { key: KEY_ORDINAL, value: String(index) },
      ...flattenResidual(residual),
    ]
    edges.push({
      id: worldTypeAssignmentEdgeId(objectId, typeId, personaId),
      source: localRef(objectId),
      target: localRef(typeId),
      sourceLocalId: objectId,
      targetLocalId: typeId,
      edgeType: 'instance-of',
      label: 'instance-of',
      confidence: typeof assignment.confidence === 'number' ? toMilli(assignment.confidence) : null,
      properties: featureMap(entries),
      metadata: { tool: 'fovea', personaRef: personaId },
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })
  return edges
}

/** Builds the temporalExpression value a Time projects onto its annotation. */
function temporalExpressionFor(time: Record<string, unknown>): {
  temporal: Record<string, unknown> | null
  confidence: number | null
} {
  const type = stringField(time, 'type')
  const value: Record<string, unknown> = {}
  const instant = stringField(time, 'timestamp')
  const start = stringField(time, 'startTime')
  const end = stringField(time, 'endTime')
  if (instant) value.instant = instant
  if (start) value.intervalStart = start
  if (end) value.intervalEnd = end

  const certainty = typeof time.certainty === 'number' ? time.certainty : null
  const hasValue = Object.keys(value).length > 0
  if (!hasValue && certainty === null) return { temporal: null, confidence: null }

  const temporal: Record<string, unknown> = {
    type: type === 'interval' ? 'interval' : 'time',
  }
  if (hasValue) temporal.value = value
  return { temporal, confidence: certainty === null ? null : toMilli(certainty) }
}

/** Recovers a Time's calendar fields from its temporal-value annotation. */
function readTemporal(annotation: WorldAnnotationRow, type: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const value = (annotation.temporal as { value?: Record<string, unknown> } | null)?.value
  if (value && typeof value === 'object') {
    if (type === 'interval') {
      if (typeof value.intervalStart === 'string') out.startTime = value.intervalStart
      if (typeof value.intervalEnd === 'string') out.endTime = value.intervalEnd
    } else if (typeof value.instant === 'string') {
      out.timestamp = value.instant
    }
  }
  if (typeof annotation.confidence === 'number') out.certainty = fromMilli(annotation.confidence)
  return out
}

/** Extracts a WKT `POINT(...)` coordinate list, or null. */
function parseWktPoint(geometry: unknown): number[] | null {
  if (typeof geometry !== 'string') return null
  const match = /^POINT\s*\(([^)]*)\)$/i.exec(geometry.trim())
  if (!match) return null
  return match[1]
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))
}

/** Builds the spatialExpression value a point Location projects onto its annotation. */
function spatialExpressionFor(location: Record<string, unknown>): Record<string, unknown> | null {
  const coordinates = location.coordinates
  if (coordinates === null || typeof coordinates !== 'object') return null
  const c = coordinates as Record<string, unknown>
  const system = stringField(location, 'coordinateSystem')
  const ordered: Array<unknown> =
    system === 'cartesian' || system === 'relative' ? [c.x, c.y, c.z] : [c.latitude, c.longitude, c.altitude]
  const numbers = ordered.filter((v): v is number => typeof v === 'number')
  if (numbers.length < 2) return null
  const crs = system === 'GPS' ? 'wgs84' : 'custom'
  return {
    type: 'location',
    value: {
      geometry: `POINT(${numbers.map((n) => String(n)).join(' ')})`,
      type: 'point',
      geometryFormat: 'wkt',
      crs,
      dimensions: numbers.length >= 3 ? 3 : 2,
    },
  }
}

/** Recovers a point Location's coordinates from its spatial-value annotation. */
function readSpatialCoordinates(annotation: WorldAnnotationRow, system: string | null): Record<string, unknown> | null {
  const geometry = (annotation.spatial as { value?: { geometry?: unknown } } | null)?.value?.geometry
  const numbers = parseWktPoint(geometry)
  if (!numbers) return null
  const out: Record<string, unknown> = {}
  if (system === 'cartesian' || system === 'relative') {
    if (numbers.length > 0) out.x = numbers[0]
    if (numbers.length > 1) out.y = numbers[1]
    if (numbers.length > 2) out.z = numbers[2]
  } else {
    if (numbers.length > 0) out.latitude = numbers[0]
    if (numbers.length > 1) out.longitude = numbers[1]
    if (numbers.length > 2) out.altitude = numbers[2]
  }
  return out
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

  // Entities and Locations (both live in the entities bucket).
  asArray(world.entities).forEach((entity, index) => {
    const id = stringField(entity, 'id')
    if (id === null) return
    const isLocation = typeof entity.locationType === 'string'
    const residual: Record<string, unknown> = { ...entity }
    delete residual.id
    const explicit: FeatureEntry[] = [{ key: KEY_ORDINAL, value: String(index) }]

    let label: string | null = null
    const name = stringField(entity, 'name')
    if (name !== null) {
      label = name
      delete residual.name
    }
    stripGroundings(residual)

    const assignments = asArray(entity.typeAssignments)
    if (assignments.length > 0) {
      edges.push(...typeAssignmentEdges(id, assignments, 'entityTypeId', scope))
      delete residual.typeAssignments
    }

    if (isLocation) {
      const locationType = stringField(entity, 'locationType')
      const system = stringField(entity, 'coordinateSystem')
      if (locationType !== null) {
        explicit.push({ key: KEY_LOC_TYPE, value: locationType })
        delete residual.locationType
      }
      if (system !== null) {
        explicit.push({ key: KEY_LOC_SYSTEM, value: system })
        delete residual.coordinateSystem
      }
      const spatial = spatialExpressionFor(entity)
      if (spatial) {
        delete residual.coordinates
        annotations.push({
          id: worldSpatialAnnotationId(id),
          layerId,
          denotesNodeId: id,
          label: 'location',
          ontologyTypeRefId: null,
          arguments: null,
          temporal: null,
          spatial,
          confidence: null,
          features: null,
          projectId: scope.projectId,
          createdByUserId: scope.createdByUserId,
        })
      }
    }

    nodes.push({
      id,
      nodeType: isLocation ? 'location' : 'entity',
      label,
      properties: featureMap([...explicit, ...flattenResidual(residual)]),
      knowledgeRefs: knowledgeRefsFor(entity),
      metadata: null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  // Events (situations).
  asArray(world.events).forEach((event, index) => {
    const id = stringField(event, 'id')
    if (id === null) return
    const residual: Record<string, unknown> = { ...event }
    delete residual.id
    const explicit: FeatureEntry[] = [{ key: KEY_ORDINAL, value: String(index) }]

    let label: string | null = null
    const name = stringField(event, 'name')
    if (name !== null) {
      label = name
      delete residual.name
    }
    stripGroundings(residual)

    let metadata: Record<string, unknown> | null = null
    const rawMeta = event.metadata
    if (rawMeta !== null && typeof rawMeta === 'object') {
      const certainty = (rawMeta as Record<string, unknown>).certainty
      if (typeof certainty === 'number') {
        metadata = { tool: 'fovea', confidence: toMilli(certainty) }
        const metaClone = { ...(residual.metadata as Record<string, unknown>) }
        delete metaClone.certainty
        residual.metadata = metaClone
      }
    }

    const interpretations = asArray(event.personaInterpretations)
    for (const raw of interpretations) {
      const personaId = stringField(raw, 'personaId') ?? ''
      const eventTypeId = stringField(raw, 'eventTypeId') ?? ''
      const participants = asArray(raw.participants).map((p) => ({
        role: stringField(p, 'roleTypeId') ?? '',
        target: localRef(stringField(p, 'entityId') ?? ''),
      }))
      const interpResidual: Record<string, unknown> = { ...raw }
      delete interpResidual.personaId
      delete interpResidual.eventTypeId
      delete interpResidual.participants
      delete interpResidual.confidence
      const confidence = typeof raw.confidence === 'number' ? toMilli(raw.confidence) : null
      annotations.push({
        id: worldInterpretationAnnotationId(id, personaId, eventTypeId),
        layerId,
        denotesNodeId: id,
        label: 'interpretation',
        ontologyTypeRefId: eventTypeId || null,
        arguments: participants.length > 0 ? participants : null,
        temporal: null,
        spatial: null,
        confidence,
        features: featureMap([
          { key: KEY_PERSONA_REF, value: personaId },
          ...flattenResidual(interpResidual),
        ]),
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    }
    // Only drop a non-empty interpretation list from the residual; an empty
    // list produces no annotations and must round-trip as [] from the residual.
    if (interpretations.length > 0) delete residual.personaInterpretations

    nodes.push({
      id,
      nodeType: 'situation',
      label,
      properties: featureMap([...explicit, ...flattenResidual(residual)]),
      knowledgeRefs: knowledgeRefsFor(event),
      metadata,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  // Times.
  asArray(world.times).forEach((time, index) => {
    const id = stringField(time, 'id')
    if (id === null) return
    const residual: Record<string, unknown> = { ...time }
    delete residual.id
    const explicit: FeatureEntry[] = [{ key: KEY_ORDINAL, value: String(index) }]
    const type = stringField(time, 'type')
    if (type !== null) {
      explicit.push({ key: KEY_TIME_TYPE, value: type })
      delete residual.type
    }

    const { temporal, confidence } = temporalExpressionFor(time)
    if (temporal) {
      delete residual.timestamp
      delete residual.startTime
      delete residual.endTime
      delete residual.certainty
      annotations.push({
        id: worldTemporalAnnotationId(id),
        layerId,
        denotesNodeId: id,
        label: 'time',
        ontologyTypeRefId: null,
        arguments: null,
        temporal,
        spatial: null,
        confidence,
        features: null,
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    }

    nodes.push({
      id,
      nodeType: 'time',
      label: null,
      properties: featureMap([...explicit, ...flattenResidual(residual)]),
      knowledgeRefs: knowledgeRefsFor(time),
      metadata: null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  // Collections -> ClusterSets.
  const collectionBucket = (
    bucket: 'entityCollections' | 'eventCollections' | 'timeCollections',
    memberField: 'entityIds' | 'eventIds' | 'times',
  ): void => {
    asArray(world[bucket]).forEach((collection, index) => {
      const id = stringField(collection, 'id')
      if (id === null) return
      const residual: Record<string, unknown> = { ...collection }
      delete residual.id
      const canonicalLabel = stringField(collection, 'name')
      if (canonicalLabel !== null) delete residual.name
      const kind = stringField(collection, 'collectionType') ?? 'clustering'
      delete residual.collectionType

      let members: ObjectRef[] = []
      if (memberField === 'times') {
        members = asArray(collection.times)
          .map((t) => stringField(t, 'id'))
          .filter((mid): mid is string => mid !== null)
          .map(localRef)
      } else {
        const ids = Array.isArray(collection[memberField]) ? (collection[memberField] as unknown[]) : []
        members = ids.filter((mid): mid is string => typeof mid === 'string').map(localRef)
      }
      delete residual[memberField]

      const assignments = asArray(collection.typeAssignments)
      if (assignments.length > 0) {
        edges.push(
          ...typeAssignmentEdges(
            id,
            assignments,
            bucket === 'eventCollections' ? 'eventTypeId' : 'entityTypeId',
            scope,
          ),
        )
        delete residual.typeAssignments
      }

      const clusterFeatures: FeatureEntry[] = [
        { key: KEY_BUCKET, value: bucket },
        { key: KEY_ORDINAL, value: String(index) },
        ...flattenResidual(residual),
      ]
      const cluster: Record<string, unknown> = {
        uuid: { value: id },
        members,
        features: { entries: clusterFeatures },
      }
      if (canonicalLabel !== null) cluster.canonicalLabel = canonicalLabel

      clusters.push({
        id,
        kind,
        clusters: [cluster],
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    })
  }
  collectionBucket('entityCollections', 'entityIds')
  collectionBucket('eventCollections', 'eventIds')
  collectionBucket('timeCollections', 'times')

  // Relations -> GraphEdges (reusing the relation id).
  asArray(world.relations).forEach((relation, index) => {
    const id = stringField(relation, 'id')
    if (id === null) return
    const sourceId = stringField(relation, 'sourceId') ?? ''
    const targetId = stringField(relation, 'targetId') ?? ''
    const edgeType =
      stringField(relation, 'relationTypeId') ?? stringField(relation, 'relationType') ?? 'related'
    const residual: Record<string, unknown> = { ...relation }
    delete residual.id
    delete residual.relationTypeId
    delete residual.sourceId
    delete residual.targetId
    const sourceType = stringField(relation, 'sourceType')
    const targetType = stringField(relation, 'targetType')
    delete residual.sourceType
    delete residual.targetType
    const entries: FeatureEntry[] = [
      { key: KEY_EDGE_ROLE, value: EDGE_ROLE_RELATION },
      { key: KEY_ORDINAL, value: String(index) },
    ]
    if (sourceType !== null) entries.push({ key: KEY_SOURCE_TYPE, value: sourceType })
    if (targetType !== null) entries.push({ key: KEY_TARGET_TYPE, value: targetType })
    entries.push(...flattenResidual(residual))
    edges.push({
      id,
      source: localRef(sourceId),
      target: localRef(targetId),
      sourceLocalId: sourceId || null,
      targetLocalId: targetId || null,
      edgeType,
      label: edgeType,
      confidence: null,
      properties: featureMap(entries),
      metadata: null,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  const scaffold: MappedWorldScaffold | null =
    annotations.length > 0
      ? {
          expressionId: worldScaffoldExpressionId(scope.createdByUserId, scope.projectId),
          layerId,
          projectId: scope.projectId,
          createdByUserId: scope.createdByUserId,
        }
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
  'id' | 'edgeType' | 'sourceLocalId' | 'targetLocalId' | 'confidence' | 'properties' | 'metadata'
>

/** The ClusterSet columns the reconstruction reads. */
export type WorldClusterRow = Pick<PrismaClusterSet, 'id' | 'kind' | 'clusters'>

/** The LayersAnnotation columns the reconstruction reads. */
export type WorldAnnotationRow = Pick<
  PrismaLayersAnnotation,
  'denotesNodeId' | 'label' | 'ontologyTypeRefId' | 'arguments' | 'temporal' | 'spatial' | 'confidence' | 'features'
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

/** True when a graph edge belongs to a world save (it carries the edgeRole tag). */
export function isWorldEdge(edge: { properties: unknown }): boolean {
  return readFeature(entriesOf(edge.properties), KEY_EDGE_ROLE) !== null
}

/** The three collection buckets a ClusterSet can carry. */
export type WorldCollectionBucket = 'entityCollections' | 'eventCollections' | 'timeCollections'

/** The collection bucket a ClusterSet belongs to, or null when it is not a world collection. */
export function worldClusterBucket(cluster: { clusters: unknown }): WorldCollectionBucket | null {
  const first = asArray(cluster.clusters)[0]
  if (!first) return null
  const bucket = readFeature(entriesOf(first.features), KEY_BUCKET)
  if (bucket === 'entityCollections' || bucket === 'eventCollections' || bucket === 'timeCollections') {
    return bucket
  }
  return null
}

// --- reconstruction ----------------------------------------------------------

/** Reads a node's ordinal from its explicit feature, defaulting to 0. */
function ordinalOf(entries: FeatureEntry[]): number {
  const raw = readFeature(entries, KEY_ORDINAL)
  const parsed = raw === null ? 0 : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Rebuilds a type assignment from its instance-of edge. */
function readTypeAssignment(edge: WorldEdgeRow): Record<string, unknown> {
  const entries = entriesOf(edge.properties)
  const typeField = readFeature(entries, KEY_TYPE_FIELD) ?? 'entityTypeId'
  const base = residualObject(entries)
  const personaRef = (edge.metadata as { personaRef?: unknown } | null)?.personaRef
  if (typeof personaRef === 'string') base.personaId = personaRef
  if (edge.targetLocalId) base[typeField] = edge.targetLocalId
  if (typeof edge.confidence === 'number') base.confidence = fromMilli(edge.confidence)
  return base
}

/** Rebuilds an event interpretation from its LayersAnnotation. */
function readInterpretation(annotation: WorldAnnotationRow): Record<string, unknown> {
  const features = entriesOf(annotation.features)
  const base = residualObject(features)
  const personaRef = readFeature(features, KEY_PERSONA_REF)
  if (personaRef !== null) base.personaId = personaRef
  if (annotation.ontologyTypeRefId) base.eventTypeId = annotation.ontologyTypeRefId
  const participants: Array<Record<string, unknown>> = []
  if (Array.isArray(annotation.arguments)) {
    for (const arg of annotation.arguments) {
      if (!arg || typeof arg !== 'object') continue
      const role = (arg as { role?: unknown }).role
      const entityId = (arg as { target?: { localId?: { value?: unknown } } }).target?.localId?.value
      participants.push({
        entityId: typeof entityId === 'string' ? entityId : '',
        roleTypeId: typeof role === 'string' ? role : '',
      })
    }
  }
  base.participants = participants
  if (typeof annotation.confidence === 'number') base.confidence = fromMilli(annotation.confidence)
  return base
}

/**
 * Reconstructs the WorldState aggregate from its native layers rows.
 *
 * @param rows - the world nodes, edges, clusters, and annotations in one scope
 * @returns the reconstructed WorldState aggregate
 */
export function layersToWorldState(rows: WorldLayersRows): WorldStateAggregate {
  const aggregate = emptyWorldState()

  // Index the annotations by the node they denote.
  const annotationsByNode = new Map<string, WorldAnnotationRow[]>()
  for (const annotation of rows.annotations) {
    if (!annotation.denotesNodeId) continue
    const list = annotationsByNode.get(annotation.denotesNodeId) ?? []
    list.push(annotation)
    annotationsByNode.set(annotation.denotesNodeId, list)
  }

  // Index the type-assignment edges by the object they are incident to.
  const assignmentsByObject = new Map<string, WorldEdgeRow[]>()
  for (const edge of rows.edges) {
    const role = readFeature(entriesOf(edge.properties), KEY_EDGE_ROLE)
    if (role !== EDGE_ROLE_TYPE_ASSIGNMENT) continue
    const key = edge.sourceLocalId ?? ''
    const list = assignmentsByObject.get(key) ?? []
    list.push(edge)
    assignmentsByObject.set(key, list)
  }
  const assignmentsFor = (objectId: string): Record<string, unknown>[] =>
    (assignmentsByObject.get(objectId) ?? [])
      .slice()
      .sort((a, b) => ordinalOf(entriesOf(a.properties)) - ordinalOf(entriesOf(b.properties)))
      .map(readTypeAssignment)

  // Reconstruct time nodes first so time collections can dereference them.
  const timeById = new Map<string, Record<string, unknown>>()
  const entityStaged: Array<{ ordinal: number; object: Record<string, unknown> }> = []
  const eventStaged: Array<{ ordinal: number; object: Record<string, unknown> }> = []
  const timeStaged: Array<{ ordinal: number; object: Record<string, unknown> }> = []

  for (const node of rows.nodes) {
    const entries = entriesOf(node.properties)
    const ordinal = ordinalOf(entries)
    const denoting = annotationsByNode.get(node.id) ?? []

    if (node.nodeType === 'time') {
      const object = residualObject(entries)
      object.id = node.id
      const type = readFeature(entries, KEY_TIME_TYPE)
      if (type !== null) object.type = type
      const temporalAnn = denoting.find((a) => a.label === 'time' || a.temporal !== null)
      if (temporalAnn) Object.assign(object, readTemporal(temporalAnn, type))
      timeById.set(node.id, object)
      timeStaged.push({ ordinal, object })
      continue
    }

    if (node.nodeType === 'entity' || node.nodeType === 'location') {
      const object = residualObject(entries)
      object.id = node.id
      if (node.label !== null) object.name = node.label
      const grounds = recoverGroundings(node.knowledgeRefs)
      if (grounds.wikidataId) object.wikidataId = grounds.wikidataId
      if (grounds.wikidataUrl) object.wikidataUrl = grounds.wikidataUrl
      if (grounds.wikibaseId) object.wikibaseId = grounds.wikibaseId
      const assignments = assignmentsFor(node.id)
      if (assignments.length > 0) object.typeAssignments = assignments
      if (node.nodeType === 'location') {
        const locationType = readFeature(entries, KEY_LOC_TYPE)
        if (locationType !== null) object.locationType = locationType
        const system = readFeature(entries, KEY_LOC_SYSTEM)
        if (system !== null) object.coordinateSystem = system
        const spatialAnn = denoting.find((a) => a.label === 'location' || a.spatial !== null)
        if (spatialAnn) {
          const coordinates = readSpatialCoordinates(spatialAnn, system)
          if (coordinates) object.coordinates = coordinates
        }
      }
      entityStaged.push({ ordinal, object })
      continue
    }

    if (node.nodeType === 'situation') {
      const object = residualObject(entries)
      object.id = node.id
      if (node.label !== null) object.name = node.label
      const grounds = recoverGroundings(node.knowledgeRefs)
      if (grounds.wikidataId) object.wikidataId = grounds.wikidataId
      if (grounds.wikidataUrl) object.wikidataUrl = grounds.wikidataUrl
      if (grounds.wikibaseId) object.wikibaseId = grounds.wikibaseId
      const confidence = (node.metadata as { confidence?: unknown } | null)?.confidence
      if (typeof confidence === 'number') {
        const metadata =
          object.metadata && typeof object.metadata === 'object' && !Array.isArray(object.metadata)
            ? (object.metadata as Record<string, unknown>)
            : {}
        metadata.certainty = fromMilli(confidence)
        object.metadata = metadata
      }
      const interpretations = denoting
        .filter((a) => a.label === 'interpretation' || a.ontologyTypeRefId !== null)
        .map(readInterpretation)
      if (interpretations.length > 0) object.personaInterpretations = interpretations
      eventStaged.push({ ordinal, object })
      continue
    }
  }

  entityStaged.sort((a, b) => a.ordinal - b.ordinal)
  eventStaged.sort((a, b) => a.ordinal - b.ordinal)
  timeStaged.sort((a, b) => a.ordinal - b.ordinal)
  aggregate.entities = entityStaged.map((s) => s.object)
  aggregate.events = eventStaged.map((s) => s.object)
  aggregate.times = timeStaged.map((s) => s.object)

  // Collections from ClusterSets.
  const collectionStaged: Record<
    WorldCollectionBucket,
    Array<{ ordinal: number; object: Record<string, unknown> }>
  > = { entityCollections: [], eventCollections: [], timeCollections: [] }

  for (const clusterSet of rows.clusters) {
    const bucket = worldClusterBucket(clusterSet)
    if (bucket === null) continue
    const first = asArray(clusterSet.clusters)[0]
    if (!first) continue
    const features = entriesOf(first.features)
    const object = residualObject(features)
    object.id = clusterSet.id
    const canonicalLabel = first.canonicalLabel
    if (typeof canonicalLabel === 'string') object.name = canonicalLabel
    object.collectionType = clusterSet.kind
    const memberIds = asArray(first.members)
      .map((m) => (m as { localId?: { value?: unknown } }).localId?.value)
      .filter((id): id is string => typeof id === 'string')

    const assignments = assignmentsFor(clusterSet.id)
    if (assignments.length > 0) object.typeAssignments = assignments

    if (bucket === 'entityCollections') object.entityIds = memberIds
    else if (bucket === 'eventCollections') object.eventIds = memberIds
    else object.times = memberIds.map((id) => timeById.get(id) ?? { id })

    collectionStaged[bucket].push({ ordinal: ordinalOf(features), object })
  }
  for (const bucket of ['entityCollections', 'eventCollections', 'timeCollections'] as const) {
    aggregate[bucket] = collectionStaged[bucket].sort((a, b) => a.ordinal - b.ordinal).map((s) => s.object)
  }

  // Relations from the relation-tagged edges.
  const relationStaged: Array<{ ordinal: number; object: Record<string, unknown> }> = []
  for (const edge of rows.edges) {
    const entries = entriesOf(edge.properties)
    if (readFeature(entries, KEY_EDGE_ROLE) !== EDGE_ROLE_RELATION) continue
    const object = residualObject(entries)
    object.id = edge.id
    object.relationTypeId = edge.edgeType
    if (edge.sourceLocalId) object.sourceId = edge.sourceLocalId
    if (edge.targetLocalId) object.targetId = edge.targetLocalId
    const sourceType = readFeature(entries, KEY_SOURCE_TYPE)
    if (sourceType !== null) object.sourceType = sourceType
    const targetType = readFeature(entries, KEY_TARGET_TYPE)
    if (targetType !== null) object.targetType = targetType
    relationStaged.push({ ordinal: ordinalOf(entries), object })
  }
  aggregate.relations = relationStaged.sort((a, b) => a.ordinal - b.ordinal).map((s) => s.object)

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
