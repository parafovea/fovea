import { PrismaClient, LayersOntology, TypeDef, Persona, Prisma } from '@prisma/client'

/**
 * Repository for all LayersOntology and TypeDef database access in the layers
 * ontology domain.
 *
 * This class owns every Prisma call for the ontologies resource group. It
 * performs no authorization: callers (the LayersOntologyService) decide who may
 * invoke a method and supply the CASL read filter that scopes list queries.
 * Methods return raw Prisma model types and propagate Prisma errors (including
 * P2002 on the client-supplied id) to their callers.
 *
 * @example
 * ```typescript
 * const repo = new LayersOntologyRepository(fastify.prisma)
 * const ontologies = await repo.findAccessibleOntologies(readScope)
 * ```
 */
export class LayersOntologyRepository {
  /**
   * Creates a new LayersOntologyRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  // --- LayersOntology ----------------------------------------------------

  /**
   * Lists ontologies matching a read-scope filter, oldest-first.
   *
   * The caller (the service) builds `readScope` from
   * `accessibleBy(ability, 'read').LayersOntology`, so this method performs no
   * authorization itself. `extraWhere` narrows the result further (e.g. by
   * personaId, projectId, or domain) and is ANDed with the read scope.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param extraWhere - optional additional WHERE constraints
   * @returns the accessible ontologies
   */
  async findAccessibleOntologies(
    readScope: Prisma.LayersOntologyWhereInput,
    extraWhere?: Prisma.LayersOntologyWhereInput
  ): Promise<LayersOntology[]> {
    return this.prisma.layersOntology.findMany({
      where: { AND: [readScope, extraWhere ?? {}] },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * Finds an ontology by id.
   *
   * @param id - LayersOntology UUID
   * @returns the ontology, or null if not found
   */
  async findOntologyById(id: string): Promise<LayersOntology | null> {
    return this.prisma.layersOntology.findUnique({ where: { id } })
  }

  /**
   * Creates an ontology.
   *
   * Accepts the unchecked create input so callers can set the scope columns
   * (projectId, createdByUserId), the parent/persona foreign keys, and an
   * optional client-supplied id directly.
   *
   * @param data - Prisma unchecked create input
   * @returns the created ontology
   */
  async createOntology(data: Prisma.LayersOntologyUncheckedCreateInput): Promise<LayersOntology> {
    return this.prisma.layersOntology.create({ data })
  }

  /**
   * Updates an ontology by id.
   *
   * @param id - LayersOntology UUID
   * @param data - Prisma unchecked update input (mutable fields only)
   * @returns the updated ontology
   */
  async updateOntology(id: string, data: Prisma.LayersOntologyUncheckedUpdateInput): Promise<LayersOntology> {
    return this.prisma.layersOntology.update({ where: { id }, data })
  }

  /**
   * Deletes an ontology by id. Its type definitions cascade-delete via the
   * schema's onDelete: Cascade relation.
   *
   * @param id - LayersOntology UUID
   */
  async deleteOntology(id: string): Promise<void> {
    await this.prisma.layersOntology.delete({ where: { id } })
  }

  // --- TypeDef -----------------------------------------------------------

  /**
   * Lists type definitions matching a read-scope filter, oldest-first.
   *
   * The caller builds `readScope` from
   * `accessibleBy(ability, 'read').TypeDef`; `extraWhere` narrows the result
   * further (e.g. by ontologyId or typeKind) and is ANDed with it.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param extraWhere - optional additional WHERE constraints
   * @returns the accessible type definitions
   */
  async findAccessibleTypeDefs(
    readScope: Prisma.TypeDefWhereInput,
    extraWhere?: Prisma.TypeDefWhereInput
  ): Promise<TypeDef[]> {
    return this.prisma.typeDef.findMany({
      where: { AND: [readScope, extraWhere ?? {}] },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * Finds a type definition by id.
   *
   * @param id - TypeDef UUID
   * @returns the type definition, or null if not found
   */
  async findTypeDefById(id: string): Promise<TypeDef | null> {
    return this.prisma.typeDef.findUnique({ where: { id } })
  }

  /**
   * Creates a type definition.
   *
   * @param data - Prisma unchecked create input
   * @returns the created type definition
   */
  async createTypeDef(data: Prisma.TypeDefUncheckedCreateInput): Promise<TypeDef> {
    return this.prisma.typeDef.create({ data })
  }

  /**
   * Updates a type definition by id.
   *
   * @param id - TypeDef UUID
   * @param data - Prisma unchecked update input (mutable fields only)
   * @returns the updated type definition
   */
  async updateTypeDef(id: string, data: Prisma.TypeDefUncheckedUpdateInput): Promise<TypeDef> {
    return this.prisma.typeDef.update({ where: { id }, data })
  }

  /**
   * Deletes a type definition by id.
   *
   * @param id - TypeDef UUID
   */
  async deleteTypeDef(id: string): Promise<void> {
    await this.prisma.typeDef.delete({ where: { id } })
  }

  // --- Persona (for projectId inheritance) -------------------------------

  /**
   * Finds a persona by id.
   *
   * Used when an ontology declares a `personaId`: the service inherits the
   * persona's project scope and re-checks read access on it. The repository
   * performs no authorization itself.
   *
   * @param id - Persona UUID
   * @returns the persona, or null if not found
   */
  async findPersonaById(id: string): Promise<Persona | null> {
    return this.prisma.persona.findUnique({ where: { id } })
  }
}
