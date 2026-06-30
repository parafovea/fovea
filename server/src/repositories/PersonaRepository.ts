import { PrismaClient, Persona, Ontology, Prisma } from '@prisma/client'

/**
 * Persona row joined with its ontology.
 *
 * Used by read paths that need the ontology in the same round-trip
 * (deletion preview, ontology endpoints, and the type-deletion flows).
 */
export type PersonaWithOntology = Prisma.PersonaGetPayload<{
  include: { ontology: true }
}>

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
    return this.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })
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
    return this.prisma.persona.findMany({
      where: { id: { in: ids } },
      include: { ontology: true }
    })
  }

  /**
   * Creates a persona together with an empty ontology in a single call.
   *
   * @param data - Prisma create input (must nest an ontology create)
   * @returns the created persona
   */
  async createWithOntology(data: Prisma.PersonaCreateInput): Promise<Persona> {
    return this.prisma.persona.create({ data })
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
   * Updates a persona's ontology, keyed by personaId.
   *
   * @param personaId - Persona UUID owning the ontology
   * @param data - Prisma ontology update input
   * @returns the updated ontology
   */
  async updateOntology(personaId: string, data: Prisma.OntologyUpdateInput): Promise<Ontology> {
    return this.prisma.ontology.update({
      where: { personaId },
      data
    })
  }

  /**
   * Applies an optimistic-concurrency update to a persona's ontology row.
   *
   * Reads the current ontology row (by personaId), lets `transform` compute the
   * new column values from it, then writes them guarded by the row's
   * `updatedAt`. If a concurrent writer committed first the guard misses (count
   * 0) and we retry against the freshly-read row, so both writes land instead of
   * one silently clobbering the other. This is what makes the whole-blob
   * ontology PUT a safe per-id merge under concurrent writers (the transform
   * re-runs on fresh state each attempt).
   *
   * @param personaId - Persona UUID owning the ontology
   * @param transform - computes the Prisma update input from the current row
   * @returns the updated ontology
   * @throws when no ontology row exists or the write keeps conflicting
   */
  async updateOntologyOptimistic(
    personaId: string,
    transform: (current: Ontology) => Prisma.OntologyUpdateInput,
  ): Promise<Ontology> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.prisma.ontology.findUnique({
        where: { personaId },
      })
      if (!current) {
        throw new Error('No ontology to update')
      }
      const result = await this.prisma.ontology.updateMany({
        where: { id: current.id, updatedAt: current.updatedAt },
        data: { ...transform(current), updatedAt: new Date() },
      })
      if (result.count === 1) {
        return this.prisma.ontology.findUniqueOrThrow({ where: { id: current.id } })
      }
    }
    throw new Error('Ontology update conflicted after retries')
  }

  /**
   * Counts annotations matching a WHERE clause.
   *
   * @param where - Prisma annotation WHERE clause
   * @returns number of matching annotations
   */
  async countAnnotations(where: Prisma.AnnotationWhereInput): Promise<number> {
    return this.prisma.annotation.count({ where })
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
   * Deletes annotations matching a WHERE clause.
   *
   * @param where - Prisma annotation WHERE clause
   * @returns Prisma batch payload with the deleted count
   */
  async deleteAnnotations(where: Prisma.AnnotationWhereInput): Promise<Prisma.BatchPayload> {
    return this.prisma.annotation.deleteMany({ where })
  }

  /**
   * Finds a user's personal world state (the row scoped to the user with no
   * project). This is the world state the persona-deletion and type-deletion
   * cleanup paths mutate.
   *
   * @param userId - owning user ID
   * @returns the personal world state, or null if the user has none
   */
  async findPersonalWorldState(userId: string) {
    return this.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })
  }

  /**
   * Updates a world state row by ID.
   *
   * @param id - World state ID
   * @param data - Prisma world state update input
   */
  async updateWorldState(id: string, data: Prisma.WorldStateUpdateInput): Promise<void> {
    await this.prisma.worldState.update({ where: { id }, data })
  }
}
