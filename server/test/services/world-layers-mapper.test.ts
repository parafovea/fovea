import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

import {
  worldStateToLayers,
  layersToWorldState,
  isWorldEdge,
  worldClusterBucket,
  WORLD_NODE_TYPES,
  type WorldStateAggregate,
  type WorldLayersProjection,
  type WorldLayersRows,
} from '../../src/services/world-layers-mapper.js'

/**
 * Pure round-trip tests for the native world mapper.
 *
 * These exercise the mapper without a database: a WorldState aggregate is
 * projected to native layers rows (GraphNode + GraphEdge + ClusterSet +
 * world-denoting LayersAnnotations), the projection is serialized the way the
 * store would persist it, and the rows are reconstructed back into the aggregate.
 * The reconstruction must equal the original — the native form is lossless with
 * no sidecar blob.
 */

const scope = { projectId: null, createdByUserId: 'user-1' }

/** Mimics a JSON column round-tripping through the database (strips undefined). */
function jsonColumn(value: unknown): Prisma.JsonValue {
  return (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value))) as Prisma.JsonValue
}

/** Simulates persisting a projection and reading its rows back. */
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
      denotesNodeId: a.denotesNodeId,
      label: a.label,
      ontologyTypeRefId: a.ontologyTypeRefId,
      arguments: jsonColumn(a.arguments),
      temporal: jsonColumn(a.temporal),
      spatial: jsonColumn(a.spatial),
      confidence: a.confidence,
      features: jsonColumn(a.features),
    })),
  }
}

/** Projects an aggregate and reconstructs it through the simulated store. */
function roundTrip(world: WorldStateAggregate): {
  reconstructed: WorldStateAggregate
  projection: WorldLayersProjection
  rows: WorldLayersRows
} {
  const projection = worldStateToLayers(world, scope)
  const rows = persistAndRead(projection)
  return { reconstructed: layersToWorldState(rows), projection, rows }
}

describe('world-layers-mapper native round trip', () => {
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

  it('reconstructs every bucket losslessly', () => {
    const { reconstructed } = roundTrip(world)
    expect(reconstructed.entities).toEqual(world.entities)
    expect(reconstructed.events).toEqual(world.events)
    expect(reconstructed.times).toEqual(world.times)
    expect(reconstructed.entityCollections).toEqual(world.entityCollections)
    expect(reconstructed.eventCollections).toEqual(world.eventCollections)
    expect(reconstructed.timeCollections).toEqual(world.timeCollections)
    expect(reconstructed.relations).toEqual(world.relations)
  })

  it('projects world objects onto native primitives, not a sidecar blob', () => {
    const { projection } = roundTrip(world)

    // Nodes carry the correct types and no foveaWorld stash.
    const nodeTypes = projection.nodes.map((n) => n.nodeType).sort()
    expect(nodeTypes).toEqual(['entity', 'location', 'situation', 'situation', 'time', 'time', 'time'])
    for (const node of projection.nodes) {
      expect(node.nodeType).toBeOneOf([...WORLD_NODE_TYPES])
      expect(JSON.stringify(node.properties ?? {})).not.toContain('foveaWorld')
    }

    // Collections are ClusterSets, not GraphNodes.
    expect(projection.clusters).toHaveLength(3)
    for (const cluster of projection.clusters) {
      expect(worldClusterBucket(cluster as { clusters: unknown })).not.toBeNull()
    }

    // Type assignments and relations are edges; world edges carry the role tag.
    expect(projection.edges.every(isWorldEdge)).toBe(true)
    const instanceOf = projection.edges.filter((e) => e.edgeType === 'instance-of')
    expect(instanceOf).toHaveLength(2) // entity-alice + ec-people collection
    const relations = projection.edges.filter((e) => e.edgeType !== 'instance-of')
    expect(relations.map((e) => e.id).sort()).toEqual(['rel-attends', 'rel-when'])

    // A confidence float is quantized to the 0-1000 integer scale.
    const aliceType = instanceOf.find((e) => e.sourceLocalId === 'entity-alice')
    expect(aliceType?.confidence).toBe(900)

    // World values (spatial, temporal, interpretation) are annotations.
    expect(projection.scaffold).not.toBeNull()
    const spatial = projection.annotations.filter((a) => a.spatial !== null)
    expect(spatial).toHaveLength(1)
    expect(spatial[0].denotesNodeId).toBe('entity-hall')
    const temporal = projection.annotations.filter((a) => a.temporal !== null)
    expect(temporal.map((a) => a.denotesNodeId).sort()).toEqual(['time-noon', 'time-span'])
    const interpretation = projection.annotations.filter((a) => a.ontologyTypeRefId !== null)
    expect(interpretation).toHaveLength(1)
    expect(interpretation[0].denotesNodeId).toBe('event-meeting')
    expect(interpretation[0].ontologyTypeRefId).toBe('et-meet')
  })

  it('encodes a GPS point location as a WKT spatialExpression', () => {
    const { projection } = roundTrip(world)
    const spatial = projection.annotations.find((a) => a.spatial !== null)
    const value = (spatial?.spatial as { value?: { geometry?: string; crs?: string } }).value
    expect(value?.geometry).toBe('POINT(40.1 -80.2)')
    expect(value?.crs).toBe('wgs84')
  })

  it('round-trips an empty world to empty buckets', () => {
    const empty: WorldStateAggregate = {
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: [],
    }
    const { reconstructed, projection } = roundTrip(empty)
    expect(reconstructed).toEqual(empty)
    expect(projection.nodes).toHaveLength(0)
    expect(projection.edges).toHaveLength(0)
    expect(projection.clusters).toHaveLength(0)
    expect(projection.scaffold).toBeNull()
  })

  it('preserves array order across buckets', () => {
    const ordered: WorldStateAggregate = {
      entities: [
        { id: 'e-3', name: 'Third' },
        { id: 'e-1', name: 'First' },
        { id: 'e-2', name: 'Second' },
      ],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: [],
    }
    const { reconstructed } = roundTrip(ordered)
    expect((reconstructed.entities as Array<{ id: string }>).map((e) => e.id)).toEqual(['e-3', 'e-1', 'e-2'])
  })
})
