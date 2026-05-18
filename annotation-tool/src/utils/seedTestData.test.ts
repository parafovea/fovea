import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { seedTestData } from './seedTestData'

interface SeededPersona {
  name: string
  role: string
  informationNeed: string
  details: string
}
interface SeededOntology {
  personaId: string
  entities: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
  events: Array<{ id: string; name: string }>
  relationTypes: unknown[]
  relations: unknown[]
}

describe('seedTestData', () => {
  let postedPersonas: SeededPersona[]
  let putOntologies: SeededOntology[]
  let savedWorldEntities: Array<{ name: string; locationType?: string }>

  beforeEach(() => {
    postedPersonas = []
    putOntologies = []
    savedWorldEntities = []

    server.use(
      http.post('/api/personas', async ({ request }) => {
        const body = await request.json() as SeededPersona
        postedPersonas.push(body)
        return HttpResponse.json({ id: `persona-${postedPersonas.length}`, ...body, createdAt: '2026-01-01', updatedAt: '2026-01-01' })
      }),
      http.put('/api/personas/:personaId/ontology', async ({ params, request }) => {
        const body = await request.json() as Omit<SeededOntology, 'personaId'>
        putOntologies.push({ personaId: params.personaId as string, ...body })
        return HttpResponse.json({ success: true })
      }),
      http.get('/api/world', () => {
        return HttpResponse.json({
          entities: [], events: [], times: [],
          entityCollections: [], eventCollections: [], timeCollections: [], relations: [],
        })
      }),
      http.put('/api/world', async ({ request }) => {
        const body = await request.json() as { entities?: Array<{ name: string; locationType?: string }> }
        savedWorldEntities = body.entities ?? []
        return HttpResponse.json({ ...body })
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('seeds two personas with name + role + informationNeed + details', async () => {
    await seedTestData()
    expect(postedPersonas.map(p => p.name)).toEqual([
      'Infrastructure Analyst',
      'Casual Viewer',
    ])
    expect(postedPersonas[0].role).toBe('domain expert')
    expect(postedPersonas[1].role).toBe('general audience')
    expect(postedPersonas[0].informationNeed).toMatch(/critical-infrastructure/)
    expect(postedPersonas[1].informationNeed).toMatch(/general-audience|without specialist context/i)
  })

  it('writes each persona\'s ontology to the corresponding /api/personas/:id/ontology endpoint', async () => {
    await seedTestData()
    expect(putOntologies).toHaveLength(2)
    // The Infrastructure Analyst ontology has 2 entities, 2 roles, 2 events.
    const analyst = putOntologies[0]
    expect(analyst.personaId).toBe('persona-1')
    expect(analyst.entities.map(e => e.name)).toEqual(['Infrastructure Organization', 'Geographic Location'])
    expect(analyst.roles.map(r => r.name)).toEqual(['operator', 'location'])
    expect(analyst.events.map(e => e.name)).toEqual(['Weather Event', 'Infrastructure Disruption'])
    // The Casual Viewer ontology has 2 entities, 0 roles, 1 event.
    const casual = putOntologies[1]
    expect(casual.personaId).toBe('persona-2')
    expect(casual.entities.map(e => e.name)).toEqual(['Person or Organization', 'Place'])
    expect(casual.roles).toEqual([])
    expect(casual.events.map(e => e.name)).toEqual(['Notable Event'])
  })

  it('seeds world entities and locations after the personas are created', async () => {
    await seedTestData()
    // Personas must POST before the world PUT so the world entities can
    // reference persona ids in future iterations of typeAssignments.
    // We can only verify the count here (4 entities + 4 locations = 8).
    expect(savedWorldEntities).toHaveLength(8)
    const locationCount = savedWorldEntities.filter(e => e.locationType === 'point').length
    expect(locationCount).toBe(4)
    expect(savedWorldEntities.map(e => e.name)).toContain('Port of Long Beach')
    expect(savedWorldEntities.map(e => e.name)).toContain('Phoenix, Arizona')
  })

  it('continues seeding world entities even if a persona POST fails', async () => {
    server.use(
      http.post('/api/personas', () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seedTestData()
    // Both persona POSTs failed; world entities should still have been saved.
    expect(savedWorldEntities.length).toBe(8)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('continues seeding world entities even if an ontology PUT fails', async () => {
    server.use(
      http.put('/api/personas/:personaId/ontology', () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seedTestData()
    expect(savedWorldEntities.length).toBe(8)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
