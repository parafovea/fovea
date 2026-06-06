/**
 * @file reference-cleanup.ts
 * @description Helper functions for cleaning up references when types or world objects are deleted.
 * Implements the "Convert References to Text" strategy (Option 3) for graceful deletion.
 */

import type {
  GlossItem,
  EntityType,
  RoleType,
  EventType,
  RelationType,
  Entity,
  Event,
} from '@models/types.js'

/**
 * Minimal interface for types that have a gloss field.
 * Used by reference cleanup functions that only need access to id, name, and gloss.
 */
export interface TypeWithGloss {
  id: string
  name: string
  gloss?: GlossItem[]
}

/**
 * Ontology type with gloss - union of all types that have a gloss field.
 */
export type OntologyTypeWithGloss = EntityType | RoleType | EventType | RelationType

/**
 * Converts typeRef items in a gloss array to plain text, using the type name.
 * This is the only production path; callers go through `updateGlossesInTypes`.
 *
 * @param gloss - Array of gloss items
 * @param deletedTypeId - ID of the type being deleted
 * @param deletedPersonaId - ID of the persona whose type is being deleted
 * @param deletedRefType - The refType category ('entity', 'role', 'event', 'relation')
 * @param typeName - Name of the deleted type to use as replacement text
 * @returns Updated gloss array with matching typeRefs converted to text
 */
export function convertTypeRefsToTextWithName(
  gloss: GlossItem[],
  deletedTypeId: string,
  deletedPersonaId: string,
  deletedRefType: 'entity' | 'role' | 'event' | 'relation',
  typeName: string
): GlossItem[] {
  return gloss.map(item => {
    if (
      item.type === 'typeRef' &&
      item.content === deletedTypeId &&
      item.refType === deletedRefType &&
      item.refPersonaId === deletedPersonaId
    ) {
      return {
        type: 'text' as const,
        content: typeName
      }
    }
    return item
  })
}

/**
 * Converts objectRef items in a gloss array to plain text when the referenced world object is deleted.
 *
 * @param gloss - Array of gloss items
 * @param deletedObjectId - ID of the world object being deleted
 * @param deletedRefType - The refType category ('entity-object', 'event-object', 'time-object', 'location-object')
 * @param objectName - Name/label of the deleted object to use as replacement text
 * @returns Updated gloss array with matching objectRefs converted to text
 */
export function convertObjectRefsToText(
  gloss: GlossItem[],
  deletedObjectId: string,
  deletedRefType: 'entity-object' | 'event-object' | 'time-object' | 'location-object',
  objectName: string
): GlossItem[] {
  return gloss.map(item => {
    if (
      item.type === 'objectRef' &&
      item.content === deletedObjectId &&
      item.refType === deletedRefType
    ) {
      return {
        type: 'text' as const,
        content: objectName
      }
    }
    return item
  })
}

/**
 * Updates all types in an ontology array to convert references to a deleted type to plain text.
 *
 * @param types - Array of ontology types (entities, roles, events, or relationTypes)
 * @param deletedTypeId - ID of the type being deleted
 * @param deletedPersonaId - ID of the persona whose type is being deleted
 * @param deletedRefType - The refType category
 * @param typeName - Name of the deleted type
 * @returns Updated array with all typeRefs converted
 */
export function updateGlossesInTypes<T extends TypeWithGloss>(
  types: T[],
  deletedTypeId: string,
  deletedPersonaId: string,
  deletedRefType: 'entity' | 'role' | 'event' | 'relation',
  typeName: string
): T[] {
  return types.map(type => {
    if (!type.gloss || type.gloss.length === 0) {
      return type
    }

    const updatedGloss = convertTypeRefsToTextWithName(
      type.gloss,
      deletedTypeId,
      deletedPersonaId,
      deletedRefType,
      typeName
    )

    const hasChanges = JSON.stringify(type.gloss) !== JSON.stringify(updatedGloss)
    if (hasChanges) {
      return { ...type, gloss: updatedGloss }
    }
    return type
  })
}

/**
 * Counts typeRef items in glosses that reference a specific type.
 * Used for deletion preview.
 *
 * @param types - Array of ontology types
 * @param targetTypeId - ID of the type to count references to
 * @param targetPersonaId - Persona ID of the type
 * @param targetRefType - The refType category
 * @returns Number of references found
 */
export function countTypeRefsInGlosses(
  types: TypeWithGloss[],
  targetTypeId: string,
  targetPersonaId: string,
  targetRefType: 'entity' | 'role' | 'event' | 'relation'
): number {
  let count = 0
  for (const type of types) {
    if (!type.gloss) continue
    for (const item of type.gloss) {
      if (
        item.type === 'typeRef' &&
        item.content === targetTypeId &&
        item.refType === targetRefType &&
        item.refPersonaId === targetPersonaId
      ) {
        count++
      }
    }
  }
  return count
}

/**
 * Counts objectRef items in glosses that reference a specific world object.
 * Used for deletion preview.
 *
 * @param types - Array of ontology types
 * @param targetObjectId - ID of the world object to count references to
 * @param targetRefType - The refType category
 * @returns Number of references found
 */
export function countObjectRefsInGlosses(
  types: TypeWithGloss[],
  targetObjectId: string,
  targetRefType: 'entity-object' | 'event-object' | 'time-object' | 'location-object'
): number {
  let count = 0
  for (const type of types) {
    if (!type.gloss) continue
    for (const item of type.gloss) {
      if (
        item.type === 'objectRef' &&
        item.content === targetObjectId &&
        item.refType === targetRefType
      ) {
        count++
      }
    }
  }
  return count
}

/**
 * Removes role references from event types when a role type is deleted.
 *
 * @param eventTypes - Array of event types
 * @param deletedRoleTypeId - ID of the role type being deleted
 * @returns Updated event types with role references removed
 */
export function removeRoleFromEventTypes(
  eventTypes: EventType[],
  deletedRoleTypeId: string
): EventType[] {
  return eventTypes.map(eventType => {
    if (!eventType.roles || eventType.roles.length === 0) {
      return eventType
    }

    const filteredRoles = eventType.roles.filter(role => role.roleTypeId !== deletedRoleTypeId)

    if (filteredRoles.length !== eventType.roles.length) {
      return { ...eventType, roles: filteredRoles }
    }
    return eventType
  })
}

/**
 * Removes type assignments from entities when a type is deleted.
 *
 * @param entities - Array of world entities
 * @param deletedTypeId - ID of the type being deleted
 * @param deletedPersonaId - Persona ID of the deleted type
 * @returns Updated entities with matching type assignments removed
 */
export function removeTypeAssignmentsFromEntities(
  entities: Entity[],
  deletedTypeId: string,
  deletedPersonaId: string
): Entity[] {
  return entities.map(entity => {
    if (!entity.typeAssignments || entity.typeAssignments.length === 0) {
      return entity
    }

    const filtered = entity.typeAssignments.filter(
      a => !(a.personaId === deletedPersonaId && a.entityTypeId === deletedTypeId)
    )

    if (filtered.length !== entity.typeAssignments.length) {
      return { ...entity, typeAssignments: filtered }
    }
    return entity
  })
}

/**
 * Removes event interpretations from events when an event type is deleted.
 *
 * @param events - Array of world events
 * @param deletedEventTypeId - ID of the event type being deleted
 * @param deletedPersonaId - Persona ID of the deleted type
 * @returns Updated events with matching interpretations removed
 */
export function removeEventInterpretationsFromEvents(
  events: Event[],
  deletedEventTypeId: string,
  deletedPersonaId: string
): Event[] {
  return events.map(event => {
    if (!event.personaInterpretations || event.personaInterpretations.length === 0) {
      return event
    }

    const filtered = event.personaInterpretations.filter(
      i => !(i.personaId === deletedPersonaId && i.eventTypeId === deletedEventTypeId)
    )

    if (filtered.length !== event.personaInterpretations.length) {
      return { ...event, personaInterpretations: filtered }
    }
    return event
  })
}

/**
 * Counts type assignments that reference a specific entity type.
 *
 * @param entities - Array of world entities
 * @param targetTypeId - ID of the type to count
 * @param targetPersonaId - Persona ID
 * @returns Count of matching assignments
 */
export function countTypeAssignments(
  entities: Entity[],
  targetTypeId: string,
  targetPersonaId: string
): number {
  let count = 0
  for (const entity of entities) {
    if (!entity.typeAssignments) continue
    count += entity.typeAssignments.filter(
      a => a.personaId === targetPersonaId && a.entityTypeId === targetTypeId
    ).length
  }
  return count
}

/**
 * Counts event interpretations that reference a specific event type.
 *
 * @param events - Array of world events
 * @param targetEventTypeId - ID of the event type to count
 * @param targetPersonaId - Persona ID
 * @returns Count of matching interpretations
 */
export function countEventInterpretations(
  events: Event[],
  targetEventTypeId: string,
  targetPersonaId: string
): number {
  let count = 0
  for (const event of events) {
    if (!event.personaInterpretations) continue
    count += event.personaInterpretations.filter(
      i => i.personaId === targetPersonaId && i.eventTypeId === targetEventTypeId
    ).length
  }
  return count
}
