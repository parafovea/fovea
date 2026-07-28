import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import {
  worldStateToLayers,
  layersToWorldState,
  type WorldStateAggregate,
  type WorldLayersProjection,
  type WorldLayersRows,
} from '../../world-layers-mapper.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import { assertOracleParity, assertBackwardParity, type LayersRow } from '../oracle-parity.js'
import {
  buildWorldLens,
  getWorldLenses,
  worldStateToLayersViaLens,
  layersToWorldStateViaLens,
  projectNodeLabel,
  projectNodeName,
  scaleConfidence,
  descaleConfidence,
  projectEdgeEndpoints,
  projectClusterMembers,
  projectClusterMemberIds,
  projectGlossText,
  projectPointGeometry,
  projectPolygonGeometry,
  projectKnowledgeRefs,
  projectOpenProperties,
  projectTemporal,
  projectGlossByteOffsets,
  WORLD_NODE_LABEL_LENS_DOC,
  WORLD_NODE_LABEL_BODY_VERTEX,
  worldNodeSourceSchema,
  worldNodeLabelSourceSchema,
  WORLD_CONFIDENCE_LENS_DOC,
  WORLD_CONFIDENCE_BODY_VERTEX,
  confidenceSourceSchema,
  WORLD_EDGE_ENDPOINT_LENS_DOC,
  WORLD_EDGE_ENDPOINT_BODY_VERTEX,
  edgeEndpointSourceSchema,
  WORLD_CLUSTER_MEMBER_LENS_DOC,
  WORLD_CLUSTER_MEMBER_BODY_VERTEX,
  clusterMemberSourceSchema,
  WORLD_GLOSS_TEXT_LENS_DOC,
  WORLD_GLOSS_TEXT_BODY_VERTEX,
  glossTextSourceSchema,
  WORLD_GEOMETRY_POINT_LENS_DOC,
  WORLD_GEOMETRY_POINT_BODY_VERTEX,
  geometryPointSourceSchema,
  WORLD_GEOMETRY_POLYGON_LENS_DOC,
  WORLD_GEOMETRY_POLYGON_BODY_VERTEX,
  geometryPolygonSourceSchema,
  WORLD_KNOWLEDGE_REFS_LENS_DOC,
  WORLD_KNOWLEDGE_REFS_BODY_VERTEX,
  knowledgeRefsSourceSchema,
  WORLD_OPEN_PROPERTIES_LENS_DOC,
  WORLD_OPEN_PROPERTIES_BODY_VERTEX,
  openPropertiesSourceSchema,
  WORLD_TEMPORAL_LENS_DOC,
  WORLD_TEMPORAL_BODY_VERTEX,
  temporalSourceSchema,
  WORLD_TEMPORAL_MODIFIER_LENS_DOC,
  WORLD_TEMPORAL_MODIFIER_BODY_VERTEX,
  temporalModifierSourceSchema,
  WORLD_GLOSS_OFFSETS_LENS_DOC,
  WORLD_GLOSS_OFFSETS_BODY_VERTEX,
  glossOffsetsSourceSchema,
  WORLD_NODE_LABEL_BACK_LENS_DOC,
  WORLD_NODE_LABEL_BACK_BODY_VERTEX,
  WORLD_CONFIDENCE_BACK_LENS_DOC,
  WORLD_CONFIDENCE_BACK_BODY_VERTEX,
  WORLD_CLUSTER_MEMBER_BACK_LENS_DOC,
  WORLD_CLUSTER_MEMBER_BACK_BODY_VERTEX,
} from '../world-lens.js'

/**
 * Verifies the FOVEA world surface's bidirectional lens+composition path against the
 * committed hand-rolled world mapper (the oracle). Every per-record value/structure
 * transform compiles to a native panproto lens whose round-trip laws hold and whose
 * `getJson` output already carries (forward) or inverts (backward) the transform. The
 * forward composition reproduces the oracle projection exactly, and the backward
 * regrouping — reconstructed through the backward lenses, not the oracle — reproduces
 * the oracle's WorldState aggregate exactly, over a corpus of representative worlds.
 */

const scope = { projectId: null, createdByUserId: 'user-1' }

const world: WorldStateAggregate = {
  entities: [
    {
      id: 'entity-alice',
      name: 'Alice',
      description: [{ type: 'text', content: 'The lead' }],
      wikidataId: 'Q42',
      typeAssignments: [
        { personaId: 'p-1', entityTypeId: 'et-person', confidence: 0.9, justification: 'named in caption' },
      ],
      metadata: { alternateNames: ['Al'], externalIds: { imdb: 'nm1' }, properties: { age: 30 } },
    },
    {
      id: 'entity-hall',
      name: 'City Hall',
      description: [],
      typeAssignments: [],
      locationType: 'point',
      coordinateSystem: 'GPS',
      coordinates: { latitude: 40.1, longitude: -80.2 },
      metadata: {},
    },
  ],
  events: [
    {
      id: 'event-meeting',
      name: 'Meeting',
      description: [],
      personaInterpretations: [
        {
          personaId: 'p-1',
          eventTypeId: 'et-meet',
          participants: [{ entityId: 'entity-alice', roleTypeId: 'rt-agent' }],
          confidence: 0.7,
          justification: 'agenda item',
        },
      ],
      metadata: { certainty: 0.8, properties: { room: 'A' } },
    },
    { id: 'event-empty', name: 'Empty', description: [], personaInterpretations: [], metadata: {} },
  ],
  times: [
    { id: 'time-noon', type: 'instant', timestamp: '2024-03-15T12:00:00Z', certainty: 0.95 },
    { id: 'time-span', type: 'interval', startTime: '2024-03-15T09:00:00Z', endTime: '2024-03-15T17:00:00Z' },
    { id: 'time-bare', type: 'instant', label: 'Noon' },
  ],
  entityCollections: [
    {
      id: 'ec-people',
      name: 'People',
      description: [],
      entityIds: ['entity-alice', 'entity-hall'],
      collectionType: 'group',
      typeAssignments: [{ personaId: 'p-1', entityTypeId: 'et-group' }],
      aggregateProperties: { homogeneous: true, ordered: true, mereological: 'count' },
    },
  ],
  eventCollections: [
    {
      id: 'evc-agenda',
      name: 'Agenda',
      description: [],
      eventIds: ['event-meeting'],
      collectionType: 'sequence',
      typeAssignments: [],
    },
  ],
  timeCollections: [
    {
      id: 'tc-day',
      name: 'Day',
      description: [],
      times: [{ id: 'time-noon', type: 'instant', timestamp: '2024-03-15T12:00:00Z', certainty: 0.95 }],
      collectionType: 'group',
    },
  ],
  relations: [
    {
      id: 'rel-attends',
      relationTypeId: 'attends',
      sourceType: 'entity',
      sourceId: 'entity-alice',
      targetType: 'event',
      targetId: 'event-meeting',
      metadata: { note: 'chair' },
    },
    {
      id: 'rel-when',
      relationTypeId: 'occurs-at',
      sourceType: 'event',
      sourceId: 'event-meeting',
      targetType: 'time',
      targetId: 'time-noon',
    },
  ],
}

const vague: WorldStateAggregate = {
  entities: [],
  events: [],
  entityCollections: [],
  eventCollections: [],
  timeCollections: [],
  relations: [],
  times: [
    {
      id: 'time-vague',
      type: 'instant',
      vagueness: {
        type: 'bounded',
        description: 'around noon',
        bounds: { earliest: '2024-03-15T11:00:00Z', latest: '2024-03-15T13:00:00Z' },
        granularity: 'hour',
      },
      deictic: { anchorType: 'annotation_time', expression: 'earlier today' },
    },
  ],
}

const memberOnly: WorldStateAggregate = {
  entities: [],
  events: [],
  times: [],
  entityCollections: [],
  eventCollections: [],
  relations: [],
  timeCollections: [
    {
      id: 'tc-only',
      name: 'Members',
      description: [],
      collectionType: 'group',
      times: [{ id: 't9', type: 'interval', startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-02T00:00:00Z' }],
    },
  ],
}

const extentLoc: WorldStateAggregate = {
  entities: [
    {
      id: 'loc-park',
      name: 'Park',
      description: [],
      typeAssignments: [],
      locationType: 'extent',
      coordinateSystem: 'cartesian',
      boundary: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    },
  ],
  events: [],
  times: [],
  entityCollections: [],
  eventCollections: [],
  timeCollections: [],
  relations: [],
}

const empty: WorldStateAggregate = {
  entities: [],
  events: [],
  times: [],
  entityCollections: [],
  eventCollections: [],
  timeCollections: [],
  relations: [],
}

const ordered: WorldStateAggregate = {
  entities: [
    { id: 'e-3', name: 'Third', description: [], typeAssignments: [] },
    { id: 'e-1', name: 'First', description: [], typeAssignments: [] },
    { id: 'e-2', name: 'Second', description: [], typeAssignments: [] },
  ],
  events: [],
  times: [],
  entityCollections: [],
  eventCollections: [],
  timeCollections: [],
  relations: [],
}

const CORPUS: Array<{ name: string; world: WorldStateAggregate }> = [
  { name: 'full world', world },
  { name: 'vague time', world: vague },
  { name: 'member-only time collection', world: memberOnly },
  { name: 'cartesian extent location', world: extentLoc },
  { name: 'empty', world: empty },
  { name: 'ordered entities', world: ordered },
]

/** Flattens a projection into tagged rows for the multiset parity comparison. */
function flatten(projection: WorldLayersProjection): LayersRow[] {
  const rows: LayersRow[] = []
  for (const node of projection.nodes) rows.push({ __table: 'GraphNode', ...node })
  for (const edge of projection.edges) rows.push({ __table: 'GraphEdge', ...edge })
  for (const cluster of projection.clusters) rows.push({ __table: 'ClusterSet', ...cluster })
  for (const annotation of projection.annotations) rows.push({ __table: 'LayersAnnotation', ...annotation })
  if (projection.scaffold) rows.push({ __table: 'Scaffold', ...projection.scaffold })
  return rows
}

/** Mimics a JSON column round-tripping through the database (strips undefined). */
function jsonColumn(value: unknown): Prisma.JsonValue {
  return (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))) as Prisma.JsonValue
}

/** Simulates persisting a projection and reading its rows back (as the oracle test does). */
function persistAndRead(projection: WorldLayersProjection): WorldLayersRows {
  return {
    nodes: projection.nodes.map((n) => ({
      id: n.id,
      nodeType: n.nodeType,
      label: n.label,
      properties: jsonColumn(n.properties),
      knowledgeRefs: jsonColumn(n.knowledgeRefs),
      metadata: jsonColumn(n.metadata),
    })),
    edges: projection.edges.map((e) => ({
      id: e.id,
      edgeType: e.edgeType,
      sourceLocalId: e.sourceLocalId,
      targetLocalId: e.targetLocalId,
      ordinal: e.ordinal,
      confidence: e.confidence,
      properties: jsonColumn(e.properties),
      metadata: jsonColumn(e.metadata),
    })),
    clusters: projection.clusters.map((c) => ({
      id: c.id,
      kind: c.kind,
      clusters: jsonColumn(c.clusters),
    })),
    annotations: projection.annotations.map((a) => ({
      id: a.id,
      denotesNodeId: a.denotesNodeId,
      parentAnnotationId: a.parentAnnotationId,
      label: a.label,
      text: a.text,
      anchor: jsonColumn(a.anchor),
      ontologyTypeRefId: a.ontologyTypeRefId,
      arguments: jsonColumn(a.arguments),
      temporal: jsonColumn(a.temporal),
      spatial: jsonColumn(a.spatial),
      confidence: a.confidence,
      features: jsonColumn(a.features),
    })),
  }
}

describe('world-lens forward value/structure transforms', () => {
  it('renders the node label rename as a native, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_NODE_LABEL_LENS_DOC,
      WORLD_NODE_LABEL_BODY_VERTEX,
      worldNodeSourceSchema,
      { id: 'entity-alice', name: 'Alice' },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectNodeLabel(lenses, 'Alice')).toBe('Alice')
  })

  it('renders the confidence scale as a native, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds, fieldTransforms } = await buildWorldLens(
      WORLD_CONFIDENCE_LENS_DOC,
      WORLD_CONFIDENCE_BODY_VERTEX,
      confidenceSourceSchema,
      { confidence: 0.88 },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const targets = (fieldTransforms.root as Array<{ ComputeField?: { target_key?: string } }>).map(
      (t) => t.ComputeField?.target_key,
    )
    expect(targets).toContain('confidence')
    const lenses = await getWorldLenses()
    expect(scaleConfidence(lenses, 0.88)).toBe(880)
    expect(scaleConfidence(lenses, 0.95)).toBe(950)
  })

  it('renders the edge-endpoint regroup as a native, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_EDGE_ENDPOINT_LENS_DOC,
      WORLD_EDGE_ENDPOINT_BODY_VERTEX,
      edgeEndpointSourceSchema,
      { id: 'rel-attends', sourceId: 'entity-alice', targetId: 'event-meeting' },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectEdgeEndpoints(lenses, 'entity-alice', 'event-meeting')).toEqual({
      source: { localId: { value: 'entity-alice' } },
      target: { localId: { value: 'event-meeting' } },
    })
  })

  it('renders the cluster-member regroup as a native item-vertex, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_CLUSTER_MEMBER_LENS_DOC,
      WORLD_CLUSTER_MEMBER_BODY_VERTEX,
      clusterMemberSourceSchema,
      { id: 'ec-people', members: [{ value: 'entity-alice' }, { value: 'entity-hall' }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectClusterMembers(lenses, ['entity-alice', 'entity-hall'])).toEqual([
      { localId: { value: 'entity-alice' } },
      { localId: { value: 'entity-hall' } },
    ])
  })

  it('renders the gloss text fold as a native, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_GLOSS_TEXT_LENS_DOC,
      WORLD_GLOSS_TEXT_BODY_VERTEX,
      glossTextSourceSchema,
      { segments: [{ content: 'The ' }, { content: 'lead' }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectGlossText(lenses, ['The ', 'lead'])).toBe('The lead')
    expect(projectGlossText(lenses, [])).toBe('')
  })

  it('renders the WKT point geometry as a native, both-laws lens matching String() formatting', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_GEOMETRY_POINT_LENS_DOC,
      WORLD_GEOMETRY_POINT_BODY_VERTEX,
      geometryPointSourceSchema,
      { coords: [40.1, -80.2] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    // Integer-valued and float coordinates render exactly as the world mapper's String().
    expect(projectPointGeometry(lenses, [40.1, -80.2])).toBe('POINT(40.1 -80.2)')
    expect(projectPointGeometry(lenses, [0, 10])).toBe('POINT(0 10)')
  })

  it('renders the WKT polygon geometry as a native, both-laws lens', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_GEOMETRY_POLYGON_LENS_DOC,
      WORLD_GEOMETRY_POLYGON_BODY_VERTEX,
      geometryPolygonSourceSchema,
      { ring: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectPolygonGeometry(lenses, [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(
      'POLYGON((0 0, 10 0, 10 10, 0 10))',
    )
  })

  it('renders the knowledgeRefs build as a native, both-laws lens carrying conditional uri/label', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_KNOWLEDGE_REFS_LENS_DOC,
      WORLD_KNOWLEDGE_REFS_BODY_VERTEX,
      knowledgeRefsSourceSchema,
      { refs: [{ source: 'wikidata', identifier: 'Q42', uri: null, label: null }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(
      projectKnowledgeRefs(lenses, [
        { source: 'wikidata', identifier: 'Q42', uri: null, label: null },
        { source: 'imdb', identifier: 'nm1', uri: null, label: 'externalId' },
      ]),
    ).toEqual([
      { source: 'wikidata', identifier: 'Q42' },
      { source: 'imdb', identifier: 'nm1', label: 'externalId' },
    ])
  })

  it('renders the open-extension passthrough as a native, both-laws lossless lens', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_OPEN_PROPERTIES_LENS_DOC,
      WORLD_OPEN_PROPERTIES_BODY_VERTEX,
      openPropertiesSourceSchema,
      { openProperties: [{ key: 'metadata', value: '{"age":30}' }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectOpenProperties(lenses, [{ key: 'metadata', value: '{"age":30}' }])).toEqual([
      { key: 'metadata', value: '{"age":30}' },
    ])
  })

  it('renders the temporal value-object as a native, both-laws lens matching the oracle', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_TEMPORAL_LENS_DOC,
      WORLD_TEMPORAL_BODY_VERTEX,
      temporalSourceSchema,
      {
        isInterval: false,
        instant: '2024-03-15T12:00:00Z',
        intervalStart: null,
        intervalEnd: null,
        earliest: null,
        latest: null,
        typical: null,
        granularity: null,
        anchorType: null,
        deicticAnchorTime: null,
        deicticExpression: null,
      },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    const noon = projectTemporal(lenses, {
      isInterval: false,
      instant: '2024-03-15T12:00:00Z',
      intervalStart: null,
      intervalEnd: null,
      earliest: null,
      latest: null,
      typical: null,
      granularity: null,
      anchorType: null,
      deicticAnchorTime: null,
      deicticExpression: null,
    })
    expect(noon).toEqual({ type: 'time', value: { instant: '2024-03-15T12:00:00Z' } })
    const bare = projectTemporal(lenses, {
      isInterval: false,
      instant: null,
      intervalStart: null,
      intervalEnd: null,
      earliest: null,
      latest: null,
      typical: null,
      granularity: null,
      anchorType: null,
      deicticAnchorTime: null,
      deicticExpression: null,
    })
    expect(bare).toEqual({ type: 'time' })
  })

  it('renders the temporal-modifier mod key (reserved keyword) via rename_field', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_TEMPORAL_MODIFIER_LENS_DOC,
      WORLD_TEMPORAL_MODIFIER_BODY_VERTEX,
      temporalModifierSourceSchema,
      { modKw: 'bounded', modDescription: 'around noon' },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
  })

  it('renders the gloss byte-offset scan as a native, both-laws prefix fold', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_GLOSS_OFFSETS_LENS_DOC,
      WORLD_GLOSS_OFFSETS_BODY_VERTEX,
      glossOffsetsSourceSchema,
      { segments: [{ content: 'The ' }, { content: 'lead' }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectGlossByteOffsets(lenses, ['The ', 'lead'])).toEqual([
      { byteStart: 0, byteEnd: 4 },
      { byteStart: 4, byteEnd: 8 },
    ])
  })
})

describe('world-lens backward value/structure transforms', () => {
  it('renders the label un-rename as a native, both-laws lens that getJson carries', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_NODE_LABEL_BACK_LENS_DOC,
      WORLD_NODE_LABEL_BACK_BODY_VERTEX,
      worldNodeLabelSourceSchema,
      { id: 'entity-alice', label: 'Alice' },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(projectNodeName(lenses, 'Alice')).toBe('Alice')
  })

  it('renders the confidence descale as a native, both-laws inverse lens', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_CONFIDENCE_BACK_LENS_DOC,
      WORLD_CONFIDENCE_BACK_BODY_VERTEX,
      z_intConfidence(),
      { confidence: 880 },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    // The backward lens descales 880 -> 0.88, inverting the forward scale.
    expect(descaleConfidence(lenses, 880)).toBe(0.88)
    expect(descaleConfidence(lenses, 950)).toBe(0.95)
  })

  it('renders the cluster-member flatten as a native item-vertex, both-laws inverse lens', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      WORLD_CLUSTER_MEMBER_BACK_LENS_DOC,
      WORLD_CLUSTER_MEMBER_BACK_BODY_VERTEX,
      z_objectRefMembers(),
      { members: [{ localId: { value: 'entity-alice' } }, { localId: { value: 'entity-hall' } }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
    const lenses = await getWorldLenses()
    expect(
      projectClusterMemberIds(lenses, [{ localId: { value: 'entity-alice' } }, { localId: { value: 'entity-hall' } }]),
    ).toEqual(['entity-alice', 'entity-hall'])
  })
})

describe('world-lens oracle parity', () => {
  it('reproduces the oracle projection rows for every corpus aggregate (forward)', async () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { world: w } of CORPUS) {
      oracleRows.push(...flatten(worldStateToLayers(w, scope)))
      lensRows.push(...flatten(await worldStateToLayersViaLens(w, scope)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('wires the denoted node, relation endpoints, and cluster membership by deterministic id', async () => {
    const projection = await worldStateToLayersViaLens(world, scope)
    const layerId = projection.scaffold!.layerId
    expect(projection.annotations.every((a) => a.layerId === layerId)).toBe(true)
    const alicePresence = projection.annotations.find((a) => a.denotesNodeId === 'entity-alice' && a.label === 'entity')
    expect(alicePresence).toBeDefined()
    const attends = projection.edges.find((e) => e.id === 'rel-attends')
    expect(attends?.source).toEqual({ localId: { value: 'entity-alice' } })
    expect(attends?.target).toEqual({ localId: { value: 'event-meeting' } })
    const people = projection.clusters.find((c) => c.id === 'ec-people')
    const members = (people?.clusters as Array<{ members: unknown[] }>)[0].members
    expect(members).toEqual([{ localId: { value: 'entity-alice' } }, { localId: { value: 'entity-hall' } }])
  })

  it('reconstructs the oracle backward aggregate via the backward lenses (backward)', async () => {
    // Reconstructs the same stored rows through the oracle backward mapper and through
    // the backward lens path, asserting the two produce the same WorldState. The lens
    // path runs the backward lenses' getJson (the node-name un-rename, the confidence
    // descale, the cluster-member flatten), not the oracle backward mapper, so this is
    // a genuine lens-vs-oracle comparison.
    for (const { name, world: w } of CORPUS) {
      const rows = persistAndRead(await worldStateToLayersViaLens(w, scope))
      const fromOracle = layersToWorldState(rows)
      const fromLens = await layersToWorldStateViaLens(rows)
      assertBackwardParity(fromOracle, fromLens)
      expect(fromLens.entities, `entities for ${name}`).toEqual(w.entities)
      expect(fromLens.events, `events for ${name}`).toEqual(w.events)
      expect(fromLens.times, `times for ${name}`).toEqual(w.times)
      expect(fromLens.entityCollections, `entityCollections for ${name}`).toEqual(w.entityCollections)
      expect(fromLens.eventCollections, `eventCollections for ${name}`).toEqual(w.eventCollections)
      expect(fromLens.timeCollections, `timeCollections for ${name}`).toEqual(w.timeCollections)
      expect(fromLens.relations, `relations for ${name}`).toEqual(w.relations)
    }
  })

  it('compiles every world lens native against its source schema', async () => {
    const p = await getPanproto()
    const cases: Array<[unknown, string, Parameters<typeof loadFoveaSchema>[0]]> = [
      [WORLD_NODE_LABEL_LENS_DOC, WORLD_NODE_LABEL_BODY_VERTEX, worldNodeSourceSchema],
      [WORLD_CONFIDENCE_LENS_DOC, WORLD_CONFIDENCE_BODY_VERTEX, confidenceSourceSchema],
      [WORLD_EDGE_ENDPOINT_LENS_DOC, WORLD_EDGE_ENDPOINT_BODY_VERTEX, edgeEndpointSourceSchema],
      [WORLD_CLUSTER_MEMBER_LENS_DOC, WORLD_CLUSTER_MEMBER_BODY_VERTEX, clusterMemberSourceSchema],
      [WORLD_GLOSS_TEXT_LENS_DOC, WORLD_GLOSS_TEXT_BODY_VERTEX, glossTextSourceSchema],
      [WORLD_GEOMETRY_POINT_LENS_DOC, WORLD_GEOMETRY_POINT_BODY_VERTEX, geometryPointSourceSchema],
      [WORLD_GEOMETRY_POLYGON_LENS_DOC, WORLD_GEOMETRY_POLYGON_BODY_VERTEX, geometryPolygonSourceSchema],
      [WORLD_KNOWLEDGE_REFS_LENS_DOC, WORLD_KNOWLEDGE_REFS_BODY_VERTEX, knowledgeRefsSourceSchema],
      [WORLD_OPEN_PROPERTIES_LENS_DOC, WORLD_OPEN_PROPERTIES_BODY_VERTEX, openPropertiesSourceSchema],
      [WORLD_TEMPORAL_LENS_DOC, WORLD_TEMPORAL_BODY_VERTEX, temporalSourceSchema],
      [WORLD_TEMPORAL_MODIFIER_LENS_DOC, WORLD_TEMPORAL_MODIFIER_BODY_VERTEX, temporalModifierSourceSchema],
      [WORLD_GLOSS_OFFSETS_LENS_DOC, WORLD_GLOSS_OFFSETS_BODY_VERTEX, glossOffsetsSourceSchema],
      [WORLD_NODE_LABEL_BACK_LENS_DOC, WORLD_NODE_LABEL_BACK_BODY_VERTEX, worldNodeLabelSourceSchema],
      [WORLD_CONFIDENCE_BACK_LENS_DOC, WORLD_CONFIDENCE_BACK_BODY_VERTEX, z_intConfidence()],
      [WORLD_CLUSTER_MEMBER_BACK_LENS_DOC, WORLD_CLUSTER_MEMBER_BACK_BODY_VERTEX, z_objectRefMembers()],
    ]
    for (const [doc, vertex, schema] of cases) {
      const source = await loadFoveaSchema(schema)
      const chain = p.compileLensDocument(doc as never, vertex)
      expect(chain.requirements(source).kind, `native for ${vertex}`).toBe('empty')
    }
  })
})

// Local schema builders for the backward-lens law checks (integer confidence, objectRef members).
function z_intConfidence() {
  return z.object({ confidence: z.number().int().nullable() })
}
function z_objectRefMembers() {
  return z.object({ members: z.array(z.object({ localId: z.object({ value: z.string() }) })) })
}
