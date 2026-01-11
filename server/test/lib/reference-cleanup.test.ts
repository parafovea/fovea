import { describe, it, expect } from 'vitest'
import {
  convertTypeRefsToText,
  convertTypeRefsToTextWithName,
  convertObjectRefsToText,
  updateGlossesInTypes,
  countTypeRefsInGlosses,
  countObjectRefsInGlosses,
  removeRoleFromEventTypes,
  removeTypeAssignmentsFromEntities,
  removeEventInterpretationsFromEvents,
  countTypeAssignments,
  countEventInterpretations,
} from '../../src/lib/reference-cleanup.js'

/**
 * Unit tests for reference cleanup utilities.
 * Tests graceful deletion of types and world objects by converting references to text.
 */
describe('Reference Cleanup Utilities', () => {
  describe('convertTypeRefsToText', () => {
    it('converts matching typeRef to plain text', () => {
      const gloss = [
        { type: 'text' as const, content: 'A ' },
        { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
        { type: 'text' as const, content: ' is here' },
      ]

      const result = convertTypeRefsToText(gloss, 'entity-1', 'persona-1', 'entity')

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ type: 'text', content: 'A ' })
      expect(result[1]).toEqual({ type: 'text', content: 'entity-1' })
      expect(result[2]).toEqual({ type: 'text', content: ' is here' })
    })

    it('preserves non-matching typeRefs', () => {
      const gloss = [
        { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
        { type: 'typeRef' as const, content: 'entity-2', refType: 'entity', refPersonaId: 'persona-1' },
      ]

      const result = convertTypeRefsToText(gloss, 'entity-1', 'persona-1', 'entity')

      expect(result[0]).toEqual({ type: 'text', content: 'entity-1' })
      expect(result[1]).toEqual({ type: 'typeRef', content: 'entity-2', refType: 'entity', refPersonaId: 'persona-1' })
    })

    it('does not convert typeRef from different persona', () => {
      const gloss = [
        { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-2' },
      ]

      const result = convertTypeRefsToText(gloss, 'entity-1', 'persona-1', 'entity')

      expect(result[0]).toEqual(gloss[0])
    })

    it('does not convert typeRef of different refType', () => {
      const gloss = [
        { type: 'typeRef' as const, content: 'entity-1', refType: 'role', refPersonaId: 'persona-1' },
      ]

      const result = convertTypeRefsToText(gloss, 'entity-1', 'persona-1', 'entity')

      expect(result[0]).toEqual(gloss[0])
    })

    it('handles empty gloss array', () => {
      const result = convertTypeRefsToText([], 'entity-1', 'persona-1', 'entity')
      expect(result).toEqual([])
    })
  })

  describe('convertTypeRefsToTextWithName', () => {
    it('uses provided type name for converted text', () => {
      const gloss = [
        { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
      ]

      const result = convertTypeRefsToTextWithName(gloss, 'entity-1', 'persona-1', 'entity', 'Person')

      expect(result[0]).toEqual({ type: 'text', content: 'Person' })
    })

    it('preserves non-matching items and uses name for matches', () => {
      const gloss = [
        { type: 'text' as const, content: 'A ' },
        { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
        { type: 'text' as const, content: ' walks into ' },
        { type: 'typeRef' as const, content: 'entity-2', refType: 'entity', refPersonaId: 'persona-1' },
      ]

      const result = convertTypeRefsToTextWithName(gloss, 'entity-1', 'persona-1', 'entity', 'Person')

      expect(result[0]).toEqual({ type: 'text', content: 'A ' })
      expect(result[1]).toEqual({ type: 'text', content: 'Person' })
      expect(result[2]).toEqual({ type: 'text', content: ' walks into ' })
      expect(result[3]).toEqual(gloss[3])
    })
  })

  describe('convertObjectRefsToText', () => {
    it('converts matching objectRef to plain text', () => {
      const gloss = [
        { type: 'objectRef' as const, content: 'entity-obj-1', refType: 'entity-object' },
      ]

      const result = convertObjectRefsToText(gloss, 'entity-obj-1', 'entity-object', 'John')

      expect(result[0]).toEqual({ type: 'text', content: 'John' })
    })

    it('preserves non-matching objectRefs', () => {
      const gloss = [
        { type: 'objectRef' as const, content: 'entity-obj-1', refType: 'entity-object' },
        { type: 'objectRef' as const, content: 'entity-obj-2', refType: 'entity-object' },
      ]

      const result = convertObjectRefsToText(gloss, 'entity-obj-1', 'entity-object', 'John')

      expect(result[0]).toEqual({ type: 'text', content: 'John' })
      expect(result[1]).toEqual(gloss[1])
    })

    it('does not convert objectRef of different refType', () => {
      const gloss = [
        { type: 'objectRef' as const, content: 'obj-1', refType: 'event-object' },
      ]

      const result = convertObjectRefsToText(gloss, 'obj-1', 'entity-object', 'Test')

      expect(result[0]).toEqual(gloss[0])
    })
  })

  describe('updateGlossesInTypes', () => {
    it('updates glosses in multiple types', () => {
      const types = [
        {
          id: 'type-1',
          name: 'Type A',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
        {
          id: 'type-2',
          name: 'Type B',
          gloss: [
            { type: 'text' as const, content: 'No refs here' },
          ],
        },
        {
          id: 'type-3',
          name: 'Type C',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
      ]

      const result = updateGlossesInTypes(types, 'entity-1', 'persona-1', 'entity', 'Person')

      expect(result[0].gloss[0]).toEqual({ type: 'text', content: 'Person' })
      expect(result[1]).toEqual(types[1]) // Unchanged
      expect(result[2].gloss[0]).toEqual({ type: 'text', content: 'Person' })
    })

    it('returns original type if no gloss', () => {
      const types = [
        { id: 'type-1', name: 'Type A' },
      ]

      const result = updateGlossesInTypes(types, 'entity-1', 'persona-1', 'entity', 'Person')

      expect(result[0]).toEqual(types[0])
    })

    it('returns original type if gloss is empty', () => {
      const types = [
        { id: 'type-1', name: 'Type A', gloss: [] },
      ]

      const result = updateGlossesInTypes(types, 'entity-1', 'persona-1', 'entity', 'Person')

      expect(result[0]).toEqual(types[0])
    })
  })

  describe('countTypeRefsInGlosses', () => {
    it('counts matching typeRefs across multiple types', () => {
      const types = [
        {
          id: 'type-1',
          name: 'Type A',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
        {
          id: 'type-2',
          name: 'Type B',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
            { type: 'typeRef' as const, content: 'entity-1', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
        {
          id: 'type-3',
          name: 'Type C',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-2', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
      ]

      const count = countTypeRefsInGlosses(types, 'entity-1', 'persona-1', 'entity')

      expect(count).toBe(3)
    })

    it('returns 0 when no matches', () => {
      const types = [
        {
          id: 'type-1',
          name: 'Type A',
          gloss: [
            { type: 'typeRef' as const, content: 'entity-2', refType: 'entity', refPersonaId: 'persona-1' },
          ],
        },
      ]

      const count = countTypeRefsInGlosses(types, 'entity-1', 'persona-1', 'entity')

      expect(count).toBe(0)
    })

    it('handles types without gloss', () => {
      const types = [
        { id: 'type-1', name: 'Type A' },
      ]

      const count = countTypeRefsInGlosses(types, 'entity-1', 'persona-1', 'entity')

      expect(count).toBe(0)
    })
  })

  describe('countObjectRefsInGlosses', () => {
    it('counts matching objectRefs', () => {
      const types = [
        {
          id: 'type-1',
          name: 'Type A',
          gloss: [
            { type: 'objectRef' as const, content: 'obj-1', refType: 'entity-object' },
            { type: 'objectRef' as const, content: 'obj-1', refType: 'entity-object' },
          ],
        },
        {
          id: 'type-2',
          name: 'Type B',
          gloss: [
            { type: 'objectRef' as const, content: 'obj-2', refType: 'entity-object' },
          ],
        },
      ]

      const count = countObjectRefsInGlosses(types, 'obj-1', 'entity-object')

      expect(count).toBe(2)
    })
  })

  describe('removeRoleFromEventTypes', () => {
    it('removes role references from event types', () => {
      const eventTypes = [
        {
          id: 'event-1',
          name: 'Event A',
          roles: [
            { roleTypeId: 'role-1' },
            { roleTypeId: 'role-2' },
          ],
        },
        {
          id: 'event-2',
          name: 'Event B',
          roles: [
            { roleTypeId: 'role-1' },
          ],
        },
      ]

      const result = removeRoleFromEventTypes(eventTypes, 'role-1')

      expect(result[0].roles).toEqual([{ roleTypeId: 'role-2' }])
      expect(result[1].roles).toEqual([])
    })

    it('returns original event type if no roles', () => {
      const eventTypes = [
        { id: 'event-1', name: 'Event A' },
      ]

      const result = removeRoleFromEventTypes(eventTypes, 'role-1')

      expect(result[0]).toEqual(eventTypes[0])
    })

    it('returns original event type if roles is empty', () => {
      const eventTypes = [
        { id: 'event-1', name: 'Event A', roles: [] },
      ]

      const result = removeRoleFromEventTypes(eventTypes, 'role-1')

      expect(result[0]).toEqual(eventTypes[0])
    })
  })

  describe('removeTypeAssignmentsFromEntities', () => {
    it('removes matching type assignments from entities', () => {
      const entities = [
        {
          id: 'entity-1',
          name: 'John',
          typeAssignments: [
            { personaId: 'persona-1', typeId: 'type-1' },
            { personaId: 'persona-1', typeId: 'type-2' },
            { personaId: 'persona-2', typeId: 'type-1' },
          ],
        },
      ]

      const result = removeTypeAssignmentsFromEntities(entities, 'type-1', 'persona-1')

      expect(result[0].typeAssignments).toEqual([
        { personaId: 'persona-1', typeId: 'type-2' },
        { personaId: 'persona-2', typeId: 'type-1' },
      ])
    })

    it('returns original entity if no type assignments', () => {
      const entities = [
        { id: 'entity-1', name: 'John' },
      ]

      const result = removeTypeAssignmentsFromEntities(entities, 'type-1', 'persona-1')

      expect(result[0]).toEqual(entities[0])
    })

    it('returns original entity if no matching assignments', () => {
      const entities = [
        {
          id: 'entity-1',
          name: 'John',
          typeAssignments: [
            { personaId: 'persona-2', typeId: 'type-1' },
          ],
        },
      ]

      const result = removeTypeAssignmentsFromEntities(entities, 'type-1', 'persona-1')

      expect(result[0]).toEqual(entities[0])
    })
  })

  describe('removeEventInterpretationsFromEvents', () => {
    it('removes matching interpretations from events', () => {
      const events = [
        {
          id: 'event-1',
          name: 'Meeting',
          personaInterpretations: [
            { personaId: 'persona-1', eventTypeId: 'event-type-1' },
            { personaId: 'persona-1', eventTypeId: 'event-type-2' },
            { personaId: 'persona-2', eventTypeId: 'event-type-1' },
          ],
        },
      ]

      const result = removeEventInterpretationsFromEvents(events, 'event-type-1', 'persona-1')

      expect(result[0].personaInterpretations).toEqual([
        { personaId: 'persona-1', eventTypeId: 'event-type-2' },
        { personaId: 'persona-2', eventTypeId: 'event-type-1' },
      ])
    })

    it('returns original event if no interpretations', () => {
      const events = [
        { id: 'event-1', name: 'Meeting' },
      ]

      const result = removeEventInterpretationsFromEvents(events, 'event-type-1', 'persona-1')

      expect(result[0]).toEqual(events[0])
    })
  })

  describe('countTypeAssignments', () => {
    it('counts matching type assignments across entities', () => {
      const entities = [
        {
          id: 'entity-1',
          name: 'John',
          typeAssignments: [
            { personaId: 'persona-1', typeId: 'type-1' },
          ],
        },
        {
          id: 'entity-2',
          name: 'Jane',
          typeAssignments: [
            { personaId: 'persona-1', typeId: 'type-1' },
            { personaId: 'persona-2', typeId: 'type-1' },
          ],
        },
      ]

      const count = countTypeAssignments(entities, 'type-1', 'persona-1')

      expect(count).toBe(2)
    })

    it('returns 0 when no matches', () => {
      const entities = [
        {
          id: 'entity-1',
          name: 'John',
          typeAssignments: [
            { personaId: 'persona-2', typeId: 'type-1' },
          ],
        },
      ]

      const count = countTypeAssignments(entities, 'type-1', 'persona-1')

      expect(count).toBe(0)
    })
  })

  describe('countEventInterpretations', () => {
    it('counts matching interpretations across events', () => {
      const events = [
        {
          id: 'event-1',
          name: 'Meeting',
          personaInterpretations: [
            { personaId: 'persona-1', eventTypeId: 'event-type-1' },
          ],
        },
        {
          id: 'event-2',
          name: 'Call',
          personaInterpretations: [
            { personaId: 'persona-1', eventTypeId: 'event-type-1' },
            { personaId: 'persona-2', eventTypeId: 'event-type-1' },
          ],
        },
      ]

      const count = countEventInterpretations(events, 'event-type-1', 'persona-1')

      expect(count).toBe(2)
    })

    it('returns 0 when no matches', () => {
      const events = [
        {
          id: 'event-1',
          name: 'Meeting',
          personaInterpretations: [
            { personaId: 'persona-2', eventTypeId: 'event-type-1' },
          ],
        },
      ]

      const count = countEventInterpretations(events, 'event-type-1', 'persona-1')

      expect(count).toBe(0)
    })
  })
})
