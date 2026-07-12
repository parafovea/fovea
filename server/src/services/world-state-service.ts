import { Prisma, PrismaClient, type Persona } from '@prisma/client'
import { subject } from '@casl/ability'

import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, InternalError, ForbiddenError } from '../lib/errors.js'
import { config } from '../config.js'
import { convertObjectRefsToText, countObjectRefsInGlosses, type TypeWithGloss } from '../lib/reference-cleanup.js'
import { GraphRepository } from '../repositories/GraphRepository.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'
import { isSingleUserMode } from './user-service.js'
import { layersOntologyForPersonaId } from './layers-id-map.js'
import {
  worldStateToLayers,
  layersToWorldState,
  isWorldRow,
  emptyWorldState,
  personalWorldStateId,
  type WorldStateAggregate,
} from './world-layers-mapper.js'
import {
  ontologyToLayers,
  layersToOntology,
  emptyOntology,
  type PersonaOntologyAggregate,
} from './ontology-layers-mapper.js'

/**
 * Coerces a value to Prisma.InputJsonValue for a JSON column, omitting the field
 * for null/undefined so the column stays NULL. Round-tripping through JSON also
 * strips undefined object properties so stored JSON compares equal on read.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Coerces a JSON column to an array of records, tolerating null/non-array. */
function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
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

/** The reconstructed world plus whether any backing rows existed. */
export interface PersonalWorldRead {
  aggregate: WorldStateAggregate
  exists: boolean
}

/** A persona's reconstructed ontology plus its id and timestamps. */
export interface PersonaOntologyBundle {
  id: string
  personaId: string
  aggregate: PersonaOntologyAggregate
  createdAt: string
  updatedAt: string
}

/** The bucket keys of a WorldState aggregate. */
const WORLD_BUCKET_KEYS: (keyof WorldStateAggregate)[] = [
  'entities',
  'events',
  'times',
  'entityCollections',
  'eventCollections',
  'timeCollections',
  'relations',
]

/**
 * Resolves the personal user id to operate on: the authenticated user, or the
 * configured default user in single-user mode.
 *
 * @param prisma - the Prisma client
 * @param userId - the authenticated user id, if any
 * @returns the resolved user id
 * @throws {InternalError} when the default user is missing in single-user mode
 * @throws {UnauthorizedError} when no user is present and not in single-user mode
 */
export async function resolvePersonalUserId(
  prisma: PrismaClient,
  userId: string | undefined,
): Promise<string> {
  if (userId) return userId
  if (isSingleUserMode()) {
    const defaultUser = await prisma.user.findFirst({ where: { username: config.defaultUser.username } })
    if (!defaultUser) throw new InternalError('Default user not found in single-user mode')
    return defaultUser.id
  }
  throw new UnauthorizedError('Authentication required')
}

/**
 * Owns world-state persistence and reference cleanup over the layers store,
 * keeping the `/api/world` contract identical while reading and writing
 * GraphNode / GraphEdge (world objects) and LayersOntology / TypeDef (the
 * persona ontologies its gloss cleanup rewrites).
 *
 * World objects are keyed by scope (createdByUserId = the user, projectId = null
 * for personal state) rather than by a single WorldState row. Reads reconstruct
 * the aggregate from the scoped graph rows; when none exist, a legacy WorldState
 * row is surfaced read-through so writers not yet re-pointed (import) keep
 * working until the next save materializes the aggregate into layers. Writes
 * prune the scope's world rows and recreate them from the aggregate.
 *
 * @example
 * ```typescript
 * const service = new WorldStateService(graphRepo, ontologyRepo, prisma, request.ability ?? null, request.user?.id)
 * const worldState = await service.getOrCreatePersonal()
 * ```
 */
export class WorldStateService {
  constructor(
    private readonly graphRepo: GraphRepository,
    private readonly ontologyRepo: LayersOntologyRepository,
    private readonly prisma: PrismaClient,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
  ) {}

  /** Resolves the personal user id (authenticated user or single-user default). */
  private resolveUserId(): Promise<string> {
    return resolvePersonalUserId(this.prisma, this.userId)
  }

  /** Wraps a reconstructed aggregate in the API response shape. */
  private toResponse(userId: string, aggregate: WorldStateAggregate): WorldStateResponse {
    const now = new Date().toISOString()
    return {
      id: personalWorldStateId(userId),
      userId,
      entities: aggregate.entities,
      events: aggregate.events,
      times: aggregate.times,
      entityCollections: aggregate.entityCollections,
      eventCollections: aggregate.eventCollections,
      timeCollections: aggregate.timeCollections,
      relations: aggregate.relations,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Reads a user's personal world from the layers store, falling back to a
   * read-through of the legacy WorldState row when no layers rows exist yet.
   *
   * @param userId - the owning user id
   * @returns the reconstructed aggregate and whether any backing rows existed
   */
  async readPersonalWorld(userId: string): Promise<PersonalWorldRead> {
    const nodeScope: Prisma.GraphNodeWhereInput = { createdByUserId: userId, projectId: null }
    const edgeScope: Prisma.GraphEdgeWhereInput = { createdByUserId: userId, projectId: null }
    const nodes = (await this.graphRepo.findAccessibleNodes(nodeScope, {})).filter(isWorldRow)
    const edges = (await this.graphRepo.findAccessibleEdges(edgeScope, {})).filter(isWorldRow)

    if (nodes.length > 0 || edges.length > 0) {
      return { aggregate: layersToWorldState(nodes, edges), exists: true }
    }

    const legacy = await this.prisma.worldState.findFirst({ where: { userId, projectId: null } })
    if (legacy) {
      return {
        aggregate: {
          entities: asRecords(legacy.entities),
          events: asRecords(legacy.events),
          times: asRecords(legacy.times),
          entityCollections: asRecords(legacy.entityCollections),
          eventCollections: asRecords(legacy.eventCollections),
          timeCollections: asRecords(legacy.timeCollections),
          relations: asRecords(legacy.relations),
        },
        exists: true,
      }
    }

    return { aggregate: emptyWorldState(), exists: false }
  }

  /**
   * Writes a user's personal world to the layers store: prunes the scope's
   * existing world rows, then recreates nodes and edges from the aggregate.
   *
   * @param userId - the owning user id
   * @param aggregate - the world state to persist
   * @throws {ForbiddenError} when create access to the scope is denied
   */
  async writePersonalWorld(userId: string, aggregate: WorldStateAggregate): Promise<void> {
    const nodeScope: Prisma.GraphNodeWhereInput = { createdByUserId: userId, projectId: null }
    const edgeScope: Prisma.GraphEdgeWhereInput = { createdByUserId: userId, projectId: null }
    const existingNodes = (await this.graphRepo.findAccessibleNodes(nodeScope, {})).filter(isWorldRow)
    for (const node of existingNodes) await this.graphRepo.deleteNode(node.id)
    const existingEdges = (await this.graphRepo.findAccessibleEdges(edgeScope, {})).filter(isWorldRow)
    for (const edge of existingEdges) await this.graphRepo.deleteEdge(edge.id)

    const { nodes, edges } = worldStateToLayers(aggregate, { projectId: null, createdByUserId: userId })

    if ((nodes.length > 0 || edges.length > 0) && this.ability) {
      const candidate = subject('GraphNode', { projectId: null, createdByUserId: userId })
      if (!this.ability.can('create', candidate)) {
        throw new ForbiddenError('Cannot create world objects in this scope')
      }
    }

    for (const node of nodes) {
      await this.graphRepo.createNode({
        id: node.id,
        nodeType: node.nodeType,
        label: node.label,
        properties: toJson(node.properties),
        knowledgeRefs: toJson(node.knowledgeRefs),
        projectId: node.projectId,
        createdByUserId: node.createdByUserId,
      })
    }
    for (const edge of edges) {
      await this.graphRepo.createEdge({
        id: edge.id,
        source: toJson(edge.source) as Prisma.InputJsonValue,
        target: toJson(edge.target) as Prisma.InputJsonValue,
        sourceLocalId: edge.sourceLocalId,
        targetLocalId: edge.targetLocalId,
        edgeType: edge.edgeType,
        label: edge.label,
        properties: toJson(edge.properties),
        projectId: edge.projectId,
        createdByUserId: edge.createdByUserId,
      })
    }
  }

  /**
   * Gets the caller's personal world, returning an empty aggregate when none
   * exists (get-or-nothing: no placeholder row is created).
   *
   * @returns the world state in API shape
   */
  async getOrCreatePersonal(): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()
    const { aggregate } = await this.readPersonalWorld(userId)
    return this.toResponse(userId, aggregate)
  }

  /**
   * Updates the caller's personal world; only provided buckets are written, the
   * rest are preserved from the current state.
   *
   * @param input - partial world state update fields
   * @returns the updated world state in API shape
   */
  async updatePersonal(input: WorldStateUpdateInput): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()
    const { aggregate } = await this.readPersonalWorld(userId)
    const merged: WorldStateAggregate = { ...aggregate }
    for (const key of WORLD_BUCKET_KEYS) {
      const value = input[key]
      if (value !== undefined) merged[key] = value
    }
    await this.writePersonalWorld(userId, merged)
    return this.toResponse(userId, merged)
  }

  /**
   * Clears a specific user's personal world by pruning its layers rows. Used by
   * the admin endpoint; the admin check itself remains route middleware.
   *
   * @param userId - the user whose world should be cleared
   * @returns the cleared user's id
   * @throws {NotFoundError} when the target user does not exist
   */
  async clearForUser(userId: string): Promise<{ message: string; userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundError('User', userId)
    await this.writePersonalWorld(userId, emptyWorldState())
    return { message: 'World state cleared successfully', userId }
  }

  // --- Persona ontology persistence (shared with the ontology route) -------

  /**
   * Reads a persona's ontology from the layers store, falling back to a
   * read-through of the legacy Ontology row when no LayersOntology exists.
   *
   * @param persona - the persona whose ontology to read
   * @returns the reconstructed ontology bundle, or null when the persona has none
   */
  async readPersonaOntologyBundle(persona: Persona): Promise<PersonaOntologyBundle | null> {
    const ontologyId = layersOntologyForPersonaId(persona.id)
    const ontologyRow = await this.ontologyRepo.findOntologyById(ontologyId)
    if (ontologyRow) {
      const typeDefs = await this.ontologyRepo.findAccessibleTypeDefs({}, { ontologyId })
      return {
        id: ontologyRow.id,
        personaId: persona.id,
        aggregate: layersToOntology(typeDefs),
        createdAt: ontologyRow.createdAt.toISOString(),
        updatedAt: ontologyRow.updatedAt.toISOString(),
      }
    }

    const legacy = await this.prisma.ontology.findUnique({ where: { personaId: persona.id } })
    if (legacy) {
      return {
        id: legacy.id,
        personaId: persona.id,
        aggregate: {
          entityTypes: asRecords(legacy.entityTypes),
          eventTypes: asRecords(legacy.eventTypes),
          roleTypes: asRecords(legacy.roleTypes),
          relationTypes: asRecords(legacy.relationTypes),
        },
        createdAt: legacy.createdAt.toISOString(),
        updatedAt: legacy.updatedAt.toISOString(),
      }
    }

    return null
  }

  /**
   * Writes a persona's ontology to the layers store: upserts the LayersOntology,
   * prunes its existing TypeDefs, and recreates them from the aggregate.
   *
   * @param persona - the owning persona
   * @param aggregate - the four type buckets to persist
   */
  async writePersonaOntology(persona: Persona, aggregate: PersonaOntologyAggregate): Promise<void> {
    const scope = { projectId: persona.projectId, createdByUserId: persona.userId }
    const meta = {
      name: `${persona.name} ontology`,
      description: persona.informationNeed,
      domain: persona.domain,
    }
    const { ontology, typeDefs } = ontologyToLayers(aggregate, persona.id, meta, scope)

    const existing = await this.ontologyRepo.findOntologyById(ontology.id)
    if (existing) {
      await this.ontologyRepo.updateOntology(ontology.id, {
        name: ontology.name,
        description: ontology.description,
        domain: ontology.domain,
      })
    } else {
      await this.ontologyRepo.createOntology({
        id: ontology.id,
        name: ontology.name,
        description: ontology.description,
        domain: ontology.domain,
        personaId: ontology.personaId,
        projectId: ontology.projectId,
        createdByUserId: ontology.createdByUserId,
      })
    }

    const oldTypeDefs = await this.ontologyRepo.findAccessibleTypeDefs({}, { ontologyId: ontology.id })
    for (const typeDef of oldTypeDefs) await this.ontologyRepo.deleteTypeDef(typeDef.id)

    // Insert types parent-free first, then set parent refs that resolve to a
    // sibling type, so a self-relation FK never references a not-yet-inserted row.
    const createdIds = new Set<string>()
    for (const typeDef of typeDefs) {
      await this.ontologyRepo.createTypeDef({
        id: typeDef.id,
        ontologyId: typeDef.ontologyId,
        name: typeDef.name,
        typeKind: typeDef.typeKind,
        gloss: typeDef.gloss,
        parentTypeId: null,
        allowedRoles: toJson(typeDef.allowedRoles),
        knowledgeRefs: toJson(typeDef.knowledgeRefs),
        features: toJson(typeDef.features),
        projectId: typeDef.projectId,
        createdByUserId: typeDef.createdByUserId,
      })
      createdIds.add(typeDef.id)
    }
    for (const typeDef of typeDefs) {
      if (typeDef.parentTypeId && createdIds.has(typeDef.parentTypeId)) {
        await this.ontologyRepo.updateTypeDef(typeDef.id, { parentTypeId: typeDef.parentTypeId })
      }
    }
  }

  // --- World object deletion with reference cleanup ------------------------

  /**
   * Enumerates the user's personas paired with their reconstructed ontology,
   * for the gloss reference scan and rewrite.
   */
  private async personasWithOntology(
    userId: string,
  ): Promise<Array<{ persona: Persona; aggregate: PersonaOntologyAggregate }>> {
    const personas = await this.prisma.persona.findMany({ where: { userId } })
    const result: Array<{ persona: Persona; aggregate: PersonaOntologyAggregate }> = []
    for (const persona of personas) {
      const bundle = await this.readPersonaOntologyBundle(persona)
      result.push({ persona, aggregate: bundle ? bundle.aggregate : emptyOntology() })
    }
    return result
  }

  /** Counts gloss references to a world object across every persona ontology. */
  private async countGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object',
  ): Promise<number> {
    let count = 0
    for (const { aggregate } of await this.personasWithOntology(userId)) {
      count += countObjectRefsInGlosses(aggregate.entityTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.roleTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.eventTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.relationTypes as TypeWithGloss[], objectId, refType)
    }
    return count
  }

  /**
   * Converts every persona ontology's gloss references to a deleted world object
   * into plain text, returning the number of references found.
   */
  private async cleanupGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectName: string,
  ): Promise<number> {
    let count = 0
    for (const { persona, aggregate } of await this.personasWithOntology(userId)) {
      const before =
        countObjectRefsInGlosses(aggregate.entityTypes as TypeWithGloss[], objectId, refType) +
        countObjectRefsInGlosses(aggregate.roleTypes as TypeWithGloss[], objectId, refType) +
        countObjectRefsInGlosses(aggregate.eventTypes as TypeWithGloss[], objectId, refType) +
        countObjectRefsInGlosses(aggregate.relationTypes as TypeWithGloss[], objectId, refType)
      count += before
      if (before === 0) continue

      const convert = (types: unknown[]): unknown[] =>
        (types as Array<Record<string, unknown>>).map((type) => {
          const gloss = type.gloss
          if (!Array.isArray(gloss)) return type
          return { ...type, gloss: convertObjectRefsToText(gloss, objectId, refType, objectName) }
        })

      await this.writePersonaOntology(persona, {
        entityTypes: convert(aggregate.entityTypes),
        eventTypes: convert(aggregate.eventTypes),
        roleTypes: convert(aggregate.roleTypes),
        relationTypes: convert(aggregate.relationTypes),
      })
    }
    return count
  }

  /** Relations incident to a world object of a given kind. */
  private static incidentRelations(
    relations: unknown[],
    kind: string,
    id: string,
  ): { kept: unknown[]; removed: number } {
    const kept: unknown[] = []
    let removed = 0
    for (const relation of relations as Array<Record<string, unknown>>) {
      const incident =
        (relation.sourceType === kind && relation.sourceId === id) ||
        (relation.targetType === kind && relation.targetId === id)
      if (incident) removed += 1
      else kept.push(relation)
    }
    return { kept, removed }
  }

  /** Collections after removing a member id, with the membership count removed. */
  private static removeFromCollections(
    collections: unknown[],
    id: string,
  ): { collections: unknown[]; memberships: number } {
    let memberships = 0
    const updated = (collections as Array<Record<string, unknown>>).map((collection) => {
      const members = collection.members
      if (Array.isArray(members) && members.includes(id)) {
        memberships += 1
        return { ...collection, members: members.filter((member) => member !== id) }
      }
      return collection
    })
    return { collections: updated, memberships }
  }

  /** Counts collection memberships of an id. */
  private static countMemberships(collections: unknown[], id: string): number {
    let count = 0
    for (const collection of collections as Array<Record<string, unknown>>) {
      const members = collection.members
      if (Array.isArray(members) && members.includes(id)) count += 1
    }
    return count
  }

  /**
   * Shared deletion preview for a world object of a given kind (entity, event,
   * or time), reading its bucket and the collection bucket by name.
   */
  private async objectDeletionPreview(
    kind: 'entity' | 'event' | 'time',
    bucket: keyof WorldStateAggregate,
    collectionBucket: keyof WorldStateAggregate,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectId: string,
  ): Promise<WorldObjectDeletionPreview> {
    const userId = await this.resolveUserId()
    const { aggregate, exists } = await this.readPersonalWorld(userId)
    if (!exists) throw new NotFoundError('World state', userId)

    const objects = asRecords(aggregate[bucket])
    const target = objects.find((object) => object.id === objectId)
    if (!target) throw new NotFoundError(kind.charAt(0).toUpperCase() + kind.slice(1), objectId)

    return {
      glossReferences: await this.countGlossReferences(userId, objectId, refType),
      annotationCount: 0,
      relationCount: WorldStateService.incidentRelations(aggregate.relations, kind, objectId).removed,
      collectionMemberships: WorldStateService.countMemberships(aggregate[collectionBucket], objectId),
    }
  }

  /**
   * Shared deletion for a world object of a given kind: removes it and its
   * incident relations and collection memberships from the aggregate, writes the
   * result, and converts gloss references to text.
   */
  private async deleteObject(
    kind: 'entity' | 'event' | 'time',
    bucket: keyof WorldStateAggregate,
    collectionBucket: keyof WorldStateAggregate,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectId: string,
    nameFor: (target: Record<string, unknown>) => string,
  ): Promise<WorldObjectDeletionResult> {
    const userId = await this.resolveUserId()
    const { aggregate, exists } = await this.readPersonalWorld(userId)
    if (!exists) throw new NotFoundError('World state', userId)

    const objects = asRecords(aggregate[bucket])
    const target = objects.find((object) => object.id === objectId)
    if (!target) throw new NotFoundError(kind.charAt(0).toUpperCase() + kind.slice(1), objectId)

    const objectName = nameFor(target)
    const { kept: relations, removed: relationsRemoved } = WorldStateService.incidentRelations(
      aggregate.relations,
      kind,
      objectId,
    )
    const { collections, memberships } = WorldStateService.removeFromCollections(
      aggregate[collectionBucket],
      objectId,
    )

    const updated: WorldStateAggregate = {
      ...aggregate,
      [bucket]: objects.filter((object) => object.id !== objectId),
      [collectionBucket]: collections,
      relations,
    }
    await this.writePersonalWorld(userId, updated)

    const glossReferences = await this.cleanupGlossReferences(userId, objectId, refType, objectName)

    const label = kind.charAt(0).toUpperCase() + kind.slice(1)
    return {
      message: `${label} "${objectName}" deleted successfully`,
      cleanedUp: { glossReferences, relations: relationsRemoved, collectionMemberships: memberships },
    }
  }

  /** Deletion preview for a world entity. */
  getEntityDeletionPreview(entityId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('entity', 'entities', 'entityCollections', 'entity-object', entityId)
  }

  /** Deletes a world entity with reference cleanup. */
  deleteEntity(entityId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'entity',
      'entities',
      'entityCollections',
      'entity-object',
      entityId,
      (target) => (typeof target.name === 'string' ? target.name : entityId),
    )
  }

  /** Deletion preview for a world event. */
  getEventDeletionPreview(eventId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('event', 'events', 'eventCollections', 'event-object', eventId)
  }

  /** Deletes a world event with reference cleanup. */
  deleteEvent(eventId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'event',
      'events',
      'eventCollections',
      'event-object',
      eventId,
      (target) => (typeof target.name === 'string' ? target.name : eventId),
    )
  }

  /** Deletion preview for a world time. */
  getTimeDeletionPreview(timeId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('time', 'times', 'timeCollections', 'time-object', timeId)
  }

  /** Deletes a world time with reference cleanup. */
  deleteTime(timeId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'time',
      'times',
      'timeCollections',
      'time-object',
      timeId,
      () => timeId,
    )
  }
}
