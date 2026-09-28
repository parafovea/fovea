import { PrismaClient, GraphNode, GraphEdge, Prisma } from '@prisma/client'

/**
 * Repository for all GraphNode and GraphEdge database access in the layers
 * graph domain.
 *
 * This class owns every Prisma call for the graph resource group. It performs
 * no authorization: callers (the GraphService) decide who may invoke a method
 * and supply the CASL read filter that scopes list queries. Methods return raw
 * Prisma model types and propagate Prisma errors (including P2002 on the
 * client-supplied id) to their callers.
 *
 * @example
 * ```typescript
 * const repo = new GraphRepository(fastify.prisma)
 * const nodes = await repo.findAccessibleNodes(readScope)
 * ```
 */
export class GraphRepository {
  /**
   * Creates a new GraphRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Lists graph nodes matching a read-scope filter, newest-registered first.
   *
   * The caller (the service) builds `readScope` from
   * `accessibleBy(ability, 'read').GraphNode`, so this method performs no
   * authorization itself. `extraWhere` narrows the result further (e.g. by
   * nodeType or projectId) and is ANDed with the read scope.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param extraWhere - optional additional WHERE constraints
   * @returns the accessible graph nodes
   */
  async findAccessibleNodes(
    readScope: Prisma.GraphNodeWhereInput,
    extraWhere?: Prisma.GraphNodeWhereInput
  ): Promise<GraphNode[]> {
    return this.prisma.graphNode.findMany({
      where: { AND: [readScope, extraWhere ?? {}] },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * Finds a graph node by id.
   *
   * @param id - GraphNode UUID
   * @returns the node, or null if not found
   */
  async findNodeById(id: string): Promise<GraphNode | null> {
    return this.prisma.graphNode.findUnique({ where: { id } })
  }

  /**
   * Creates a graph node.
   *
   * Accepts the unchecked create input so callers can set the scope columns
   * (projectId, createdByUserId) and an optional client-supplied id directly.
   *
   * @param data - Prisma unchecked create input
   * @returns the created node
   */
  async createNode(data: Prisma.GraphNodeUncheckedCreateInput): Promise<GraphNode> {
    return this.prisma.graphNode.create({ data })
  }

  /**
   * Updates a graph node by id.
   *
   * @param id - GraphNode UUID
   * @param data - Prisma unchecked update input (mutable fields only)
   * @returns the updated node
   */
  async updateNode(id: string, data: Prisma.GraphNodeUncheckedUpdateInput): Promise<GraphNode> {
    return this.prisma.graphNode.update({ where: { id }, data })
  }

  /**
   * Deletes a graph node by id.
   *
   * @param id - GraphNode UUID
   */
  async deleteNode(id: string): Promise<void> {
    await this.prisma.graphNode.delete({ where: { id } })
  }

  /**
   * Lists graph edges matching a read-scope filter, oldest-first.
   *
   * The caller builds `readScope` from
   * `accessibleBy(ability, 'read').GraphEdge`; `extraWhere` narrows the result
   * further (e.g. by edgeType or an incident node id) and is ANDed with it.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param extraWhere - optional additional WHERE constraints
   * @returns the accessible graph edges
   */
  async findAccessibleEdges(
    readScope: Prisma.GraphEdgeWhereInput,
    extraWhere?: Prisma.GraphEdgeWhereInput
  ): Promise<GraphEdge[]> {
    return this.prisma.graphEdge.findMany({
      where: { AND: [readScope, extraWhere ?? {}] },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * Finds a graph edge by id.
   *
   * @param id - GraphEdge UUID
   * @returns the edge, or null if not found
   */
  async findEdgeById(id: string): Promise<GraphEdge | null> {
    return this.prisma.graphEdge.findUnique({ where: { id } })
  }

  /**
   * Creates a graph edge.
   *
   * @param data - Prisma unchecked create input
   * @returns the created edge
   */
  async createEdge(data: Prisma.GraphEdgeUncheckedCreateInput): Promise<GraphEdge> {
    return this.prisma.graphEdge.create({ data })
  }

  /**
   * Updates a graph edge by id.
   *
   * @param id - GraphEdge UUID
   * @param data - Prisma unchecked update input (mutable fields only)
   * @returns the updated edge
   */
  async updateEdge(id: string, data: Prisma.GraphEdgeUncheckedUpdateInput): Promise<GraphEdge> {
    return this.prisma.graphEdge.update({ where: { id }, data })
  }

  /**
   * Deletes a graph edge by id.
   *
   * @param id - GraphEdge UUID
   */
  async deleteEdge(id: string): Promise<void> {
    await this.prisma.graphEdge.delete({ where: { id } })
  }
}
