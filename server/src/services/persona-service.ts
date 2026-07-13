import { Persona, Prisma } from '@prisma/client'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { demoPersonaListWhere, demoPermitsSystemPersonaRead } from '../lib/demo-rbac.js'
import { isSingleUserMode } from './user-service.js'
import {
  PersonaRepository,
  PersonaWithOntology
} from '../repositories/PersonaRepository.js'
import {
  updateGlossesInTypes,
  countTypeRefsInGlosses,
  removeTypeAssignmentsFromEntities,
  removeEventInterpretationsFromEvents,
  countTypeAssignments,
  countEventInterpretations
} from '../lib/reference-cleanup.js'
import { asTypesWithGloss, asEntities, asEvents } from '../lib/prisma-json.js'

/**
 * Converts a typed array to Prisma.InputJsonValue for storage in JSON columns.
 * Prisma JSON columns accept any serializable value at runtime; this bridges
 * the TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

/** RefType categories used by the gloss reference cleanup helpers. */
type RefType = 'entity' | 'role' | 'event' | 'relation'

/** Maps a type-deletion endpoint to the ontology array it primarily targets. */
type TypeCategory = 'entity' | 'role' | 'event' | 'relation'

/**
 * API-facing ontology shape.
 *
 * The database stores `entityTypes` / `roleTypes` / `eventTypes`; the API
 * exposes them as `entities` / `roles` / `events` and always returns an empty
 * `relations` array. Dates are ISO strings.
 */
export interface OntologyResponse {
  id: string
  personaId: string
  entities: unknown[]
  roles: unknown[]
  events: unknown[]
  relationTypes: unknown[]
  relations: never[]
  createdAt: string
  updatedAt: string
}

/** Validated, coerced fields for creating a persona. */
export interface CreatePersonaInput {
  name: string
  role: string
  informationNeed: string
  details?: string
  projectId?: string
  isSystemGenerated?: boolean
  hidden?: boolean
}

/** Validated fields for updating a persona (all optional). */
export interface UpdatePersonaInput {
  name?: string
  role?: string
  informationNeed?: string
  details?: string
  isSystemGenerated?: boolean
  hidden?: boolean
}

/** Request body shape for the ontology update endpoint. */
export interface OntologyUpdateInput {
  entities?: unknown[]
  roles?: unknown[]
  events?: unknown[]
  relationTypes?: unknown[]
  relations?: unknown[]
}

/** Counts returned by the persona deletion preview. */
export interface PersonaDeletionPreview {
  typeCount: number
  annotationCount: number
  summaryCount: number
  worldAssignmentCount: number
}

/**
 * Owns persona business rules and RBAC, delegating all data access to a
 * PersonaRepository. Construct one per request from the request-scoped CASL
 * ability and the authenticated user's id and system role.
 *
 * The service performs every authorization decision (mode-branch selection,
 * `accessibleBy` filters, instance-level `can()` checks, the create
 * pre-check, and the `isSystemGenerated` coercion). The repository performs
 * none.
 *
 * @example
 * ```typescript
 * const service = new PersonaService(repository, request.ability, request.user?.id, request.user?.systemRole)
 * const personas = await service.list()
 * ```
 */
export class PersonaService {
  constructor(
    private readonly repository: PersonaRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
    private readonly systemRole: string | undefined
  ) {}

  /**
   * Asserts that a CASL ability is present, returning it narrowed.
   *
   * Mirrors the per-request `if (!request.ability) throw new ForbiddenError(...)`
   * guard the route used on every authenticated handler.
   */
  private requireAbility(): AppAbility {
    if (!this.ability) {
      throw new ForbiddenError('No abilities defined')
    }
    return this.ability
  }

  /**
   * Lists the personas visible to the caller.
   *
   * Applies the four mode branches in order:
   * - single-user mode: every non-hidden persona;
   * - unauthenticated: non-hidden system personas;
   * - demo mode: every system persona (hidden or not);
   * - authenticated: non-hidden personas the caller may read (CASL).
   *
   * @returns the visible personas, newest first
   */
  async list(): Promise<Persona[]> {
    if (isSingleUserMode()) {
      return this.repository.findManyForList({ hidden: false })
    }

    if (!this.userId || !this.ability) {
      return this.repository.findManyForList({ isSystemGenerated: true, hidden: false })
    }

    // Demo mode exposes every system persona (hidden or not) to the public
    // tour catalogue; demoPersonaListWhere returns that filter in demo mode
    // and null otherwise (see lib/demo-rbac.ts).
    const demoWhere = demoPersonaListWhere()
    if (demoWhere) {
      return this.repository.findManyForList(demoWhere)
    }

    return this.repository.findManyForList({
      AND: [
        { hidden: false },
        accessibleBy(this.ability, 'read').Persona
      ]
    })
  }

  /**
   * Creates a persona with an empty ontology.
   *
   * Verifies the caller may create a persona in the target scope, then coerces
   * `isSystemGenerated` to false for non-admins (only system_admin may set it).
   *
   * @param input - validated, coerced create fields
   * @returns the created persona
   * @throws {ForbiddenError} when no ability is present or the create is denied
   */
  async create(input: CreatePersonaInput): Promise<Persona> {
    const ability = this.requireAbility()
    const userId = this.userId!
    const projectId = input.projectId ?? null

    const candidate = subject('Persona', { userId, projectId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Persona in this scope')
    }

    // Only system_admin may flag a persona as system-generated, since system
    // personas are visible to unauthenticated visitors via the unauthenticated
    // list branch. A non-admin attempt is silently coerced to false rather
    // than 403 so clients that always send the field still succeed.
    const isSystemGenerated = this.systemRole === 'system_admin'
      ? input.isSystemGenerated
      : false

    return this.repository.createWithOntology({
      name: input.name,
      role: input.role,
      informationNeed: input.informationNeed,
      details: input.details || null,
      isSystemGenerated,
      hidden: input.hidden,
      user: { connect: { id: userId } },
      ...(projectId ? { project: { connect: { id: projectId } } } : {}),
    })
  }

  /**
   * Gets a persona by ID, enforcing read access.
   *
   * Unauthenticated callers may only read non-hidden system personas; for them
   * a non-system or hidden persona is reported as not found. Authenticated
   * callers must pass the CASL read check.
   *
   * @param id - Persona UUID
   * @returns the persona
   * @throws {NotFoundError} when the persona does not exist or is not visible to an anonymous caller
   * @throws {ForbiddenError} when an authenticated caller lacks read access
   */
  async getById(id: string): Promise<Persona> {
    const persona = await this.repository.findById(id)
    if (!persona) {
      throw new NotFoundError('Persona', id)
    }

    if (!this.userId || !this.ability) {
      if (!persona.isSystemGenerated || persona.hidden) {
        throw new NotFoundError('Persona', id)
      }
      return persona
    }

    if (!this.ability.can('read', subject('Persona', persona))) {
      throw new ForbiddenError('Access denied')
    }

    return persona
  }

  /**
   * Updates a persona after verifying update access.
   *
   * Strips `isSystemGenerated` from non-admin updates so a regular user cannot
   * publish their persona to anonymous visitors.
   *
   * @param id - Persona UUID
   * @param input - validated update fields
   * @returns the updated persona
   * @throws {NotFoundError} when the persona does not exist
   * @throws {ForbiddenError} when the caller lacks update access
   */
  async update(id: string, input: UpdatePersonaInput): Promise<Persona> {
    const ability = this.requireAbility()

    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new NotFoundError('Persona', id)
    }

    if (!ability.can('update', subject('Persona', existing))) {
      throw new ForbiddenError('Cannot update this Persona')
    }

    const updatePayload: UpdatePersonaInput = { ...input }
    if (this.systemRole !== 'system_admin') {
      delete updatePayload.isSystemGenerated
    }

    try {
      return await this.repository.update(id, updatePayload)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundError('Persona', id)
      }
      throw error
    }
  }

  /**
   * Computes the deletion preview for a persona: counts of ontology types,
   * annotations, summaries, and personal world-state assignments that the
   * delete would affect.
   *
   * @param id - Persona UUID
   * @returns the affected-item counts
   * @throws {NotFoundError} when the persona does not exist
   * @throws {ForbiddenError} when the caller lacks delete access
   */
  async getDeletionPreview(id: string): Promise<PersonaDeletionPreview> {
    const ability = this.requireAbility()

    const persona = await this.repository.findByIdWithOntology(id)
    if (!persona) {
      throw new NotFoundError('Persona', id)
    }

    if (!ability.can('delete', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot access this Persona')
    }

    const entityTypes = Array.isArray(persona.ontology?.entityTypes) ? persona.ontology.entityTypes : []
    const roleTypes = Array.isArray(persona.ontology?.roleTypes) ? persona.ontology.roleTypes : []
    const eventTypes = Array.isArray(persona.ontology?.eventTypes) ? persona.ontology.eventTypes : []
    const relationTypes = Array.isArray(persona.ontology?.relationTypes) ? persona.ontology.relationTypes : []
    const typeCount = entityTypes.length + roleTypes.length + eventTypes.length + relationTypes.length

    const annotationCount = await this.repository.countAnnotations({ personaId: id })
    const summaryCount = await this.repository.countVideoSummaries(id)

    let worldAssignmentCount = 0
    const worldState = await this.repository.findPersonalWorldState(persona.userId)
    if (worldState) {
      const entities = (worldState.entities as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const entity of entities) {
        worldAssignmentCount += (entity.typeAssignments || []).filter(a => a.personaId === id).length
      }

      const events = (worldState.events as Array<{ personaInterpretations?: Array<{ personaId: string }> }>) || []
      for (const event of events) {
        worldAssignmentCount += (event.personaInterpretations || []).filter(i => i.personaId === id).length
      }

      const entityCollections = (worldState.entityCollections as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const collection of entityCollections) {
        worldAssignmentCount += (collection.typeAssignments || []).filter(a => a.personaId === id).length
      }

      const eventCollections = (worldState.eventCollections as Array<{ typeAssignments?: Array<{ personaId: string }> }>) || []
      for (const collection of eventCollections) {
        worldAssignmentCount += (collection.typeAssignments || []).filter(a => a.personaId === id).length
      }
    }

    return { typeCount, annotationCount, summaryCount, worldAssignmentCount }
  }

  /**
   * Deletes a persona and cleans the owner's personal world state of the
   * persona's type assignments and interpretations before removing the row.
   *
   * @param id - Persona UUID
   * @throws {NotFoundError} when the persona does not exist
   * @throws {ForbiddenError} when the caller lacks delete access
   */
  async delete(id: string): Promise<void> {
    const ability = this.requireAbility()

    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new NotFoundError('Persona', id)
    }

    if (!ability.can('delete', subject('Persona', existing))) {
      throw new ForbiddenError('Cannot delete this Persona')
    }

    const worldState = await this.repository.findPersonalWorldState(existing.userId)
    if (worldState) {
      interface EntityWithAssignments {
        typeAssignments?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }
      interface EventWithInterpretations {
        personaInterpretations?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }
      interface CollectionWithAssignments {
        typeAssignments?: Array<{ personaId: string; [key: string]: unknown }>
        [key: string]: unknown
      }

      const entities = (worldState.entities as EntityWithAssignments[]) || []
      const cleanedEntities = entities.map(entity => ({
        ...entity,
        typeAssignments: (entity.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      const events = (worldState.events as EventWithInterpretations[]) || []
      const cleanedEvents = events.map(event => ({
        ...event,
        personaInterpretations: (event.personaInterpretations || []).filter(i => i.personaId !== id)
      }))

      const entityCollections = (worldState.entityCollections as CollectionWithAssignments[]) || []
      const cleanedEntityCollections = entityCollections.map(collection => ({
        ...collection,
        typeAssignments: (collection.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      const eventCollections = (worldState.eventCollections as CollectionWithAssignments[]) || []
      const cleanedEventCollections = eventCollections.map(collection => ({
        ...collection,
        typeAssignments: (collection.typeAssignments || []).filter(a => a.personaId !== id)
      }))

      await this.repository.updateWorldState(worldState.userId, {
        entities: toJson(cleanedEntities),
        events: toJson(cleanedEvents),
        entityCollections: toJson(cleanedEntityCollections),
        eventCollections: toJson(cleanedEventCollections)
      })
    }

    try {
      await this.repository.delete(id)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundError('Persona', id)
      }
      throw error
    }
  }

  /**
   * Gets a persona's ontology mapped to the API response shape.
   *
   * Read access mirrors getById, with the demo-mode widening: in demo mode any
   * caller may read a system persona's ontology.
   *
   * @param id - Persona UUID
   * @returns the ontology in API shape
   * @throws {NotFoundError} when the persona or its ontology does not exist, or is not visible to an anonymous caller
   * @throws {ForbiddenError} when an authenticated caller lacks read access
   */
  async getOntology(id: string): Promise<OntologyResponse> {
    const persona = await this.repository.findByIdWithOntology(id)
    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', id)
    }

    if (!this.userId || !this.ability) {
      if (!persona.isSystemGenerated || persona.hidden) {
        throw new NotFoundError('Persona or ontology', id)
      }
    } else if (!this.ability.can('read', subject('Persona', persona))) {
      // Demo mode widens read access to seeded system personas so the public
      // tour catalogue can fetch their ontologies (see lib/demo-rbac.ts).
      if (!demoPermitsSystemPersonaRead(persona.isSystemGenerated)) {
        throw new ForbiddenError('Access denied')
      }
    }

    return this.mapOntologyResponse(persona.ontology)
  }

  /**
   * Batch-fetches ontologies for many personas, applying the same per-persona
   * read rules as getOntology. Personas that are missing, have no ontology, or
   * are not readable are omitted.
   *
   * @param personaIds - Persona UUIDs to fetch
   * @returns the readable ontologies, in API shape
   */
  async getOntologies(personaIds: string[]): Promise<OntologyResponse[]> {
    if (personaIds.length === 0) {
      return []
    }

    const personas = await this.repository.findManyWithOntology(personaIds)
    const result: OntologyResponse[] = []

    for (const persona of personas) {
      if (!persona.ontology) continue

      if (!this.userId || !this.ability) {
        if (!persona.isSystemGenerated || persona.hidden) continue
      } else if (!this.ability.can('read', subject('Persona', persona))) {
        // Demo mode widens read access to seeded system personas (see
        // lib/demo-rbac.ts).
        if (!demoPermitsSystemPersonaRead(persona.isSystemGenerated)) continue
      }

      result.push(this.mapOntologyResponse(persona.ontology))
    }

    return result
  }

  /**
   * Updates a persona's ontology from the API request body and returns the
   * updated ontology in API shape. Fields omitted from the body are preserved.
   *
   * @param id - Persona UUID
   * @param input - ontology update body (entities/roles/events/relationTypes)
   * @returns the updated ontology in API shape
   * @throws {NotFoundError} when the persona or its ontology does not exist
   * @throws {ForbiddenError} when the caller lacks update access
   */
  async updateOntology(id: string, input: OntologyUpdateInput): Promise<OntologyResponse> {
    const ability = this.requireAbility()

    const persona = await this.repository.findByIdWithOntology(id)
    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', id)
    }

    if (!ability.can('update', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot update this Persona')
    }

    const updated = await this.repository.updateOntology(id, {
      entityTypes: input.entities !== undefined ? (input.entities as Prisma.InputJsonValue) : (persona.ontology.entityTypes ?? undefined),
      roleTypes: input.roles !== undefined ? (input.roles as Prisma.InputJsonValue) : (persona.ontology.roleTypes ?? undefined),
      eventTypes: input.events !== undefined ? (input.events as Prisma.InputJsonValue) : (persona.ontology.eventTypes ?? undefined),
      relationTypes: input.relationTypes !== undefined ? (input.relationTypes as Prisma.InputJsonValue) : (persona.ontology.relationTypes ?? undefined)
    })

    return this.mapOntologyResponse(updated)
  }

  /**
   * Loads a persona with its ontology and enforces read access for the type
   * deletion-preview endpoints. Demo-mode widening does not apply here (these
   * endpoints require authentication).
   *
   * @throws {NotFoundError} when the persona or its ontology does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  private async loadForTypeRead(personaId: string): Promise<PersonaWithOntology> {
    const persona = await this.repository.findByIdWithOntology(personaId)
    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', personaId)
    }

    const ability = this.requireAbility()
    if (!ability.can('read', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot access this Persona')
    }

    return persona
  }

  /**
   * Loads a persona with its ontology and enforces delete access for the type
   * deletion endpoints.
   *
   * @throws {NotFoundError} when the persona or its ontology does not exist
   * @throws {ForbiddenError} when no ability is present or delete access is denied
   */
  private async loadForTypeDelete(personaId: string): Promise<PersonaWithOntology> {
    const persona = await this.repository.findByIdWithOntology(personaId)
    if (!persona || !persona.ontology) {
      throw new NotFoundError('Persona or ontology', personaId)
    }

    const ability = this.requireAbility()
    if (!ability.can('delete', subject('Persona', persona))) {
      throw new ForbiddenError('Cannot modify this Persona')
    }

    return persona
  }

  /**
   * Counts gloss references to a type across all four ontology type arrays,
   * with the target array filtered to exclude the type itself.
   */
  private countGlossRefsAcrossOntology(
    ontology: PersonaWithOntology['ontology'],
    personaId: string,
    typeId: string,
    refType: RefType,
    selfCategory: TypeCategory
  ): number {
    const entityTypes = asTypesWithGloss(ontology!.entityTypes)
    const roleTypes = asTypesWithGloss(ontology!.roleTypes)
    const eventTypes = asTypesWithGloss(ontology!.eventTypes)
    const relationTypes = asTypesWithGloss(ontology!.relationTypes)

    const exclude = (types: typeof entityTypes, category: TypeCategory) =>
      category === selfCategory ? types.filter(t => t.id !== typeId) : types

    let count = 0
    count += countTypeRefsInGlosses(exclude(entityTypes, 'entity'), typeId, personaId, refType)
    count += countTypeRefsInGlosses(exclude(roleTypes, 'role'), typeId, personaId, refType)
    count += countTypeRefsInGlosses(exclude(eventTypes, 'event'), typeId, personaId, refType)
    count += countTypeRefsInGlosses(exclude(relationTypes, 'relation'), typeId, personaId, refType)
    return count
  }

  /**
   * Deletion preview for an entity type.
   *
   * @returns gloss reference, annotation, and world-assignment counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when read access is denied
   */
  async getEntityTypeDeletionPreview(
    personaId: string,
    typeId: string
  ): Promise<{ glossReferences: number; annotationCount: number; worldAssignmentCount: number }> {
    const persona = await this.loadForTypeRead(personaId)

    const entityTypes = asTypesWithGloss(persona.ontology!.entityTypes)
    if (!entityTypes.find(t => t.id === typeId)) {
      throw new NotFoundError('Entity type', typeId)
    }

    const glossReferences = this.countGlossRefsAcrossOntology(persona.ontology, personaId, typeId, 'entity', 'entity')

    const annotationCount = await this.repository.countAnnotations({
      personaId,
      type: 'entity',
      label: typeId
    })

    let worldAssignmentCount = 0
    const worldState = await this.repository.findPersonalWorldState(persona.userId)
    if (worldState) {
      const entities = asEntities(worldState.entities)
      worldAssignmentCount = countTypeAssignments(entities, typeId, personaId)
    }

    return { glossReferences, annotationCount, worldAssignmentCount }
  }

  /**
   * Deletes an entity type, converting gloss references to text, deleting
   * matching annotations, and cleaning the personal world state.
   *
   * @returns the success message and the cleaned-up counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when delete access is denied
   */
  async deleteEntityType(
    personaId: string,
    typeId: string
  ): Promise<{ message: string; cleanedUp: { glossReferences: number; annotations: number; worldAssignments: number } }> {
    const persona = await this.loadForTypeDelete(personaId)
    const ontology = persona.ontology!

    const entityTypes = asTypesWithGloss(ontology.entityTypes)
    const targetType = entityTypes.find(t => t.id === typeId)
    if (!targetType) {
      throw new NotFoundError('Entity type', typeId)
    }

    const typeName = targetType.name
    const updatedEntityTypes = entityTypes.filter(t => t.id !== typeId)

    const roleTypes = asTypesWithGloss(ontology.roleTypes)
    const eventTypes = asTypesWithGloss(ontology.eventTypes)
    const relationTypes = asTypesWithGloss(ontology.relationTypes)

    let glossReferences = 0
    glossReferences += countTypeRefsInGlosses(updatedEntityTypes, typeId, personaId, 'entity')
    glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'entity')
    glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'entity')
    glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'entity')

    const cleanedEntityTypes = updateGlossesInTypes(updatedEntityTypes, typeId, personaId, 'entity', typeName)
    const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'entity', typeName)
    const cleanedEventTypes = updateGlossesInTypes(eventTypes, typeId, personaId, 'entity', typeName)
    const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'entity', typeName)

    const deleteResult = await this.repository.deleteAnnotations({
      personaId,
      type: 'entity',
      label: typeId
    })

    let worldAssignments = 0
    const worldState = await this.repository.findPersonalWorldState(persona.userId)
    if (worldState) {
      const entities = asEntities(worldState.entities)
      worldAssignments = countTypeAssignments(entities, typeId, personaId)
      const cleanedEntities = removeTypeAssignmentsFromEntities(entities, typeId, personaId)
      await this.repository.updateWorldState(worldState.userId, {
        entities: toJson(cleanedEntities)
      })
    }

    await this.repository.updateOntology(personaId, {
      entityTypes: toJson(cleanedEntityTypes),
      roleTypes: toJson(cleanedRoleTypes),
      eventTypes: toJson(cleanedEventTypes),
      relationTypes: toJson(cleanedRelationTypes)
    })

    return {
      message: `Entity type "${typeName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        annotations: deleteResult.count,
        worldAssignments
      }
    }
  }

  /**
   * Deletion preview for a role type.
   *
   * @returns gloss reference, annotation, and event-role reference counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when read access is denied
   */
  async getRoleTypeDeletionPreview(
    personaId: string,
    typeId: string
  ): Promise<{ glossReferences: number; annotationCount: number; eventRoleReferences: number }> {
    const persona = await this.loadForTypeRead(personaId)
    const ontology = persona.ontology!

    const roleTypes = asTypesWithGloss(ontology.roleTypes)
    if (!roleTypes.find(t => t.id === typeId)) {
      throw new NotFoundError('Role type', typeId)
    }

    const glossReferences = this.countGlossRefsAcrossOntology(ontology, personaId, typeId, 'role', 'role')

    const annotationCount = await this.repository.countAnnotations({
      personaId,
      type: 'role',
      label: typeId
    })

    const eventRoleReferences = this.countEventRoleReferences(ontology.eventTypes, typeId)

    return { glossReferences, annotationCount, eventRoleReferences }
  }

  /**
   * Deletes a role type, converting gloss references to text, removing the role
   * from event-type role slots, and deleting matching annotations.
   *
   * @returns the success message and the cleaned-up counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when delete access is denied
   */
  async deleteRoleType(
    personaId: string,
    typeId: string
  ): Promise<{ message: string; cleanedUp: { glossReferences: number; annotations: number; eventRoleReferences: number } }> {
    const persona = await this.loadForTypeDelete(personaId)
    const ontology = persona.ontology!

    const roleTypes = asTypesWithGloss(ontology.roleTypes)
    const targetType = roleTypes.find(t => t.id === typeId)
    if (!targetType) {
      throw new NotFoundError('Role type', typeId)
    }

    const typeName = targetType.name
    const updatedRoleTypes = roleTypes.filter(t => t.id !== typeId)

    const entityTypes = asTypesWithGloss(ontology.entityTypes)
    const eventTypesForGloss = asTypesWithGloss(ontology.eventTypes)
    const relationTypes = asTypesWithGloss(ontology.relationTypes)

    let glossReferences = 0
    glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'role')
    glossReferences += countTypeRefsInGlosses(updatedRoleTypes, typeId, personaId, 'role')
    glossReferences += countTypeRefsInGlosses(eventTypesForGloss, typeId, personaId, 'role')
    glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'role')

    const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'role', typeName)
    const cleanedRoleTypes = updateGlossesInTypes(updatedRoleTypes, typeId, personaId, 'role', typeName)
    const cleanedEventTypesGloss = updateGlossesInTypes(eventTypesForGloss, typeId, personaId, 'role', typeName)
    const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'role', typeName)

    // Remove the role from event-type role slots, preserving every other field
    // on each event type. The raw event types carry the `roles` array, which
    // the gloss-only mapping above does not.
    const eventTypesRaw = ontology.eventTypes
    const eventRoleReferences = this.countEventRoleReferences(eventTypesRaw, typeId)
    let cleanedEventTypes = cleanedEventTypesGloss
    if (Array.isArray(eventTypesRaw)) {
      cleanedEventTypes = cleanedEventTypesGloss.map(et => {
        const rawEvent = eventTypesRaw.find(raw =>
          raw && typeof raw === 'object' && 'id' in raw && (raw as { id: string }).id === et.id
        )
        if (rawEvent && typeof rawEvent === 'object' && 'roles' in rawEvent) {
          const roles = (rawEvent as { roles?: Array<{ roleTypeId: string }> }).roles
          if (roles) {
            return { ...et, roles: roles.filter(r => r.roleTypeId !== typeId) }
          }
        }
        return et
      })
    }

    const deleteResult = await this.repository.deleteAnnotations({
      personaId,
      type: 'role',
      label: typeId
    })

    await this.repository.updateOntology(personaId, {
      entityTypes: toJson(cleanedEntityTypes),
      roleTypes: toJson(cleanedRoleTypes),
      eventTypes: toJson(cleanedEventTypes),
      relationTypes: toJson(cleanedRelationTypes)
    })

    return {
      message: `Role type "${typeName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        annotations: deleteResult.count,
        eventRoleReferences
      }
    }
  }

  /**
   * Counts the references to a role type across event-type role slots in a raw
   * ontology event-types JSON value.
   */
  private countEventRoleReferences(eventTypesRaw: Prisma.JsonValue, roleTypeId: string): number {
    let count = 0
    if (Array.isArray(eventTypesRaw)) {
      for (const eventType of eventTypesRaw) {
        if (eventType && typeof eventType === 'object' && 'roles' in eventType) {
          const roles = (eventType as { roles?: Array<{ roleTypeId: string }> }).roles
          if (roles) {
            count += roles.filter(r => r.roleTypeId === roleTypeId).length
          }
        }
      }
    }
    return count
  }

  /**
   * Deletion preview for an event type.
   *
   * @returns gloss reference, annotation, and world-interpretation counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when read access is denied
   */
  async getEventTypeDeletionPreview(
    personaId: string,
    typeId: string
  ): Promise<{ glossReferences: number; annotationCount: number; worldInterpretationCount: number }> {
    const persona = await this.loadForTypeRead(personaId)
    const ontology = persona.ontology!

    const eventTypes = asTypesWithGloss(ontology.eventTypes)
    if (!eventTypes.find(t => t.id === typeId)) {
      throw new NotFoundError('Event type', typeId)
    }

    const glossReferences = this.countGlossRefsAcrossOntology(ontology, personaId, typeId, 'event', 'event')

    const annotationCount = await this.repository.countAnnotations({
      personaId,
      type: 'event',
      label: typeId
    })

    let worldInterpretationCount = 0
    const worldState = await this.repository.findPersonalWorldState(persona.userId)
    if (worldState) {
      const events = asEvents(worldState.events)
      worldInterpretationCount = countEventInterpretations(events, typeId, personaId)
    }

    return { glossReferences, annotationCount, worldInterpretationCount }
  }

  /**
   * Deletes an event type, converting gloss references to text, deleting
   * matching annotations, and cleaning event interpretations from the personal
   * world state.
   *
   * @returns the success message and the cleaned-up counts
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when delete access is denied
   */
  async deleteEventType(
    personaId: string,
    typeId: string
  ): Promise<{ message: string; cleanedUp: { glossReferences: number; annotations: number; worldInterpretations: number } }> {
    const persona = await this.loadForTypeDelete(personaId)
    const ontology = persona.ontology!

    const eventTypes = asTypesWithGloss(ontology.eventTypes)
    const targetType = eventTypes.find(t => t.id === typeId)
    if (!targetType) {
      throw new NotFoundError('Event type', typeId)
    }

    const typeName = targetType.name
    const updatedEventTypes = eventTypes.filter(t => t.id !== typeId)

    const entityTypes = asTypesWithGloss(ontology.entityTypes)
    const roleTypes = asTypesWithGloss(ontology.roleTypes)
    const relationTypes = asTypesWithGloss(ontology.relationTypes)

    let glossReferences = 0
    glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'event')
    glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'event')
    glossReferences += countTypeRefsInGlosses(updatedEventTypes, typeId, personaId, 'event')
    glossReferences += countTypeRefsInGlosses(relationTypes, typeId, personaId, 'event')

    const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'event', typeName)
    const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'event', typeName)
    const cleanedEventTypes = updateGlossesInTypes(updatedEventTypes, typeId, personaId, 'event', typeName)
    const cleanedRelationTypes = updateGlossesInTypes(relationTypes, typeId, personaId, 'event', typeName)

    const deleteResult = await this.repository.deleteAnnotations({
      personaId,
      type: 'event',
      label: typeId
    })

    let worldInterpretations = 0
    const worldState = await this.repository.findPersonalWorldState(persona.userId)
    if (worldState) {
      const events = asEvents(worldState.events)
      worldInterpretations = countEventInterpretations(events, typeId, personaId)
      const cleanedEvents = removeEventInterpretationsFromEvents(events, typeId, personaId)
      await this.repository.updateWorldState(worldState.userId, {
        events: toJson(cleanedEvents)
      })
    }

    await this.repository.updateOntology(personaId, {
      entityTypes: toJson(cleanedEntityTypes),
      roleTypes: toJson(cleanedRoleTypes),
      eventTypes: toJson(cleanedEventTypes),
      relationTypes: toJson(cleanedRelationTypes)
    })

    return {
      message: `Event type "${typeName}" deleted successfully`,
      cleanedUp: {
        glossReferences,
        annotations: deleteResult.count,
        worldInterpretations
      }
    }
  }

  /**
   * Deletion preview for a relation type.
   *
   * Relation instances are tracked client-side, so the instance count is
   * always 0.
   *
   * @returns gloss reference count and the (always-zero) relation instance count
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when read access is denied
   */
  async getRelationTypeDeletionPreview(
    personaId: string,
    typeId: string
  ): Promise<{ glossReferences: number; relationInstanceCount: number }> {
    const persona = await this.loadForTypeRead(personaId)
    const ontology = persona.ontology!

    const relationTypes = asTypesWithGloss(ontology.relationTypes)
    if (!relationTypes.find(t => t.id === typeId)) {
      throw new NotFoundError('Relation type', typeId)
    }

    const glossReferences = this.countGlossRefsAcrossOntology(ontology, personaId, typeId, 'relation', 'relation')

    return { glossReferences, relationInstanceCount: 0 }
  }

  /**
   * Deletes a relation type, converting gloss references to text.
   *
   * @returns the success message and the cleaned-up gloss reference count
   * @throws {NotFoundError} when the persona, ontology, or type does not exist
   * @throws {ForbiddenError} when delete access is denied
   */
  async deleteRelationType(
    personaId: string,
    typeId: string
  ): Promise<{ message: string; cleanedUp: { glossReferences: number } }> {
    const persona = await this.loadForTypeDelete(personaId)
    const ontology = persona.ontology!

    const relationTypes = asTypesWithGloss(ontology.relationTypes)
    const targetType = relationTypes.find(t => t.id === typeId)
    if (!targetType) {
      throw new NotFoundError('Relation type', typeId)
    }

    const typeName = targetType.name
    const updatedRelationTypes = relationTypes.filter(t => t.id !== typeId)

    const entityTypes = asTypesWithGloss(ontology.entityTypes)
    const roleTypes = asTypesWithGloss(ontology.roleTypes)
    const eventTypes = asTypesWithGloss(ontology.eventTypes)

    let glossReferences = 0
    glossReferences += countTypeRefsInGlosses(entityTypes, typeId, personaId, 'relation')
    glossReferences += countTypeRefsInGlosses(roleTypes, typeId, personaId, 'relation')
    glossReferences += countTypeRefsInGlosses(eventTypes, typeId, personaId, 'relation')
    glossReferences += countTypeRefsInGlosses(updatedRelationTypes, typeId, personaId, 'relation')

    const cleanedEntityTypes = updateGlossesInTypes(entityTypes, typeId, personaId, 'relation', typeName)
    const cleanedRoleTypes = updateGlossesInTypes(roleTypes, typeId, personaId, 'relation', typeName)
    const cleanedEventTypes = updateGlossesInTypes(eventTypes, typeId, personaId, 'relation', typeName)
    const cleanedRelationTypes = updateGlossesInTypes(updatedRelationTypes, typeId, personaId, 'relation', typeName)

    await this.repository.updateOntology(personaId, {
      entityTypes: toJson(cleanedEntityTypes),
      roleTypes: toJson(cleanedRoleTypes),
      eventTypes: toJson(cleanedEventTypes),
      relationTypes: toJson(cleanedRelationTypes)
    })

    return {
      message: `Relation type "${typeName}" deleted successfully`,
      cleanedUp: { glossReferences }
    }
  }

  /**
   * Maps a database ontology row to the API response shape: database field
   * names are renamed (`entityTypes` to `entities`, etc.), `relations` is
   * always empty, and dates are ISO strings.
   */
  private mapOntologyResponse(ontology: NonNullable<PersonaWithOntology['ontology']>): OntologyResponse {
    return {
      id: ontology.id,
      personaId: ontology.personaId,
      entities: (ontology.entityTypes as unknown[]) || [],
      roles: (ontology.roleTypes as unknown[]) || [],
      events: (ontology.eventTypes as unknown[]) || [],
      relationTypes: (ontology.relationTypes as unknown[]) || [],
      relations: [],
      createdAt: ontology.createdAt.toISOString(),
      updatedAt: ontology.updatedAt.toISOString()
    }
  }
}
