import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth, optionalAuth } from '../middleware/auth.js'

/**
 * TypeBox schema for Persona response.
 * Defines the structure of persona data returned by the API.
 */
const PersonaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1 }),
  role: Type.String(),
  informationNeed: Type.String(),
  details: Type.Union([Type.String(), Type.Null()]),
  isSystemGenerated: Type.Boolean(),
  hidden: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/**
 * Zod schema for creating a new persona.
 * Validates request body for POST /api/personas.
 */
const createPersonaSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  informationNeed: z.string().min(1, 'Information need is required'),
  details: z.string().optional(),
  isSystemGenerated: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false)
})

/**
 * Zod schema for updating an existing persona.
 * All fields are optional for partial updates.
 */
const updatePersonaSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  informationNeed: z.string().min(1).optional(),
  details: z.string().optional(),
  isSystemGenerated: z.boolean().optional(),
  hidden: z.boolean().optional()
})

/**
 * Fastify plugin for persona-related routes.
 * Provides CRUD operations for personas using Prisma ORM.
 *
 * Routes:
 * - GET /api/personas - List all personas
 * - POST /api/personas - Create a new persona
 * - GET /api/personas/:id - Get a specific persona
 * - PUT /api/personas/:id - Update a persona
 * - DELETE /api/personas/:id - Delete a persona
 */
const personasRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List all personas.
   * In single-user mode, returns all personas.
   * In multi-user mode with authentication, returns current user's personas only.
   * Without authentication, returns public/system personas.
   *
   * @route GET /api/personas
   * @returns Array of personas
   */
  fastify.get('/api/personas', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Retrieve personas',
      tags: ['personas'],
      response: {
        200: Type.Array(PersonaSchema)
      }
    }
  }, async (request, reply) => {
    const mode = process.env.FOVEA_MODE || 'multi-user'

    let where: { userId?: string; isSystemGenerated?: boolean } = {}

    if (mode === 'single-user') {
      // Single-user mode: return all personas
      where = {}
    } else if (request.user) {
      // Multi-user mode with auth: return user's personas
      where = { userId: request.user.id }
    } else {
      // Multi-user mode without auth: return only system personas
      where = { isSystemGenerated: true }
    }

    const personas = await fastify.prisma.persona.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })
    return reply.send(personas)
  })

  /**
   * Create a new persona.
   * Creates a persona and its associated ontology in the database.
   * In single-user mode, uses default user if not authenticated.
   * In multi-user mode, requires authentication.
   *
   * @route POST /api/personas
   * @param request.body - Persona data
   * @returns Created persona
   */
  fastify.post('/api/personas', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Create a new persona',
      tags: ['personas'],
      body: Type.Object({
        name: Type.String({ minLength: 1 }),
        role: Type.String(),
        informationNeed: Type.String(),
        details: Type.Optional(Type.String()),
        isSystemGenerated: Type.Optional(Type.Boolean()),
        hidden: Type.Optional(Type.Boolean())
      }),
      response: {
        201: PersonaSchema,
        401: Type.Object({ error: Type.String() }),
        500: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const mode = process.env.FOVEA_MODE || 'multi-user'

    // In multi-user mode, require authentication
    if (mode !== 'single-user' && !request.user) {
      return reply.code(401).send({ error: 'Authentication required' })
    }

    // Get user ID: use authenticated user or find default user in single-user mode
    let userId: string
    if (request.user) {
      userId = request.user.id
    } else {
      // Single-user mode: find the default user (the one created at startup)
      const defaultUser = await fastify.prisma.user.findFirst({
        where: { username: process.env.DEFAULT_USER_USERNAME || 'default-user' }
      })
      if (!defaultUser) {
        return reply.code(500).send({ error: 'Default user not found in single-user mode' })
      }
      userId = defaultUser.id
    }

    const validatedData = createPersonaSchema.parse(request.body)

    const persona = await fastify.prisma.persona.create({
      data: {
        name: validatedData.name,
        role: validatedData.role,
        informationNeed: validatedData.informationNeed,
        details: validatedData.details || null,
        isSystemGenerated: validatedData.isSystemGenerated,
        hidden: validatedData.hidden,
        userId,
        ontology: {
          create: {
            entityTypes: [],
            eventTypes: [],
            roleTypes: [],
            relationTypes: []
          }
        }
      }
    })

    return reply.code(201).send(persona)
  })

  /**
   * Get a specific persona by ID.
   * In multi-user mode, verifies user owns the persona or it's a system persona.
   *
   * @route GET /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Persona object
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Get a specific persona by ID',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: PersonaSchema,
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const mode = process.env.FOVEA_MODE || 'multi-user'

    const persona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!persona) {
      return reply.code(404).send({ error: 'Persona not found' })
    }

    // In multi-user mode, verify access
    if (mode === 'multi-user' && request.user) {
      if (persona.userId !== request.user.id && !persona.isSystemGenerated) {
        return reply.code(403).send({ error: 'Access denied' })
      }
    }

    return reply.send(persona)
  })

  /**
   * Update a persona.
   * Performs partial update of persona fields.
   * Requires authentication and ownership verification.
   *
   * @route PUT /api/personas/:id
   * @param request.params.id - Persona UUID
   * @param request.body - Fields to update
   * @returns Updated persona
   */
  fastify.put<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [requireAuth],
    schema: {
      description: 'Update a persona',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        role: Type.Optional(Type.String()),
        informationNeed: Type.Optional(Type.String()),
        details: Type.Optional(Type.String()),
        isSystemGenerated: Type.Optional(Type.Boolean()),
        hidden: Type.Optional(Type.Boolean())
      }),
      response: {
        200: PersonaSchema,
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const validatedData = updatePersonaSchema.parse(request.body)

    // Verify ownership
    const existingPersona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!existingPersona) {
      return reply.code(404).send({ error: 'Persona not found' })
    }

    if (existingPersona.userId !== request.user!.id) {
      return reply.code(403).send({ error: 'Cannot update another user\'s persona' })
    }

    try {
      const persona = await fastify.prisma.persona.update({
        where: { id },
        data: validatedData
      })
      return reply.send(persona)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        return reply.code(404).send({ error: 'Persona not found' })
      }
      throw error
    }
  })

  /**
   * Delete a persona.
   * Deletes the persona and its associated ontology (cascade).
   * Requires authentication and ownership verification.
   *
   * @route DELETE /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Success message
   */
  fastify.delete<{ Params: { id: string } }>('/api/personas/:id', {
    onRequest: [requireAuth],
    schema: {
      description: 'Delete a persona',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          message: Type.String()
        }),
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    // Verify ownership
    const existingPersona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!existingPersona) {
      return reply.code(404).send({ error: 'Persona not found' })
    }

    if (existingPersona.userId !== request.user!.id) {
      return reply.code(403).send({ error: 'Cannot delete another user\'s persona' })
    }

    try {
      await fastify.prisma.persona.delete({
        where: { id }
      })
      return reply.send({ message: 'Persona deleted successfully' })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        return reply.code(404).send({ error: 'Persona not found' })
      }
      throw error
    }
  })

  /**
   * Get ontology for a specific persona.
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id/ontology', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Get ontology for a specific persona',
      tags: ['personas', 'ontology'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          entities: Type.Array(Type.Any()),
          roles: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          relationTypes: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String(),
          updatedAt: Type.String()
        }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    const persona = await fastify.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })

    if (!persona || !persona.ontology) {
      return reply.code(404).send({ error: 'Persona or ontology not found' })
    }

    // Map database field names to API field names
    return reply.send({
      id: persona.ontology.id,
      personaId: persona.ontology.personaId,
      entities: persona.ontology.entityTypes || [],
      roles: persona.ontology.roleTypes || [],
      events: persona.ontology.eventTypes || [],
      relationTypes: persona.ontology.relationTypes || [],
      relations: [],
      createdAt: persona.ontology.createdAt.toISOString(),
      updatedAt: persona.ontology.updatedAt.toISOString()
    })
  })

  /**
   * Update ontology for a specific persona.
   */
  fastify.put<{ Params: { id: string }; Body: any }>('/api/personas/:id/ontology', {
    onRequest: [optionalAuth],
    schema: {
      description: 'Update ontology for a specific persona',
      tags: ['personas', 'ontology'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        entities: Type.Optional(Type.Array(Type.Any())),
        roles: Type.Optional(Type.Array(Type.Any())),
        events: Type.Optional(Type.Array(Type.Any())),
        relationTypes: Type.Optional(Type.Array(Type.Any())),
        relations: Type.Optional(Type.Array(Type.Any()))
      }),
      response: {
        200: Type.Object({
          id: Type.String(),
          personaId: Type.String(),
          entities: Type.Array(Type.Any()),
          roles: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          relationTypes: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any()),
          createdAt: Type.String(),
          updatedAt: Type.String()
        }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const updateData = request.body as any

    const persona = await fastify.prisma.persona.findUnique({
      where: { id },
      include: { ontology: true }
    })

    if (!persona || !persona.ontology) {
      return reply.code(404).send({ error: 'Persona or ontology not found' })
    }

    // Map API field names to database field names
    const updatedOntology = await fastify.prisma.ontology.update({
      where: { personaId: id },
      data: {
        entityTypes: updateData.entities !== undefined ? updateData.entities : persona.ontology.entityTypes,
        roleTypes: updateData.roles !== undefined ? updateData.roles : persona.ontology.roleTypes,
        eventTypes: updateData.events !== undefined ? updateData.events : persona.ontology.eventTypes,
        relationTypes: updateData.relationTypes !== undefined ? updateData.relationTypes : persona.ontology.relationTypes
      }
    })

    // Map database field names back to API field names in response
    return reply.send({
      id: updatedOntology.id,
      personaId: updatedOntology.personaId,
      entities: updatedOntology.entityTypes || [],
      roles: updatedOntology.roleTypes || [],
      events: updatedOntology.eventTypes || [],
      relationTypes: updatedOntology.relationTypes || [],
      relations: [],
      createdAt: updatedOntology.createdAt.toISOString(),
      updatedAt: updatedOntology.updatedAt.toISOString()
    })
  })
}

export default personasRoute
