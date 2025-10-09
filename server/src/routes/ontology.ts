import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'

/**
 * Fastify plugin for ontology-related routes.
 * Provides endpoints for retrieving and saving ontology data in a format compatible with the frontend.
 *
 * Routes:
 * - GET /api/ontology - Get all personas and their ontologies
 * - PUT /api/ontology - Save ontology data (personas and ontologies)
 */
const ontologyRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all personas, their ontologies, and world state.
   * Returns data in the multi-persona format expected by the frontend.
   *
   * @route GET /api/ontology
   * @returns Object with personas, personaOntologies, and world state
   */
  fastify.get('/api/ontology', {
    schema: {
      description: 'Retrieve all personas, their ontologies, and world state',
      tags: ['ontology'],
      response: {
        200: Type.Object({
          personas: Type.Array(Type.Any()),
          personaOntologies: Type.Array(Type.Any()),
          world: Type.Optional(Type.Object({
            entities: Type.Array(Type.Any()),
            events: Type.Array(Type.Any()),
            times: Type.Array(Type.Any()),
            entityCollections: Type.Array(Type.Any()),
            eventCollections: Type.Array(Type.Any()),
            timeCollections: Type.Array(Type.Any()),
            relations: Type.Array(Type.Any())
          }))
        })
      }
    }
  }, async (_request, reply) => {
    // Fetch all personas with their ontologies
    const personas = await fastify.prisma.persona.findMany({
      include: {
        ontology: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Fetch world state (there should only be one record)
    const worldState = await fastify.prisma.worldState.findFirst()

    // Transform to frontend format
    const personasData = personas.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      informationNeed: p.informationNeed,
      details: p.details,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }))

    const ontologiesData = personas
      .filter(p => p.ontology)
      .map(p => ({
        id: p.ontology!.id,
        personaId: p.id,
        entities: p.ontology!.entityTypes || [],
        roles: p.ontology!.roleTypes || [],
        events: p.ontology!.eventTypes || [],
        relationTypes: p.ontology!.relationTypes || [],
        relations: [],
        createdAt: p.ontology!.createdAt.toISOString(),
        updatedAt: p.ontology!.updatedAt.toISOString()
      }))

    const worldData = worldState ? {
      entities: worldState.entities as unknown[] || [],
      events: worldState.events as unknown[] || [],
      times: worldState.times as unknown[] || [],
      entityCollections: worldState.entityCollections as unknown[] || [],
      eventCollections: worldState.eventCollections as unknown[] || [],
      timeCollections: worldState.timeCollections as unknown[] || [],
      relations: worldState.relations as unknown[] || []
    } : {
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: []
    }

    return reply.send({
      personas: personasData,
      personaOntologies: ontologiesData,
      world: worldData
    })
  })

  /**
   * Save ontology data (personas, ontologies, and world state).
   * Creates or updates personas, their associated ontologies, and world state.
   *
   * @route PUT /api/ontology
   * @param ontology - Ontology data with personas, personaOntologies, and world state
   * @returns Saved ontology data
   */
  fastify.put('/api/ontology', {
    schema: {
      description: 'Save ontology data including world state',
      tags: ['ontology'],
      body: Type.Object({
        personas: Type.Array(Type.Any()),
        personaOntologies: Type.Array(Type.Any()),
        world: Type.Optional(Type.Object({
          entities: Type.Array(Type.Any()),
          events: Type.Array(Type.Any()),
          times: Type.Array(Type.Any()),
          entityCollections: Type.Array(Type.Any()),
          eventCollections: Type.Array(Type.Any()),
          timeCollections: Type.Array(Type.Any()),
          relations: Type.Array(Type.Any())
        }))
      }),
      response: {
        200: Type.Object({
          personas: Type.Array(Type.Any()),
          personaOntologies: Type.Array(Type.Any()),
          world: Type.Optional(Type.Object({
            entities: Type.Array(Type.Any()),
            events: Type.Array(Type.Any()),
            times: Type.Array(Type.Any()),
            entityCollections: Type.Array(Type.Any()),
            eventCollections: Type.Array(Type.Any()),
            timeCollections: Type.Array(Type.Any()),
            relations: Type.Array(Type.Any())
          }))
        })
      }
    }
  }, async (request, reply) => {
    const { personas, personaOntologies, world } = request.body as {
      personas: unknown[]
      personaOntologies: unknown[]
      world?: {
        entities: unknown[]
        events: unknown[]
        times: unknown[]
        entityCollections: unknown[]
        eventCollections: unknown[]
        timeCollections: unknown[]
        relations: unknown[]
      }
    }

    // Use a transaction to ensure atomicity - either all saves succeed or all fail
    const result = await fastify.prisma.$transaction(async (tx) => {
      const savedPersonas = []
      const savedOntologies = []

      // Save all personas
      for (const persona of personas) {
        const savedPersona = await tx.persona.upsert({
          where: { id: persona.id },
          update: {
            name: persona.name,
            role: persona.role,
            informationNeed: persona.informationNeed,
            details: persona.details
          },
          create: {
            id: persona.id,
            name: persona.name,
            role: persona.role,
            informationNeed: persona.informationNeed,
            details: persona.details
          }
        })
        savedPersonas.push(savedPersona)
      }

      // Save all ontologies
      for (const ontology of personaOntologies) {
        const savedOntology = await tx.ontology.upsert({
          where: { personaId: ontology.personaId },
          update: {
            entityTypes: ontology.entities || [],
            roleTypes: ontology.roles || [],
            eventTypes: ontology.events || [],
            relationTypes: ontology.relationTypes || []
          },
          create: {
            personaId: ontology.personaId,
            entityTypes: ontology.entities || [],
            roleTypes: ontology.roles || [],
            eventTypes: ontology.events || [],
            relationTypes: ontology.relationTypes || []
          }
        })
        savedOntologies.push({
          id: savedOntology.id,
          personaId: savedOntology.personaId,
          entities: savedOntology.entityTypes,
          roles: savedOntology.roleTypes,
          events: savedOntology.eventTypes,
          relationTypes: savedOntology.relationTypes,
          relations: [],
          createdAt: savedOntology.createdAt.toISOString(),
          updatedAt: savedOntology.updatedAt.toISOString()
        })
      }

      // Save world state if provided
      let savedWorldState = null
      if (world) {
        // There should only be one WorldState record
        const existingWorldState = await tx.worldState.findFirst()

        if (existingWorldState) {
          savedWorldState = await tx.worldState.update({
            where: { id: existingWorldState.id },
            data: {
              entities: world.entities || [],
              events: world.events || [],
              times: world.times || [],
              entityCollections: world.entityCollections || [],
              eventCollections: world.eventCollections || [],
              timeCollections: world.timeCollections || [],
              relations: world.relations || []
            }
          })
        } else {
          savedWorldState = await tx.worldState.create({
            data: {
              entities: world.entities || [],
              events: world.events || [],
              times: world.times || [],
              entityCollections: world.entityCollections || [],
              eventCollections: world.eventCollections || [],
              timeCollections: world.timeCollections || [],
              relations: world.relations || []
            }
          })
        }
      }

      return { savedPersonas, savedOntologies, savedWorldState }
    })

    const worldData = result.savedWorldState ? {
      entities: result.savedWorldState.entities as unknown[] || [],
      events: result.savedWorldState.events as unknown[] || [],
      times: result.savedWorldState.times as unknown[] || [],
      entityCollections: result.savedWorldState.entityCollections as unknown[] || [],
      eventCollections: result.savedWorldState.eventCollections as unknown[] || [],
      timeCollections: result.savedWorldState.timeCollections as unknown[] || [],
      relations: result.savedWorldState.relations as unknown[] || []
    } : undefined

    return reply.send({
      personas: result.savedPersonas.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        informationNeed: p.informationNeed,
        details: p.details,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
      })),
      personaOntologies: result.savedOntologies,
      world: worldData
    })
  })
}

export default ontologyRoute
