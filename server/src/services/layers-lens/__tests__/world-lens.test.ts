import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

import {
  worldStateToLayers,
  layersToWorldState,
  type WorldStateAggregate,
  type WorldLayersProjection,
  type WorldLayersRows,
} from '../../world-layers-mapper.js'
import { assertOracleParity, type LayersRow } from '../oracle-parity.js'
import {
  buildWorldLens,
  composeWorldToProjection,
  NODE_LABEL_RENAME_LENS_DOC,
  NODE_LABEL_RENAME_BODY_VERTEX,
  worldNodeSourceSchema,
  TEMPORAL_VALUE_REGROUP_LENS_DOC,
  TEMPORAL_VALUE_REGROUP_BODY_VERTEX,
  temporalValueSourceSchema,
  EDGE_ENDPOINT_REGROUP_LENS_DOC,
  EDGE_ENDPOINT_REGROUP_BODY_VERTEX,
  edgeEndpointSourceSchema,
  CLUSTER_MEMBER_REGROUP_LENS_DOC,
  CLUSTER_MEMBER_REGROUP_BODY_VERTEX,
  clusterMemberSourceSchema,
} from '../world-lens.js'

/**
 * Verifies the FOVEA world surface's lens+composition path against the committed
 * hand-rolled world mapper (the oracle): the structural transforms compile to
 * panproto lenses whose law and native-ness signals are pinned, and the
 * composition reproduces the oracle projection exactly over a corpus of
 * representative WorldState aggregates.
 */

const scope = { projectId: null, createdByUserId: 'user-1' }

/** The corpus: representative WorldState aggregates across every branch of the map. */
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

describe('world-lens structural transforms', () => {
  it('renders the node label rename as a native, both-laws lens', async () => {
    const { requirementKind, getPutHolds, putGetHolds } = await buildWorldLens(
      NODE_LABEL_RENAME_LENS_DOC,
      NODE_LABEL_RENAME_BODY_VERTEX,
      worldNodeSourceSchema,
      { id: 'entity-alice', name: 'Alice' },
    )
    // A pure structural rename is native and lawful in both directions over the
    // string leaf: the one world transform expressible as a fully-lawful lens.
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(true)
  })

  it('renders the temporal value regroup as a native get/put lens, pinning the string-leaf put/get gap', async () => {
    const { requirementKind, getPutHolds, putGetHolds, fieldTransforms } = await buildWorldLens(
      TEMPORAL_VALUE_REGROUP_LENS_DOC,
      TEMPORAL_VALUE_REGROUP_BODY_VERTEX,
      temporalValueSourceSchema,
      { instant: '2024-03-15T12:00:00Z', intervalStart: '', intervalEnd: '', earliest: '', latest: '', granularity: 'hour' },
    )
    // The regroup is native (empty complement) and its computed field survives
    // compilation. get/put holds; put/get does not, over string leaves, under the
    // installed @panproto/core — the same regroup over integer leaves does hold.
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(false)
    expect(Object.keys(fieldTransforms)).toContain('root')
  })

  it('renders the edge-endpoint regroup as a native get/put lens, pinning the string-leaf put/get gap', async () => {
    const { requirementKind, getPutHolds, putGetHolds, fieldTransforms } = await buildWorldLens(
      EDGE_ENDPOINT_REGROUP_LENS_DOC,
      EDGE_ENDPOINT_REGROUP_BODY_VERTEX,
      edgeEndpointSourceSchema,
      { id: 'rel-attends', sourceId: 'entity-alice', targetId: 'event-meeting' },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(false)
    expect(Object.keys(fieldTransforms)).toContain('root')
  })

  it('renders the cluster-member regroup as a native item-vertex get/put lens, pinning the string-leaf put/get gap', async () => {
    const { requirementKind, getPutHolds, putGetHolds, fieldTransforms } = await buildWorldLens(
      CLUSTER_MEMBER_REGROUP_LENS_DOC,
      CLUSTER_MEMBER_REGROUP_BODY_VERTEX,
      clusterMemberSourceSchema,
      { id: 'ec-people', members: [{ value: 'entity-alice' }, { value: 'entity-hall' }] },
    )
    expect(requirementKind).toBe('empty')
    expect(getPutHolds).toBe(true)
    expect(putGetHolds).toBe(false)
    expect(Object.keys(fieldTransforms)).toContain('root.members:items')
  })
})

describe('world-lens oracle parity', () => {
  it('reproduces the oracle projection rows for every corpus aggregate', () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []
    for (const { world: w } of CORPUS) {
      oracleRows.push(...flatten(worldStateToLayers(w, scope)))
      lensRows.push(...flatten(composeWorldToProjection(w, scope)))
    }
    assertOracleParity(oracleRows, lensRows)
  })

  it('wires the denoted node, relation endpoints, and cluster membership by deterministic id', () => {
    const projection = composeWorldToProjection(world, scope)
    // The scaffold layer groups every world annotation, and each presence
    // annotation denotes its node.
    const layerId = projection.scaffold!.layerId
    expect(projection.annotations.every((a) => a.layerId === layerId)).toBe(true)
    const alicePresence = projection.annotations.find((a) => a.denotesNodeId === 'entity-alice' && a.label === 'entity')
    expect(alicePresence).toBeDefined()
    // The relation edge reuses the relation id and carries its endpoints as local refs.
    const attends = projection.edges.find((e) => e.id === 'rel-attends')
    expect(attends?.source).toEqual({ localId: { value: 'entity-alice' } })
    expect(attends?.target).toEqual({ localId: { value: 'event-meeting' } })
    // The collection ClusterSet carries its members as local-ref objectRefs.
    const people = projection.clusters.find((c) => c.id === 'ec-people')
    const members = (people?.clusters as Array<{ members: unknown[] }>)[0].members
    expect(members).toEqual([{ localId: { value: 'entity-alice' } }, { localId: { value: 'entity-hall' } }])
  })

  it('round-trips every corpus aggregate through the composition and the oracle backward mapper', () => {
    for (const { name, world: w } of CORPUS) {
      const rows = persistAndRead(composeWorldToProjection(w, scope))
      const reconstructed = layersToWorldState(rows)
      expect(reconstructed.entities, `entities for ${name}`).toEqual(w.entities)
      expect(reconstructed.events, `events for ${name}`).toEqual(w.events)
      expect(reconstructed.times, `times for ${name}`).toEqual(w.times)
      expect(reconstructed.entityCollections, `entityCollections for ${name}`).toEqual(w.entityCollections)
      expect(reconstructed.eventCollections, `eventCollections for ${name}`).toEqual(w.eventCollections)
      expect(reconstructed.timeCollections, `timeCollections for ${name}`).toEqual(w.timeCollections)
      expect(reconstructed.relations, `relations for ${name}`).toEqual(w.relations)
    }
  })
})
