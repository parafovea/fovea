import { describe, it, expect } from 'vitest'
import { buildDuplicatePayload } from './duplicateWorldObject'

describe('buildDuplicatePayload', () => {
  it('strips server-managed id / createdAt / updatedAt fields', () => {
    const entity = {
      id: 'e-1', name: 'Alice',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    }
    const payload = buildDuplicatePayload(entity)
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('createdAt')
    expect(payload).not.toHaveProperty('updatedAt')
  })

  it('strips Wikidata-provenance fields so the duplicate does not collide on the (userId, wikidataId) ownership index', () => {
    const entity = {
      id: 'e-1', name: 'Alice',
      wikidataId: 'Q42',
      wikibaseId: 'Q12345',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q42',
    }
    const payload = buildDuplicatePayload(entity)
    expect(payload).not.toHaveProperty('wikidataId')
    expect(payload).not.toHaveProperty('wikibaseId')
    expect(payload).not.toHaveProperty('wikidataUrl')
  })

  it('appends " (copy)" to the name field for entities / events / locations / collections', () => {
    expect(buildDuplicatePayload({ id: 'e-1', name: 'Alice' }).name).toBe('Alice (copy)')
    expect(buildDuplicatePayload({ id: 'ev-1', name: 'Standup' }).name).toBe('Standup (copy)')
  })

  it('appends " (copy)" to the label field for times (which lack a name field)', () => {
    const time = { id: 't-1', label: '2026-05-15 09:00', type: 'instant' }
    expect(buildDuplicatePayload(time).label).toBe('2026-05-15 09:00 (copy)')
    expect(buildDuplicatePayload(time)).not.toHaveProperty('name')
  })

  it('leaves non-string name / label values untouched (defensive against malformed input)', () => {
    const malformed = { id: 'x', name: null, label: 42 }
    const payload = buildDuplicatePayload(malformed)
    expect(payload.name).toBeNull()
    expect(payload.label).toBe(42)
  })

  it('preserves every non-stripped field verbatim', () => {
    const entity = {
      id: 'e-1', name: 'Alice', description: 'a person', personaIds: ['p-1', 'p-2'],
      type: 'entity-object', locationType: undefined, metadata: { tag: 'x' },
      createdAt: '2026-01-01T00:00:00Z',
    }
    const payload = buildDuplicatePayload(entity)
    expect(payload.description).toBe('a person')
    expect(payload.personaIds).toEqual(['p-1', 'p-2'])
    expect(payload.type).toBe('entity-object')
    expect(payload.locationType).toBeUndefined()
    expect(payload.metadata).toEqual({ tag: 'x' })
  })

  it('does not mutate the input object', () => {
    const entity = { id: 'e-1', name: 'Alice', wikidataId: 'Q42' }
    const snapshot = JSON.parse(JSON.stringify(entity))
    buildDuplicatePayload(entity)
    expect(entity).toEqual(snapshot)
  })

  it('handles entity collections (members array preserved, name renamed)', () => {
    const coll = {
      id: 'ec-1', name: 'Suspects', entityIds: ['e-1', 'e-2'],
      members: ['e-1', 'e-2'], metadata: { batch: 1 },
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }
    const payload = buildDuplicatePayload(coll)
    expect(payload.name).toBe('Suspects (copy)')
    expect(payload.entityIds).toEqual(['e-1', 'e-2'])
    expect(payload.members).toEqual(['e-1', 'e-2'])
    expect(payload.metadata).toEqual({ batch: 1 })
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('createdAt')
  })
})
