import { Type } from '@sinclair/typebox'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { ForbiddenError } from '../../lib/errors.js'
import { CorpusRepository } from '../../repositories/CorpusRepository.js'
import {
  CorporaService,
  type CorpusInput,
  type CorpusUpdateInput,
  type MembershipInput,
  type ClusterSetInput,
  type ClusterSetUpdateInput,
  type AlignmentInput,
  type AlignmentUpdateInput,
} from '../../services/corpora-service.js'

/**
 * Response schema for a Corpus. JSON columns (ontologyRefs, metadata) pass
 * through as `Type.Unknown()`; their compile-time shape lives in the
 * @fovea/layers-schema Corpus interface, so the envelope stays hand-written
 * while the record content is not re-declared here.
 */
const CorpusResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.Null(), Type.String()]),
  version: Type.Union([Type.Null(), Type.String()]),
  domain: Type.Union([Type.Null(), Type.String()]),
  ontologyRefs: Type.Unknown(),
  languages: Type.Array(Type.String()),
  metadata: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Response schema for a CorpusMembership. */
const MembershipResponseSchema = Type.Object({
  id: Type.String(),
  corpusId: Type.String(),
  expressionId: Type.String(),
  split: Type.Union([Type.Null(), Type.String()]),
  ordinal: Type.Union([Type.Null(), Type.Number()]),
  metadata: Type.Unknown(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Response schema for a ClusterSet. */
const ClusterSetResponseSchema = Type.Object({
  id: Type.String(),
  expressionId: Type.Union([Type.Null(), Type.String()]),
  corpusId: Type.Union([Type.Null(), Type.String()]),
  kind: Type.String(),
  layerId: Type.Union([Type.Null(), Type.String()]),
  clusters: Type.Unknown(),
  metadata: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

/** Response schema for an Alignment. */
const AlignmentResponseSchema = Type.Object({
  id: Type.String(),
  expressionId: Type.Union([Type.Null(), Type.String()]),
  kind: Type.String(),
  subkind: Type.Union([Type.Null(), Type.String()]),
  source: Type.Unknown(),
  target: Type.Unknown(),
  sourceLang: Type.Union([Type.Null(), Type.String()]),
  targetLang: Type.Union([Type.Null(), Type.String()]),
  links: Type.Unknown(),
  metadata: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const IdParams = Type.Object({ id: Type.String() })

/**
 * Routes for the layers corpora resource group: corpora and their memberships,
 * cluster sets, and alignments. The `/api/layers` prefix and the shared
 * `requireAuth` + `buildAbilities` hooks are applied by the aggregator, so this
 * module declares only relative paths and dispatches every request to a
 * per-request CorporaService that owns the CASL checks. The CorpusRepository
 * owns all Prisma access.
 */
export default async function corporaRoutes(fastify: FastifyInstance): Promise<void> {
  // Request-independent: one repository for the plugin's lifetime.
  const repository = new CorpusRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id (the aggregator's requireAuth guarantees a user).
   */
  const serviceFor = (request: FastifyRequest): CorporaService => {
    if (!request.user) throw new ForbiddenError('Authentication required')
    return new CorporaService(repository, request.ability ?? null, request.user.id)
  }

  // --- Corpus ---------------------------------------------------------------

  fastify.get('/corpora', {
    schema: {
      description: 'List corpora the caller is authorized to read',
      tags: ['layers'],
      response: { 200: Type.Array(CorpusResponseSchema) },
    },
  }, async (request, reply) => {
    return reply.send(await serviceFor(request).listCorpora())
  })

  fastify.get('/corpora/:id', {
    schema: {
      description: 'Get a single corpus',
      tags: ['layers'],
      params: IdParams,
      response: { 200: CorpusResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(await serviceFor(request).getCorpus(id))
  })

  fastify.post('/corpora', {
    schema: {
      description: 'Create a corpus, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        name: Type.String(),
        description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        version: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        domain: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        ontologyRefs: Type.Optional(Type.Array(Type.String())),
        languages: Type.Optional(Type.Array(Type.String())),
        metadata: Type.Optional(Type.Unknown()),
        projectId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: CorpusResponseSchema, 201: CorpusResponseSchema },
    },
  }, async (request, reply) => {
    const { corpus, created } = await serviceFor(request).createCorpus(request.body as CorpusInput)
    return reply.code(created ? 201 : 200).send(corpus)
  })

  fastify.put('/corpora/:id', {
    schema: {
      description: 'Update a corpus',
      tags: ['layers'],
      params: IdParams,
      body: Type.Object({
        name: Type.Optional(Type.String()),
        description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        version: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        domain: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        ontologyRefs: Type.Optional(Type.Array(Type.String())),
        languages: Type.Optional(Type.Array(Type.String())),
        metadata: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: CorpusResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(await serviceFor(request).updateCorpus(id, request.body as CorpusUpdateInput))
  })

  fastify.delete('/corpora/:id', {
    schema: {
      description: 'Delete a corpus',
      tags: ['layers'],
      params: IdParams,
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await serviceFor(request).deleteCorpus(id)
    return reply.code(204).send()
  })

  // --- CorpusMembership -----------------------------------------------------

  fastify.get('/corpora/:id/memberships', {
    schema: {
      description: 'List the expressions belonging to a corpus',
      tags: ['layers'],
      params: IdParams,
      response: { 200: Type.Array(MembershipResponseSchema) },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(await serviceFor(request).listMemberships(id))
  })

  fastify.post('/corpora/:id/memberships', {
    schema: {
      description: 'Add an expression to a corpus, or update the membership in place when it already exists (idempotent)',
      tags: ['layers'],
      params: IdParams,
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        expressionId: Type.String(),
        split: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        ordinal: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
        metadata: Type.Optional(Type.Unknown()),
      }),
      response: { 200: MembershipResponseSchema, 201: MembershipResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { membership, created } = await serviceFor(request).addMembership(
      id,
      request.body as MembershipInput
    )
    return reply.code(created ? 201 : 200).send(membership)
  })

  fastify.delete('/corpora/:id/memberships/:membershipId', {
    schema: {
      description: 'Remove an expression from a corpus',
      tags: ['layers'],
      params: Type.Object({ id: Type.String(), membershipId: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id, membershipId } = request.params as { id: string; membershipId: string }
    await serviceFor(request).removeMembership(id, membershipId)
    return reply.code(204).send()
  })

  // --- ClusterSet -----------------------------------------------------------

  fastify.get('/cluster-sets', {
    schema: {
      description: 'List cluster sets the caller is authorized to read',
      tags: ['layers'],
      response: { 200: Type.Array(ClusterSetResponseSchema) },
    },
  }, async (request, reply) => {
    return reply.send(await serviceFor(request).listClusterSets())
  })

  fastify.get('/cluster-sets/:id', {
    schema: {
      description: 'Get a single cluster set',
      tags: ['layers'],
      params: IdParams,
      response: { 200: ClusterSetResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(await serviceFor(request).getClusterSet(id))
  })

  fastify.post('/cluster-sets', {
    schema: {
      description: 'Create a cluster set, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        expressionId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        corpusId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        kind: Type.String(),
        layerId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        clusters: Type.Unknown(),
        metadata: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: ClusterSetResponseSchema, 201: ClusterSetResponseSchema },
    },
  }, async (request, reply) => {
    const { clusterSet, created } = await serviceFor(request).createClusterSet(
      request.body as ClusterSetInput
    )
    return reply.code(created ? 201 : 200).send(clusterSet)
  })

  fastify.put('/cluster-sets/:id', {
    schema: {
      description: 'Update a cluster set',
      tags: ['layers'],
      params: IdParams,
      body: Type.Object({
        kind: Type.Optional(Type.String()),
        layerId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        clusters: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: ClusterSetResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(
      await serviceFor(request).updateClusterSet(id, request.body as ClusterSetUpdateInput)
    )
  })

  fastify.delete('/cluster-sets/:id', {
    schema: {
      description: 'Delete a cluster set',
      tags: ['layers'],
      params: IdParams,
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await serviceFor(request).deleteClusterSet(id)
    return reply.code(204).send()
  })

  // --- Alignment ------------------------------------------------------------

  fastify.get('/alignments', {
    schema: {
      description: 'List alignments the caller is authorized to read',
      tags: ['layers'],
      response: { 200: Type.Array(AlignmentResponseSchema) },
    },
  }, async (request, reply) => {
    return reply.send(await serviceFor(request).listAlignments())
  })

  fastify.get('/alignments/:id', {
    schema: {
      description: 'Get a single alignment',
      tags: ['layers'],
      params: IdParams,
      response: { 200: AlignmentResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(await serviceFor(request).getAlignment(id))
  })

  fastify.post('/alignments', {
    schema: {
      description: 'Create an alignment, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      body: Type.Object({
        id: Type.Optional(Type.String({ format: 'uuid' })),
        expressionId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        kind: Type.String(),
        subkind: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        source: Type.Optional(Type.Unknown()),
        target: Type.Optional(Type.Unknown()),
        sourceLang: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        targetLang: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        links: Type.Unknown(),
        metadata: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: AlignmentResponseSchema, 201: AlignmentResponseSchema },
    },
  }, async (request, reply) => {
    const { alignment, created } = await serviceFor(request).createAlignment(
      request.body as AlignmentInput
    )
    return reply.code(created ? 201 : 200).send(alignment)
  })

  fastify.put('/alignments/:id', {
    schema: {
      description: 'Update an alignment',
      tags: ['layers'],
      params: IdParams,
      body: Type.Object({
        kind: Type.Optional(Type.String()),
        subkind: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        source: Type.Optional(Type.Unknown()),
        target: Type.Optional(Type.Unknown()),
        sourceLang: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        targetLang: Type.Optional(Type.Union([Type.Null(), Type.String()])),
        links: Type.Optional(Type.Unknown()),
        metadata: Type.Optional(Type.Unknown()),
        layersUri: Type.Optional(Type.Union([Type.Null(), Type.String()])),
      }),
      response: { 200: AlignmentResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(
      await serviceFor(request).updateAlignment(id, request.body as AlignmentUpdateInput)
    )
  })

  fastify.delete('/alignments/:id', {
    schema: {
      description: 'Delete an alignment',
      tags: ['layers'],
      params: IdParams,
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await serviceFor(request).deleteAlignment(id)
    return reply.code(204).send()
  })
}
