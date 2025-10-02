import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'

/**
 * Fastify plugin for ontology-related routes.
 * Provides endpoints for retrieving ontology data in a format compatible with the frontend.
 *
 * Routes:
 * - GET /api/ontology - Get all personas and their ontologies
 */
const ontologyRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all personas and their ontologies.
   * Returns data in the multi-persona format expected by the frontend.
   *
   * @route GET /api/ontology
   * @returns Object with personas and personaOntologies arrays
   */
  fastify.get('/api/ontology', {
    schema: {
      description: 'Retrieve all personas and their ontologies',
      tags: ['ontology'],
      response: {
        200: Type.Object({
          personas: Type.Array(Type.Any()),
          personaOntologies: Type.Array(Type.Any())
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

    return reply.send({
      personas: personasData,
      personaOntologies: ontologiesData
    })
  })
}

export default ontologyRoute
