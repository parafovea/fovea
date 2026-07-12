import { Prisma, type GraphNode as PrismaGraphNode, type GraphEdge as PrismaGraphEdge } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type {
  GraphNode as GraphNodeShape,
  GraphEdge as GraphEdgeShape,
  ObjectRef
} from '@fovea/layers-schema'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, ForbiddenError } from '../lib/errors.js'
import { GraphRepository } from '../repositories/GraphRepository.js'

/**
 * Converts a value to Prisma.InputJsonValue for storage in a JSON column.
 * Prisma JSON columns accept any serializable value at runtime; this bridges
 * the TypeScript gap without an unsafe cast. Returns undefined for undefined
 * input so the field is omitted from the write (leaving the column NULL on
 * create, untouched on update).
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * API-facing graph-node shape: the layers record fields plus id, scope columns,
 * and ISO timestamps. JSON columns are surfaced as their `@fovea/layers-schema`
 * compile-time types.
 */
export interface GraphNodeResponse {
  id: string
  nodeType: string
  label: string | null
  properties: GraphNodeShape['properties'] | null
  knowledgeRefs: GraphNodeShape['knowledgeRefs'] | null
  metadata: GraphNodeShape['metadata'] | null
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating or updating a graph node. */
export interface GraphNodeInput {
  id?: string
  nodeType: string
  label?: string | null
  properties?: GraphNodeShape['properties']
  knowledgeRefs?: GraphNodeShape['knowledgeRefs']
  metadata?: GraphNodeShape['metadata']
  projectId?: string | null
}

/** Mutable fields accepted when updating a graph node in place. */
export interface GraphNodeUpdateInput {
  nodeType?: string
  label?: string | null
  properties?: GraphNodeShape['properties']
  knowledgeRefs?: GraphNodeShape['knowledgeRefs']
  metadata?: GraphNodeShape['metadata']
}

/**
 * API-facing graph-edge shape: the layers record fields plus id, denormalized
 * incident-node ids, scope columns, and ISO timestamps.
 */
export interface GraphEdgeResponse {
  id: string
  source: ObjectRef
  target: ObjectRef
  sourceLocalId: string | null
  targetLocalId: string | null
  edgeType: string
  label: string | null
  ordinal: number | null
  confidence: number | null
  properties: GraphEdgeShape['properties'] | null
  metadata: GraphEdgeShape['metadata'] | null
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating a graph edge. */
export interface GraphEdgeInput {
  id?: string
  source: ObjectRef
  target: ObjectRef
  edgeType: string
  label?: string | null
  ordinal?: number | null
  confidence?: number | null
  properties?: GraphEdgeShape['properties']
  metadata?: GraphEdgeShape['metadata']
  projectId?: string | null
}

/** Mutable fields accepted when updating a graph edge in place. */
export interface GraphEdgeUpdateInput {
  source?: ObjectRef
  target?: ObjectRef
  edgeType?: string
  label?: string | null
  ordinal?: number | null
  confidence?: number | null
  properties?: GraphEdgeShape['properties']
  metadata?: GraphEdgeShape['metadata']
}

/**
 * Owns the graph resource group's business rules and RBAC, delegating all data
 * access to a GraphRepository. Construct one per request from the request-scoped
 * CASL ability and the authenticated user's id.
 *
 * GraphNode rows are world objects; GraphEdge rows are typed edges between them.
 * Both carry (projectId, createdByUserId) scope columns. The service performs
 * every authorization decision: the `accessibleBy` read filter for lists,
 * instance-level `can()` checks for single-row reads/updates/deletes, and the
 * create pre-check. The repository performs none.
 *
 * @example
 * ```typescript
 * const service = new GraphService(repo, request.ability ?? null, request.user?.id)
 * const nodes = await service.listNodes()
 * ```
 */
export class GraphService {
  constructor(
    private readonly repository: GraphRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined
  ) {}

  /** Resolves the acting user id, or throws when the request is unauthenticated. */
  private requireUserId(): string {
    if (!this.userId) throw new UnauthorizedError('Authentication required')
    return this.userId
  }

  /** Resolves the caller's ability, or throws when none was built. */
  private requireAbility(): AppAbility {
    if (!this.ability) throw new ForbiddenError('No abilities defined')
    return this.ability
  }

  // --- GraphNode ---------------------------------------------------------

  private mapNode(node: PrismaGraphNode): GraphNodeResponse {
    return {
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      properties: node.properties as GraphNodeResponse['properties'],
      knowledgeRefs: node.knowledgeRefs as GraphNodeResponse['knowledgeRefs'],
      metadata: node.metadata as GraphNodeResponse['metadata'],
      projectId: node.projectId,
      createdByUserId: node.createdByUserId,
      layersUri: node.layersUri,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString()
    }
  }

  /**
   * Lists graph nodes the caller can read, optionally narrowed by nodeType and
   * projectId.
   */
  async listNodes(filter?: { nodeType?: string; projectId?: string }): Promise<GraphNodeResponse[]> {
    const ability = this.requireAbility()
    const extraWhere: Prisma.GraphNodeWhereInput = {}
    if (filter?.nodeType) extraWhere.nodeType = filter.nodeType
    if (filter?.projectId) extraWhere.projectId = filter.projectId
    const nodes = await this.repository.findAccessibleNodes(
      accessibleBy(ability, 'read').GraphNode,
      extraWhere
    )
    return nodes.map(n => this.mapNode(n))
  }

  /** Loads one graph node, enforcing instance-level read access. */
  async getNode(id: string): Promise<GraphNodeResponse> {
    const ability = this.requireAbility()
    const node = await this.repository.findNodeById(id)
    if (!node) throw new NotFoundError('GraphNode', id)
    if (!ability.can('read', subject('GraphNode', node))) {
      throw new ForbiddenError('Cannot read this GraphNode')
    }
    return this.mapNode(node)
  }

  /**
   * Creates a graph node, or updates it in place when a client-supplied id
   * already exists (idempotent create). The idempotent update authorizes
   * against the EXISTING row's `update` permission, so a caller cannot hijack
   * another user's node by supplying its id.
   */
  async createNode(input: GraphNodeInput): Promise<{ node: GraphNodeResponse; created: boolean }> {
    const ability = this.requireAbility()
    const userId = this.requireUserId()
    const projectId = input.projectId ?? null

    const updateExisting = async (existing: PrismaGraphNode) => {
      if (!ability.can('update', subject('GraphNode', existing))) {
        throw new ForbiddenError('Cannot update this GraphNode')
      }
      const updated = await this.repository.updateNode(existing.id, {
        nodeType: input.nodeType,
        label: input.label ?? null,
        properties: toJson(input.properties),
        knowledgeRefs: toJson(input.knowledgeRefs),
        metadata: toJson(input.metadata)
      })
      return { node: this.mapNode(updated), created: false }
    }

    // Idempotent create: an existing row under the client-supplied id is
    // updated in place rather than duplicated.
    if (input.id) {
      const existing = await this.repository.findNodeById(input.id)
      if (existing) return updateExisting(existing)
    }

    // Pre-authorize the create in the resolved scope so future rule tightening
    // cannot be bypassed. The candidate carries the final scope columns so
    // CASL's MongoQuery conditions resolve against actual field values.
    const candidate = subject('GraphNode', { projectId, createdByUserId: userId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create GraphNode in this scope')
    }

    try {
      const node = await this.repository.createNode({
        id: input.id,
        nodeType: input.nodeType,
        label: input.label ?? null,
        properties: toJson(input.properties),
        knowledgeRefs: toJson(input.knowledgeRefs),
        metadata: toJson(input.metadata),
        projectId,
        createdByUserId: userId
      })
      return { node: this.mapNode(node), created: true }
    } catch (error) {
      // Concurrent-create race: a parallel request with the same client id won
      // the insert between our find and create. Fall back to the idempotent
      // update path (re-authorizing against the now-existing row).
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findNodeById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /** Updates a graph node, enforcing instance-level update access. */
  async updateNode(id: string, input: GraphNodeUpdateInput): Promise<GraphNodeResponse> {
    const ability = this.requireAbility()
    const existing = await this.repository.findNodeById(id)
    if (!existing) throw new NotFoundError('GraphNode', id)
    if (!ability.can('update', subject('GraphNode', existing))) {
      throw new ForbiddenError('Cannot update this GraphNode')
    }
    const updated = await this.repository.updateNode(id, {
      nodeType: input.nodeType,
      label: input.label,
      properties: toJson(input.properties),
      knowledgeRefs: toJson(input.knowledgeRefs),
      metadata: toJson(input.metadata)
    })
    return this.mapNode(updated)
  }

  /** Deletes a graph node, enforcing instance-level delete access. */
  async deleteNode(id: string): Promise<void> {
    const ability = this.requireAbility()
    const existing = await this.repository.findNodeById(id)
    if (!existing) throw new NotFoundError('GraphNode', id)
    if (!ability.can('delete', subject('GraphNode', existing))) {
      throw new ForbiddenError('Cannot delete this GraphNode')
    }
    await this.repository.deleteNode(id)
  }

  // --- GraphEdge ---------------------------------------------------------

  private mapEdge(edge: PrismaGraphEdge): GraphEdgeResponse {
    return {
      id: edge.id,
      source: edge.source as unknown as ObjectRef,
      target: edge.target as unknown as ObjectRef,
      sourceLocalId: edge.sourceLocalId,
      targetLocalId: edge.targetLocalId,
      edgeType: edge.edgeType,
      label: edge.label,
      ordinal: edge.ordinal,
      confidence: edge.confidence,
      properties: edge.properties as GraphEdgeResponse['properties'],
      metadata: edge.metadata as GraphEdgeResponse['metadata'],
      projectId: edge.projectId,
      createdByUserId: edge.createdByUserId,
      layersUri: edge.layersUri,
      createdAt: edge.createdAt.toISOString(),
      updatedAt: edge.updatedAt.toISOString()
    }
  }

  /**
   * Lists graph edges the caller can read, optionally narrowed by edgeType and
   * an incident node id (matching either endpoint's denormalized local id).
   */
  async listEdges(filter?: {
    edgeType?: string
    projectId?: string
    nodeId?: string
  }): Promise<GraphEdgeResponse[]> {
    const ability = this.requireAbility()
    const extraWhere: Prisma.GraphEdgeWhereInput = {}
    if (filter?.edgeType) extraWhere.edgeType = filter.edgeType
    if (filter?.projectId) extraWhere.projectId = filter.projectId
    if (filter?.nodeId) {
      extraWhere.OR = [
        { sourceLocalId: filter.nodeId },
        { targetLocalId: filter.nodeId }
      ]
    }
    const edges = await this.repository.findAccessibleEdges(
      accessibleBy(ability, 'read').GraphEdge,
      extraWhere
    )
    return edges.map(e => this.mapEdge(e))
  }

  /** Loads one graph edge, enforcing instance-level read access. */
  async getEdge(id: string): Promise<GraphEdgeResponse> {
    const ability = this.requireAbility()
    const edge = await this.repository.findEdgeById(id)
    if (!edge) throw new NotFoundError('GraphEdge', id)
    if (!ability.can('read', subject('GraphEdge', edge))) {
      throw new ForbiddenError('Cannot read this GraphEdge')
    }
    return this.mapEdge(edge)
  }

  /**
   * Creates a graph edge, or updates it in place when a client-supplied id
   * already exists (idempotent create). The denormalized sourceLocalId /
   * targetLocalId are derived from the source/target objectRefs' `localId`.
   */
  async createEdge(input: GraphEdgeInput): Promise<{ edge: GraphEdgeResponse; created: boolean }> {
    const ability = this.requireAbility()
    const userId = this.requireUserId()
    const projectId = input.projectId ?? null

    const updateExisting = async (existing: PrismaGraphEdge) => {
      if (!ability.can('update', subject('GraphEdge', existing))) {
        throw new ForbiddenError('Cannot update this GraphEdge')
      }
      const updated = await this.repository.updateEdge(existing.id, {
        source: toJson(input.source),
        target: toJson(input.target),
        sourceLocalId: input.source.localId?.value ?? null,
        targetLocalId: input.target.localId?.value ?? null,
        edgeType: input.edgeType,
        label: input.label ?? null,
        ordinal: input.ordinal ?? null,
        confidence: input.confidence ?? null,
        properties: toJson(input.properties),
        metadata: toJson(input.metadata)
      })
      return { edge: this.mapEdge(updated), created: false }
    }

    if (input.id) {
      const existing = await this.repository.findEdgeById(input.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('GraphEdge', { projectId, createdByUserId: userId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create GraphEdge in this scope')
    }

    try {
      const edge = await this.repository.createEdge({
        id: input.id,
        source: toJson(input.source) as Prisma.InputJsonValue,
        target: toJson(input.target) as Prisma.InputJsonValue,
        sourceLocalId: input.source.localId?.value ?? null,
        targetLocalId: input.target.localId?.value ?? null,
        edgeType: input.edgeType,
        label: input.label ?? null,
        ordinal: input.ordinal ?? null,
        confidence: input.confidence ?? null,
        properties: toJson(input.properties),
        metadata: toJson(input.metadata),
        projectId,
        createdByUserId: userId
      })
      return { edge: this.mapEdge(edge), created: true }
    } catch (error) {
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findEdgeById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /** Updates a graph edge, enforcing instance-level update access. */
  async updateEdge(id: string, input: GraphEdgeUpdateInput): Promise<GraphEdgeResponse> {
    const ability = this.requireAbility()
    const existing = await this.repository.findEdgeById(id)
    if (!existing) throw new NotFoundError('GraphEdge', id)
    if (!ability.can('update', subject('GraphEdge', existing))) {
      throw new ForbiddenError('Cannot update this GraphEdge')
    }
    // Keep the denormalized incident-node ids in step with any source/target
    // rewrite; leave them untouched when the endpoint is not being changed.
    const updated = await this.repository.updateEdge(id, {
      source: toJson(input.source),
      target: toJson(input.target),
      sourceLocalId: input.source !== undefined ? (input.source.localId?.value ?? null) : undefined,
      targetLocalId: input.target !== undefined ? (input.target.localId?.value ?? null) : undefined,
      edgeType: input.edgeType,
      label: input.label,
      ordinal: input.ordinal,
      confidence: input.confidence,
      properties: toJson(input.properties),
      metadata: toJson(input.metadata)
    })
    return this.mapEdge(updated)
  }

  /** Deletes a graph edge, enforcing instance-level delete access. */
  async deleteEdge(id: string): Promise<void> {
    const ability = this.requireAbility()
    const existing = await this.repository.findEdgeById(id)
    if (!existing) throw new NotFoundError('GraphEdge', id)
    if (!ability.can('delete', subject('GraphEdge', existing))) {
      throw new ForbiddenError('Cannot delete this GraphEdge')
    }
    await this.repository.deleteEdge(id)
  }
}
