/**
 * The WorldState domain vocabulary over the native layers store: the aggregate
 * and projection shapes the `/api/world` contract and the world read/write paths
 * exchange, the row shapes the reconstruction reads, the discriminators that tell
 * a world-authored node / edge / presence annotation apart from a sibling that
 * shares its shape, and the synthetic per-scope WorldState ids the contract
 * reports.
 *
 * A WorldState carries six object/collection buckets plus its relation instances.
 * Entities and locations, events (situations), and times live as GraphNodes whose
 * nodeType is one of {@link WORLD_NODE_TYPES}; each carries a presence
 * LayersAnnotation marking its world membership and kind. Relations live as
 * GraphEdges stamped with a world-role property, and collections live as
 * ClusterSets. {@link isWorldNode}, {@link isWorldEdge}, and
 * {@link isWorldPresence} recover those native markers so a world node/edge/
 * presence is never confused with a video stub or a claim/ontology edge.
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

import { deriveId } from './layers-id-map.js'

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

/**
 * The flat edge-property marking a graph edge as a world-model relation. It is
 * the native world-edge discriminator: a claim-relation or ontology-relation edge
 * (which connect claim / type nodes) carries none, so an edge sharing an edgeType
 * is never mistaken for a world relation.
 */
const KEY_WORLD_ROLE = 'worldRole'
const WORLD_ROLE_RELATION = 'relation'

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

/** Reads one feature value by key, or null. */
function readFeature(entries: FeatureEntry[], key: string): string | null {
  for (const entry of entries) if (entry.key === key) return entry.value
  return null
}

// --- read row shapes ---------------------------------------------------------

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
