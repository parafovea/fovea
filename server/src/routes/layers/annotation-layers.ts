import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Anchor } from '@fovea/layers-schema'
import { ForbiddenError } from '../../lib/errors.js'
import { AnnotationLayerRepository } from '../../repositories/AnnotationLayerRepository.js'
import {
  AnnotationLayerService,
  type AnnotationLayerCreateInput,
  type LayersAnnotationCreateInput,
  type LayersAnnotationUpdateInput,
  type TextAnnotationRelationCreateInput,
} from '../../services/annotation-layers-service.js'

/** Nullable string field helper. */
const NullableString = Type.Union([Type.Null(), Type.String()])
/** Nullable integer field helper. */
const NullableInt = Type.Union([Type.Null(), Type.Integer()])

/**
 * Response shape for an annotation layer. JSON columns (`metadata`, `features`)
 * pass through as `Type.Unknown()`; the compile-time shape is the
 * `@fovea/layers-schema` interface applied at the repository boundary.
 */
const AnnotationLayerResponseSchema = Type.Object({
  id: Type.String(),
  expressionId: Type.String(),
  kind: Type.String(),
  subkind: NullableString,
  formalism: NullableString,
  sourceMethod: Type.String(),
  labelSet: NullableString,
  tokenizationId: NullableString,
  ontologyId: NullableString,
  parentLayerId: NullableString,
  personaId: NullableString,
  metadata: Type.Unknown(),
  features: Type.Unknown(),
  languages: Type.Array(Type.String()),
  projectId: NullableString,
  createdByUserId: NullableString,
  layersUri: NullableString,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Response shape for a layers annotation. */
const LayersAnnotationResponseSchema = Type.Object({
  id: Type.String(),
  layerId: Type.String(),
  tokenizationId: NullableString,
  anchor: Type.Unknown(),
  tokenIndex: NullableInt,
  label: NullableString,
  value: NullableString,
  text: NullableString,
  parentAnnotationId: NullableString,
  childIds: Type.Unknown(),
  headIndex: NullableInt,
  targetIndex: NullableInt,
  arguments: Type.Unknown(),
  confidence: NullableInt,
  ontologyTypeRefId: NullableString,
  denotesNodeId: NullableString,
  knowledgeRefs: Type.Unknown(),
  temporal: Type.Unknown(),
  spatial: Type.Unknown(),
  features: Type.Unknown(),
  startMs: NullableInt,
  endMs: NullableInt,
  projectId: NullableString,
  createdByUserId: NullableString,
  layersUri: NullableString,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Response shape for a text annotation relation. */
const TextAnnotationRelationResponseSchema = Type.Object({
  id: Type.String(),
  layerId: Type.String(),
  sourceAnnotationId: Type.String(),
  targetAnnotationId: Type.String(),
  relationTypeRef: Type.Unknown(),
  label: NullableString,
  features: Type.Unknown(),
  projectId: NullableString,
  createdByUserId: NullableString,
  layersUri: NullableString,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/**
 * Layers annotation-layers routes: the AnnotationLayer, LayersAnnotation, and
 * TextAnnotationRelation resource group. Registered by the layers aggregator
 * under the `/api/layers` prefix, behind its shared `requireAuth` +
 * `buildAbilities` hooks (which this module must not re-register). Every handler
 * constructs a per-request `AnnotationLayerService` from the request-scoped CASL
 * ability and the authenticated user's id, so all authorization lives in the
 * service.
 */
const annotationLayersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Builds the per-request service. Throws if abilities were not attached
   * (the aggregator's hooks guarantee they are for every layers endpoint).
   */
  const buildService = (request: FastifyRequest): AnnotationLayerService => {
    if (!request.ability) throw new ForbiddenError('No abilities defined')
    return new AnnotationLayerService(
      new AnnotationLayerRepository(fastify.prisma),
      request.ability,
      request.user!.id,
    )
  }

  // ---- AnnotationLayer -----------------------------------------------------

  /**
   * List annotation layers the caller can read, optionally filtered to one
   * expression.
   */
  fastify.get('/annotation-layers', {
    schema: {
      description: 'List annotation layers the caller can read, optionally filtered by expression',
      tags: ['layers'],
      querystring: Type.Object({
        expressionId: Type.Optional(Type.String()),
      }),
      response: {
        200: Type.Array(AnnotationLayerResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { expressionId } = request.query as { expressionId?: string }
    const service = buildService(request)
    return reply.send(await service.listLayers(expressionId))
  })

  /**
   * Create an annotation layer, or update it in place when a client-supplied id
   * already exists (idempotent create).
   */
  fastify.post('/annotation-layers', {
    schema: {
      description: 'Create an annotation layer over an expression (idempotent by client id)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        expressionId: Type.String(),
        kind: Type.String(),
        subkind: Type.Optional(NullableString),
        formalism: Type.Optional(NullableString),
        sourceMethod: Type.Optional(Type.String()),
        labelSet: Type.Optional(NullableString),
        tokenizationId: Type.Optional(NullableString),
        ontologyId: Type.Optional(NullableString),
        parentLayerId: Type.Optional(NullableString),
        personaId: Type.Optional(NullableString),
        metadata: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
        languages: Type.Optional(Type.Array(Type.String())),
        layersUri: Type.Optional(NullableString),
      }),
      response: {
        200: AnnotationLayerResponseSchema,
        201: AnnotationLayerResponseSchema,
      },
    },
  }, async (request, reply) => {
    const service = buildService(request)
    const { row, created } = await service.createLayer(request.body as AnnotationLayerCreateInput)
    return reply.code(created ? 201 : 200).send(row)
  })

  /**
   * Delete an annotation layer (cascades to its annotations and relations).
   */
  fastify.delete('/annotation-layers/:id', {
    schema: {
      description: 'Delete an annotation layer',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = buildService(request)
    await service.deleteLayer(id)
    return reply.code(204).send()
  })

  // ---- LayersAnnotation ----------------------------------------------------

  /**
   * Create a layers annotation, or update it in place when a client-supplied id
   * already exists (idempotent create). `startMs`/`endMs` are denormalized from
   * the anchor; the denotation link is set from the layer's persona.
   */
  fastify.post('/annotations', {
    schema: {
      description: 'Create a layers annotation on a layer (idempotent by client id)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        layerId: Type.String(),
        tokenizationId: Type.Optional(NullableString),
        anchor: Type.Optional(Type.Unknown()),
        tokenIndex: Type.Optional(NullableInt),
        label: Type.Optional(NullableString),
        value: Type.Optional(NullableString),
        text: Type.Optional(NullableString),
        parentAnnotationId: Type.Optional(NullableString),
        childIds: Type.Optional(Type.Unknown()),
        headIndex: Type.Optional(NullableInt),
        targetIndex: Type.Optional(NullableInt),
        arguments: Type.Optional(Type.Unknown()),
        confidence: Type.Optional(NullableInt),
        ontologyTypeRefId: Type.Optional(NullableString),
        denotesNodeId: Type.Optional(NullableString),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        temporal: Type.Optional(Type.Unknown()),
        spatial: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(NullableString),
      }),
      response: {
        200: LayersAnnotationResponseSchema,
        201: LayersAnnotationResponseSchema,
      },
    },
  }, async (request, reply) => {
    const service = buildService(request)
    // The anchor JSON validates as passthrough; its compile-time shape is the
    // layers-schema Anchor interface.
    const body = request.body as Omit<LayersAnnotationCreateInput, 'anchor'> & { anchor?: Anchor }
    const { row, created } = await service.createAnnotation(body)
    return reply.code(created ? 201 : 200).send(row)
  })

  /**
   * Update a layers annotation. Only provided fields are written; the extent is
   * recomputed when a new anchor is supplied.
   */
  fastify.put('/annotations/:id', {
    schema: {
      description: 'Update a layers annotation',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        tokenizationId: Type.Optional(NullableString),
        anchor: Type.Optional(Type.Unknown()),
        tokenIndex: Type.Optional(NullableInt),
        label: Type.Optional(NullableString),
        value: Type.Optional(NullableString),
        text: Type.Optional(NullableString),
        parentAnnotationId: Type.Optional(NullableString),
        childIds: Type.Optional(Type.Unknown()),
        headIndex: Type.Optional(NullableInt),
        targetIndex: Type.Optional(NullableInt),
        arguments: Type.Optional(Type.Unknown()),
        confidence: Type.Optional(NullableInt),
        ontologyTypeRefId: Type.Optional(NullableString),
        denotesNodeId: Type.Optional(NullableString),
        knowledgeRefs: Type.Optional(Type.Unknown()),
        temporal: Type.Optional(Type.Unknown()),
        spatial: Type.Optional(Type.Unknown()),
        features: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(NullableString),
      }),
      response: {
        200: LayersAnnotationResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = buildService(request)
    const body = request.body as Omit<LayersAnnotationUpdateInput, 'anchor'> & { anchor?: Anchor }
    return reply.send(await service.updateAnnotation(id, body))
  })

  /**
   * Delete a layers annotation (cascades to relations referencing it).
   */
  fastify.delete('/annotations/:id', {
    schema: {
      description: 'Delete a layers annotation',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = buildService(request)
    await service.deleteAnnotation(id)
    return reply.code(204).send()
  })

  // ---- TextAnnotationRelation ---------------------------------------------

  /**
   * Create a text annotation relation (a labeled directed edge between two
   * layers annotations), or update it in place when a client-supplied id
   * already exists (idempotent create).
   */
  fastify.post('/annotation-relations', {
    schema: {
      description: 'Create a relation between two layers annotations (idempotent by client id)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        layerId: Type.String(),
        sourceAnnotationId: Type.String(),
        targetAnnotationId: Type.String(),
        relationTypeRef: Type.Unknown(),
        label: Type.Optional(NullableString),
        features: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(NullableString),
      }),
      response: {
        200: TextAnnotationRelationResponseSchema,
        201: TextAnnotationRelationResponseSchema,
      },
    },
  }, async (request, reply) => {
    const service = buildService(request)
    const { row, created } = await service.createRelation(
      request.body as TextAnnotationRelationCreateInput,
    )
    return reply.code(created ? 201 : 200).send(row)
  })

  /**
   * Delete a text annotation relation.
   */
  fastify.delete('/annotation-relations/:id', {
    schema: {
      description: 'Delete a text annotation relation',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = buildService(request)
    await service.deleteRelation(id)
    return reply.code(204).send()
  })
}

export default annotationLayersRoutes
