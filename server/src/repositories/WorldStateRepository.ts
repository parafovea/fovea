import { PrismaClient, User, WorldState, Prisma } from '@prisma/client'
import { ConflictError, NotFoundError } from '../lib/errors.js'

/**
 * Persona row joined with its ontology.
 *
 * Used by the object-reference cleanup paths (entity/event/time deletion and
 * deletion-preview), which scan and rewrite every persona ontology's glosses.
 */
export type PersonaWithOntology = Prisma.PersonaGetPayload<{
  include: { ontology: true }
}>

/**
 * Repository for all WorldState database access in the world domain, plus the
 * supporting User, Persona, and Ontology reads/writes the world endpoints make
 * during reference cleanup.
 *
 * This class owns every Prisma call in the world domain. It performs no
 * authorization: callers (the WorldStateService) decide who may invoke a method
 * and what the resulting filter should be. Methods return raw Prisma model
 * types and propagate Prisma errors to their callers.
 *
 * @example
 * ```typescript
 * const repo = new WorldStateRepository(fastify.prisma)
 * const ws = await repo.findPersonalWorldState(userId)
 * ```
 */
export class WorldStateRepository {
  /**
   * Creates a new WorldStateRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a user by their username.
   *
   * Used to resolve the configured default user in single-user mode.
   *
   * @param username - the username to look up
   * @returns the user, or null if no user has that username
   */
  async findUserByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { username }
    })
  }

  /**
   * Finds a user by ID.
   *
   * Used by the admin clear endpoint to confirm the target user exists.
   *
   * @param id - User UUID
   * @returns the user, or null if not found
   */
  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id }
    })
  }

  /**
   * Finds a user's personal world state (the row scoped to the user with no
   * project).
   *
   * @param userId - owning user ID
   * @returns the personal world state, or null if the user has none
   */
  async findPersonalWorldState(userId: string): Promise<WorldState | null> {
    return this.prisma.worldState.findFirst({
      where: { userId, projectId: null }
    })
  }

  /**
   * Finds a user's personal world state intersected with a read-scope filter.
   *
   * The row is only returned when it both matches (userId, projectId = null)
   * and satisfies `readScope` — the caller (the service) builds that scope
   * from `accessibleBy(ability, 'read').WorldState`, so this method performs
   * no authorization itself.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param userId - owning user ID
   * @returns the accessible personal world state, or null
   */
  async findAccessiblePersonalWorldState(
    readScope: Prisma.WorldStateWhereInput,
    userId: string
  ): Promise<WorldState | null> {
    return this.prisma.worldState.findFirst({
      where: {
        AND: [
          { userId, projectId: null },
          readScope
        ]
      }
    })
  }

  /**
   * Creates a personal world state row for a user.
   *
   * Accepts the unchecked create input so callers can set `userId` directly
   * (rather than a nested relation connect).
   *
   * @param data - Prisma unchecked create input (sets userId and the JSON arrays)
   * @returns the created world state
   */
  async createWorldState(data: Prisma.WorldStateUncheckedCreateInput): Promise<WorldState> {
    return this.prisma.worldState.create({ data })
  }

  /**
   * Applies an optimistic-concurrency update to a user's personal world state.
   *
   * Reads the current row, lets `transform` compute the new column values from
   * it, then writes them guarded by the row's `version`. If a concurrent writer
   * committed first the version has advanced, the guard misses (count 0), and we
   * retry against the freshly-read row, so both writes land instead of one
   * silently clobbering the other. The guard keys on the monotonic `version`
   * rather than `updatedAt` because two writes landing in the same millisecond
   * can share an `updatedAt`, which would let the second silently overwrite the
   * first. This is what makes the whole-blob PUT a safe per-id merge under
   * concurrent writers (the transform re-runs on fresh state each attempt).
   *
   * @param userId - owning user ID
   * @param transform - computes the Prisma update input from the current row
   * @returns the updated world state
   * @throws {NotFoundError} when no personal row exists
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  async updatePersonalWorldStateOptimistic(
    userId: string,
    transform: (current: WorldState) => Prisma.WorldStateUpdateInput,
  ): Promise<WorldState> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.prisma.worldState.findFirst({
        where: { userId, projectId: null },
      })
      if (!current) {
        throw new NotFoundError('World state', userId)
      }
      const result = await this.prisma.worldState.updateMany({
        where: { id: current.id, version: current.version },
        data: { ...transform(current), version: { increment: 1 } },
      })
      if (result.count === 1) {
        return this.prisma.worldState.findUniqueOrThrow({ where: { id: current.id } })
      }
    }
    throw new ConflictError('Personal world state update conflicted after retries')
  }

  /**
   * Finds all of a user's personas with their ontologies included.
   *
   * Used by the object-reference cleanup paths to scan and rewrite every
   * persona ontology's glosses.
   *
   * @param userId - owning user ID
   * @returns the user's personas, each with its ontology (may be null)
   */
  async findPersonasWithOntology(userId: string): Promise<PersonaWithOntology[]> {
    return this.prisma.persona.findMany({
      where: { userId },
      include: { ontology: true }
    })
  }

  /**
   * Updates a persona's ontology, keyed by personaId.
   *
   * @param personaId - Persona UUID owning the ontology
   * @param data - Prisma ontology update input
   */
  async updateOntology(personaId: string, data: Prisma.OntologyUpdateInput): Promise<void> {
    await this.prisma.ontology.update({
      where: { personaId },
      data
    })
  }
}
