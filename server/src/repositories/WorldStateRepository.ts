import { PrismaClient, User, WorldState, Prisma } from '@prisma/client'

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
   * Updates a world state row by ID.
   *
   * @param id - World state ID
   * @param data - Prisma world state update input
   * @returns the updated world state
   */
  async updateWorldState(id: string, data: Prisma.WorldStateUpdateInput): Promise<WorldState> {
    return this.prisma.worldState.update({
      where: { id },
      data
    })
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
