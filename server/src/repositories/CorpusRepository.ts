import {
  PrismaClient,
  Prisma,
  type Corpus,
  type CorpusMembership,
  type ClusterSet,
  type Alignment,
  type Expression,
} from '@prisma/client'

/**
 * Repository for all Prisma access in the layers corpora domain: the Corpus
 * record, its CorpusMembership join rows, and the ClusterSet and Alignment
 * records that hang off expressions/corpora.
 *
 * This class owns every Prisma call in the corpora domain and performs no
 * authorization: callers (the CorporaService) decide who may invoke a method
 * and supply the CASL read-scope filter for list queries. Methods return raw
 * Prisma model types and propagate Prisma errors (including the P2002
 * unique-violation used by the idempotent create paths) to their callers.
 *
 * @example
 * ```typescript
 * const repo = new CorpusRepository(fastify.prisma)
 * const corpora = await repo.findAccessibleCorpora(accessibleBy(ability, 'read').Corpus)
 * ```
 */
export class CorpusRepository {
  /**
   * Creates a new CorpusRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  // --- Corpus ---------------------------------------------------------------

  /**
   * Finds every corpus matching a read-scope filter.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @returns the accessible corpora, oldest first
   */
  async findAccessibleCorpora(readScope: Prisma.CorpusWhereInput): Promise<Corpus[]> {
    return this.prisma.corpus.findMany({
      where: readScope,
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Finds a corpus by ID.
   *
   * @param id - Corpus UUID
   * @returns the corpus, or null if not found
   */
  async findCorpusById(id: string): Promise<Corpus | null> {
    return this.prisma.corpus.findUnique({ where: { id } })
  }

  /**
   * Creates a corpus.
   *
   * @param data - Prisma unchecked create input (sets projectId/createdByUserId directly)
   * @returns the created corpus
   */
  async createCorpus(data: Prisma.CorpusUncheckedCreateInput): Promise<Corpus> {
    return this.prisma.corpus.create({ data })
  }

  /**
   * Updates a corpus by ID.
   *
   * @param id - Corpus UUID
   * @param data - Prisma corpus update input
   * @returns the updated corpus
   */
  async updateCorpus(id: string, data: Prisma.CorpusUpdateInput): Promise<Corpus> {
    return this.prisma.corpus.update({ where: { id }, data })
  }

  /**
   * Deletes a corpus by ID.
   *
   * @param id - Corpus UUID
   */
  async deleteCorpus(id: string): Promise<void> {
    await this.prisma.corpus.delete({ where: { id } })
  }

  // --- CorpusMembership -----------------------------------------------------

  /**
   * Lists a corpus's memberships in ordinal-then-creation order.
   *
   * @param corpusId - owning Corpus UUID
   * @returns the corpus's membership rows
   */
  async findMembershipsByCorpus(corpusId: string): Promise<CorpusMembership[]> {
    return this.prisma.corpusMembership.findMany({
      where: { corpusId },
      orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
    })
  }

  /**
   * Finds a membership by ID.
   *
   * @param id - CorpusMembership UUID
   * @returns the membership, or null if not found
   */
  async findMembershipById(id: string): Promise<CorpusMembership | null> {
    return this.prisma.corpusMembership.findUnique({ where: { id } })
  }

  /**
   * Finds a membership by its (corpusId, expressionId) unique pair.
   *
   * @param corpusId - owning Corpus UUID
   * @param expressionId - member Expression UUID
   * @returns the membership, or null if the expression is not in the corpus
   */
  async findMembershipByCorpusAndExpression(
    corpusId: string,
    expressionId: string
  ): Promise<CorpusMembership | null> {
    return this.prisma.corpusMembership.findUnique({
      where: { corpusId_expressionId: { corpusId, expressionId } },
    })
  }

  /**
   * Creates a corpus membership.
   *
   * @param data - Prisma unchecked create input (sets corpusId/expressionId directly)
   * @returns the created membership
   */
  async createMembership(
    data: Prisma.CorpusMembershipUncheckedCreateInput
  ): Promise<CorpusMembership> {
    return this.prisma.corpusMembership.create({ data })
  }

  /**
   * Updates a membership by ID.
   *
   * @param id - CorpusMembership UUID
   * @param data - Prisma membership update input
   * @returns the updated membership
   */
  async updateMembership(
    id: string,
    data: Prisma.CorpusMembershipUpdateInput
  ): Promise<CorpusMembership> {
    return this.prisma.corpusMembership.update({ where: { id }, data })
  }

  /**
   * Deletes a membership by ID.
   *
   * @param id - CorpusMembership UUID
   */
  async deleteMembership(id: string): Promise<void> {
    await this.prisma.corpusMembership.delete({ where: { id } })
  }

  // --- Expression (read-only parent lookups) --------------------------------

  /**
   * Finds an expression by ID.
   *
   * Used to resolve project scope and authorize the parent when creating a
   * membership, cluster set, or alignment that references an expression.
   *
   * @param id - Expression UUID
   * @returns the expression, or null if not found
   */
  async findExpressionById(id: string): Promise<Expression | null> {
    return this.prisma.expression.findUnique({ where: { id } })
  }

  // --- ClusterSet -----------------------------------------------------------

  /**
   * Finds every cluster set matching a read-scope filter.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @returns the accessible cluster sets, oldest first
   */
  async findAccessibleClusterSets(
    readScope: Prisma.ClusterSetWhereInput
  ): Promise<ClusterSet[]> {
    return this.prisma.clusterSet.findMany({
      where: readScope,
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Finds a cluster set by ID.
   *
   * @param id - ClusterSet UUID
   * @returns the cluster set, or null if not found
   */
  async findClusterSetById(id: string): Promise<ClusterSet | null> {
    return this.prisma.clusterSet.findUnique({ where: { id } })
  }

  /**
   * Creates a cluster set.
   *
   * @param data - Prisma unchecked create input
   * @returns the created cluster set
   */
  async createClusterSet(data: Prisma.ClusterSetUncheckedCreateInput): Promise<ClusterSet> {
    return this.prisma.clusterSet.create({ data })
  }

  /**
   * Updates a cluster set by ID.
   *
   * @param id - ClusterSet UUID
   * @param data - Prisma cluster set update input
   * @returns the updated cluster set
   */
  async updateClusterSet(id: string, data: Prisma.ClusterSetUpdateInput): Promise<ClusterSet> {
    return this.prisma.clusterSet.update({ where: { id }, data })
  }

  /**
   * Deletes a cluster set by ID.
   *
   * @param id - ClusterSet UUID
   */
  async deleteClusterSet(id: string): Promise<void> {
    await this.prisma.clusterSet.delete({ where: { id } })
  }

  // --- Alignment ------------------------------------------------------------

  /**
   * Finds every alignment matching a read-scope filter.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @returns the accessible alignments, oldest first
   */
  async findAccessibleAlignments(
    readScope: Prisma.AlignmentWhereInput
  ): Promise<Alignment[]> {
    return this.prisma.alignment.findMany({
      where: readScope,
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Finds an alignment by ID.
   *
   * @param id - Alignment UUID
   * @returns the alignment, or null if not found
   */
  async findAlignmentById(id: string): Promise<Alignment | null> {
    return this.prisma.alignment.findUnique({ where: { id } })
  }

  /**
   * Creates an alignment.
   *
   * @param data - Prisma unchecked create input
   * @returns the created alignment
   */
  async createAlignment(data: Prisma.AlignmentUncheckedCreateInput): Promise<Alignment> {
    return this.prisma.alignment.create({ data })
  }

  /**
   * Updates an alignment by ID.
   *
   * @param id - Alignment UUID
   * @param data - Prisma alignment update input
   * @returns the updated alignment
   */
  async updateAlignment(id: string, data: Prisma.AlignmentUpdateInput): Promise<Alignment> {
    return this.prisma.alignment.update({ where: { id }, data })
  }

  /**
   * Deletes an alignment by ID.
   *
   * @param id - Alignment UUID
   */
  async deleteAlignment(id: string): Promise<void> {
    await this.prisma.alignment.delete({ where: { id } })
  }
}
