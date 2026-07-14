import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { LayersOntologyRepository } from '../../repositories/LayersOntologyRepository.js'
import {
  LayersOntologyService,
  type LayersOntologyInput,
  type LayersOntologyUpdateInput,
  type TypeDefInput,
  type TypeDefUpdateInput
} from '../../services/layers-ontology-service.js'

/**
 * Response schema for a LayersOntology. JSON columns (knowledgeRefs) validate
 * as `Type.Unknown()` passthrough — their compile-time shape is the
 * `@fovea/layers-schema` interface, not a hand-written TypeBox duplicate.
 */
const OntologyResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: Type.Union([Type.Null(), Type.String()]),
  version: Type.Union([Type.Null(), Type.String()]),
  domain: Type.Union([Type.Null(), Type.String()]),
  parentOntologyId: Type.Union([Type.Null(), Type.String()]),
  personaId: Type.Union([Type.Null(), Type.String()]),
  knowledgeRefs: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/** Response schema for a TypeDef. JSON columns validate as passthrough. */
const TypeDefResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  ontologyId: Type.String({ format: 'uuid' }),
  name: Type.String(),
  typeKind: Type.String(),
  gloss: Type.Union([Type.Null(), Type.String()]),
  parentTypeId: Type.Union([Type.Null(), Type.String()]),
  allowedRoles: Type.Unknown(),
  allowedValues: Type.Unknown(),
  knowledgeRefs: Type.Unknown(),
  features: Type.Unknown(),
  projectId: Type.Union([Type.Null(), Type.String()]),
  createdByUserId: Type.Union([Type.Null(), Type.String()]),
  layersUri: Type.Union([Type.Null(), Type.String()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/** Create body for an ontology. Envelope fields are typed; JSON is passthrough. */
const OntologyCreateSchema = Type.Object({
  // Optional client-generated id makes the create idempotent: a re-POST of an
  // already-persisted ontology updates it in place instead of duplicating it.
  id: Type.Optional(Type.String({ format: 'uuid' })),
  name: Type.String(),
  description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  version: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  domain: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  parentOntologyId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  personaId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  knowledgeRefs: Type.Optional(Type.Unknown()),
  projectId: Type.Optional(Type.Union([Type.Null(), Type.String()]))
})

/** Update body for an ontology. All fields optional; only provided ones write. */
const OntologyUpdateSchema = Type.Object({
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  version: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  domain: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  parentOntologyId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  knowledgeRefs: Type.Optional(Type.Unknown())
})

/** Create body for a type definition. */
const TypeDefCreateSchema = Type.Object({
  id: Type.Optional(Type.String({ format: 'uuid' })),
  name: Type.String(),
  typeKind: Type.String(),
  gloss: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  parentTypeId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  allowedRoles: Type.Optional(Type.Unknown()),
  allowedValues: Type.Optional(Type.Unknown()),
  knowledgeRefs: Type.Optional(Type.Unknown()),
  features: Type.Optional(Type.Unknown())
})

/** Update body for a type definition. */
const TypeDefUpdateSchema = Type.Object({
  name: Type.Optional(Type.String()),
  typeKind: Type.Optional(Type.String()),
  gloss: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  parentTypeId: Type.Optional(Type.Union([Type.Null(), Type.String()])),
  allowedRoles: Type.Optional(Type.Unknown()),
  allowedValues: Type.Optional(Type.Unknown()),
  knowledgeRefs: Type.Optional(Type.Unknown()),
  features: Type.Optional(Type.Unknown())
})

/**
 * Ontologies resource group for the layers-shaped annotation store: CRUD for
 * LayersOntology and its nested TypeDef children.
 *
 * Authentication and CASL abilities are applied once by the parent aggregator
 * (`routes/layers/index.ts`) via its shared `requireAuth` + `buildAbilities`
 * onRequest hooks, so this module registers neither. Endpoint paths are declared
 * relative to the `/api/layers` prefix the aggregator applies at registration
 * time. Every route performs HTTP concerns only — schema validation, request
 * parsing, and dispatch to a per-request LayersOntologyService that owns
 * business rules and RBAC; the LayersOntologyRepository owns all Prisma access.
 *
 * Routes:
 * - GET    /ontologies                        - list readable ontologies
 * - POST   /ontologies                        - create (idempotent by client id)
 * - GET    /ontologies/:id                    - get one ontology
 * - PUT    /ontologies/:id                    - update one ontology
 * - DELETE /ontologies/:id                    - delete one ontology
 * - GET    /ontologies/:ontologyId/type-defs  - list an ontology's type defs
 * - POST   /ontologies/:ontologyId/type-defs  - create (idempotent by client id)
 * - GET    /type-defs/:id                     - get one type def
 * - PUT    /type-defs/:id                     - update one type def
 * - DELETE /type-defs/:id                     - delete one type def
 */
const ontologiesRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: one repository for the plugin's lifetime.
  const repository = new LayersOntologyRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id.
   */
  const serviceFor = (request: FastifyRequest): LayersOntologyService =>
    new LayersOntologyService(repository, request.ability ?? null, request.user?.id)

  // --- LayersOntology ----------------------------------------------------

  /** List ontologies the caller can read, optionally filtered. */
  fastify.get('/ontologies', {
    schema: {
      description: 'List layers ontologies the caller can read',
      tags: ['layers'],
      querystring: Type.Object({
        personaId: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String()),
        domain: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Array(OntologyResponseSchema)
      }
    }
  }, async (request, reply) => {
    const { personaId, projectId, domain } = request.query as {
      personaId?: string
      projectId?: string
      domain?: string
    }
    const service = serviceFor(request)
    return reply.send(await service.listOntologies({ personaId, projectId, domain }))
  })

  /** Create an ontology, or update it in place when its client id already exists. */
  fastify.post('/ontologies', {
    schema: {
      description: 'Create a layers ontology, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      body: OntologyCreateSchema,
      response: {
        200: OntologyResponseSchema,
        201: OntologyResponseSchema
      }
    }
  }, async (request, reply) => {
    const service = serviceFor(request)
    const { ontology, created } = await service.createOntology(request.body as LayersOntologyInput)
    return reply.code(created ? 201 : 200).send(ontology)
  })

  /** Get one ontology by id. */
  fastify.get('/ontologies/:id', {
    schema: {
      description: 'Get a layers ontology by id',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: {
        200: OntologyResponseSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.getOntology(id))
  })

  /** Update one ontology by id. */
  fastify.put('/ontologies/:id', {
    schema: {
      description: 'Update a layers ontology',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      body: OntologyUpdateSchema,
      response: {
        200: OntologyResponseSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.updateOntology(id, request.body as LayersOntologyUpdateInput))
  })

  /** Delete one ontology by id. Its type definitions cascade-delete. */
  fastify.delete('/ontologies/:id', {
    schema: {
      description: 'Delete a layers ontology',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: {
        204: Type.Null()
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    await service.deleteOntology(id)
    return reply.code(204).send()
  })

  // --- TypeDef -----------------------------------------------------------

  /** List the type definitions belonging to an ontology. */
  fastify.get('/ontologies/:ontologyId/type-defs', {
    schema: {
      description: "List a layers ontology's type definitions",
      tags: ['layers'],
      params: Type.Object({ ontologyId: Type.String() }),
      querystring: Type.Object({
        typeKind: Type.Optional(Type.String())
      }),
      response: {
        200: Type.Array(TypeDefResponseSchema)
      }
    }
  }, async (request, reply) => {
    const { ontologyId } = request.params as { ontologyId: string }
    const { typeKind } = request.query as { typeKind?: string }
    const service = serviceFor(request)
    return reply.send(await service.listTypeDefs(ontologyId, { typeKind }))
  })

  /** Create a type definition under an ontology (idempotent by client id). */
  fastify.post('/ontologies/:ontologyId/type-defs', {
    schema: {
      description: 'Create a type definition under a layers ontology, or update it in place when a client-supplied id already exists (idempotent create)',
      tags: ['layers'],
      params: Type.Object({ ontologyId: Type.String() }),
      body: TypeDefCreateSchema,
      response: {
        200: TypeDefResponseSchema,
        201: TypeDefResponseSchema
      }
    }
  }, async (request, reply) => {
    const { ontologyId } = request.params as { ontologyId: string }
    const service = serviceFor(request)
    const { typeDef, created } = await service.createTypeDef(ontologyId, request.body as TypeDefInput)
    return reply.code(created ? 201 : 200).send(typeDef)
  })

  /** Get one type definition by id. */
  fastify.get('/type-defs/:id', {
    schema: {
      description: 'Get a type definition by id',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: {
        200: TypeDefResponseSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.getTypeDef(id))
  })

  /** Update one type definition by id. */
  fastify.put('/type-defs/:id', {
    schema: {
      description: 'Update a type definition',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      body: TypeDefUpdateSchema,
      response: {
        200: TypeDefResponseSchema
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    return reply.send(await service.updateTypeDef(id, request.body as TypeDefUpdateInput))
  })

  /** Delete one type definition by id. */
  fastify.delete('/type-defs/:id', {
    schema: {
      description: 'Delete a type definition',
      tags: ['layers'],
      params: Type.Object({ id: Type.String() }),
      response: {
        204: Type.Null()
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const service = serviceFor(request)
    await service.deleteTypeDef(id)
    return reply.code(204).send()
  })
}

export default ontologiesRoute
