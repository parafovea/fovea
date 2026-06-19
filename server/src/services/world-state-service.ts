import { Prisma, type WorldState as PrismaWorldState } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, InternalError, ForbiddenError } from '../lib/errors.js'
import { demoWidensWorldState } from '../lib/demo-rbac.js'
import { isSingleUserMode } from './user-service.js'
import { config } from '../config.js'
import { convertObjectRefsToText, countObjectRefsInGlosses } from '../lib/reference-cleanup.js'
import {
  asEntityTypes,
  asRoleTypes,
  asEventTypes,
  asRelationTypes,
  asEntities,
  asEvents,
  asTimes,
  asWorldRelations,
  asWorldCollections,
} from '../lib/prisma-json.js'
import { WorldStateRepository } from '../repositories/WorldStateRepository.js'

/**
 * Converts a typed array to Prisma.InputJsonValue for storage in JSON columns.
 * Prisma JSON columns accept any serializable value at runtime; this function
 * bridges the TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Partial world state update fields. All fields are optional; only provided
 * fields are written.
 */
export interface WorldStateUpdateInput {
  entities?: unknown[]
  events?: unknown[]
  times?: unknown[]
  entityCollections?: unknown[]
  eventCollections?: unknown[]
  timeCollections?: unknown[]
  relations?: unknown[]
}

/**
 * API-facing world state shape: the entity/event/time/collection/relation JSON
 * arrays plus the id, userId, and ISO timestamps.
 */
export interface WorldStateResponse {
  id: string
  userId: string
  entities: unknown[]
  events: unknown[]
  times: unknown[]
  entityCollections: unknown[]
  eventCollections: unknown[]
  timeCollections: unknown[]
  relations: unknown[]
  createdAt: string
  updatedAt: string
}

/** Counts returned by a world-object deletion preview. */
export interface WorldObjectDeletionPreview {
  glossReferences: number
  annotationCount: number
  relationCount: number
  collectionMemberships: number
}

/** Success payload returned by a world-object deletion with cleanup. */
export interface WorldObjectDeletionResult {
  message: string
  cleanedUp: {
    glossReferences: number
    relations: number
    collectionMemberships: number
  }
}

/**
 * Owns world-state business rules and RBAC, delegating all data access to a
 * WorldStateRepository. Construct one per request from the request-scoped CASL
 * ability and the authenticated user's id and system role.
 *
 * WorldState rows are keyed by (userId, projectId); a user owns their personal
 * state (projectId = null). The service performs every authorization decision:
 * the mode-branch user resolution, instance-level `can()` checks, the create
 * pre-check, the `accessibleBy` read filter, and the demo-mode read widening.
 * The repository performs none.
 *
 * @example
 * ```typescript
 * const service = new WorldStateService(repository, request.ability ?? null, request.user?.id, request.user?.systemRole ?? undefined)
 * const worldState = await service.getOrCreatePersonal()
 * ```
 */
export class WorldStateService {
  constructor(
    private readonly repository: WorldStateRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
    _systemRole: string | undefined
  ) {}

  /**
   * Resolves the user ID to operate on: the authenticated user, or the
   * configured default user in single-user mode.
   *
   * @returns the resolved user ID
   * @throws {InternalError} when the default user is missing in single-user mode
   * @throws {UnauthorizedError} when no user is present and not in single-user mode
   */
  private async resolveUserId(): Promise<string> {
    if (this.userId) {
      return this.userId
    } else if (isSingleUserMode()) {
      const defaultUser = await this.repository.findUserByUsername(config.defaultUser.username)
      if (!defaultUser) {
        throw new InternalError('Default user not found in single-user mode')
      }
      return defaultUser.id
    } else {
      throw new UnauthorizedError('Authentication required')
    }
  }

  /**
   * Maps a world state row to the API response shape: JSON arrays default to
   * empty, and dates become ISO strings.
   */
  private mapResponse(worldState: PrismaWorldState): WorldStateResponse {
    return {
      id: worldState.id,
      userId: worldState.userId,
      entities: (worldState.entities as unknown[]) || [],
      events: (worldState.events as unknown[]) || [],
      times: (worldState.times as unknown[]) || [],
      entityCollections: (worldState.entityCollections as unknown[]) || [],
      eventCollections: (worldState.eventCollections as unknown[]) || [],
      timeCollections: (worldState.timeCollections as unknown[]) || [],
      relations: (worldState.relations as unknown[]) || [],
      createdAt: worldState.createdAt.toISOString(),
      updatedAt: worldState.updatedAt.toISOString()
    }
  }

  /**
   * Gets the caller's personal world state, creating an empty one if none
   * exists.
   *
   * A user always owns their personal world state, so the find-or-create
   * semantics are preserved. Read access is enforced via CASL (widened in demo
   * mode); creation is pre-authorized so future rule tightening cannot be
   * bypassed, with a demo-mode override that lets each anonymous user lazily
   * create their own row.
   *
   * @returns the world state in API shape
   * @throws {InternalError} when the default user is missing in single-user mode
   * @throws {UnauthorizedError} when authentication is required and absent
   * @throws {ForbiddenError} when read or create access is denied
   */
  async getOrCreatePersonal(): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()

    // Find or create personal world state for this user (projectId: null).
    // A user always owns their personal world state, so the findOrCreate
    // semantics are preserved. Before creating, pre-authorize via CASL so
    // future rule tightening cannot be bypassed.
    let worldState = await this.repository.findPersonalWorldState(userId)

    // Demo mode widens both the personal world-state read and the lazy create
    // for anonymous sessions; the local drives the read/create branching below
    // (see lib/demo-rbac.ts).
    const inDemoMode = demoWidensWorldState()

    if (worldState) {
      if (
        this.ability &&
        !this.ability.can('read', subject('WorldState', worldState)) &&
        !inDemoMode
      ) {
        throw new ForbiddenError('Cannot read this WorldState')
      }
    } else {
      if (this.ability && !inDemoMode) {
        // FOVEA_DEMO_MODE override: anonymous demo sessions have no
        // WorldState:create ability under their ephemeral role.
        // Widening here lets each anonymous user lazily create
        // their own personal world-state row. The row is always
        // scoped to userId so anonymous users never see one
        // another's state.
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!this.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
      worldState = await this.repository.createWorldState({
        userId,
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: []
      })
    }

    return this.mapResponse(worldState)
  }

  /**
   * Updates the caller's personal world state, creating it if it does not yet
   * exist. Only provided fields are written.
   *
   * Runs CASL `update` against an existing row before mutating it, or `create`
   * pre-authorization before creating a new row.
   *
   * @param input - partial world state update fields
   * @returns the updated world state in API shape
   * @throws {InternalError} when the default user is missing in single-user mode
   * @throws {UnauthorizedError} when authentication is required and absent
   * @throws {ForbiddenError} when update or create access is denied
   */
  async updatePersonal(input: WorldStateUpdateInput): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()

    // Find or create personal world state, then update. A user always owns
    // their personal world state (projectId: null) so the existence check
    // preserves the original semantics, but we still run CASL against the
    // row before mutating it.
    const existing = await this.repository.findPersonalWorldState(userId)

    let worldState
    if (existing) {
      if (this.ability && !this.ability.can('update', subject('WorldState', existing))) {
        throw new ForbiddenError('Cannot update this WorldState')
      }
      worldState = await this.repository.updateWorldState(existing.id, {
        entities: input.entities !== undefined ? toJson(input.entities) : undefined,
        events: input.events !== undefined ? toJson(input.events) : undefined,
        times: input.times !== undefined ? toJson(input.times) : undefined,
        entityCollections: input.entityCollections !== undefined ? toJson(input.entityCollections) : undefined,
        eventCollections: input.eventCollections !== undefined ? toJson(input.eventCollections) : undefined,
        timeCollections: input.timeCollections !== undefined ? toJson(input.timeCollections) : undefined,
        relations: input.relations !== undefined ? toJson(input.relations) : undefined
      })
    } else {
      if (this.ability) {
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!this.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
      worldState = await this.repository.createWorldState({
        userId,
        entities: toJson(input.entities || []),
        events: toJson(input.events || []),
        times: toJson(input.times || []),
        entityCollections: toJson(input.entityCollections || []),
        eventCollections: toJson(input.eventCollections || []),
        timeCollections: toJson(input.timeCollections || []),
        relations: toJson(input.relations || [])
      })
    }

    return this.mapResponse(worldState)
  }

  /**
   * Clears a specific user's personal world state by overwriting it with empty
   * arrays, creating an empty row if none exists. Used by the admin endpoint;
   * the admin check itself remains route middleware.
   *
   * @param userId - ID of the user whose world state should be cleared
   * @returns the cleared user's ID
   * @throws {NotFoundError} when the target user does not exist
   * @throws {ForbiddenError} when delete or create access is denied
   */
  async clearForUser(userId: string): Promise<{ message: string; userId: string }> {
    const user = await this.repository.findUserById(userId)
    if (!user) {
      throw new NotFoundError('User', userId)
    }

    // Clear the user's personal world state by updating with empty arrays
    const existingWorldState = await this.repository.findPersonalWorldState(userId)

    const emptyData = {
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: []
    }

    if (existingWorldState) {
      if (this.ability && !this.ability.can('delete', subject('WorldState', existingWorldState))) {
        throw new ForbiddenError('Cannot delete this WorldState')
      }
      await this.repository.updateWorldState(existingWorldState.id, emptyData)
    } else {
      if (this.ability) {
        const candidate = subject('WorldState', { userId, projectId: null })
        if (!this.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this WorldState')
        }
      }
      await this.repository.createWorldState({ userId, ...emptyData })
    }

    return {
      message: 'World state cleared successfully',
      userId
    }
  }

  /**
   * Loads the caller's personal WorldState enforcing CASL read access.
   *
   * Uses an accessibleBy filter so the row is only returned when the caller
   * is entitled to read it. If a row exists but is not accessible, a
   * ForbiddenError is thrown. If no row exists for this user at all, a
   * NotFoundError is thrown. This preserves existence privacy: callers can
   * neither distinguish "forbidden" from "not found" nor probe other users'
   * world states.
   */
  private async loadAuthorizedPersonalWorldState(userId: string): Promise<PrismaWorldState> {
    const ability = this.ability
    const accessible = ability
      ? await this.repository.findAccessiblePersonalWorldState(accessibleBy(ability, 'read').WorldState, userId)
      : await this.repository.findPersonalWorldState(userId)

    if (accessible) {
      if (ability && !ability.can('read', subject('WorldState', accessible))) {
        throw new ForbiddenError('Cannot read this WorldState')
      }
      return accessible
    }

    // Distinguish forbidden vs not-found without leaking existence to other
    // users: only the owning user's row is ever considered here (userId is
    // the caller's own id), so a missing row is safely 404.
    const raw = await this.repository.findPersonalWorldState(userId)
    if (raw) {
      throw new ForbiddenError('Cannot read this WorldState')
    }
    throw new NotFoundError('World state', userId)
  }

  /**
   * Authorize an action on a WorldState row before mutating it.
   */
  private authorizeWorldState(
    action: 'read' | 'update' | 'delete',
    ws: PrismaWorldState
  ): void {
    if (this.ability && !this.ability.can(action, subject('WorldState', ws))) {
      throw new ForbiddenError(`Cannot ${action} this WorldState`)
    }
  }

  /**
   * Counts gloss references to a world object across every persona ontology's
   * type arrays.
   */
  private async countGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object'
  ): Promise<number> {
    let glossReferences = 0
    const personas = await this.repository.findPersonasWithOntology(userId)

    for (const persona of personas) {
      if (!persona.ontology) continue
      const entityTypes = asEntityTypes(persona.ontology.entityTypes)
      const roleTypes = asRoleTypes(persona.ontology.roleTypes)
      const eventTypes = asEventTypes(persona.ontology.eventTypes)
      const relationTypes = asRelationTypes(persona.ontology.relationTypes)

      glossReferences += countObjectRefsInGlosses(entityTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(roleTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(eventTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(relationTypes, objectId, refType)
    }

    return glossReferences
  }

  /**
   * Converts every persona ontology's gloss references to a deleted world
   * object into plain text, and returns the total number of references found.
   */
  private async cleanupGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectName: string
  ): Promise<number> {
    let glossReferences = 0
    const personas = await this.repository.findPersonasWithOntology(userId)

    for (const persona of personas) {
      if (!persona.ontology) continue

      const entityTypes = asEntityTypes(persona.ontology.entityTypes)
      const roleTypes = asRoleTypes(persona.ontology.roleTypes)
      const eventTypes = asEventTypes(persona.ontology.eventTypes)
      const relationTypes = asRelationTypes(persona.ontology.relationTypes)

      // Count references
      glossReferences += countObjectRefsInGlosses(entityTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(roleTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(eventTypes, objectId, refType)
      glossReferences += countObjectRefsInGlosses(relationTypes, objectId, refType)

      // Convert references to text
      const cleanedEntityTypes = entityTypes.map(type => ({
        ...type,
        gloss: type.gloss ? convertObjectRefsToText(type.gloss, objectId, refType, objectName) : type.gloss
      }))
      const cleanedRoleTypes = roleTypes.map(type => ({
        ...type,
        gloss: type.gloss ? convertObjectRefsToText(type.gloss, objectId, refType, objectName) : type.gloss
      }))
      const cleanedEventTypes = eventTypes.map(type => ({
        ...type,
        gloss: type.gloss ? convertObjectRefsToText(type.gloss, objectId, refType, objectName) : type.gloss
      }))
      const cleanedRelationTypes = relationTypes.map(type => ({
        ...type,
        gloss: type.gloss ? convertObjectRefsToText(type.gloss, objectId, refType, objectName) : type.gloss
      }))

      // Update ontology
      await this.repository.updateOntology(persona.id, {
        entityTypes: toJson(cleanedEntityTypes),
        roleTypes: toJson(cleanedRoleTypes),
        eventTypes: toJson(cleanedEventTypes),
        relationTypes: toJson(cleanedRelationTypes)
      })
    }

    return glossReferences
  }

  /**
   * Computes the deletion preview for a world entity: gloss references,
   * annotation count, relation count, and collection memberships.
   *
   * @param entityId - ID of the world entity
   * @returns the affected-item counts
   * @throws {NotFoundError} when no accessible world state exists or the entity is absent
   * @throws {ForbiddenError} when read access is denied
   */
  async getEntityDeletionPreview(entityId: string): Promise<WorldObjectDeletionPreview> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)

    const entities = asEntities(worldState.entities)
    const targetEntity = entities.find(e => e.id === entityId)
    if (!targetEntity) {
      throw new NotFoundError('Entity', entityId)
    }

    // Count gloss references in all personas' ontologies
    const glossReferences = await this.countGlossReferences(userId, entityId, 'entity-object')

    // Count annotations linking to this entity
    // Note: Annotations use JSON frames field, need raw query or scan
    // For simplicity, count annotations that might reference this entity
    const annotationCount = 0 // Would need to scan frames JSON field

    // Count relations referencing this entity
    const relations = asWorldRelations(worldState.relations)
    const relationCount = relations.filter(
      r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
           (r.targetType === 'entity' && r.targetId === entityId)
    ).length

    // Count collection memberships
    const entityCollections = asWorldCollections(worldState.entityCollections)
    let collectionMemberships = 0
    for (const collection of entityCollections) {
      if (collection.members?.includes(entityId)) {
        collectionMemberships++
      }
    }

    return {
      glossReferences,
      annotationCount,
      relationCount,
      collectionMemberships
    }
  }

  /**
   * Deletes a world entity, removing it from the entity list, dropping
   * relations and collection memberships referencing it, and converting gloss
   * references to text.
   *
   * @param entityId - ID of the world entity
   * @returns the success message and cleaned-up counts
   * @throws {NotFoundError} when no accessible world state exists or the entity is absent
   * @throws {ForbiddenError} when read or update access is denied
   */
  async deleteEntity(entityId: string): Promise<WorldObjectDeletionResult> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)
    this.authorizeWorldState('update', worldState)

    const entities = asEntities(worldState.entities)
    const targetEntity = entities.find(e => e.id === entityId)
    if (!targetEntity) {
      throw new NotFoundError('Entity', entityId)
    }

    const entityName = targetEntity.name || entityId

    // Remove entity from list
    const updatedEntities = entities.filter(e => e.id !== entityId)

    // Remove relations referencing this entity
    const relations = asWorldRelations(worldState.relations)
    const relationsRemoved = relations.filter(
      r => (r.sourceType === 'entity' && r.sourceId === entityId) ||
           (r.targetType === 'entity' && r.targetId === entityId)
    ).length
    const updatedRelations = relations.filter(
      r => !((r.sourceType === 'entity' && r.sourceId === entityId) ||
             (r.targetType === 'entity' && r.targetId === entityId))
    )

    // Remove from collections
    const entityCollections = asWorldCollections(worldState.entityCollections)
    let collectionMemberships = 0
    const updatedEntityCollections = entityCollections.map(collection => {
      if (collection.members?.includes(entityId)) {
        collectionMemberships++
        return {
          ...collection,
          members: collection.members.filter(id => id !== entityId)
        }
      }
      return collection
    })

    // Update world state
    await this.repository.updateWorldState(worldState.id, {
      entities: toJson(updatedEntities),
      relations: toJson(updatedRelations),
      entityCollections: toJson(updatedEntityCollections)
    })

    // Convert objectRefs in glosses
    const glossReferences = await this.cleanupGlossReferences(userId, entityId, 'entity-object', entityName)

    return {
      message: `Entity "${entityName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        relations: relationsRemoved,
        collectionMemberships
      }
    }
  }

  /**
   * Computes the deletion preview for a world event: gloss references,
   * annotation count, relation count, and collection memberships.
   *
   * @param eventId - ID of the world event
   * @returns the affected-item counts
   * @throws {NotFoundError} when no accessible world state exists or the event is absent
   * @throws {ForbiddenError} when read access is denied
   */
  async getEventDeletionPreview(eventId: string): Promise<WorldObjectDeletionPreview> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)

    const events = asEvents(worldState.events)
    const targetEvent = events.find(e => e.id === eventId)
    if (!targetEvent) {
      throw new NotFoundError('Event', eventId)
    }

    // Count gloss references
    const glossReferences = await this.countGlossReferences(userId, eventId, 'event-object')

    // Count relations
    const relations = asWorldRelations(worldState.relations)
    const relationCount = relations.filter(
      r => (r.sourceType === 'event' && r.sourceId === eventId) ||
           (r.targetType === 'event' && r.targetId === eventId)
    ).length

    // Count collection memberships
    const eventCollections = asWorldCollections(worldState.eventCollections)
    let collectionMemberships = 0
    for (const collection of eventCollections) {
      if (collection.members?.includes(eventId)) {
        collectionMemberships++
      }
    }

    return {
      glossReferences,
      annotationCount: 0,
      relationCount,
      collectionMemberships
    }
  }

  /**
   * Deletes a world event, removing it from the event list, dropping relations
   * and collection memberships referencing it, and converting gloss references
   * to text.
   *
   * @param eventId - ID of the world event
   * @returns the success message and cleaned-up counts
   * @throws {NotFoundError} when no accessible world state exists or the event is absent
   * @throws {ForbiddenError} when read or update access is denied
   */
  async deleteEvent(eventId: string): Promise<WorldObjectDeletionResult> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)
    this.authorizeWorldState('update', worldState)

    const events = asEvents(worldState.events)
    const targetEvent = events.find(e => e.id === eventId)
    if (!targetEvent) {
      throw new NotFoundError('Event', eventId)
    }

    const eventName = targetEvent.name || eventId

    // Remove event
    const updatedEvents = events.filter(e => e.id !== eventId)

    // Remove relations
    const relations = asWorldRelations(worldState.relations)
    const relationsRemoved = relations.filter(
      r => (r.sourceType === 'event' && r.sourceId === eventId) ||
           (r.targetType === 'event' && r.targetId === eventId)
    ).length
    const updatedRelations = relations.filter(
      r => !((r.sourceType === 'event' && r.sourceId === eventId) ||
             (r.targetType === 'event' && r.targetId === eventId))
    )

    // Remove from collections
    const eventCollections = asWorldCollections(worldState.eventCollections)
    let collectionMemberships = 0
    const updatedEventCollections = eventCollections.map(collection => {
      if (collection.members?.includes(eventId)) {
        collectionMemberships++
        return {
          ...collection,
          members: collection.members.filter(id => id !== eventId)
        }
      }
      return collection
    })

    // Update world state
    await this.repository.updateWorldState(worldState.id, {
      events: toJson(updatedEvents),
      relations: toJson(updatedRelations),
      eventCollections: toJson(updatedEventCollections)
    })

    // Convert objectRefs in glosses
    const glossReferences = await this.cleanupGlossReferences(userId, eventId, 'event-object', eventName)

    return {
      message: `Event "${eventName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        relations: relationsRemoved,
        collectionMemberships
      }
    }
  }

  /**
   * Computes the deletion preview for a world time: gloss references, annotation
   * count, relation count, and collection memberships.
   *
   * @param timeId - ID of the world time
   * @returns the affected-item counts
   * @throws {NotFoundError} when no accessible world state exists or the time is absent
   * @throws {ForbiddenError} when read access is denied
   */
  async getTimeDeletionPreview(timeId: string): Promise<WorldObjectDeletionPreview> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)

    const times = asTimes(worldState.times)
    const targetTime = times.find(t => t.id === timeId)
    if (!targetTime) {
      throw new NotFoundError('Time', timeId)
    }

    // Count gloss references
    const glossReferences = await this.countGlossReferences(userId, timeId, 'time-object')

    // Count relations
    const relations = asWorldRelations(worldState.relations)
    const relationCount = relations.filter(
      r => (r.sourceType === 'time' && r.sourceId === timeId) ||
           (r.targetType === 'time' && r.targetId === timeId)
    ).length

    // Count collection memberships
    const timeCollections = asWorldCollections(worldState.timeCollections)
    let collectionMemberships = 0
    for (const collection of timeCollections) {
      if (collection.members?.includes(timeId)) {
        collectionMemberships++
      }
    }

    return {
      glossReferences,
      annotationCount: 0,
      relationCount,
      collectionMemberships
    }
  }

  /**
   * Deletes a world time, removing it from the time list, dropping relations
   * and collection memberships referencing it, and converting gloss references
   * to text.
   *
   * @param timeId - ID of the world time
   * @returns the success message and cleaned-up counts
   * @throws {NotFoundError} when no accessible world state exists or the time is absent
   * @throws {ForbiddenError} when read or update access is denied
   */
  async deleteTime(timeId: string): Promise<WorldObjectDeletionResult> {
    const userId = await this.resolveUserId()
    const worldState = await this.loadAuthorizedPersonalWorldState(userId)
    this.authorizeWorldState('update', worldState)

    const times = asTimes(worldState.times)
    const targetTime = times.find(t => t.id === timeId)
    if (!targetTime) {
      throw new NotFoundError('Time', timeId)
    }

    // Time objects don't have a name/label, use id for reference cleanup
    const timeName = timeId

    // Remove time
    const updatedTimes = times.filter(t => t.id !== timeId)

    // Remove relations
    const relations = asWorldRelations(worldState.relations)
    const relationsRemoved = relations.filter(
      r => (r.sourceType === 'time' && r.sourceId === timeId) ||
           (r.targetType === 'time' && r.targetId === timeId)
    ).length
    const updatedRelations = relations.filter(
      r => !((r.sourceType === 'time' && r.sourceId === timeId) ||
             (r.targetType === 'time' && r.targetId === timeId))
    )

    // Remove from collections
    const timeCollections = asWorldCollections(worldState.timeCollections)
    let collectionMemberships = 0
    const updatedTimeCollections = timeCollections.map(collection => {
      if (collection.members?.includes(timeId)) {
        collectionMemberships++
        return {
          ...collection,
          members: collection.members.filter(id => id !== timeId)
        }
      }
      return collection
    })

    // Update world state
    await this.repository.updateWorldState(worldState.id, {
      times: toJson(updatedTimes),
      relations: toJson(updatedRelations),
      timeCollections: toJson(updatedTimeCollections)
    })

    // Convert objectRefs in glosses
    const glossReferences = await this.cleanupGlossReferences(userId, timeId, 'time-object', timeName)

    return {
      message: `Time "${timeName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        relations: relationsRemoved,
        collectionMemberships
      }
    }
  }
}
