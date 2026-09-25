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
import type { Prisma } from '@prisma/client'

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
 * A deleted thing whose inline gloss mentions must be frozen to its display name.
 * `kind` selects the GlossItem variant to match; `id` is the referenced id; `name`
 * is the human-readable text that replaces each mention. `refPersonaId`/`refType`
 * narrow a typeRef/objectRef match when supplied (a typeRef is persona-scoped).
 */
export interface DereferenceTarget {
  kind: 'typeRef' | 'objectRef' | 'claimRef' | 'annotationRef'
  id: string
  name: string
  refPersonaId?: string | null
  refType?: GlossItem['refType']
}

/** Whether a gloss item is an inline reference to the deleted target. */
function glossItemMatches(item: GlossItem, target: DereferenceTarget): boolean {
  if (item.type !== target.kind) return false
  switch (target.kind) {
    case 'typeRef':
      return (
        item.content === target.id &&
        (target.refType === undefined || item.refType === target.refType) &&
        (target.refPersonaId === undefined || item.refPersonaId === target.refPersonaId)
      )
    case 'objectRef':
      return (
        item.content === target.id &&
        (target.refType === undefined || item.refType === target.refType)
      )
    case 'annotationRef':
      return item.content === target.id
    case 'claimRef':
      return item.refClaimId === target.id || item.content === target.id
  }
}

/**
 * Replaces every inline mention of a deleted thing in one gloss with its frozen
 * human-readable name, returning the rewritten gloss and the number of hits. This
 * is the single matcher the four kind-specific converters and the cross-carrier
 * sweep share, so the policy "a deleted thing mentioned in text becomes its name"
 * is enforced identically everywhere.
 *
 * @param gloss - the gloss items to rewrite
 * @param target - the deleted thing and its replacement name
 * @returns the rewritten gloss and the count of replaced mentions
 */
export function dereferenceGlossItems(
  gloss: GlossItem[],
  target: DereferenceTarget,
): { gloss: GlossItem[]; count: number } {
  let count = 0
  const rewritten = gloss.map((item) => {
    if (glossItemMatches(item, target)) {
      count++
      return { type: 'text' as const, content: target.name }
    }
    return item
  })
  return { gloss: rewritten, count }
}

/**
 * Freezes every inline mention of a deleted thing in VideoSummary.summary to its
 * display name. Unlike glosses/descriptions/claim-prose, VideoSummary.summary is a
 * plain GlossItem[] JSON column (not standoff), so this is a direct
 * read-rewrite-write rather than a standoff-regenerating aggregate rewrite.
 *
 * Candidate rows are prefiltered in the database: a matching GlossItem carries the
 * deleted id either in `content` (typeRef / objectRef / annotationRef) or in
 * `refClaimId` (claimRef). Prisma's `array_contains` compiles to the Postgres jsonb
 * `@>` operator, which matches when any array element contains the probe object, so
 * probing both keys selects every candidate. The precise, kind-aware match then runs
 * in memory via {@link dereferenceGlossItems}, so an over-selected row is harmless
 * and is left unwritten (its rewrite count is zero).
 *
 * Runs on the caller's transaction client so the rewrite commits — or rolls back —
 * atomically with the delete that drives it.
 *
 * @param tx - the transaction client the driving delete runs on
 * @param target - the deleted thing and the display name to freeze its mentions to
 * @returns the total number of summary mentions frozen to text
 */
export async function dereferenceSummaries(
  tx: Prisma.TransactionClient,
  target: DereferenceTarget,
): Promise<number> {
  const candidates = await tx.videoSummary.findMany({
    where: {
      OR: [
        { summary: { array_contains: [{ content: target.id }] } },
        { summary: { array_contains: [{ refClaimId: target.id }] } },
      ],
    },
    select: { id: true, summary: true },
  })

  let total = 0
  for (const row of candidates) {
    if (!Array.isArray(row.summary)) continue
    const { gloss, count } = dereferenceGlossItems(row.summary as unknown as GlossItem[], target)
    if (count === 0) continue
    total += count
    await tx.videoSummary.update({
      where: { id: row.id },
      data: { summary: gloss as unknown as Prisma.InputJsonValue },
    })
  }
  return total
}

/**
 * Converts claimRef items in a gloss to plain text when the referenced claim is
 * deleted, mirroring {@link convertObjectRefsToText}.
 *
 * @param gloss - the gloss items
 * @param deletedClaimId - id of the deleted claim
 * @param claimName - the claim's human-readable name/text used as replacement
 * @returns the gloss with matching claimRefs frozen to text
 */
export function convertClaimRefsToText(
  gloss: GlossItem[],
  deletedClaimId: string,
  claimName: string,
): GlossItem[] {
  return dereferenceGlossItems(gloss, { kind: 'claimRef', id: deletedClaimId, name: claimName }).gloss
}

/**
 * Converts annotationRef items in a gloss to plain text when the referenced
 * annotation is deleted, mirroring {@link convertObjectRefsToText}.
 *
 * @param gloss - the gloss items
 * @param deletedAnnotationId - id of the deleted annotation
 * @param annotationLabel - the annotation's human-readable label used as replacement
 * @returns the gloss with matching annotationRefs frozen to text
 */
export function convertAnnotationRefsToText(
  gloss: GlossItem[],
  deletedAnnotationId: string,
  annotationLabel: string,
): GlossItem[] {
  return dereferenceGlossItems(gloss, {
    kind: 'annotationRef',
    id: deletedAnnotationId,
    name: annotationLabel,
  }).gloss
}

/** Counts claimRef mentions of a claim across the given glosses, for previews. */
export function countClaimRefsInGlosses(glosses: Array<GlossItem[] | undefined>, claimId: string): number {
  let count = 0
  for (const gloss of glosses) {
    if (!gloss) continue
    for (const item of gloss) {
      if (item.type === 'claimRef' && (item.refClaimId === claimId || item.content === claimId)) count++
    }
  }
  return count
}

/** Counts annotationRef mentions of an annotation across the given glosses, for previews. */
export function countAnnotationRefsInGlosses(
  glosses: Array<GlossItem[] | undefined>,
  annotationId: string,
): number {
  let count = 0
  for (const gloss of glosses) {
    if (!gloss) continue
    for (const item of gloss) {
      if (item.type === 'annotationRef' && item.content === annotationId) count++
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
