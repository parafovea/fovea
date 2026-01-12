/**
 * @file prisma-json.ts
 * @description Type-safe helpers for working with Prisma JSON fields.
 *
 * Prisma stores JSON fields as `Prisma.JsonValue` which is a union type that
 * doesn't preserve our application type information. These helpers provide
 * type-safe access to JSON fields by using runtime validation.
 */

import type { Prisma } from '@prisma/client'
import type {
  EntityType,
  RoleType,
  EventType,
  RelationType,
  Entity,
  Event,
  Time,
  EntityCollection,
  EventCollection,
  TimeCollection,
  OntologyRelation,
  GlossItem,
} from '@models/types.js'

/**
 * Minimal interface for types that have a gloss field.
 * Matches the interface exported from reference-cleanup.ts.
 */
interface TypeWithGloss {
  id: string
  name: string
  gloss?: GlossItem[]
}

/**
 * Type guard to check if a value is an array.
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * Type guard to check if a value is an object with an id and name.
 */
function isNamedObject(value: unknown): value is { id: string; name: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string'
  )
}

/**
 * Asserts that a Prisma JSON value is an array of types with gloss.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asTypesWithGloss(value: Prisma.JsonValue | null | undefined): TypeWithGloss[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as TypeWithGloss[]
}

/**
 * Asserts that a Prisma JSON value is an array of EntityType.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEntityTypes(value: Prisma.JsonValue | null | undefined): EntityType[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as EntityType[]
}

/**
 * Asserts that a Prisma JSON value is an array of RoleType.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asRoleTypes(value: Prisma.JsonValue | null | undefined): RoleType[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as RoleType[]
}

/**
 * Asserts that a Prisma JSON value is an array of EventType.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEventTypes(value: Prisma.JsonValue | null | undefined): EventType[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as EventType[]
}

/**
 * Asserts that a Prisma JSON value is an array of RelationType.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asRelationTypes(value: Prisma.JsonValue | null | undefined): RelationType[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as RelationType[]
}

/**
 * Asserts that a Prisma JSON value is an array of OntologyRelation.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asOntologyRelations(value: Prisma.JsonValue | null | undefined): OntologyRelation[] {
  if (!value || !isArray(value)) return []
  const filtered: unknown[] = value.filter(item =>
    typeof item === 'object' && item !== null && 'id' in item && 'relationTypeId' in item
  )
  return filtered as OntologyRelation[]
}

/**
 * Asserts that a Prisma JSON value is an array of Entity (world object).
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEntities(value: Prisma.JsonValue | null | undefined): Entity[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as Entity[]
}

/**
 * Asserts that a Prisma JSON value is an array of Event (world object).
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEvents(value: Prisma.JsonValue | null | undefined): Event[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as Event[]
}

/**
 * Asserts that a Prisma JSON value is an array of Time (world object).
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asTimes(value: Prisma.JsonValue | null | undefined): Time[] {
  if (!value || !isArray(value)) return []
  const filtered: unknown[] = value.filter(item =>
    typeof item === 'object' && item !== null && 'id' in item && 'type' in item
  )
  return filtered as Time[]
}

/**
 * Asserts that a Prisma JSON value is an array of EntityCollection.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEntityCollections(value: Prisma.JsonValue | null | undefined): EntityCollection[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as EntityCollection[]
}

/**
 * Asserts that a Prisma JSON value is an array of EventCollection.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asEventCollections(value: Prisma.JsonValue | null | undefined): EventCollection[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as EventCollection[]
}

/**
 * Asserts that a Prisma JSON value is an array of TimeCollection.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asTimeCollections(value: Prisma.JsonValue | null | undefined): TimeCollection[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as TimeCollection[]
}

/**
 * World relation structure from JSON.
 */
export interface WorldRelation {
  id: string
  relationTypeId: string
  sourceType: 'entity' | 'event' | 'time'
  sourceId: string
  targetType: 'entity' | 'event' | 'time'
  targetId: string
}

/**
 * Asserts that a Prisma JSON value is an array of WorldRelation.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asWorldRelations(value: Prisma.JsonValue | null | undefined): WorldRelation[] {
  if (!value || !isArray(value)) return []
  const filtered: unknown[] = value.filter(item =>
    typeof item === 'object' && item !== null && 'id' in item && 'sourceId' in item
  )
  return filtered as WorldRelation[]
}

/**
 * World collection structure from JSON (for entity/event/time collections with members array).
 */
export interface WorldCollection {
  id: string
  name: string
  members?: string[]
}

/**
 * Asserts that a Prisma JSON value is an array of WorldCollection.
 * Returns empty array if the value is null/undefined or not an array.
 */
export function asWorldCollections(value: Prisma.JsonValue | null | undefined): WorldCollection[] {
  if (!value || !isArray(value)) return []
  return value.filter(isNamedObject) as WorldCollection[]
}
