import type { GlossItem } from './gloss'
import type { Time } from './temporal'

/**
 * @interface Entity
 * @description Represents a real-world object, person, place, or concept
 * that can be referenced in annotations.
 *
 * @remarks
 * Entities are persona-independent world objects. Different personas can
 * assign different types to the same entity through EntityTypeAssignment.
 *
 * @example
 * ```typescript
 * const entity: Entity = {
 *   id: 'entity-123',
 *   name: 'John Smith',
 *   description: [{ type: 'text', content: 'The main speaker in the video' }],
 *   typeAssignments: [
 *     { personaId: 'persona-1', entityTypeId: 'person-type' }
 *   ],
 *   metadata: { alternateNames: ['John', 'Mr. Smith'] },
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface Entity {
  /** Unique identifier for the entity */
  id: string
  /** Display name for the entity */
  name: string
  /** Rich text description with optional references */
  description: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when imported */
  importedAt?: string
  /** Type assignments from different personas */
  typeAssignments: EntityTypeAssignment[]
  /** Additional metadata about the entity */
  metadata: {
    /** Alternative names or aliases */
    alternateNames?: string[]
    /** External identifiers (e.g., IMDb ID, DOI) */
    externalIds?: Record<string, string>
    /** Custom properties */
    properties?: Record<string, unknown>
  }
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface EntityTypeAssignment
 * @description Assigns an entity type to an entity from a specific persona's perspective.
 */
export interface EntityTypeAssignment {
  /** ID of the persona making this assignment */
  personaId: string
  /** ID of the entity type being assigned */
  entityTypeId: string
  /** Confidence score for this assignment (0-1) */
  confidence?: number
  /** Explanation for why this type was assigned */
  justification?: string
}

/**
 * @interface Event
 * @description Represents an action, process, or state change in the world.
 * Events involve participants in various roles and can have temporal and spatial extent.
 *
 * @remarks
 * Events are interpreted differently by different personas through EventInterpretation.
 * Each persona can assign different event types and participant structures.
 */
export interface Event {
  /** Unique identifier for the event */
  id: string
  /** Display name for the event */
  name: string
  /** Rich text description with optional references */
  description: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when imported */
  importedAt?: string
  /** Interpretations from different personas */
  personaInterpretations: EventInterpretation[]
  /** When this event occurred */
  time?: Time
  /** Where this event occurred */
  location?: Location
  /** Additional metadata */
  metadata: {
    /** How certain we are this event occurred */
    certainty?: number
    /** Custom properties */
    properties?: Record<string, unknown>
  }
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface EventInterpretation
 * @description A persona's interpretation of an event, including type and participants.
 */
export interface EventInterpretation {
  /** ID of the persona providing this interpretation */
  personaId: string
  /** ID of the event type assigned by this persona */
  eventTypeId: string
  /** Participants in this event with their roles */
  participants: Array<{
    /** ID of the participating entity */
    entityId: string
    /** ID of the role type the entity fills */
    roleTypeId: string
  }>
  /** Confidence score for this interpretation (0-1) */
  confidence?: number
  /** Explanation for this interpretation */
  justification?: string
}

/**
 * @interface Location
 * @description A spatial location, extending Entity with geographic information.
 * Can be a point location or an extent (area/region).
 */
export interface Location extends Entity {
  /** Whether this is a point or an area */
  locationType: 'point' | 'extent'
  /** Coordinate system used for this location */
  coordinateSystem?: 'GPS' | 'cartesian' | 'relative'
}

/**
 * @interface LocationPoint
 * @description A point location with specific coordinates.
 */
export interface LocationPoint extends Location {
  /** Discriminator for point type */
  locationType: 'point'
  /** Geographic or spatial coordinates */
  coordinates: {
    /** GPS latitude */
    latitude?: number
    /** GPS longitude */
    longitude?: number
    /** Altitude in meters */
    altitude?: number
    /** X coordinate (for cartesian/relative systems) */
    x?: number
    /** Y coordinate (for cartesian/relative systems) */
    y?: number
    /** Z coordinate (for cartesian/relative systems) */
    z?: number
  }
}

/**
 * @interface LocationExtent
 * @description An area or region defined by a boundary polygon.
 */
export interface LocationExtent extends Location {
  /** Discriminator for extent type */
  locationType: 'extent'
  /** Boundary polygon as array of coordinate points */
  boundary: Array<{
    /** GPS latitude */
    latitude?: number
    /** GPS longitude */
    longitude?: number
    /** Altitude in meters */
    altitude?: number
    /** X coordinate (for cartesian/relative systems) */
    x?: number
    /** Y coordinate (for cartesian/relative systems) */
    y?: number
    /** Z coordinate (for cartesian/relative systems) */
    z?: number
  }>
  /** Axis-aligned bounding box for quick spatial queries */
  boundingBox?: {
    /** Minimum latitude */
    minLatitude?: number
    /** Maximum latitude */
    maxLatitude?: number
    /** Minimum longitude */
    minLongitude?: number
    /** Maximum longitude */
    maxLongitude?: number
    /** Minimum altitude */
    minAltitude?: number
    /** Maximum altitude */
    maxAltitude?: number
  }
}

/**
 * @interface EntityCollection
 * @description A collection of entities grouped by some criterion.
 * Supports various collection semantics (groups, kinds, stages, etc.).
 */
export interface EntityCollection {
  /** Unique identifier for the collection */
  id: string
  /** Display name for the collection */
  name: string
  /** Rich text description of the collection */
  description: GlossItem[]
  /** IDs of entities in this collection */
  entityIds: string[]
  /** Semantic type of collection */
  collectionType: 'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'
  /** Type assignments from different personas */
  typeAssignments: EntityTypeAssignment[]
  /** Properties of the collection as a whole */
  aggregateProperties?: {
    /** Whether all members share the same properties */
    homogeneous?: boolean
    /** Whether the collection has a meaningful order */
    ordered?: boolean
    /** Mass/count distinction for the collection */
    mereological?: 'mass' | 'count' | 'mixed'
  }
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface EventCollection
 * @description A collection of events with structural relationships.
 * Supports sequences, iterations, complex events, and alternatives.
 */
export interface EventCollection {
  /** Unique identifier for the collection */
  id: string
  /** Display name for the collection */
  name: string
  /** Rich text description of the collection */
  description: GlossItem[]
  /** IDs of events in this collection */
  eventIds: string[]
  /** Semantic type of collection */
  collectionType: 'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'
  /** Type assignments from different personas */
  typeAssignments: Array<{
    /** ID of the persona making this assignment */
    personaId: string
    /** ID of the event type assigned to this collection */
    eventTypeId: string
    /** Confidence score (0-1) */
    confidence?: number
    /** Explanation for the assignment */
    justification?: string
  }>
  /** ID of associated time collection (for temporal structure) */
  timeCollectionId?: string
  /** Hierarchical structure of events within the collection */
  structure?: EventStructureNode
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface EventStructureNode
 * @description Node in a hierarchical event structure tree.
 * Represents how events relate to each other within a collection.
 */
export interface EventStructureNode {
  /** ID of the event at this node (leaf nodes only) */
  eventId?: string
  /** Child nodes in the structure */
  children?: EventStructureNode[]
  /** Relation type connecting children to this node */
  relationTypeId?: string
  /** Label for this structural element */
  label?: string
  /** Whether this structural element is optional */
  optional?: boolean
}
