/**
 * The FOVEA world surface as bidirectional `@panproto/core` lenses plus a
 * multi-record composition and a record↔row adapter.
 *
 * A WorldState aggregate splits into many layers records: a
 * `pub.layers.graph.graphNode` per entity/location/situation/time, a
 * `pub.layers.graph.graphEdge` per relation, a `pub.layers.catalog.collection` plus
 * one `pub.layers.catalog.membership` per member for each collection (built by
 * {@link worldCollectionsToCatalog}), and a scope-scaffold layer of
 * `LayersAnnotation`s that carry the
 * world-denoting values — a node's presence, its type assignments, an event's
 * interpretations, and each object's stand-off description gloss. Splitting one
 * aggregate into those records, and regrouping those records back into one
 * aggregate, is the composition's job; every per-record value/structure transform
 * within a record is a lens, run in both directions through `getJson`.
 *
 * The forward lenses (fovea view-model -> layers record) each carry one transform:
 *
 *   - {@link WORLD_NODE_LABEL_LENS_DOC} renames a world object's `name` to the
 *     GraphNode `label`;
 *   - {@link WORLD_CONFIDENCE_LENS_DOC} scales a 0-1 confidence float to the
 *     layers-native 0-1000 integer;
 *   - {@link WORLD_EDGE_ENDPOINT_LENS_DOC} regroups a relation's flat endpoints into
 *     nested `objectRef` records;
 *   - {@link WORLD_GLOSS_TEXT_LENS_DOC} folds a description gloss's segments into the
 *     presence text;
 *   - {@link WORLD_GEOMETRY_POINT_LENS_DOC} / {@link WORLD_GEOMETRY_POLYGON_LENS_DOC}
 *     render a Location's ordered coordinate tuple(s) into a WKT `POINT`/`POLYGON`;
 *   - {@link WORLD_KNOWLEDGE_REFS_LENS_DOC} builds a node's `knowledgeRefs` list from
 *     its wikidata/wikibase/externalIds groundings;
 *   - {@link WORLD_TEMPORAL_LENS_DOC} builds a Time's `temporalExpression` value
 *     (calendar `value`, deictic `anchorRef`/`features`, and `type`) from the flat,
 *     nullable-present temporal fields, and {@link WORLD_TEMPORAL_MODIFIER_LENS_DOC}
 *     builds its `temporalModifier` (whose reserved-keyword `mod` field a
 *     `compute_field` cannot construct, so it is reached by `rename_field`);
 *   - {@link WORLD_GLOSS_OFFSETS_LENS_DOC} folds a gloss's segments into their running
 *     UTF-8 byte offsets by a record-accumulator scan;
 *   - {@link WORLD_OPEN_PROPERTIES_LENS_DOC} carries an object's open extension —
 *     already quantized to featureMap-native `{ key, value }` entries at ingress — into
 *     the target `featureMap`, a lossless passthrough with both round-trip laws.
 *
 * The backward lenses (layers record -> fovea view-model) invert the invertible
 * scalar/structure transforms on `getJson`: {@link WORLD_NODE_LABEL_BACK_LENS_DOC}
 * un-renames `label` to `name` and {@link WORLD_CONFIDENCE_BACK_LENS_DOC} descales the
 * 0-1000 integer to a 0-1 float. Each holds both round-trip laws;
 * the backward direction runs the reverse-authored lens's `getJson` rather than the
 * forward lens's `putJson`, since on `@panproto/core@0.66.0` the JSON `putJson`
 * restore path does not apply a step's inverse and reorders array elements.
 *
 * {@link composeWorldToProjection} owns only what a single lens cannot: the
 * multi-record framing and the cross-record wiring by deterministic id (the denoted
 * node, the relation endpoints, the gloss parentage), and it delegates the
 * collection catalog records to {@link worldCollectionsToCatalog}.
 * {@link layersToWorldStateViaLens} is its inverse: it regroups the rows back into
 * one aggregate — indexing annotations by the node they denote, assembling a gloss
 * from its parent text and reference children, and rebuilding collections from their
 * catalog collection and memberships — while routing the invertible value transforms through the backward
 * lenses. The value-object *deserializations* that have no independent complement
 * (parsing a WKT geometry string, reading a `temporalExpression` back to a Time,
 * `JSON.parse` of an open-extension entry, and rebuilding the dynamic-key
 * `externalIds` map) stay at this egress boundary.
 *
 * @module
 */

import { z } from 'zod'

import type { GlossItem } from '@models/types.js'
import type { ObjectRef } from '@fovea/layers-schema'
import type { BuiltSchema, LensHandle, ProtolensChainHandle } from '@panproto/core'

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
import { worldCollectionsToCatalog } from './world-collection-catalog.js'
import {
  emptyWorldState,
  type WorldStateAggregate,
  type WorldLayersScope,
  type WorldLayersProjection,
  type WorldLayersRows,
  type WorldNodeRow,
  type WorldEdgeRow,
  type WorldAnnotationRow,
  type MappedWorldNode,
  type MappedWorldEdge,
  type MappedCatalogMembership,
  type MappedWorldScaffold,
  type MappedWorldAnnotation,
} from '../world-model.js'

// --------------------------------------------------------------------------
// FOVEA world source view-models (the lens sources)
// --------------------------------------------------------------------------

/**
 * The Zod schema for a world object's naming core — the shape the label rename lens
 * binds to. An entity, event, or location carries a display `name`; the GraphNode
 * carries it as `label`. Native and lawful in both directions over the string leaf.
 */
export const worldNodeSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
})

/**
 * The Zod schema the backward label lens binds to: a GraphNode carrying `label`,
 * which the un-rename turns back into the world object's `name`.
 */
export const worldNodeLabelSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
})

/**
 * The Zod schema for a confidence scalar — the 0-1 float the confidence scale lens
 * maps to the layers-native 0-1000 integer. Native and lawful in both directions.
 */
export const confidenceSourceSchema = z.object({
  confidence: z.number(),
})

/**
 * The Zod schema for a relation's endpoint core — the flat `sourceId`/`targetId`
 * the edge-endpoint regroup nests into `objectRef` records.
 */
export const edgeEndpointSourceSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
})

/**
 * The Zod schema for a description gloss's segment contents — the shape the gloss
 * text fold binds to. The lens joins the segment contents into the presence text.
 */
export const glossTextSourceSchema = z.object({
  segments: z.array(z.object({ content: z.string() })),
})

/**
 * The Zod schema for a point Location's ordered coordinate tuple — the numeric home
 * (native to the source) the geometry lens renders into a WKT `POINT`. The ingress
 * orders the coordinates per the coordinate system; the lens formats each element,
 * branching on `int`/`float` so the string matches the world mapper's `String()`.
 */
export const geometryPointSourceSchema = z.object({
  coords: z.array(z.number()),
})

/**
 * The Zod schema for an extent Location's boundary ring — the numeric home the
 * geometry lens renders into a WKT `POLYGON`.
 */
export const geometryPolygonSourceSchema = z.object({
  ring: z.array(z.array(z.number())),
})

/**
 * The Zod schema for a node's grounding refs — the source-native, featureMap-adjacent
 * home for wikidata/wikibase/externalIds groundings the knowledgeRefs lens builds a
 * `knowledgeRef` list from. `uri`/`label` are nullable-present so the lens guards them
 * by `is_null` (an absent optional field would be unbound at the record root).
 */
export const knowledgeRefsSourceSchema = z.object({
  refs: z.array(
    z.object({
      source: z.string(),
      identifier: z.string(),
      uri: z.string().nullable(),
      label: z.string().nullable(),
    }),
  ),
})

/**
 * The Zod schema for an object's open extension — the fields with no first-class
 * native home, quantized once at ingress to featureMap-native `{ key, value }` string
 * entries. The lens carries them into the target `featureMap` losslessly, so both
 * round-trip laws hold and the mapping never stashes a JSON blob mid-lens.
 */
export const openPropertiesSourceSchema = z.object({
  openProperties: z.array(z.object({ key: z.string(), value: z.string() })),
})

/**
 * The Zod schema for a Time's flat, nullable-present temporal fields — the source
 * home the temporal lens assembles into a `temporalExpression` value. Every optional
 * calendar/vagueness/deictic field is present with a `null` sentinel so the lens can
 * guard it by `is_null`; the ingress filters the granularity to the valid slug set
 * and resolves the deictic scalars, so the lens only assembles.
 */
export const temporalSourceSchema = z.object({
  isInterval: z.boolean(),
  instant: z.string().nullable(),
  intervalStart: z.string().nullable(),
  intervalEnd: z.string().nullable(),
  earliest: z.string().nullable(),
  latest: z.string().nullable(),
  typical: z.string().nullable(),
  granularity: z.string().nullable(),
  anchorType: z.string().nullable(),
  deicticAnchorTime: z.string().nullable(),
  deicticExpression: z.string().nullable(),
})

/**
 * The Zod schema for a Time's vagueness modifier — the `mod` slug and its optional
 * description. `modKw` is a real source field so `rename_field` can rename it to the
 * target's reserved-keyword `mod` key, which a `compute_field` expression cannot
 * construct.
 */
export const temporalModifierSourceSchema = z.object({
  modKw: z.string(),
  modDescription: z.string().nullable(),
})

/**
 * The Zod schema for a gloss's segments — the shape the byte-offset scan folds into
 * running UTF-8 byte offsets. The parallel UTF-16 char offsets are computed at the
 * boundary, since panproto's `len` is UTF-8 byte length with no char-count builtin.
 */
export const glossOffsetsSourceSchema = z.object({
  segments: z.array(z.object({ content: z.string() })),
})

// --------------------------------------------------------------------------
// Forward lens documents (fovea view-model -> layers record)
// --------------------------------------------------------------------------

/** Renders one numeric coordinate as a string, matching `String()` on int vs float. */
const NUM_TO_STR = '(\\c -> if type_of c == "int" then int_to_str c else float_to_str c)'

/** The label rename: a world object's `name` becomes the GraphNode `label`. */
export const WORLD_NODE_LABEL_LENS_DOC = {
  id: 'fovea.world.node-label.v1',
  source: 'fovea.world.node',
  target: 'pub.layers.graph.graphNode',
  steps: [{ rename_field: { old: 'name', new: 'label' } }],
} as const

/** The body vertex the label rename binds to: the node record root. */
export const WORLD_NODE_LABEL_BODY_VERTEX = 'root'

/**
 * The confidence scale: a 0-1 float becomes the layers-native 0-1000 integer by
 * `clamp (floor (x * 1000 + 0.5)) 0 1000`, mirroring the half-up rounding and
 * [0,1000] clamp of the world mapper's `toMilli`.
 */
export const WORLD_CONFIDENCE_LENS_DOC = {
  id: 'fovea.world.confidence.v1',
  source: 'fovea.world.confidence',
  target: 'pub.layers.x',
  steps: [{ compute_field: { target: 'confidence', expr: 'clamp (floor (confidence * 1000.0 + 0.5)) 0 1000' } }],
} as const

/** The body vertex the confidence scale binds to: the scalar record root. */
export const WORLD_CONFIDENCE_BODY_VERTEX = 'root'

/** The edge-endpoint regroup: flat `sourceId`/`targetId` nest into `objectRef`s. */
export const WORLD_EDGE_ENDPOINT_LENS_DOC = {
  id: 'fovea.world.edge-endpoints.v1',
  source: 'fovea.world.relation',
  target: 'pub.layers.graph.graphEdge',
  steps: [
    { compute_field: { target: 'source', expr: '{ localId = { value = sourceId } }' } },
    { compute_field: { target: 'target', expr: '{ localId = { value = targetId } }' } },
  ],
} as const

/** The body vertex the edge-endpoint regroup binds to: the relation record root. */
export const WORLD_EDGE_ENDPOINT_BODY_VERTEX = 'root'

/** The gloss text fold: a description gloss's segment contents join into the text. */
export const WORLD_GLOSS_TEXT_LENS_DOC = {
  id: 'fovea.world.gloss-text.v1',
  source: 'fovea.world.gloss',
  target: 'pub.layers.x',
  steps: [{ compute_field: { target: 'text', expr: 'join (map (\\s -> s.content) segments) ""' } }],
} as const

/** The body vertex the gloss text fold binds to: the gloss record root. */
export const WORLD_GLOSS_TEXT_BODY_VERTEX = 'root'

/** The point geometry: an ordered coordinate tuple renders into a WKT `POINT`. */
export const WORLD_GEOMETRY_POINT_LENS_DOC = {
  id: 'fovea.world.geometry-point.v1',
  source: 'fovea.world.point',
  target: 'pub.layers.defs.spatialEntity',
  steps: [
    {
      compute_field: {
        target: 'geometry',
        expr: `concat "POINT(" (concat (join (map ${NUM_TO_STR} coords) " ") ")")`,
      },
    },
  ],
} as const

/** The body vertex the point geometry binds to: the coordinate record root. */
export const WORLD_GEOMETRY_POINT_BODY_VERTEX = 'root'

/** The polygon geometry: a boundary ring renders into a WKT `POLYGON`. */
export const WORLD_GEOMETRY_POLYGON_LENS_DOC = {
  id: 'fovea.world.geometry-polygon.v1',
  source: 'fovea.world.polygon',
  target: 'pub.layers.defs.spatialEntity',
  steps: [
    {
      compute_field: {
        target: 'geometry',
        expr: `concat "POLYGON((" (concat (join (map (\\pt -> join (map ${NUM_TO_STR} pt) " ") ring) ", ") "))")`,
      },
    },
  ],
} as const

/** The body vertex the polygon geometry binds to: the ring record root. */
export const WORLD_GEOMETRY_POLYGON_BODY_VERTEX = 'root'

/**
 * The knowledgeRefs build: a node's groundings become `knowledgeRef` value-objects,
 * carrying the optional `uri`/`label` only when present (guarded by `is_null`).
 */
export const WORLD_KNOWLEDGE_REFS_LENS_DOC = {
  id: 'fovea.world.knowledge-refs.v1',
  source: 'fovea.world.groundings',
  target: 'pub.layers.graph.graphNode',
  steps: [
    {
      compute_field: {
        target: 'knowledgeRefs',
        expr:
          'map (\\e -> merge { source = e.source, identifier = e.identifier } (merge (if is_null e.uri then {} else { uri = e.uri }) (if is_null e.label then {} else { label = e.label }))) refs',
      },
    },
  ],
} as const

/** The body vertex the knowledgeRefs build binds to: the groundings record root. */
export const WORLD_KNOWLEDGE_REFS_BODY_VERTEX = 'root'

/** The open-extension passthrough: quantized `{ key, value }` entries into a featureMap. */
export const WORLD_OPEN_PROPERTIES_LENS_DOC = {
  id: 'fovea.world.open-properties.v1',
  source: 'fovea.world.open',
  target: 'pub.layers.defs.featureMap',
  steps: [{ compute_field: { target: 'properties', expr: '{ entries = openProperties }' } }],
} as const

/** The body vertex the open-extension passthrough binds to: the open record root. */
export const WORLD_OPEN_PROPERTIES_BODY_VERTEX = 'root'

/** The calendar `value` singletons a Time projects, merged and omitted when empty. */
const TEMPORAL_VALUE_BASE =
  'merge (if is_null instant then {} else { instant = instant }) (merge (if is_null intervalStart then {} else { intervalStart = intervalStart }) (merge (if is_null intervalEnd then {} else { intervalEnd = intervalEnd }) (merge (if is_null earliest then {} else { earliest = earliest }) (merge (if is_null latest then {} else { latest = latest }) (if is_null granularity then {} else { granularity = granularity })))))'
const TEMPORAL_VALUE_WITH_FEATURES = `merge (${TEMPORAL_VALUE_BASE}) (if is_null typical then {} else { features = { entries = [{ key = "typical", value = typical }] } })`
const TEMPORAL_VALUE_BLOCK = `if length (keys (${TEMPORAL_VALUE_WITH_FEATURES})) == 0 then {} else { value = ${TEMPORAL_VALUE_WITH_FEATURES} }`
const TEMPORAL_ANCHOR_BLOCK = 'if is_null anchorType then {} else { anchorRef = { localId = { value = anchorType } } }'
const TEMPORAL_DEICTIC_LIST =
  'flat_map (\\x -> x) [(if is_null deicticAnchorTime then [] else [{ key = "deicticAnchorTime", value = deicticAnchorTime }]), (if is_null deicticExpression then [] else [{ key = "deicticExpression", value = deicticExpression }])]'
const TEMPORAL_DEICTIC_BLOCK = `if length (${TEMPORAL_DEICTIC_LIST}) == 0 then {} else { features = { entries = ${TEMPORAL_DEICTIC_LIST} } }`
const TEMPORAL_EXPR = `merge { type = if isInterval then "interval" else "time" } (merge (${TEMPORAL_VALUE_BLOCK}) (merge (${TEMPORAL_ANCHOR_BLOCK}) (${TEMPORAL_DEICTIC_BLOCK})))`

/**
 * The temporal value-object build: the calendar `value`, the deictic `anchorRef` and
 * `features`, and the `type`, each assembled conditionally from the nullable-present
 * source fields by `merge` of `is_null`-guarded singletons and empty-record omission.
 * The `temporalModifier` is built by {@link WORLD_TEMPORAL_MODIFIER_LENS_DOC} and
 * spliced by the composition, since its `mod` key is a reserved keyword.
 */
export const WORLD_TEMPORAL_LENS_DOC = {
  id: 'fovea.world.temporal.v1',
  source: 'fovea.world.temporal',
  target: 'pub.layers.defs.temporalExpression',
  steps: [{ compute_field: { target: 'temporal', expr: TEMPORAL_EXPR } }],
} as const

/** The body vertex the temporal build binds to: the temporal record root. */
export const WORLD_TEMPORAL_BODY_VERTEX = 'root'

/**
 * The temporal-modifier build: the `mod` slug (reached by `rename_field`, since a
 * `compute_field` cannot construct the reserved-keyword key) and the optional
 * description `features`. The composition reads `mod` and the present `features`.
 */
export const WORLD_TEMPORAL_MODIFIER_LENS_DOC = {
  id: 'fovea.world.temporal-modifier.v1',
  source: 'fovea.world.temporal-modifier',
  target: 'pub.layers.defs.temporalModifier',
  steps: [
    {
      compute_field: {
        target: 'features',
        expr: 'if is_null modDescription then Nothing else { entries = [{ key = "description", value = modDescription }] }',
      },
    },
    { rename_field: { old: 'modKw', new: 'mod' } },
  ],
} as const

/** The body vertex the temporal-modifier build binds to: the modifier record root. */
export const WORLD_TEMPORAL_MODIFIER_BODY_VERTEX = 'root'

/**
 * The gloss byte-offset scan: a record-accumulator fold carries a running UTF-8 byte
 * cursor over the segments, emitting each segment's `[byteStart, byteEnd)`. The
 * parallel UTF-16 char offsets are computed at the boundary.
 */
export const WORLD_GLOSS_OFFSETS_LENS_DOC = {
  id: 'fovea.world.gloss-offsets.v1',
  source: 'fovea.world.gloss',
  target: 'pub.layers.defs.textSpan',
  steps: [
    {
      compute_field: {
        target: 'offsets',
        expr:
          '(fold (\\acc s -> { cursor = acc.cursor + len s.content, list = append acc.list { byteStart = acc.cursor, byteEnd = acc.cursor + len s.content } }) { cursor = 0, list = [] } segments).list',
      },
    },
  ],
} as const

/** The body vertex the gloss byte-offset scan binds to: the gloss record root. */
export const WORLD_GLOSS_OFFSETS_BODY_VERTEX = 'root'

// --------------------------------------------------------------------------
// Backward lens documents (layers record -> fovea view-model)
// --------------------------------------------------------------------------

/** The label un-rename: a GraphNode `label` becomes the world object's `name`. */
export const WORLD_NODE_LABEL_BACK_LENS_DOC = {
  id: 'fovea.world.node-label.back.v1',
  source: 'pub.layers.graph.graphNode',
  target: 'fovea.world.node',
  steps: [{ rename_field: { old: 'label', new: 'name' } }],
} as const

/** The body vertex the label un-rename binds to: the node record root. */
export const WORLD_NODE_LABEL_BACK_BODY_VERTEX = 'root'

/** The confidence descale: the 0-1000 integer becomes a 0-1 float, null passing through. */
export const WORLD_CONFIDENCE_BACK_LENS_DOC = {
  id: 'fovea.world.confidence.back.v1',
  source: 'pub.layers.x',
  target: 'fovea.world.confidence',
  steps: [{ compute_field: { target: 'confidence', expr: 'if is_null confidence then Nothing else int_to_float confidence / 1000.0' } }],
} as const

/** The body vertex the confidence descale binds to: the scalar record root. */
export const WORLD_CONFIDENCE_BACK_BODY_VERTEX = 'root'

/** The source-schema vertex a source record roots at for `getJson`. */
const ROOT_VERTEX = 'root'

// --------------------------------------------------------------------------
// Lens compilation
// --------------------------------------------------------------------------

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
 * native-ness (complement-requirement kind) and its get/put and put/get laws over a
 * representative record.
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

/** The instantiated world lenses the composition executes through `getJson`. */
export interface WorldLenses {
  /** Renames a node's `name` to the GraphNode `label`. */
  nodeLabel: LensHandle
  /** Scales a 0-1 confidence float to the 0-1000 integer. */
  confidence: LensHandle
  /** Regroups a relation's flat endpoints into `objectRef` records. */
  edgeEndpoint: LensHandle
  /** Folds a gloss's segment contents into the presence text. */
  glossText: LensHandle
  /** Renders an ordered coordinate tuple into a WKT `POINT`. */
  geometryPoint: LensHandle
  /** Renders a boundary ring into a WKT `POLYGON`. */
  geometryPolygon: LensHandle
  /** Builds a node's `knowledgeRefs` list from its groundings. */
  knowledgeRefs: LensHandle
  /** Carries quantized open-extension entries into a featureMap. */
  openProperties: LensHandle
  /** Assembles a Time's `temporalExpression` value. */
  temporal: LensHandle
  /** Builds a Time's `temporalModifier` (its `mod` key via rename). */
  temporalModifier: LensHandle
  /** Folds a gloss's segments into running UTF-8 byte offsets. */
  glossOffsets: LensHandle
  /** Un-renames a GraphNode `label` back to the world object's `name`. */
  nodeLabelBack: LensHandle
  /** Descales a 0-1000 integer confidence back to a 0-1 float. */
  confidenceBack: LensHandle
}

/** Compiles and instantiates the world lenses against their source schemas. */
export async function buildWorldLenses(): Promise<WorldLenses> {
  const p = await getPanproto()
  const [
    nodeSrc, labelBackSrc, confSrc, edgeSrc, glossSrc, pointSrc, polygonSrc, groundingsSrc, openSrc, temporalSrc, modifierSrc,
  ] = await Promise.all([
    loadFoveaSchema(worldNodeSourceSchema),
    loadFoveaSchema(worldNodeLabelSourceSchema),
    loadFoveaSchema(confidenceSourceSchema),
    loadFoveaSchema(edgeEndpointSourceSchema),
    loadFoveaSchema(glossTextSourceSchema),
    loadFoveaSchema(geometryPointSourceSchema),
    loadFoveaSchema(geometryPolygonSourceSchema),
    loadFoveaSchema(knowledgeRefsSourceSchema),
    loadFoveaSchema(openPropertiesSourceSchema),
    loadFoveaSchema(temporalSourceSchema),
    loadFoveaSchema(temporalModifierSourceSchema),
  ])
  const compile = (doc: unknown, vertex: string, src: BuiltSchema): LensHandle =>
    p.compileLensDocument(doc as never, vertex).instantiate(src)
  return {
    nodeLabel: compile(WORLD_NODE_LABEL_LENS_DOC, WORLD_NODE_LABEL_BODY_VERTEX, nodeSrc),
    confidence: compile(WORLD_CONFIDENCE_LENS_DOC, WORLD_CONFIDENCE_BODY_VERTEX, confSrc),
    edgeEndpoint: compile(WORLD_EDGE_ENDPOINT_LENS_DOC, WORLD_EDGE_ENDPOINT_BODY_VERTEX, edgeSrc),
    glossText: compile(WORLD_GLOSS_TEXT_LENS_DOC, WORLD_GLOSS_TEXT_BODY_VERTEX, glossSrc),
    geometryPoint: compile(WORLD_GEOMETRY_POINT_LENS_DOC, WORLD_GEOMETRY_POINT_BODY_VERTEX, pointSrc),
    geometryPolygon: compile(WORLD_GEOMETRY_POLYGON_LENS_DOC, WORLD_GEOMETRY_POLYGON_BODY_VERTEX, polygonSrc),
    knowledgeRefs: compile(WORLD_KNOWLEDGE_REFS_LENS_DOC, WORLD_KNOWLEDGE_REFS_BODY_VERTEX, groundingsSrc),
    openProperties: compile(WORLD_OPEN_PROPERTIES_LENS_DOC, WORLD_OPEN_PROPERTIES_BODY_VERTEX, openSrc),
    temporal: compile(WORLD_TEMPORAL_LENS_DOC, WORLD_TEMPORAL_BODY_VERTEX, temporalSrc),
    temporalModifier: compile(WORLD_TEMPORAL_MODIFIER_LENS_DOC, WORLD_TEMPORAL_MODIFIER_BODY_VERTEX, modifierSrc),
    glossOffsets: compile(WORLD_GLOSS_OFFSETS_LENS_DOC, WORLD_GLOSS_OFFSETS_BODY_VERTEX, glossSrc),
    nodeLabelBack: compile(WORLD_NODE_LABEL_BACK_LENS_DOC, WORLD_NODE_LABEL_BACK_BODY_VERTEX, labelBackSrc),
    confidenceBack: compile(WORLD_CONFIDENCE_BACK_LENS_DOC, WORLD_CONFIDENCE_BACK_BODY_VERTEX, confSrc),
  }
}

let worldLensesPromise: Promise<WorldLenses> | null = null

/** The world lenses, compiled and instantiated once per process. */
export function getWorldLenses(): Promise<WorldLenses> {
  worldLensesPromise ??= buildWorldLenses()
  return worldLensesPromise
}

// --------------------------------------------------------------------------
// Lens-projected value/structure transforms (each executed through getJson)
// --------------------------------------------------------------------------

/** Projects a world object's `name` to its GraphNode `label` through the lens. */
export function projectNodeLabel(lenses: WorldLenses, name: string): string {
  const { view } = lenses.nodeLabel.getJson({ id: '', name }, ROOT_VERTEX)
  return (view as { label: string }).label
}

/** Scales a 0-1 confidence float to the layers-native 0-1000 integer through the lens. */
export function scaleConfidence(lenses: WorldLenses, value: number): number {
  const { view } = lenses.confidence.getJson({ confidence: value }, ROOT_VERTEX)
  return (view as { confidence: number }).confidence
}

/** Descales a 0-1000 integer confidence back to a 0-1 float through the backward lens. */
export function descaleConfidence(lenses: WorldLenses, value: number): number {
  const { view } = lenses.confidenceBack.getJson({ confidence: value }, ROOT_VERTEX)
  return (view as { confidence: number }).confidence
}

/** Un-renames a GraphNode `label` back to the world object's `name` through the backward lens. */
export function projectNodeName(lenses: WorldLenses, label: string): string {
  const { view } = lenses.nodeLabelBack.getJson({ id: '', label }, ROOT_VERTEX)
  return (view as { name: string }).name
}

/** Regroups a relation's flat endpoints into `objectRef` records through the lens. */
export function projectEdgeEndpoints(
  lenses: WorldLenses,
  sourceId: string,
  targetId: string,
): { source: ObjectRef; target: ObjectRef } {
  const { view } = lenses.edgeEndpoint.getJson({ id: '', sourceId, targetId }, ROOT_VERTEX)
  const v = view as { source: ObjectRef; target: ObjectRef }
  return { source: v.source, target: v.target }
}

/** Folds a gloss's segment contents into the presence text through the lens. */
export function projectGlossText(lenses: WorldLenses, contents: string[]): string {
  const { view } = lenses.glossText.getJson({ segments: contents.map((content) => ({ content })) }, ROOT_VERTEX)
  return (view as { text: string }).text
}

/** Renders an ordered coordinate tuple into a WKT `POINT` string through the lens. */
export function projectPointGeometry(lenses: WorldLenses, coords: number[]): string {
  const { view } = lenses.geometryPoint.getJson({ coords }, ROOT_VERTEX)
  return (view as { geometry: string }).geometry
}

/** Renders a boundary ring into a WKT `POLYGON` string through the lens. */
export function projectPolygonGeometry(lenses: WorldLenses, ring: number[][]): string {
  const { view } = lenses.geometryPolygon.getJson({ ring }, ROOT_VERTEX)
  return (view as { geometry: string }).geometry
}

/** A grounding ref in the lens source shape (nullable-present `uri`/`label`). */
interface GroundingInput {
  source: string
  identifier: string
  uri: string | null
  label: string | null
}

/** A layers knowledgeRef value-object. */
interface KnowledgeRef {
  source: string
  identifier: string
  uri?: string
  label?: string
}

/** Builds a node's `knowledgeRefs` list from its groundings through the lens. */
export function projectKnowledgeRefs(lenses: WorldLenses, refs: GroundingInput[]): KnowledgeRef[] {
  const { view } = lenses.knowledgeRefs.getJson({ refs }, ROOT_VERTEX)
  return (view as { knowledgeRefs: KnowledgeRef[] }).knowledgeRefs
}

/** A single featureMap entry. */
interface FeatureEntry {
  key: string
  value: string
}

/** Carries quantized open-extension entries into a featureMap through the lens. */
export function projectOpenProperties(lenses: WorldLenses, entries: FeatureEntry[]): FeatureEntry[] {
  const { view } = lenses.openProperties.getJson({ openProperties: entries }, ROOT_VERTEX)
  return (view as { properties: { entries: FeatureEntry[] } }).properties.entries
}

/** The flat, nullable-present temporal source fields the temporal lens assembles from. */
interface TemporalInput {
  isInterval: boolean
  instant: string | null
  intervalStart: string | null
  intervalEnd: string | null
  earliest: string | null
  latest: string | null
  typical: string | null
  granularity: string | null
  anchorType: string | null
  deicticAnchorTime: string | null
  deicticExpression: string | null
}

/** Assembles a Time's `temporalExpression` value through the temporal lens. */
export function projectTemporal(lenses: WorldLenses, input: TemporalInput): Record<string, unknown> {
  const { view } = lenses.temporal.getJson(input as never, ROOT_VERTEX)
  return (view as { temporal: Record<string, unknown> }).temporal
}

/** Builds a Time's `temporalModifier` record through the modifier lens (its `mod` via rename). */
export function projectTemporalModifier(
  lenses: WorldLenses,
  modKw: string,
  modDescription: string | null,
): Record<string, unknown> {
  const { view } = lenses.temporalModifier.getJson({ modKw, modDescription }, ROOT_VERTEX)
  const v = view as { mod: string; features?: unknown }
  const modifier: Record<string, unknown> = { mod: v.mod }
  if (v.features !== null && v.features !== undefined) modifier.features = v.features
  return modifier
}

/** A gloss segment's running UTF-8 byte offsets. */
interface ByteOffset {
  byteStart: number
  byteEnd: number
}

/** Folds a gloss's segments into their running UTF-8 byte offsets through the lens. */
export function projectGlossByteOffsets(lenses: WorldLenses, contents: string[]): ByteOffset[] {
  const { view } = lenses.glossOffsets.getJson({ segments: contents.map((content) => ({ content })) }, ROOT_VERTEX)
  return (view as { offsets: ByteOffset[] }).offsets
}

// --------------------------------------------------------------------------
// Shared readers (the composition's small helpers)
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

/** The localId value of an objectRef, or null. */
function localRefValue(ref: unknown): string | null {
  const value = (ref as { localId?: { value?: unknown } } | null)?.localId?.value
  return typeof value === 'string' ? value : null
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

/**
 * Quantizes an object's open, unstructured leftover to featureMap-native `{ key,
 * value }` string entries: one entry per top-level field, keyed by the field name,
 * valued as its JSON. This runs at the ingress boundary that builds the lens source,
 * so the open-extension lens is a lossless passthrough.
 */
function openPropertyEntries(leftover: Record<string, unknown>): FeatureEntry[] {
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

/** The reserved knowledgeRef source label the native projection owns. */
const WIKIBASE_LABEL = 'wikibase'

/**
 * Builds an object's grounding inputs (the lens source shape) from its
 * wikidata/wikibase groundings and its `metadata.externalIds` map, or null when it
 * has none. The lens turns these into `knowledgeRef` value-objects.
 */
function groundingInputs(object: Record<string, unknown>): GroundingInput[] | null {
  const refs: GroundingInput[] = []
  const wikidataId = stringField(object, 'wikidataId')
  if (wikidataId) {
    refs.push({ source: 'wikidata', identifier: wikidataId, uri: stringField(object, 'wikidataUrl'), label: null })
  }
  const wikibaseId = stringField(object, 'wikibaseId')
  if (wikibaseId) refs.push({ source: 'custom', identifier: wikibaseId, uri: null, label: WIKIBASE_LABEL })

  const metadata = object.metadata
  const externalIds = (metadata as { externalIds?: unknown } | null)?.externalIds
  if (externalIds !== null && typeof externalIds === 'object' && !Array.isArray(externalIds)) {
    for (const [source, identifier] of Object.entries(externalIds as Record<string, unknown>)) {
      if (typeof identifier === 'string') refs.push({ source, identifier, uri: null, label: 'externalId' })
    }
  }
  return refs.length > 0 ? refs : null
}

/** A node's `knowledgeRefs` built through the lens, or null when it has none. */
function knowledgeRefsFor(lenses: WorldLenses, object: Record<string, unknown>): KnowledgeRef[] | null {
  const inputs = groundingInputs(object)
  return inputs === null ? null : projectKnowledgeRefs(lenses, inputs)
}

/** The groundings recovered from a node's knowledgeRefs. */
interface RecoveredGroundings {
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  externalIds?: Record<string, string>
}

/**
 * Recovers the wikidata/wikibase/externalIds groundings a node's knowledgeRefs carry.
 * The dynamic-key `externalIds` map is rebuilt here at the egress boundary, since a
 * lens `compute_field` cannot construct a record with a computed key name.
 */
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

// --- gloss stand-off ---------------------------------------------------------

/**
 * The plain text of a description gloss, folded through the lens: null for an empty
 * or non-array gloss, else the lens-joined segment contents.
 */
function glossText(lenses: WorldLenses, gloss: unknown): string | null {
  if (!Array.isArray(gloss) || gloss.length === 0) return null
  const contents = gloss.map((seg) => {
    const content = (seg as { content?: unknown }).content
    return typeof content === 'string' ? content : ''
  })
  return projectGlossText(lenses, contents)
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
 * Builds the child reference annotations for a description gloss: one per non-text
 * segment, anchored by a textSpan into the parent text. The running UTF-8 byte
 * offsets are folded through {@link projectGlossByteOffsets}; the parallel UTF-16
 * char offsets are cumulated here at the boundary, since panproto's `len` is byte
 * length with no char-count builtin. typeRefs carry the type id in
 * `ontologyTypeRefId`; every other reference points at its target via an
 * `argumentRef` role `denotes`. Fanning one gloss out to N child records, and wiring
 * their `parentAnnotationId`, is the composition's multi-record job.
 */
function glossRefAnnotations(
  lenses: WorldLenses,
  objectId: string,
  gloss: unknown,
  layerId: string,
  parentId: string,
  denotesNodeId: string | null,
  scope: WorldLayersScope,
): MappedWorldAnnotation[] {
  if (!Array.isArray(gloss)) return []
  const contents = gloss.map((seg) => {
    const content = (seg as { content?: unknown }).content
    return typeof content === 'string' ? content : ''
  })
  const byteOffsets = projectGlossByteOffsets(lenses, contents)
  const annotations: MappedWorldAnnotation[] = []
  let charCursor = 0
  gloss.forEach((raw, index) => {
    const segment = raw as GlossItem
    const content = contents[index]
    const charStart = charCursor
    charCursor += content.length
    const { byteStart, byteEnd } = byteOffsets[index]
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
      anchor: { textSpan: { byteStart, byteEnd, charStart, charEnd: charCursor } },
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
 * Builds the temporalExpression value a Time projects onto its presence annotation.
 * The flat calendar/vagueness/deictic fields are shaped into the nullable-present
 * temporal source here, the `temporalExpression` value (calendar `value`, deictic
 * `anchorRef`/`features`, `type`) is assembled by {@link projectTemporal}, and the
 * `temporalModifier` — whose `mod` key a `compute_field` cannot construct — is built
 * by {@link projectTemporalModifier} and spliced. The certainty confidence is scaled
 * through the confidence lens.
 */
function temporalExpressionFor(
  lenses: WorldLenses,
  time: Record<string, unknown>,
): { temporal: Record<string, unknown>; confidence: number | null } {
  const type = stringField(time, 'type')
  const input: TemporalInput = {
    isInterval: type === 'interval',
    instant: stringField(time, 'timestamp'),
    intervalStart: stringField(time, 'startTime'),
    intervalEnd: stringField(time, 'endTime'),
    earliest: null,
    latest: null,
    typical: null,
    granularity: null,
    anchorType: null,
    deicticAnchorTime: null,
    deicticExpression: null,
  }

  let modifier: Record<string, unknown> | null = null
  const vagueness = time.vagueness
  if (vagueness !== null && typeof vagueness === 'object') {
    const v = vagueness as Record<string, unknown>
    const modKw = typeof v.type === 'string' ? v.type : null
    const modDescription = typeof v.description === 'string' ? v.description : null
    if (modKw !== null || modDescription !== null) {
      modifier = projectTemporalModifier(lenses, modKw ?? '', modDescription)
      if (modKw === null) delete modifier.mod
    }
    const bounds = v.bounds
    if (bounds !== null && typeof bounds === 'object') {
      const b = bounds as Record<string, unknown>
      if (typeof b.earliest === 'string') input.earliest = b.earliest
      if (typeof b.latest === 'string') input.latest = b.latest
      if (typeof b.typical === 'string') input.typical = b.typical
    }
    if (typeof v.granularity === 'string' && GRANULARITIES.has(v.granularity)) input.granularity = v.granularity
  }

  const deictic = time.deictic
  if (deictic !== null && typeof deictic === 'object') {
    const d = deictic as Record<string, unknown>
    if (typeof d.anchorType === 'string') input.anchorType = d.anchorType
    if (typeof d.anchorTime === 'string') input.deicticAnchorTime = d.anchorTime
    if (typeof d.expression === 'string') input.deicticExpression = d.expression
  }

  const temporal = projectTemporal(lenses, input)
  if (modifier !== null) temporal.modifier = modifier

  const certainty = typeof time.certainty === 'number' ? time.certainty : null
  return { temporal, confidence: certainty === null ? null : scaleConfidence(lenses, certainty) }
}

/** Recovers a Time's calendar, vagueness, deictic, and certainty from its presence annotation. */
function readTemporal(lenses: WorldLenses, annotation: WorldAnnotationRow): Record<string, unknown> {
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

  if (typeof annotation.confidence === 'number') out.certainty = descaleConfidence(lenses, annotation.confidence)
  return out
}

// --- spatial value objects ---------------------------------------------------

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

/**
 * Builds the spatialExpression value a Location projects onto its presence
 * annotation: a point's coordinates as a WKT POINT, an extent's boundary as a WKT
 * POLYGON, both carrying the coordinate system on `spatialEntity.crs`. The WKT
 * geometry string — the surface's spatial value transform — is rendered through the
 * geometry lens; the surrounding `{ crs, geometryFormat, type, dimensions }` wrapper
 * is deterministic composition.
 */
function spatialExpressionFor(
  lenses: WorldLenses,
  location: Record<string, unknown>,
): Record<string, unknown> | null {
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
      value.geometry = projectPolygonGeometry(lenses, ring)
      value.type = 'polygon'
      value.dimensions = ring[0] && ring[0].length >= 3 ? 3 : 2
    }
  } else {
    const coordinates = location.coordinates
    if (coordinates !== null && typeof coordinates === 'object') {
      const numbers = orderedCoordinates(coordinates as Record<string, unknown>, system)
      if (numbers.length >= 2) {
        value.geometry = projectPointGeometry(lenses, numbers)
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

// --- type assignments --------------------------------------------------------

/** The presence-annotation label marking a type assignment. */
const LABEL_TYPE_ASSIGNMENT = 'type-assignment'

/** Builds the type-assignment annotations a type-assignment list projects to. */
function typeAssignmentAnnotations(
  lenses: WorldLenses,
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
      confidence: typeof raw.confidence === 'number' ? scaleConfidence(lenses, raw.confidence) : null,
      features: featureMap(projectOpenProperties(lenses, openPropertyEntries(leftover))),
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    }
  })
}

// --------------------------------------------------------------------------
// Multi-record composition (fovea aggregate -> layers projection)
// --------------------------------------------------------------------------

/** Presence-annotation labels marking a node's world membership and kind. */
const LABEL_ENTITY = 'entity'
const LABEL_LOCATION = 'location'
const LABEL_SITUATION = 'situation'
const LABEL_TIME = 'time'
const LABEL_COLLECTION_TIME = 'collection-time'
const LABEL_INTERPRETATION = 'interpretation'
const LABEL_COLLECTION_DESCRIPTION = 'collection-description'
const PRESENCE_LABELS = [LABEL_ENTITY, LABEL_LOCATION, LABEL_SITUATION, LABEL_TIME, LABEL_COLLECTION_TIME]

/** The flat edge-property marking a graph edge as a world-model relation. */
const KEY_WORLD_ROLE = 'worldRole'
const WORLD_ROLE_RELATION = 'relation'
const KEY_SOURCE_KIND = 'sourceKind'
const KEY_TARGET_KIND = 'targetKind'

/** Flat catalog-feature keys recording a collection's bucket, member field, and type. */
const KEY_BUCKET = 'bucket'
const KEY_MEMBER_FIELD = 'memberField'
const KEY_COLLECTION_TYPE = 'collectionType'

/**
 * Distributes a WorldState aggregate to its native layers projection rows: a
 * GraphNode per entity/location/situation/time, a GraphEdge per relation, a
 * `pub.layers.catalog.collection` plus one membership per member for each collection,
 * the scope scaffold, and the world-denoting
 * LayersAnnotations (presence with its temporal/spatial/gloss value, type
 * assignments, interpretations, gloss reference children). Every per-record value
 * and structure transform is projected through {@link WorldLenses} by `getJson`; the
 * collection catalog records come from {@link worldCollectionsToCatalog}; this
 * owns the multi-record framing and the cross-record id wiring.
 *
 * @param world - the WorldState aggregate to project
 * @param scope - the scope columns every produced row carries
 * @param lenses - the instantiated world lenses the value/structure transforms run through
 * @returns the nodes, edges, catalog collections/memberships, scaffold, and annotations to persist
 */
export function composeWorldToProjection(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
  lenses: WorldLenses,
): WorldLayersProjection {
  const nodes: MappedWorldNode[] = []
  const edges: MappedWorldEdge[] = []
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
      text: glossText(lenses, gloss),
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
    annotations.push(...glossRefAnnotations(lenses, node.id, gloss, layerId, presenceId, node.id, scope))
  }

  // Entities and Locations (both live in the entities bucket).
  asArray(world.entities).forEach((entity) => {
    const id = stringField(entity, 'id')
    if (id === null) return
    const isLocation = typeof entity.locationType === 'string'
    const name = stringField(entity, 'name')
    const label = name === null ? null : projectNodeLabel(lenses, name)

    annotations.push(
      ...typeAssignmentAnnotations(lenses, id, id, asArray(entity.typeAssignments), 'entityTypeId', layerId, scope),
    )

    const spatial = isLocation ? spatialExpressionFor(lenses, entity) : null
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
        properties: featureMap(projectOpenProperties(lenses, openPropertyEntries(leftover))),
        knowledgeRefs: knowledgeRefsFor(lenses, entity),
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
    const name = stringField(event, 'name')
    const label = name === null ? null : projectNodeLabel(lenses, name)

    asArray(event.personaInterpretations).forEach((raw, index) => {
      const personaId = stringField(raw, 'personaId') ?? ''
      const eventTypeId = stringField(raw, 'eventTypeId') ?? ''
      const args: Array<Record<string, unknown>> = [{ role: ROLE_PERSONA, target: localRef(personaId) }]
      for (const participant of asArray(raw.participants)) {
        args.push({
          role: stringField(participant, 'roleTypeId') ?? '',
          target: localRef(stringField(participant, 'entityId') ?? ''),
        })
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
        confidence: typeof raw.confidence === 'number' ? scaleConfidence(lenses, raw.confidence) : null,
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
        properties: featureMap(projectOpenProperties(lenses, openPropertyEntries(leftover))),
        knowledgeRefs: knowledgeRefsFor(lenses, event),
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
    const { temporal, confidence } = temporalExpressionFor(lenses, time)
    const leftover = leftoverAfter(time, [
      'id', 'type', 'timestamp', 'startTime', 'endTime', 'certainty', 'vagueness', 'deictic',
    ])
    pushNode(
      {
        id,
        nodeType: 'time',
        label: null,
        properties: featureMap(projectOpenProperties(lenses, openPropertyEntries(leftover))),
        knowledgeRefs: knowledgeRefsFor(lenses, time),
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

  // Collections home onto native catalog records; only their type-assignment and
  // description-gloss values stay world LayersAnnotations, and a time collection's
  // member times materialize as collection-time GraphNodes.
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
      const memberField = candidates.find((f) => Array.isArray(collection[f])) ?? candidates[0]

      if (memberField === 'times') {
        for (const time of asArray(collection.times)) {
          const memberId = stringField(time, 'id')
          if (memberId !== null && !materializedTimeIds.has(memberId)) pushTime(time, LABEL_COLLECTION_TIME)
        }
      }

      annotations.push(
        ...typeAssignmentAnnotations(lenses, id, null, asArray(collection.typeAssignments), typeField, layerId, scope),
      )

      const gloss = collection.description
      const text = glossText(lenses, gloss)
      const glossHasContent = text !== null || asArray(gloss).some((s) => s.type !== 'text')
      if (glossHasContent) {
        const descId = worldCollectionDescriptionAnnotationId(id)
        annotations.push({
          id: descId,
          layerId,
          denotesNodeId: null,
          parentAnnotationId: null,
          label: LABEL_COLLECTION_DESCRIPTION,
          text,
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
        annotations.push(...glossRefAnnotations(lenses, id, gloss, layerId, descId, null, scope))
      }
    })
  }
  collectionBucket('entityCollections', ['entityIds', 'members'], 'entityTypeId')
  collectionBucket('eventCollections', ['eventIds', 'members'], 'eventTypeId')
  collectionBucket('timeCollections', ['members'], 'entityTypeId')

  // Every collection projects to one catalog collection plus one membership per member.
  const { collections: catalogCollections, memberships: catalogMemberships } = worldCollectionsToCatalog(
    world,
    scope,
    new Date().toISOString(),
  )

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
    entries.push(...projectOpenProperties(lenses, openPropertyEntries(leftover)))
    const { source, target } = projectEdgeEndpoints(lenses, sourceId, targetId)
    edges.push({
      id,
      source,
      target,
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
    nodes.length > 0 || catalogCollections.length > 0
      ? { expressionId, layerId, projectId: scope.projectId, createdByUserId: scope.createdByUserId }
      : null

  return { nodes, edges, catalogCollections, catalogMemberships, scaffold, annotations }
}

/**
 * The end-to-end forward path for a WorldState aggregate: get the world lenses, then
 * project the aggregate to its native layers rows through them.
 *
 * @param world - the WorldState aggregate to project
 * @param scope - the scope columns every produced row carries
 * @returns the nodes, edges, catalog collections/memberships, scaffold, and annotations to persist
 */
export async function worldStateToLayersViaLens(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
): Promise<WorldLayersProjection> {
  const lenses = await getWorldLenses()
  return composeWorldToProjection(world, scope, lenses)
}

// --------------------------------------------------------------------------
// Multi-record regrouping (layers rows -> fovea aggregate), the backward path
// --------------------------------------------------------------------------

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

/**
 * Reconstructs a description gloss from its plain text and reference children, by the
 * char spans the children carry — a regroup of N child rows and their parent text
 * back into one gloss, the composition's multi-record inverse.
 */
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

/** Rebuilds a type assignment from its LayersAnnotation, descaling confidence through the lens. */
function readTypeAssignment(
  lenses: WorldLenses,
  annotation: WorldAnnotationRow,
  typeField: 'entityTypeId' | 'eventTypeId',
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const personaId = localRefValue(asArray(annotation.arguments).find((a) => a.role === ROLE_PERSONA)?.target)
  out.personaId = personaId ?? ''
  applyOpenExtension(out, entriesOf(annotation.features), new Set())
  if (annotation.ontologyTypeRefId) out[typeField] = annotation.ontologyTypeRefId
  if (typeof annotation.confidence === 'number') out.confidence = descaleConfidence(lenses, annotation.confidence)
  return out
}

/** Rebuilds an event interpretation from its LayersAnnotation, descaling confidence through the lens. */
function readInterpretation(lenses: WorldLenses, annotation: WorldAnnotationRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const args = asArray(annotation.arguments)
  const personaId = localRefValue(args.find((a) => a.role === ROLE_PERSONA)?.target)
  out.personaId = personaId ?? ''
  if (annotation.ontologyTypeRefId) out.eventTypeId = annotation.ontologyTypeRefId
  out.participants = args
    .filter((a) => a.role !== ROLE_PERSONA)
    .map((a) => ({ entityId: localRefValue(a.target) ?? '', roleTypeId: typeof a.role === 'string' ? a.role : '' }))
  if (typeof annotation.confidence === 'number') out.confidence = descaleConfidence(lenses, annotation.confidence)
  const justification = readFeature(entriesOf(annotation.features), 'justification')
  if (justification !== null) out.justification = justification
  return out
}

/** True when a graph edge is a world relation (it carries the world-role property). */
function isWorldEdge(edge: { properties: unknown }): boolean {
  return readFeature(entriesOf(edge.properties), KEY_WORLD_ROLE) === WORLD_ROLE_RELATION
}

/** The annotations denoting or describing a single world node. */
interface NodeAnnotations {
  presence: WorldAnnotationRow | null
  typeAssignments: WorldAnnotationRow[]
  interpretations: WorldAnnotationRow[]
}

/**
 * Reconstructs the WorldState aggregate from its native layers rows through the
 * backward lenses — the lens-native inverse of {@link composeWorldToProjection}. The
 * per-record value transforms (the node name un-rename, the confidence descale) run
 * through {@link WorldLenses}; this owns the multi-record
 * regrouping (indexing annotations by their node, assembling glosses from parts,
 * rebuilding collections from their catalog collection and memberships) and the
 * value-object deserializations with no
 * independent complement (parsing a WKT geometry, reading a `temporalExpression`,
 * `JSON.parse` of an open-extension entry, and rebuilding the `externalIds` map). It
 * reconstructs the WorldState aggregate the forward path projected.
 *
 * @param rows - the world nodes, edges, catalog collections/memberships, and annotations in one scope
 * @param lenses - the instantiated world lenses the value inversions run through
 * @returns the reconstructed WorldState aggregate
 */
export function composeProjectionToWorld(rows: WorldLayersRows, lenses: WorldLenses): WorldStateAggregate {
  const aggregate = emptyWorldState()

  const byNode = new Map<string, NodeAnnotations>()
  const glossByParent = new Map<string, WorldAnnotationRow[]>()
  const collectionAssignments = new Map<string, WorldAnnotationRow[]>()
  const collectionDescription = new Map<string, WorldAnnotationRow>()

  const nodeBucket = (nodeId: string): NodeAnnotations => {
    let entry = byNode.get(nodeId)
    if (!entry) {
      entry = { presence: null, typeAssignments: [], interpretations: [] }
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

  const glossChildrenOf = (parentId: string | null): WorldAnnotationRow[] =>
    parentId === null ? [] : (glossByParent.get(parentId) ?? [])

  const describeFrom = (presence: WorldAnnotationRow | null): GlossItem[] =>
    glossFromParts(presence?.text ?? null, glossChildrenOf(presence?.id ?? null).map(toGlossChild))

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
      Object.assign(object, readTemporal(lenses, anns.presence))
      timeById.set(node.id, object)
      if (label === LABEL_TIME) times.push(object)
      continue
    }

    const object: Record<string, unknown> = { id: node.id }
    if (node.label !== null) object.name = projectNodeName(lenses, node.label)
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
      object.personaInterpretations = anns.interpretations.map((a) => readInterpretation(lenses, a))
      events.push(object)
    } else {
      object.typeAssignments = anns.typeAssignments.map((a) => readTypeAssignment(lenses, a, 'entityTypeId'))
      if (label === LABEL_LOCATION && anns.presence.spatial !== null) {
        Object.assign(object, readSpatial(anns.presence))
      }
      entities.push(object)
    }
  }

  aggregate.entities = entities
  aggregate.events = events
  aggregate.times = times

  // Collections rebuild from their catalog collection plus their ordinal-sorted
  // memberships: the member ids come from the membership refs, the bucket/memberField/
  // collectionType from the collection features, the open leftover from the JSON-decoded
  // feature entries, and the type assignments and description from the world annotations.
  const membershipsByCollection = new Map<string, MappedCatalogMembership[]>()
  for (const membership of rows.catalogMemberships) {
    const list = membershipsByCollection.get(membership.catalogRef) ?? []
    list.push(membership)
    membershipsByCollection.set(membership.catalogRef, list)
  }

  for (const collection of rows.catalogCollections) {
    const featureEntries = entriesOf(collection.features)
    const bucket = readFeature(featureEntries, KEY_BUCKET)
    if (bucket !== 'entityCollections' && bucket !== 'eventCollections' && bucket !== 'timeCollections') continue
    const memberField = readFeature(featureEntries, KEY_MEMBER_FIELD) ?? 'members'

    const object: Record<string, unknown> = { id: collection.id }
    applyOpenExtension(object, featureEntries, new Set([KEY_BUCKET, KEY_MEMBER_FIELD, KEY_COLLECTION_TYPE]))
    object.name = collection.name
    const collectionType = readFeature(featureEntries, KEY_COLLECTION_TYPE)
    if (collectionType !== null) object.collectionType = collectionType

    const desc = collectionDescription.get(collection.id)
    object.description = desc ? glossFromParts(desc.text ?? null, glossChildrenOf(desc.id).map(toGlossChild)) : []

    const memberIds = (membershipsByCollection.get(collection.id) ?? [])
      .slice()
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((m) => localRefValue(m.member?.ref))
      .filter((value): value is string => value !== null)

    if (bucket === 'entityCollections') {
      object.typeAssignments = (collectionAssignments.get(collection.id) ?? []).map((a) =>
        readTypeAssignment(lenses, a, 'entityTypeId'),
      )
    } else if (bucket === 'eventCollections') {
      object.typeAssignments = (collectionAssignments.get(collection.id) ?? []).map((a) =>
        readTypeAssignment(lenses, a, 'eventTypeId'),
      )
    }

    if (memberField === 'times') object.times = memberIds.map((id) => timeById.get(id) ?? { id })
    else object[memberField] = memberIds

    aggregate[bucket].push(object)
  }

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

/**
 * The end-to-end backward path: get the world lenses, then regroup the stored
 * layers rows into the WorldState aggregate through them.
 *
 * @param rows - the world nodes, edges, catalog collections/memberships, and annotations in one scope
 * @returns the reconstructed WorldState aggregate
 */
export async function layersToWorldStateViaLens(rows: WorldLayersRows): Promise<WorldStateAggregate> {
  const lenses = await getWorldLenses()
  return composeProjectionToWorld(rows, lenses)
}

export type { WorldNodeRow, WorldEdgeRow, WorldAnnotationRow }
