import { PrismaClient, Persona, Prisma } from '@prisma/client'

import { ConflictError, NotFoundError } from '../lib/errors.js'
import {
  countPersonaAnnotations,
  deletePersonaAnnotations,
} from '../services/layers-bridge/annotation-bridge.js'
import { readOntologyAggregate, writeOntologyAggregate } from '../services/layers-bridge/ontology-bridge.js'
import { readWorldAggregate, writeWorldAggregate } from '../services/layers-bridge/world-bridge.js'
import { layersOntologyForPersonaId } from '../services/layers-id-map.js'
import { personalWorldStateId, type WorldStateAggregate } from '../services/world-layers-mapper.js'
import type { PersonaOntologyAggregate } from '../services/ontology-layers-mapper.js'

/**
 * A persona's ontology reconstructed from the layers store, in the row shape the
 * ontology read paths consume: the four type buckets plus an id and timestamps.
 */
export interface PersonaOntologyRow {
  id: string
  personaId: string
  entityTypes: Prisma.JsonValue
  eventTypes: Prisma.JsonValue
  roleTypes: Prisma.JsonValue
  relationTypes: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

/**
 * Persona row joined with its ontology.
 *
 * Used by read paths that need the ontology in the same round-trip
 * (deletion preview, ontology endpoints, and the type-deletion flows). The
 * ontology is reconstructed from the layers store.
 */
export type PersonaWithOntology = Persona & { ontology: PersonaOntologyRow | null }

/** An annotation filter selecting a persona's annotations, optionally by type/label. */
export interface PersonaAnnotationWhere {
  personaId: string
  type?: string
  label?: string
}

/**
 * The four type buckets a persona-ontology update carries. Each is an opaque
 * JSON array; omitted buckets are treated as empty.
 */
export interface OntologyBucketUpdate {
  entityTypes?: unknown
  eventTypes?: unknown
  roleTypes?: unknown
  relationTypes?: unknown
}

/** The buckets of a personal world state a partial update may set. */
export interface WorldStatePartialUpdate {
  entities?: unknown
  events?: unknown
  times?: unknown
  entityCollections?: unknown
  eventCollections?: unknown
  timeCollections?: unknown
  relations?: unknown
}

/**
 * A personal world state reconstructed from the layers store, in the row shape
 * the persona-cleanup paths read.
 */
export interface PersonalWorldStateView {
  id: string
  userId: string
  projectId: string | null
  entities: Prisma.JsonValue
  events: Prisma.JsonValue
  times: Prisma.JsonValue
  entityCollections: Prisma.JsonValue
  eventCollections: Prisma.JsonValue
  timeCollections: Prisma.JsonValue
  relations: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

/**
 * Repository for all Persona and Ontology database access.
 *
 * This class owns every Prisma call in the personas domain. It performs no
 * authorization: callers (the PersonaService) decide who may invoke a method.
 * Methods return raw Prisma model types and propagate Prisma errors (for
 * example P2025 on a missing update target) to their callers.
 *
 * @example
 * ```typescript
 * const repo = new PersonaRepository(fastify.prisma)
 * const persona = await repo.findById(id)
 * if (!persona) {
 *   throw new NotFoundError('Persona', id)
 * }
 * ```
 */
export class PersonaRepository {
  /**
   * Creates a new PersonaRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /** Builds an ontology row shape from a reconstructed aggregate. */
  private static synthOntology(
    id: string,
    personaId: string,
    aggregate: PersonaOntologyAggregate,
    createdAt: Date,
    updatedAt: Date,
  ): PersonaOntologyRow {
    return {
      id,
      personaId,
      entityTypes: aggregate.entityTypes as Prisma.JsonValue,
      eventTypes: aggregate.eventTypes as Prisma.JsonValue,
      roleTypes: aggregate.roleTypes as Prisma.JsonValue,
      relationTypes: aggregate.relationTypes as Prisma.JsonValue,
      createdAt,
      updatedAt,
    }
  }

  /** Reconstructs a persona's ontology from the layers store, or null. */
  private async reconstructOntology(personaId: string): Promise<PersonaOntologyRow | null> {
    const read = await readOntologyAggregate(this.prisma, personaId)
    if (!read.exists) return null
    return PersonaRepository.synthOntology(
      read.id,
      personaId,
      read.aggregate,
      new Date(read.createdAt),
      new Date(read.updatedAt),
    )
  }

  /**
   * Finds personas matching a WHERE clause, newest first.
   *
   * Used by the list endpoint; the caller supplies the mode-specific filter
   * (single-user, unauthenticated, demo, or CASL-scoped authenticated).
   *
   * @param where - Prisma WHERE clause selecting the visible personas
   * @returns matching personas ordered by creation date descending
   */
  async findManyForList(where: Prisma.PersonaWhereInput): Promise<Persona[]> {
    return this.prisma.persona.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Finds a persona by ID.
   *
   * @param id - Persona UUID
   * @returns the persona, or null if not found
   */
  async findById(id: string): Promise<Persona | null> {
    return this.prisma.persona.findUnique({ where: { id } })
  }

  /**
   * Finds a persona by ID with its ontology included.
   *
   * @param id - Persona UUID
   * @returns the persona with its ontology, or null if not found
   */
  async findByIdWithOntology(id: string): Promise<PersonaWithOntology | null> {
    const persona = await this.prisma.persona.findUnique({ where: { id } })
    if (!persona) return null
    return { ...persona, ontology: await this.reconstructOntology(id) }
  }

  /**
   * Finds many personas by ID with their ontologies included.
   *
   * Used by the batch ontology endpoint. Personas without an ontology are
   * still returned; the caller filters them out.
   *
   * @param ids - Persona UUIDs to fetch
   * @returns matching personas, each with its ontology
   */
  async findManyWithOntology(ids: string[]): Promise<PersonaWithOntology[]> {
    const personas = await this.prisma.persona.findMany({ where: { id: { in: ids } } })
    const result: PersonaWithOntology[] = []
    for (const persona of personas) {
      result.push({ ...persona, ontology: await this.reconstructOntology(persona.id) })
    }
    return result
  }

  /**
   * Creates a persona together with an empty ontology in the layers store.
   *
   * @param data - Prisma persona create input
   * @returns the created persona
   */
  async createWithOntology(data: Prisma.PersonaCreateInput): Promise<Persona> {
    const persona = await this.prisma.persona.create({ data })
    await writeOntologyAggregate(
      this.prisma,
      persona.id,
      { entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] },
      { name: `${persona.name} ontology`, description: persona.informationNeed, domain: persona.domain },
      { projectId: persona.projectId, createdByUserId: persona.userId },
    )
    return persona
  }

  /**
   * Updates a persona.
   *
   * @param id - Persona UUID
   * @param data - Prisma update input
   * @returns the updated persona
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if the persona does not exist
   */
  async update(id: string, data: Prisma.PersonaUpdateInput): Promise<Persona> {
    return this.prisma.persona.update({ where: { id }, data })
  }

  /**
   * Deletes a persona (cascades to its ontology, summaries, and annotations).
   *
   * @param id - Persona UUID
   * @returns the deleted persona
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if the persona does not exist
   */
  async delete(id: string): Promise<Persona> {
    return this.prisma.persona.delete({ where: { id } })
  }

  /**
   * Updates a persona's ontology in the layers store, keyed by personaId. The
   * caller supplies the full set of four type buckets (see PersonaService); the
   * write reconstructs the ontology from them.
   *
   * @param personaId - Persona UUID owning the ontology
   * @param data - the four type buckets to persist
   * @returns the updated ontology in the row shape
   * @throws {Error} when the persona does not exist
   */
  async updateOntology(personaId: string, data: OntologyBucketUpdate): Promise<PersonaOntologyRow> {
    const persona = await this.prisma.persona.findUnique({ where: { id: personaId } })
    if (!persona) {
      throw new Prisma.PrismaClientKnownRequestError('Persona not found', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      })
    }
    const aggregate: PersonaOntologyAggregate = {
      entityTypes: Array.isArray(data.entityTypes) ? data.entityTypes : [],
      eventTypes: Array.isArray(data.eventTypes) ? data.eventTypes : [],
      roleTypes: Array.isArray(data.roleTypes) ? data.roleTypes : [],
      relationTypes: Array.isArray(data.relationTypes) ? data.relationTypes : [],
    }
    await writeOntologyAggregate(
      this.prisma,
      personaId,
      aggregate,
      { name: `${persona.name} ontology`, description: persona.informationNeed, domain: persona.domain },
      { projectId: persona.projectId, createdByUserId: persona.userId },
    )
    return (await this.reconstructOntology(personaId)) ??
      PersonaRepository.synthOntology(
        `ontology-${personaId}`,
        personaId,
        aggregate,
        new Date(),
        new Date(),
      )
  }

  /**
   * Applies a version-guarded update to a persona's ontology in the layers store.
   *
   * Reads the current ontology aggregate from the layers store, lets `transform`
   * compute the new type buckets from it, then compares-and-swaps on the backing
   * `LayersOntology.lockVersion` before materializing the buckets. When a
   * concurrent writer advanced the version first the guard misses (count 0) and
   * the whole read-transform-write retries against the freshly read row, so both
   * writes land instead of one silently clobbering the other. The guard keys on
   * the monotonic `lockVersion` rather than `updatedAt` because two writes landing
   * in the same millisecond can share an `updatedAt`. Buckets the transform leaves
   * undefined keep their current value, so a partial cleanup never drops a sibling
   * bucket.
   *
   * @param personaId - Persona UUID owning the ontology
   * @param transform - computes the type buckets to write from the current row
   * @returns the updated ontology in the row shape
   * @throws {NotFoundError} when the persona has no ontology
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  async updateOntologyOptimistic(
    personaId: string,
    transform: (current: PersonaOntologyRow) => OntologyBucketUpdate,
  ): Promise<PersonaOntologyRow> {
    const ontologyId = layersOntologyForPersonaId(personaId)
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.prisma.layersOntology.findUnique({ where: { id: ontologyId } })
      if (!row) {
        throw new NotFoundError('Ontology', personaId)
      }
      const current = await this.reconstructOntology(personaId)
      if (!current) {
        throw new NotFoundError('Ontology', personaId)
      }
      const buckets = transform(current)
      const merged: OntologyBucketUpdate = {
        entityTypes: buckets.entityTypes !== undefined ? buckets.entityTypes : current.entityTypes,
        eventTypes: buckets.eventTypes !== undefined ? buckets.eventTypes : current.eventTypes,
        roleTypes: buckets.roleTypes !== undefined ? buckets.roleTypes : current.roleTypes,
        relationTypes: buckets.relationTypes !== undefined ? buckets.relationTypes : current.relationTypes,
      }
      // Compare-and-swap the ontology version before writing its types; on a miss
      // a concurrent writer advanced it, so retry against the freshly read row.
      const guard = await this.prisma.layersOntology.updateMany({
        where: { id: ontologyId, lockVersion: row.lockVersion },
        data: { lockVersion: { increment: 1 } },
      })
      if (guard.count !== 1) {
        continue
      }
      return this.updateOntology(personaId, merged)
    }
    throw new ConflictError('Ontology update conflicted after retries')
  }

  /**
   * Counts a persona's annotations in the layers store, optionally scoped by the
   * semantic type and label (falling through to the legacy table when the
   * persona has no layers annotations).
   *
   * @param where - persona id, plus optional type and label
   * @returns number of matching annotations
   */
  async countAnnotations(where: PersonaAnnotationWhere): Promise<number> {
    return countPersonaAnnotations(this.prisma, where.personaId, {
      type: where.type,
      label: where.label,
    })
  }

  /**
   * Counts video summaries for a persona.
   *
   * @param personaId - Persona UUID
   * @returns number of summaries for the persona
   */
  async countVideoSummaries(personaId: string): Promise<number> {
    return this.prisma.videoSummary.count({ where: { personaId } })
  }

  /**
   * Deletes a persona's annotations from the layers store, optionally scoped by
   * the semantic type and label (falling through to the legacy table when the
   * persona has no layers annotations).
   *
   * @param where - persona id, plus optional type and label
   * @returns a batch payload with the deleted count
   */
  async deleteAnnotations(where: PersonaAnnotationWhere): Promise<Prisma.BatchPayload> {
    const count = await deletePersonaAnnotations(this.prisma, where.personaId, {
      type: where.type,
      label: where.label,
    })
    return { count }
  }

  /**
   * Reconstructs a user's personal world state (scoped to the user with no
   * project) from the layers store, or null when the user has none. This is the
   * world state the persona-deletion and type-deletion cleanup paths mutate.
   *
   * @param userId - owning user ID
   * @returns the personal world state view, or null if the user has none
   */
  async findPersonalWorldState(userId: string): Promise<PersonalWorldStateView | null> {
    const { aggregate, exists } = await readWorldAggregate(this.prisma, { userId, projectId: null })
    if (!exists) return null
    const now = new Date()
    return {
      id: personalWorldStateId(userId),
      userId,
      projectId: null,
      entities: aggregate.entities as Prisma.JsonValue,
      events: aggregate.events as Prisma.JsonValue,
      times: aggregate.times as Prisma.JsonValue,
      entityCollections: aggregate.entityCollections as Prisma.JsonValue,
      eventCollections: aggregate.eventCollections as Prisma.JsonValue,
      timeCollections: aggregate.timeCollections as Prisma.JsonValue,
      relations: aggregate.relations as Prisma.JsonValue,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Applies a partial update to a user's personal world state in the layers
   * store: the provided buckets replace the current ones; the rest are preserved.
   *
   * @param userId - the owning user id (from `PersonalWorldStateView.userId`)
   * @param data - the world buckets to replace
   */
  async updateWorldState(userId: string, data: WorldStatePartialUpdate): Promise<void> {
    const { aggregate } = await readWorldAggregate(this.prisma, { userId, projectId: null })
    const merged: WorldStateAggregate = { ...aggregate }
    const buckets: (keyof WorldStatePartialUpdate & keyof WorldStateAggregate)[] = [
      'entities',
      'events',
      'times',
      'entityCollections',
      'eventCollections',
      'timeCollections',
      'relations',
    ]
    for (const bucket of buckets) {
      const value = data[bucket]
      if (value !== undefined) merged[bucket] = Array.isArray(value) ? value : []
    }
    await writeWorldAggregate(this.prisma, { userId, projectId: null }, merged)
  }
}
