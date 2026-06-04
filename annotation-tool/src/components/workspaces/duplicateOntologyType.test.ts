import { describe, it, expect } from 'vitest'
import { buildDuplicateOntologyType } from './duplicateOntologyType'

describe('buildDuplicateOntologyType', () => {
  it('replaces id with the caller-supplied newId', () => {
    const entity = { id: 'ent-1', name: 'Person', gloss: [] }
    const duped = buildDuplicateOntologyType(entity, 'ent-2')
    expect(duped.id).toBe('ent-2')
  })

  it('appends " (copy)" to the name', () => {
    const entity = { id: 'ent-1', name: 'Person', gloss: [] }
    expect(buildDuplicateOntologyType(entity, 'ent-2').name).toBe('Person (copy)')
  })

  it('strips Wikidata-provenance fields so the duplicate does not collide on the (personaId, wikidataId) ontology invariant', () => {
    const entity = {
      id: 'ent-1', name: 'Person', gloss: [],
      wikidataId: 'Q5',
      wikibaseId: 'Q5-local',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q5',
    }
    const duped = buildDuplicateOntologyType(entity, 'ent-2') as unknown as Record<string, unknown>
    expect(duped).not.toHaveProperty('wikidataId')
    expect(duped).not.toHaveProperty('wikibaseId')
    expect(duped).not.toHaveProperty('wikidataUrl')
  })

  it('preserves every non-stripped field verbatim including the gloss array', () => {
    const entity = {
      id: 'ent-1', name: 'Person', gloss: [{ type: 'text', content: 'a human' }],
      description: 'A natural person',
    }
    const duped = buildDuplicateOntologyType(entity, 'ent-2') as unknown as Record<string, unknown>
    expect(duped.description).toBe('A natural person')
    expect(duped.gloss).toEqual([{ type: 'text', content: 'a human' }])
  })

  it('does not mutate the source object', () => {
    const entity = { id: 'ent-1', name: 'Person', wikidataId: 'Q5', gloss: [] }
    const snapshot = JSON.parse(JSON.stringify(entity))
    buildDuplicateOntologyType(entity, 'ent-2')
    expect(entity).toEqual(snapshot)
  })

  it('handles all four ontology kinds (entity / role / event / relation) symmetrically', () => {
    const role = { id: 'r-1', name: 'Witness', gloss: [] }
    const event = { id: 'ev-1', name: 'Meeting', gloss: [], roleAssignments: [{ roleId: 'r-1' }] }
    const relation = { id: 'rel-1', name: 'isLocatedIn', gloss: [], sourceTypeId: 'ent-1', targetTypeId: 'loc-1' }
    expect(buildDuplicateOntologyType(role, 'r-2').name).toBe('Witness (copy)')
    expect((buildDuplicateOntologyType(event, 'ev-2') as unknown as { roleAssignments: unknown[] }).roleAssignments)
      .toEqual([{ roleId: 'r-1' }])
    const dupedRel = buildDuplicateOntologyType(relation, 'rel-2') as unknown as Record<string, unknown>
    expect(dupedRel.sourceTypeId).toBe('ent-1')
    expect(dupedRel.targetTypeId).toBe('loc-1')
  })
})
