/**
 * The FOVEA world surface as `@panproto/core` lens specifications plus an
 * executable composition that distributes a WorldState aggregate to its layers
 * rows.
 *
 * A WorldState aggregate projects onto several layers records: a
 * `pub.layers.graph.graphNode` per entity/location/situation/time, a
 * `pub.layers.graph.graphEdge` per relation, a `pub.layers.annotation.clusterSet`
 * per collection, and a scope-scaffold layer of `LayersAnnotation`s that carry the
 * world-denoting values — a Time's `temporalExpression`, a Location's
 * `spatialExpression`, an Event's interpretation, an object's type assignments,
 * and each object's stand-off description gloss. {@link composeWorldToProjection}
 * builds all of them and wires the cross-record references (the denoted node, the
 * relation endpoints, the collection membership, the gloss parentage) by
 * deterministic id from {@link ../layers-id-map}.
 *
 * The structural value transforms at the surface's core are authored as panproto
 * lens documents so their bidirectional laws and native-ness are verified against
 * the schema graph: {@link NODE_LABEL_RENAME_LENS_DOC} renames an object's `name`
 * to a GraphNode `label`; {@link TEMPORAL_VALUE_REGROUP_LENS_DOC},
 * {@link EDGE_ENDPOINT_REGROUP_LENS_DOC}, and {@link CLUSTER_MEMBER_REGROUP_LENS_DOC}
 * regroup flat scalars into the nested `temporalEntity`, `objectRef`, and cluster
 * member records. The rename is a fully native, both-laws lens; the nested
 * regroups are native and satisfy get/put but — over string-valued leaves under
 * `@panproto/core` 0.65.0 — do not satisfy put/get (the same regroup over integer
 * leaves does, as the video keyframe regroup shows). {@link buildWorldLens}
 * reports each lens's measured law and requirement signals. Because 0.65.0 does
 * not surface a value-transform lens's output to JavaScript, the composition is
 * the executable image of these specifications and reproduces, row for row, the
 * hand-rolled world mapper the parity test checks against.
 *
 * @module
 */

import { z } from 'zod'

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'

import {
  worldScaffoldExpressionId,
  worldScaffoldLayerId,
  worldNodeAnnotationId,
  worldInterpretationAnnotationId,
  worldTypeAssignmentAnnotationId,
  worldCollectionDescriptionAnnotationId,
  worldGlossRefAnnotationId,
} from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type {
  WorldStateAggregate,
  WorldLayersScope,
  WorldLayersProjection,
  MappedWorldNode,
  MappedWorldEdge,
  MappedWorldCluster,
  MappedWorldScaffold,
  MappedWorldAnnotation,
} from '../world-layers-mapper.js'

// --------------------------------------------------------------------------
// FOVEA world source view-models (the lens sources)
// --------------------------------------------------------------------------

/**
 * The Zod schema for a world node's naming core — the shape the label rename lens
 * binds to. An entity or event carries a display `name`; the GraphNode carries it
 * as `label`. The rename is a fully native, both-laws-holding lens over this
 * shape.
 */
export const worldNodeSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
})

/**
 * The Zod schema for a Time's calendar core — the flat ISO-datetime scalars the
 * temporal value regroup nests under a `temporalEntity`. The regroup is native and
 * holds get/put; its put/get law does not hold over these string leaves under the
 * installed `@panproto/core` (see {@link buildWorldLens}).
 */
export const temporalValueSourceSchema = z.object({
  instant: z.string(),
  intervalStart: z.string(),
  intervalEnd: z.string(),
  earliest: z.string(),
  latest: z.string(),
  granularity: z.string(),
})

/**
 * The Zod schema for a relation's endpoint core — the flat `sourceId`/`targetId`
 * the edge-endpoint regroup nests into `objectRef` records. Native, holds get/put;
 * put/get does not hold over the string leaves (see {@link buildWorldLens}).
 */
export const edgeEndpointSourceSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
})

/**
 * The Zod schema for a collection's membership core — an array of flat member id
 * carriers the cluster-member regroup nests into per-item `objectRef` records. The
 * regroup anchors at the member item vertex; native, holds get/put, put/get does
 * not hold over the string leaf.
 */
export const clusterMemberSourceSchema = z.object({
  id: z.string(),
  members: z.array(z.object({ value: z.string() })),
})

// --------------------------------------------------------------------------
// Lens documents (the verified specifications of the structural transforms)
// --------------------------------------------------------------------------

/**
 * The label rename: a world object's `name` becomes the GraphNode `label`. A pure
 * structural rename, native (empty complement requirement) and lawful in both
 * directions over the string leaf.
 */
export const NODE_LABEL_RENAME_LENS_DOC = {
  id: 'fovea.world.node-label.v1',
  source: 'fovea.world.node',
  target: 'pub.layers.graph.graphNode',
  steps: [{ rename_field: { old: 'name', new: 'label' } }],
} as const

/** The body vertex the label rename binds to: the node record root. */
export const NODE_LABEL_RENAME_BODY_VERTEX = 'root'

/**
 * The temporal value regroup: a Time's flat calendar scalars are gathered into a
 * nested `temporalEntity` under `value`. Native and get/put-lawful; its put/get
 * law does not hold over the string leaves under `@panproto/core` 0.65.0.
 */
export const TEMPORAL_VALUE_REGROUP_LENS_DOC = {
  id: 'fovea.world.temporal-value.v1',
  source: 'fovea.world.time',
  target: 'pub.layers.defs.temporalExpression',
  steps: [
    {
      compute_field: {
        target: 'value',
        expr:
          '{ instant = instant, intervalStart = intervalStart, intervalEnd = intervalEnd, earliest = earliest, latest = latest, granularity = granularity }',
      },
    },
  ],
} as const

/** The body vertex the temporal value regroup binds to: the time record root. */
export const TEMPORAL_VALUE_REGROUP_BODY_VERTEX = 'root'

/**
 * The edge-endpoint regroup: a relation's flat `sourceId`/`targetId` are nested
 * into `objectRef` records. Native and get/put-lawful; put/get does not hold over
 * the string leaves under `@panproto/core` 0.65.0.
 */
export const EDGE_ENDPOINT_REGROUP_LENS_DOC = {
  id: 'fovea.world.edge-endpoints.v1',
  source: 'fovea.world.relation',
  target: 'pub.layers.graph.graphEdge',
  steps: [
    { compute_field: { target: 'source', expr: '{ localId = { value = sourceId } }' } },
    { compute_field: { target: 'target', expr: '{ localId = { value = targetId } }' } },
  ],
} as const

/** The body vertex the edge-endpoint regroup binds to: the relation record root. */
export const EDGE_ENDPOINT_REGROUP_BODY_VERTEX = 'root'

/**
 * The cluster-member regroup: each flat member id carrier is nested into an
 * `objectRef` at the member item vertex. Native and get/put-lawful; put/get does
 * not hold over the string leaf under `@panproto/core` 0.65.0.
 */
export const CLUSTER_MEMBER_REGROUP_LENS_DOC = {
  id: 'fovea.world.cluster-members.v1',
  source: 'fovea.world.collection',
  target: 'pub.layers.annotation.clusterSet',
  steps: [{ compute_field: { target: 'localId', expr: '{ value = value }' } }],
} as const

/** The body vertex the cluster-member regroup binds to: each member array item. */
export const CLUSTER_MEMBER_REGROUP_BODY_VERTEX = 'root.members:items'

/** A compiled world lens with its schema-independent chain and measured signals. */
export interface WorldLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the view-model source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** Whether the get/put round-trip law holds for the sample record. */
  getPutHolds: boolean
  /** Whether the put/get round-trip law holds for the sample record. */
  putGetHolds: boolean
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles a world lens document against its source schema and measures its
 * native-ness (complement-requirement kind) and its get/put and put/get laws over
 * a representative record.
 *
 * @param doc - the lens document to compile
 * @param bodyVertex - the vertex the transform anchors at
 * @param schema - the FOVEA source view-model the lens binds to
 * @param sampleRecord - a representative source record for the law checks
 * @returns the compiled chain, the instantiated lens, and its measured signals
 */
export async function buildWorldLens(
  doc: unknown,
  bodyVertex: string,
  schema: z.ZodType,
  sampleRecord: unknown,
): Promise<WorldLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(schema)
  const chain = p.compileLensDocument(doc as never, bodyVertex)
  const lens = chain.instantiate(source)
  const bytes = p.parseJson(source, JSON.stringify(sampleRecord))._bytes
  return {
    chain,
    lens,
    requirementKind: chain.requirements(source).kind,
    getPutHolds: lens.checkGetPut(bytes).holds,
    putGetHolds: lens.checkPutGet(bytes).holds,
    fieldTransforms: chain.fieldTransforms(),
  }
}

// --------------------------------------------------------------------------
// Shared readers (the executable image's small helpers)
// --------------------------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
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

/** A single featureMap entry. */
interface FeatureEntry {
  key: string
  value: string
}

/** Wraps feature entries in a featureMap, or null when empty. */
function featureMap(entries: FeatureEntry[]): { entries: FeatureEntry[] } | null {
  return entries.length > 0 ? { entries } : null
}

/**
 * Encodes an object's open, unstructured leftover — the fields the native
 * projection did not consume — as flat featureMap entries: one entry per
 * top-level field, keyed by the field name, valued as its JSON.
 */
function openExtensionEntries(leftover: Record<string, unknown>): FeatureEntry[] {
  const entries: FeatureEntry[] = []
  for (const [key, value] of Object.entries(leftover)) {
    if (value === undefined) continue
    entries.push({ key, value: JSON.stringify(value) })
  }
  return entries
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

// --- knowledge refs ----------------------------------------------------------

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** The reserved knowledgeRef source label the native projection owns. */
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

// --- gloss stand-off ---------------------------------------------------------

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

/** The argumentRef roles a world annotation uses. */
const ROLE_PERSONA = 'persona'
const ROLE_SUBJECT = 'subject'
const ROLE_DENOTES = 'denotes'

/** Flat gloss-reference feature keys. */
const KEY_REF_TYPE = 'refType'
const KEY_REF_PERSONA_ID = 'refPersonaId'
const KEY_REF_CLAIM_ID = 'refClaimId'

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

// --- temporal value objects --------------------------------------------------

/** The FOVEA temporal granularities with a layers `temporalEntity.granularity` slug. */
const GRANULARITIES = new Set(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'])

/**
 * Builds the temporalExpression value a Time projects onto its presence
 * annotation, modeling the deep temporal constructs with their typed layers
 * value-objects: the calendar value on `temporalEntity`, vagueness on
 * `temporalModifier.mod` plus `earliest`/`latest`/`granularity`, and a deictic
 * reference on `anchorRef`. This is the executable image of
 * {@link TEMPORAL_VALUE_REGROUP_LENS_DOC} extended with the vagueness and deictic
 * moves the composition owns.
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

// --- spatial value objects ---------------------------------------------------

/** Maps a FOVEA coordinate system to a layers `spatialEntity.crs` slug. */
function crsForSystem(system: string | null): string {
  if (system === 'cartesian') return 'pixel'
  if (system === 'relative') return 'percentage'
  return 'wgs84'
}

/** Orders a coordinate object into a numeric tuple per the coordinate system. */
function orderedCoordinates(coordinates: Record<string, unknown>, system: string | null): number[] {
  const ordered =
    system === 'cartesian' || system === 'relative'
      ? [coordinates.x, coordinates.y, coordinates.z]
      : [coordinates.latitude, coordinates.longitude, coordinates.altitude]
  return ordered.filter((v): v is number => typeof v === 'number')
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

// --- type assignments --------------------------------------------------------

/** The presence-annotation label marking a type assignment. */
const LABEL_TYPE_ASSIGNMENT = 'type-assignment'

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
    const personaId = typeof raw.personaId === 'string' ? raw.personaId : ''
    const typeId = typeof raw[typeField] === 'string' ? (raw[typeField] as string) : ''
    const args: Array<Record<string, unknown>> = [{ role: ROLE_PERSONA, target: localRef(personaId) }]
    if (denotesNodeId === null) args.push({ role: ROLE_SUBJECT, target: localRef(subjectId) })
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
      confidence: typeof raw.confidence === 'number' ? toMilli(raw.confidence) : null,
      features: featureMap(openExtensionEntries(leftover)),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

// --------------------------------------------------------------------------
// The executable composition (FOVEA aggregate -> layers projection rows)
// --------------------------------------------------------------------------

/** Presence-annotation labels marking a node's world membership and kind. */
const LABEL_ENTITY = 'entity'
const LABEL_LOCATION = 'location'
const LABEL_SITUATION = 'situation'
const LABEL_TIME = 'time'
const LABEL_COLLECTION_TIME = 'collection-time'
const LABEL_INTERPRETATION = 'interpretation'
const LABEL_COLLECTION_DESCRIPTION = 'collection-description'

/** The flat edge-property marking a graph edge as a world-model relation. */
const KEY_WORLD_ROLE = 'worldRole'
const WORLD_ROLE_RELATION = 'relation'
const KEY_SOURCE_KIND = 'sourceKind'
const KEY_TARGET_KIND = 'targetKind'

/** Flat cluster-feature keys recording a collection's bucket and member field. */
const KEY_BUCKET = 'bucket'
const KEY_MEMBER_FIELD = 'memberField'

/**
 * Distributes a WorldState aggregate to its native layers projection rows: a
 * GraphNode per entity/location/situation/time, a GraphEdge per relation, a
 * ClusterSet per collection, the scope scaffold, and the world-denoting
 * LayersAnnotations (presence with its temporal/spatial/gloss value, type
 * assignments, interpretations, gloss reference children). This is the executable
 * image of the world lens specifications extended with the record framing and
 * cross-record wiring the composition owns; it reproduces the hand-rolled world
 * mapper row for row.
 *
 * @param world - the WorldState aggregate to project
 * @param scope - the scope columns every produced row carries
 * @returns the nodes, edges, clusters, scaffold, and annotations to persist
 */
export function composeWorldToProjection(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
): WorldLayersProjection {
  const nodes: MappedWorldNode[] = []
  const edges: MappedWorldEdge[] = []
  const clusters: MappedWorldCluster[] = []
  const annotations: MappedWorldAnnotation[] = []
  const layerId = worldScaffoldLayerId(scope.createdByUserId, scope.projectId)
  const materializedTimeIds = new Set<string>()

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

    annotations.push(
      ...typeAssignmentAnnotations(id, id, asArray(entity.typeAssignments), 'entityTypeId', layerId, scope),
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

  asArray(world.times).forEach((time) => pushTime(time, LABEL_TIME))

  // Collections -> ClusterSets bound to the world scaffold expression.
  const expressionId = worldScaffoldExpressionId(scope.createdByUserId, scope.projectId)
  const collectionBucket = (
    bucket: 'entityCollections' | 'eventCollections' | 'timeCollections',
    idFields: Array<'entityIds' | 'eventIds' | 'members'>,
    typeField: 'entityTypeId' | 'eventTypeId',
  ): void => {
    const candidates = bucket === 'timeCollections' ? (['times', 'members'] as const) : idFields
    asArray(world[bucket]).forEach((collection) => {
      const id = stringField(collection, 'id')
      if (id === null) return
      const canonicalLabel = stringField(collection, 'name')
      const memberField = candidates.find((f) => Array.isArray(collection[f])) ?? candidates[0]

      let members: ObjectRef[] = []
      if (memberField === 'times') {
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
