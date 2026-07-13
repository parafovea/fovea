import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { layersOntologyForPersonaId } from '../../src/services/layers-id-map.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the combined ontology API.
 *
 * The `/api/ontology` contract is unchanged, but its store is now the layers
 * graph: personas stay in the `persona` table, their ontologies persist as a
 * LayersOntology plus TypeDef rows, and the world persists as GraphNode /
 * GraphEdge rows. These tests round-trip the multi-persona payload through the
 * route and assert the data lands in layers_ontologies / type_defs.
 */
describe('Ontology API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testUserId: string
  let sessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  /** Removes all world/ontology data in reverse foreign-key order. */
  async function cleanDatabase(): Promise<void> {
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
  }

  beforeEach(async () => {
    await cleanDatabase()
    await seedBaselinePermissions(prisma)

    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username: 'ontuser',
        email: 'ont@example.com',
        passwordHash,
        displayName: 'Ontology User',
        isAdmin: false,
      }
    })
    testUserId = user.id

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ontuser', password: 'testpass123' }
    })
    sessionToken = login.cookies.find(c => c.name === 'session_token')!.value
  })

  describe('GET /api/ontology', () => {
    it('returns empty personas and ontologies when the user has none', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ontology',
        cookies: { session_token: sessionToken }
      })

      expect(response.statusCode).toBe(200)
      const bundle = response.json()
      expect(bundle.personas).toEqual([])
      expect(bundle.personaOntologies).toEqual([])
      expect(bundle.world.entities).toEqual([])
    })

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ontology'
      })
      expect(response.statusCode).toBe(401)
    })

  })

  describe('PUT /api/ontology round-trip', () => {
    it('round-trips a multi-persona ontology across all four type kinds and lands it in layers_ontologies/type_defs', async () => {
      const analystId = randomUUID()
      const criticId = randomUUID()

      const analystOntology = {
        personaId: analystId,
        entities: [
          {
            id: 'et-person',
            name: 'Person',
            gloss: [
              { type: 'text', content: 'A ' },
              { type: 'typeRef', content: 'et-agent', refType: 'entity', refPersonaId: analystId }
            ],
            wikidataId: 'Q5',
            wikidataUrl: 'https://www.wikidata.org/wiki/Q5'
          }
        ],
        roles: [
          {
            id: 'rt-agent',
            name: 'Agent',
            gloss: [{ type: 'text', content: 'The doer' }],
            allowedFillerTypes: ['entity']
          }
        ],
        events: [
          {
            id: 'evt-action',
            name: 'Action',
            gloss: [{ type: 'text', content: 'Any action' }],
            roles: []
          },
          {
            id: 'evt-meet',
            name: 'Meeting',
            gloss: [{ type: 'text', content: 'People meeting' }],
            roles: [{ roleTypeId: 'rt-agent', optional: false, minOccurrences: 1 }],
            parentEventId: 'evt-action',
            wikidataId: 'Q2761147'
          }
        ],
        relationTypes: [
          {
            id: 'relt-knows',
            name: 'knows',
            gloss: [{ type: 'text', content: 'acquaintance' }],
            sourceTypes: ['entity'],
            targetTypes: ['entity'],
            symmetric: true
          }
        ]
      }

      const criticOntology = {
        personaId: criticId,
        entities: [
          { id: 'et-work', name: 'Work', gloss: [{ type: 'text', content: 'A creative work' }] }
        ],
        roles: [],
        events: [],
        relationTypes: []
      }

      const putResponse = await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: sessionToken },
        payload: {
          personas: [
            { id: analystId, name: 'Analyst', role: 'analyst', informationNeed: 'analyze', details: 'the analyst' },
            { id: criticId, name: 'Critic', role: 'critic', informationNeed: 'critique', details: 'the critic' }
          ],
          personaOntologies: [analystOntology, criticOntology]
        }
      })
      expect(putResponse.statusCode).toBe(200)

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/ontology',
        cookies: { session_token: sessionToken }
      })
      expect(getResponse.statusCode).toBe(200)
      const bundle = getResponse.json() as {
        personas: Array<{ id: string; name: string }>
        personaOntologies: Array<{
          personaId: string
          entities: unknown[]
          roles: unknown[]
          events: unknown[]
          relationTypes: unknown[]
          relations: unknown[]
        }>
      }

      expect(bundle.personas.map(p => p.id).sort()).toEqual([analystId, criticId].sort())

      const analyst = bundle.personaOntologies.find(o => o.personaId === analystId)!
      // Every type kind deep-equals what went in, glosses/roles/parents/wikidata intact.
      expect(analyst.entities).toEqual(analystOntology.entities)
      expect(analyst.roles).toEqual(analystOntology.roles)
      expect(analyst.events).toEqual(analystOntology.events)
      expect(analyst.relationTypes).toEqual(analystOntology.relationTypes)
      expect(analyst.relations).toEqual([])

      const critic = bundle.personaOntologies.find(o => o.personaId === criticId)!
      expect(critic.entities).toEqual(criticOntology.entities)

      // Rows landed: one LayersOntology per persona, one TypeDef per declared type.
      expect(await prisma.layersOntology.count({ where: { createdByUserId: testUserId } })).toBe(2)
      expect(await prisma.typeDef.count({ where: { createdByUserId: testUserId } })).toBe(6)

      // The ontologies are bound to their personas by the derived id.
      const analystOntologyId = layersOntologyForPersonaId(analystId)
      const analystRow = await prisma.layersOntology.findUnique({ where: { id: analystOntologyId } })
      expect(analystRow!.personaId).toBe(analystId)

      // Type kinds are projected onto the layers vocabulary.
      const kinds = await prisma.typeDef.findMany({
        where: { ontologyId: analystOntologyId },
        select: { name: true, typeKind: true, parentTypeId: true }
      })
      const byName = new Map(kinds.map(k => [k.name, k]))
      expect(byName.get('Person')!.typeKind).toBe('entity-type')
      expect(byName.get('Agent')!.typeKind).toBe('role-type')
      expect(byName.get('Action')!.typeKind).toBe('situation-type')
      expect(byName.get('knows')!.typeKind).toBe('relation-type')
      // The child event type's parent ref is projected onto the layers self-relation.
      expect(byName.get('Meeting')!.parentTypeId).toBe('evt-action')
    })

    it('updates an existing ontology in place, pruning removed types', async () => {
      const personaId = randomUUID()
      await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: sessionToken },
        payload: {
          personas: [{ id: personaId, name: 'P', role: 'r', informationNeed: 'n' }],
          personaOntologies: [{
            personaId,
            entities: [{ id: 'a', name: 'A', gloss: [] }, { id: 'b', name: 'B', gloss: [] }],
            roles: [], events: [], relationTypes: []
          }]
        }
      })
      expect(await prisma.typeDef.count({ where: { createdByUserId: testUserId } })).toBe(2)

      await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: sessionToken },
        payload: {
          personas: [{ id: personaId, name: 'P', role: 'r', informationNeed: 'n' }],
          personaOntologies: [{
            personaId,
            entities: [{ id: 'a', name: 'A renamed', gloss: [] }],
            roles: [], events: [], relationTypes: []
          }]
        }
      })

      // The removed type is pruned; the survivor reflects the update.
      expect(await prisma.typeDef.count({ where: { createdByUserId: testUserId } })).toBe(1)
      const bundle = (await app.inject({
        method: 'GET',
        url: '/api/ontology',
        cookies: { session_token: sessionToken }
      })).json() as { personaOntologies: Array<{ personaId: string; entities: Array<{ id: string; name: string }> }> }
      const ontology = bundle.personaOntologies.find(o => o.personaId === personaId)!
      expect(ontology.entities).toHaveLength(1)
      expect(ontology.entities[0].name).toBe('A renamed')
    })

    it('saves world state through the ontology route and lands it in graph_nodes', async () => {
      const personaId = randomUUID()
      const response = await app.inject({
        method: 'PUT',
        url: '/api/ontology',
        cookies: { session_token: sessionToken },
        payload: {
          personas: [{ id: personaId, name: 'P', role: 'r', informationNeed: 'n' }],
          personaOntologies: [{ personaId, entities: [], roles: [], events: [], relationTypes: [] }],
          world: {
            entities: [{ id: 'world-entity', name: 'World Entity', description: [], typeAssignments: [] }],
            events: [],
            times: [],
            entityCollections: [],
            eventCollections: [],
            timeCollections: [],
            relations: []
          }
        }
      })

      expect(response.statusCode).toBe(200)
      const bundle = response.json() as { world?: { entities: Array<{ id: string }> } }
      expect(bundle.world!.entities[0].id).toBe('world-entity')

      const node = await prisma.graphNode.findUnique({ where: { id: 'world-entity' } })
      expect(node).not.toBeNull()
      expect(node!.nodeType).toBe('entity')
      expect(node!.createdByUserId).toBe(testUserId)

      // The world round-trips through the combined GET as well.
      const world = (await app.inject({
        method: 'GET',
        url: '/api/ontology',
        cookies: { session_token: sessionToken }
      })).json() as { world: { entities: Array<{ id: string }> } }
      expect(world.world.entities[0].id).toBe('world-entity')
    })

    // Cross-tenant persona/ontology-save rejection is covered end-to-end by
    // test/integration/multi-user-isolation.test.ts, which reseeds the
    // ownership-aware RBAC baseline the default seedBaselinePermissions here
    // intentionally relaxes for non-destructive actions.
  })
})
