import {
  PrismaClient,
  Prisma,
  Expression,
  Persona,
  AnnotationLayer,
  LayersAnnotation,
  TextAnnotationRelation,
} from '@prisma/client'

/**
 * Repository for all database access in the layers annotation-layers domain:
 * the AnnotationLayer, LayersAnnotation, and TextAnnotationRelation models,
 * plus the Expression and Persona reads the create paths make to resolve
 * project scope and verify parentage.
 *
 * This class owns every Prisma call in the domain. It performs no
 * authorization: the AnnotationLayerService decides who may invoke a method
 * and builds the read/scope filters. Methods return raw Prisma model types and
 * propagate Prisma errors (including P2002 on the idempotent create paths) to
 * their callers.
 *
 * @example
 * ```typescript
 * const repo = new AnnotationLayerRepository(fastify.prisma)
 * const layer = await repo.findLayerById(id)
 * ```
 */
export class AnnotationLayerRepository {
  /**
   * Creates a new AnnotationLayerRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  // ---- Expression / Persona parentage lookups -----------------------------

  /**
   * Finds an expression by id. Used to resolve the project scope a new layer
   * inherits and to verify the caller may read the expression it layers over.
   *
   * @param id - Expression UUID
   * @returns the expression, or null if not found
   */
  async findExpressionById(id: string): Promise<Expression | null> {
    return this.prisma.expression.findUnique({ where: { id } })
  }

  /**
   * Finds a persona by id. Used to verify the caller may attach an
   * ontology-type layer under that persona.
   *
   * @param id - Persona UUID
   * @returns the persona, or null if not found
   */
  async findPersonaById(id: string): Promise<Persona | null> {
    return this.prisma.persona.findUnique({ where: { id } })
  }

  // ---- AnnotationLayer -----------------------------------------------------

  /**
   * Finds an annotation layer by id.
   *
   * @param id - AnnotationLayer UUID
   * @returns the layer, or null if not found
   */
  async findLayerById(id: string): Promise<AnnotationLayer | null> {
    return this.prisma.annotationLayer.findUnique({ where: { id } })
  }

  /**
   * Lists annotation layers matching a WHERE clause, oldest first. The caller
   * (the service) intersects its CASL read filter with any expression filter.
   *
   * @param where - the composed Prisma WHERE clause
   * @returns the matching layers
   */
  async findLayers(where: Prisma.AnnotationLayerWhereInput): Promise<AnnotationLayer[]> {
    return this.prisma.annotationLayer.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Creates an annotation layer from unchecked input (sets scalar FKs directly).
   *
   * @param data - Prisma unchecked create input
   * @returns the created layer
   */
  async createLayer(data: Prisma.AnnotationLayerUncheckedCreateInput): Promise<AnnotationLayer> {
    return this.prisma.annotationLayer.create({ data })
  }

  /**
   * Updates an annotation layer's mutable fields by id.
   *
   * @param id - AnnotationLayer UUID
   * @param data - Prisma update input
   * @returns the updated layer
   */
  async updateLayer(
    id: string,
    data: Prisma.AnnotationLayerUncheckedUpdateInput,
  ): Promise<AnnotationLayer> {
    return this.prisma.annotationLayer.update({ where: { id }, data })
  }

  /**
   * Deletes an annotation layer by id. Cascades to its annotations and
   * relations via the schema's onDelete rules.
   *
   * @param id - AnnotationLayer UUID
   */
  async deleteLayer(id: string): Promise<void> {
    await this.prisma.annotationLayer.delete({ where: { id } })
  }

  // ---- LayersAnnotation ----------------------------------------------------

  /**
   * Finds a layers annotation by id.
   *
   * @param id - LayersAnnotation UUID
   * @returns the annotation, or null if not found
   */
  async findAnnotationById(id: string): Promise<LayersAnnotation | null> {
    return this.prisma.layersAnnotation.findUnique({ where: { id } })
  }

  /**
   * Creates a layers annotation from unchecked input.
   *
   * @param data - Prisma unchecked create input
   * @returns the created annotation
   */
  async createAnnotation(
    data: Prisma.LayersAnnotationUncheckedCreateInput,
  ): Promise<LayersAnnotation> {
    return this.prisma.layersAnnotation.create({ data })
  }

  /**
   * Updates a layers annotation's mutable fields by id.
   *
   * @param id - LayersAnnotation UUID
   * @param data - Prisma update input
   * @returns the updated annotation
   */
  async updateAnnotation(
    id: string,
    data: Prisma.LayersAnnotationUncheckedUpdateInput,
  ): Promise<LayersAnnotation> {
    return this.prisma.layersAnnotation.update({ where: { id }, data })
  }

  /**
   * Deletes a layers annotation by id. Cascades to relations that reference it.
   *
   * @param id - LayersAnnotation UUID
   */
  async deleteAnnotation(id: string): Promise<void> {
    await this.prisma.layersAnnotation.delete({ where: { id } })
  }

  // ---- TextAnnotationRelation ---------------------------------------------

  /**
   * Finds a text annotation relation by id.
   *
   * @param id - TextAnnotationRelation UUID
   * @returns the relation, or null if not found
   */
  async findRelationById(id: string): Promise<TextAnnotationRelation | null> {
    return this.prisma.textAnnotationRelation.findUnique({ where: { id } })
  }

  /**
   * Creates a text annotation relation from unchecked input.
   *
   * @param data - Prisma unchecked create input
   * @returns the created relation
   */
  async createRelation(
    data: Prisma.TextAnnotationRelationUncheckedCreateInput,
  ): Promise<TextAnnotationRelation> {
    return this.prisma.textAnnotationRelation.create({ data })
  }

  /**
   * Updates a text annotation relation's mutable fields by id.
   *
   * @param id - TextAnnotationRelation UUID
   * @param data - Prisma update input
   * @returns the updated relation
   */
  async updateRelation(
    id: string,
    data: Prisma.TextAnnotationRelationUncheckedUpdateInput,
  ): Promise<TextAnnotationRelation> {
    return this.prisma.textAnnotationRelation.update({ where: { id }, data })
  }

  /**
   * Deletes a text annotation relation by id.
   *
   * @param id - TextAnnotationRelation UUID
   */
  async deleteRelation(id: string): Promise<void> {
    await this.prisma.textAnnotationRelation.delete({ where: { id } })
  }
}
