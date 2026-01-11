/**
 * @file reference-cleanup.ts
 * @description Helper functions for cleaning up references when types or world objects are deleted.
 * Implements the "Convert References to Text" strategy (Option 3) for graceful deletion.
 */

/**
 * Gloss item structure from the frontend.
 */
interface GlossItem {
  type: 'text' | 'typeRef' | 'objectRef' | 'annotationRef' | 'claimRef'
  content: string
  refType?: string
  refPersonaId?: string | null
  refClaimId?: string
}

/**
 * Type definition for ontology types with gloss arrays.
 */
interface TypeWithGloss {
  id: string
  name: string
  gloss?: GlossItem[]
  [key: string]: unknown
}

/**
 * Converts typeRef items in a gloss array to plain text when the referenced type is deleted.
 *
 * @param gloss - Array of gloss items
 * @param deletedTypeId - ID of the type being deleted
 * @param deletedPersonaId - ID of the persona whose type is being deleted
 * @param deletedRefType - The refType category ('entity', 'role', 'event', 'relation')
 * @returns Updated gloss array with matching typeRefs converted to text
 */
export function convertTypeRefsToText(
  gloss: GlossItem[],
  deletedTypeId: string,
  deletedPersonaId: string,
  deletedRefType: 'entity' | 'role' | 'event' | 'relation'
): GlossItem[] {
  return gloss.map(item => {
    if (
      item.type === 'typeRef' &&
      item.content === deletedTypeId &&
      item.refType === deletedRefType &&
      item.refPersonaId === deletedPersonaId
    ) {
      // Convert to plain text, preserving the display content
      // We need to look up the type name, but since we're deleting it,
      // we'll mark it as [Deleted Type] or use a placeholder
      return {
        type: 'text' as const,
        content: item.content // This will just show the ID; see note below
      }
    }
    return item
  })
}

/**
 * Converts typeRef items in a gloss array to plain text, using the type name.
 * This version takes the deleted type's name to use as the replacement text.
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
      // Convert to plain text using the type name
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
      // Convert to plain text using the object name
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

    // Only return updated type if gloss actually changed
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
export function countTypeRefsInGlosses<T extends TypeWithGloss>(
  types: T[],
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
export function countObjectRefsInGlosses<T extends TypeWithGloss>(
  types: T[],
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
  eventTypes: Array<{ id: string; roles?: Array<{ roleTypeId: string }> } & TypeWithGloss>,
  deletedRoleTypeId: string
): Array<{ id: string; roles?: Array<{ roleTypeId: string }> } & TypeWithGloss> {
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
 * World object types for type assignments.
 */
interface EntityWithAssignments {
  id: string
  name?: string
  typeAssignments?: Array<{ personaId: string; typeId: string; [key: string]: unknown }>
  [key: string]: unknown
}

interface EventWithInterpretations {
  id: string
  name?: string
  personaInterpretations?: Array<{ personaId: string; eventTypeId: string; [key: string]: unknown }>
  [key: string]: unknown
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
  entities: EntityWithAssignments[],
  deletedTypeId: string,
  deletedPersonaId: string
): EntityWithAssignments[] {
  return entities.map(entity => {
    if (!entity.typeAssignments || entity.typeAssignments.length === 0) {
      return entity
    }

    const filtered = entity.typeAssignments.filter(
      a => !(a.personaId === deletedPersonaId && a.typeId === deletedTypeId)
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
  events: EventWithInterpretations[],
  deletedEventTypeId: string,
  deletedPersonaId: string
): EventWithInterpretations[] {
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
  entities: EntityWithAssignments[],
  targetTypeId: string,
  targetPersonaId: string
): number {
  let count = 0
  for (const entity of entities) {
    if (!entity.typeAssignments) continue
    count += entity.typeAssignments.filter(
      a => a.personaId === targetPersonaId && a.typeId === targetTypeId
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
  events: EventWithInterpretations[],
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
