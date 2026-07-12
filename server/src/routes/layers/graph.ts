import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { GraphRepository } from '../../repositories/GraphRepository.js'
import {
  GraphService,
  type GraphNodeInput,
  type GraphNodeUpdateInput,
  type GraphEdgeInput,
  type GraphEdgeUpdateInput
} from '../../services/graph-service.js'

/**
 * TypeBox schema for a graph-node response. JSON record columns
 * (properties/knowledgeRefs/metadata) pass through as Type.Unknown(); their
 * compile-time shape is the `@fovea/layers-schema` GraphNode interface.
 */
const GraphNodeResponseSchema = Type.Object({
  id: Type.String(),
  nodeType: Type.String(),
  label: Type.Union([Type.Null(), Type.String()]),
  properties: Type.Unknown(),
  knowledgeRefs: Type.Unknown(),
  metadata: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

/**
 * TypeBox schema for a graph-edge response. source/target and the JSON record
 * columns pass through as Type.Unknown(); their compile-time shapes are the
 * `@fovea/layers-schema` ObjectRef / GraphEdge interfaces.
 */
const GraphEdgeResponseSchema = Type.Object({
  id: Type.String(),
  source: Type.Unknown(),
  target: Type.Unknown(),
  sourceLocalId: Type.Union([Type.Null(), Type.String()]),
  targetLocalId: Type.Union([Type.Null(), Type.String()]),
  edgeType: Type.String(),
  label: Type.Union([Type.Null(), Type.String()]),
  ordinal: Type.Union([Type.Null(), Type.Number()]),
  confidence: Type.Union([Type.Null(), Type.Number()]),
  properties: Type.Unknown(),
  metadata: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String()
})

/**
 * Routes for the graph resource group: GraphNode (world objects) and GraphEdge
 * (typed edges between them) under `/api/layers/graph/*`.
 *
 * Authentication and CASL abilities are applied by the layers aggregator, so
 * this module only wires paths to a per-request GraphService that performs the
 * authorization and persistence. List endpoints filter to what the caller can
 * read; single-row endpoints run an instance-level check; node and edge creates
 * are idempotent on a client-supplied id.
 */
export default async function graphRoutes(fastify: FastifyInstance): Promise<void> {
  /** Builds a per-request GraphService from the request's ability and user. */
  const serviceFor = (request: FastifyRequest): GraphService => {
    const repository = new GraphRepository(fastify.prisma)
    return new GraphService(repository, request.ability ?? null, request.user?.id)
  }

  // --- GraphNode ---------------------------------------------------------

  /** List graph nodes the caller can read, optionally filtered. */
  fastify.get('/graph/nodes', {
    schema: {
      description: 'List graph nodes the caller can read',
      tags: ['layers-graph'],
      querystring: Type.Object({
        nodeType: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String())
      }),
      response: { 200: Type.Array(GraphNodeResponseSchema) }
    }
  }, async (request, reply) => {
    const query = request.query as { nodeType?: string; projectId?: string }
    const service = serviceFor(request)
    const nodes = await service.listNodes(query)
    return reply.send(nodes)
  })

  /** Create a graph node, idempotent on a client-supplied id. */
  fastify.post('/graph/nodes', {
    schema: {
      description: 'Create a graph node, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers-graph'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        nodeType: Type.String(),
        label: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        properties: Type.Optional(Type.Unknown()),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()]))
      }),
      response: { 200: GraphNodeResponseSchema, 201: GraphNodeResponseSchema }
    }
  }, async (request, reply) => {
    const body = request.body as GraphNodeInput
    const service = serviceFor(request)
    const { node, created } = await service.createNode(body)
    return reply.code(created ? 201 : 200).send(node)
  })

  /** Get one graph node. */
  fastify.get('/graph/nodes/:id', {
    schema: {
      description: 'Get a graph node by id',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      response: { 200: GraphNodeResponseSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.getNode(id))
  })

  /** Update a graph node. */
  fastify.put('/graph/nodes/:id', {
    schema: {
      description: 'Update a graph node',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        nodeType: Type.Optional(Type.String()),
        label: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        properties: Type.Optional(Type.Unknown()),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown())
      }),
      response: { 200: GraphNodeResponseSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as GraphNodeUpdateInput
    const service = serviceFor(request)
    return reply.send(await service.updateNode(id, body))
  })

  /** Delete a graph node. */
  fastify.delete('/graph/nodes/:id', {
    schema: {
      description: 'Delete a graph node',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    await service.deleteNode(id)
    return reply.code(204).send()
  })

  // --- GraphEdge ---------------------------------------------------------

  /** List graph edges the caller can read, optionally filtered. */
  fastify.get('/graph/edges', {
    schema: {
      description: 'List graph edges the caller can read',
      tags: ['layers-graph'],
      querystring: Type.Object({
        edgeType: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String()),
        nodeId: Type.Optional(Type.String())
      }),
      response: { 200: Type.Array(GraphEdgeResponseSchema) }
    }
  }, async (request, reply) => {
    const query = request.query as { edgeType?: string; projectId?: string; nodeId?: string }
    const service = serviceFor(request)
    return reply.send(await service.listEdges(query))
  })

  /** Create a graph edge, idempotent on a client-supplied id. */
  fastify.post('/graph/edges', {
    schema: {
      description: 'Create a graph edge, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers-graph'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        source: Type.Unknown(),
        target: Type.Unknown(),
        edgeType: Type.String(),
        label: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        ordinal: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
        confidence: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
        properties: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()]))
      }),
      response: { 200: GraphEdgeResponseSchema, 201: GraphEdgeResponseSchema }
    }
  }, async (request, reply) => {
    const body = request.body as GraphEdgeInput
    const service = serviceFor(request)
    const { edge, created } = await service.createEdge(body)
    return reply.code(created ? 201 : 200).send(edge)
  })

  /** Get one graph edge. */
  fastify.get('/graph/edges/:id', {
    schema: {
      description: 'Get a graph edge by id',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      response: { 200: GraphEdgeResponseSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.getEdge(id))
  })

  /** Update a graph edge. */
  fastify.put('/graph/edges/:id', {
    schema: {
      description: 'Update a graph edge',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        source: Type.Optional(Type.Unknown()),
        target: Type.Optional(Type.Unknown()),
        edgeType: Type.Optional(Type.String()),
        label: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        ordinal: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
        confidence: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
        properties: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown())
      }),
      response: { 200: GraphEdgeResponseSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as GraphEdgeUpdateInput
    const service = serviceFor(request)
    return reply.send(await service.updateEdge(id, body))
  })

  /** Delete a graph edge. */
  fastify.delete('/graph/edges/:id', {
    schema: {
      description: 'Delete a graph edge',
      tags: ['layers-graph'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    await service.deleteEdge(id)
    return reply.code(204).send()
  })
}
