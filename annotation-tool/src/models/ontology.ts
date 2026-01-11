import type { GlossItem, TypeConstraint } from './gloss'

/**
 * @interface EntityType
 * @description Defines a type of entity in the ontology. Entity types categorize
 * real-world objects, people, places, or concepts that can be referenced in annotations.
 * Can be imported from Wikidata or created manually.
 */
export interface EntityType {
  /** Unique identifier for the entity type */
  id: string
  /** Display name for the entity type */
  name: string
  /** Rich text definition/description of the entity type */
  gloss: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when the type was imported */
  importedAt?: string
  /** Constraints applied to instances of this type */
  constraints?: TypeConstraint[]
  /** Example instances of this type */
  examples?: string[]
  /** ISO 8601 timestamp of when the type was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}

/**
 * @interface RoleType
 * @description Defines a semantic role that entities or events can play
 * in event structures. For example, "agent", "patient", "instrument".
 */
export interface RoleType {
  /** Unique identifier for the role type */
  id: string
  /** Display name for the role type */
  name: string
  /** Rich text definition/description of the role type */
  gloss: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when the type was imported */
  importedAt?: string
  /** Types of fillers allowed for this role (entities or events) */
  allowedFillerTypes: ('entity' | 'event')[]
  /** Constraints applied to this role type */
  constraints?: TypeConstraint[]
  /** Example usages of this role */
  examples?: string[]
  /** ISO 8601 timestamp of when the type was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}

/**
 * @interface EventRole
 * @description Defines a role slot within an event type, specifying
 * which role types can participate and their cardinality constraints.
 */
export interface EventRole {
  /** The role type that fills this slot */
  roleTypeId: string
  /** Whether this role is optional in the event */
  optional: boolean
  /** Role IDs that are mutually exclusive with this role */
  excludes?: string[]
  /** Minimum number of fillers required for this role */
  minOccurrences?: number
  /** Maximum number of fillers allowed for this role */
  maxOccurrences?: number
}

/**
 * @interface EventType
 * @description Defines a type of event in the ontology. Event types represent
 * actions, processes, or state changes that involve participants in various roles.
 * Can form hierarchies through parentEventId.
 */
export interface EventType {
  /** Unique identifier for the event type */
  id: string
  /** Display name for the event type */
  name: string
  /** Rich text definition/description of the event type */
  gloss: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when the type was imported */
  importedAt?: string
  /** Role slots that participants can fill in this event */
  roles: EventRole[]
  /** Parent event type for hierarchical event structures */
  parentEventId?: string
  /** Example instances of this event type */
  examples?: string[]
  /** ISO 8601 timestamp of when the type was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}

/**
 * @interface RelationType
 * @description Defines a type of relation that can hold between ontology elements.
 * Relations can be symmetric, transitive, and have constraints on source/target types.
 */
export interface RelationType {
  /** Unique identifier for the relation type */
  id: string
  /** Display name for the relation type */
  name: string
  /** Rich text definition/description of the relation */
  gloss: GlossItem[]
  /** Q-identifier from Wikidata (original ID) */
  wikidataId?: string
  /** Local Wikibase ID (only set when using offline Wikibase) */
  wikibaseId?: string
  /** Full URL to Wikidata entry */
  wikidataUrl?: string
  /** Source of the import (wikidata or persona) */
  importedFrom?: 'wikidata' | 'persona'
  /** ISO timestamp when the type was imported */
  importedAt?: string
  /** Types of elements that can be the source of this relation */
  sourceTypes: ('entity' | 'role' | 'event' | 'time' | 'claim')[]
  /** Types of elements that can be the target of this relation */
  targetTypes: ('entity' | 'role' | 'event' | 'time' | 'claim')[]
  /** Constraints applied to this relation type */
  constraints?: TypeConstraint[]
  /** Whether the relation holds in both directions (A->B implies B->A) */
  symmetric?: boolean
  /** Whether the relation is transitive (A->B and B->C implies A->C) */
  transitive?: boolean
  /** Example usages of this relation */
  examples?: string[]
  /** ISO 8601 timestamp of when the type was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}

/**
 * @interface OntologyRelation
 * @description An instance of a relation between two ontology elements.
 * Links entities, roles, events, times, or claims with a specific relation type.
 */
export interface OntologyRelation {
  /** Unique identifier for this relation instance */
  id: string
  /** The type of relation being instantiated */
  relationTypeId: string
  /** The type of the source element */
  sourceType: 'entity' | 'role' | 'event' | 'time' | 'claim'
  /** The ID of the source element */
  sourceId: string
  /** The type of the target element */
  targetType: 'entity' | 'role' | 'event' | 'time' | 'claim'
  /** The ID of the target element */
  targetId: string
  /** Additional metadata about this relation instance */
  metadata?: Record<string, unknown>
  /** ISO 8601 timestamp of when the relation was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}
