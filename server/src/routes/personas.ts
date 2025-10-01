import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

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
   * Returns an array of all personas in the database.
   *
   * @route GET /api/personas
   * @returns Array of personas
   */
  fastify.get('/api/personas', {
    schema: {
      description: 'Retrieve all personas',
      tags: ['personas'],
      response: {
        200: Type.Array(PersonaSchema)
      }
    }
  }, async (_request, reply) => {
    const personas = await fastify.prisma.persona.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return reply.send(personas)
  })

  /**
   * Create a new persona.
   * Creates a persona and its associated ontology in the database.
   *
   * @route POST /api/personas
   * @param request.body - Persona data
   * @returns Created persona
   */
  fastify.post('/api/personas', {
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
        201: PersonaSchema
      }
    }
  }, async (request, reply) => {
    const validatedData = createPersonaSchema.parse(request.body)

    const persona = await fastify.prisma.persona.create({
      data: {
        name: validatedData.name,
        role: validatedData.role,
        informationNeed: validatedData.informationNeed,
        details: validatedData.details || null,
        isSystemGenerated: validatedData.isSystemGenerated,
        hidden: validatedData.hidden,
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
   *
   * @route GET /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Persona object
   */
  fastify.get<{ Params: { id: string } }>('/api/personas/:id', {
    schema: {
      description: 'Get a specific persona by ID',
      tags: ['personas'],
      params: Type.Object({
        id: Type.String({ format: 'uuid' })
      }),
      response: {
        200: PersonaSchema,
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    const persona = await fastify.prisma.persona.findUnique({
      where: { id }
    })

    if (!persona) {
      return reply.code(404).send({ error: 'Persona not found' })
    }

    return reply.send(persona)
  })

  /**
   * Update a persona.
   * Performs partial update of persona fields.
   *
   * @route PUT /api/personas/:id
   * @param request.params.id - Persona UUID
   * @param request.body - Fields to update
   * @returns Updated persona
   */
  fastify.put<{ Params: { id: string } }>('/api/personas/:id', {
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
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const validatedData = updatePersonaSchema.parse(request.body)

    try {
      const persona = await fastify.prisma.persona.update({
        where: { id },
        data: validatedData
      })
      return reply.send(persona)
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Persona not found' })
      }
      throw error
    }
  })

  /**
   * Delete a persona.
   * Deletes the persona and its associated ontology (cascade).
   *
   * @route DELETE /api/personas/:id
   * @param request.params.id - Persona UUID
   * @returns Success message
   */
  fastify.delete<{ Params: { id: string } }>('/api/personas/:id', {
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
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id } = request.params

    try {
      await fastify.prisma.persona.delete({
        where: { id }
      })
      return reply.send({ message: 'Persona deleted successfully' })
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Persona not found' })
      }
      throw error
    }
  })
}

export default personasRoute
