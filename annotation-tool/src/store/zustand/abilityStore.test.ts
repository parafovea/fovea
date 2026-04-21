/**
 * Tests for AbilityStore.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useAbilityStore } from './abilityStore'

describe('AbilityStore', () => {
  beforeEach(() => {
    // Reset to an empty ability
    useAbilityStore.getState().setAbility([])
  })

  describe('Initial State', () => {
    it('has an ability instance with no permissions', () => {
      const { ability } = useAbilityStore.getState()
      expect(ability).toBeDefined()
      expect(ability.can('read', 'Video')).toBe(false)
      expect(ability.can('create', 'Annotation')).toBe(false)
    })
  })

  describe('setAbility', () => {
    it('creates ability from rules', () => {
      useAbilityStore.getState().setAbility([
        { action: 'read', subject: 'Video' },
        { action: 'create', subject: 'Annotation' },
      ])

      const { ability } = useAbilityStore.getState()
      expect(ability.can('read', 'Video')).toBe(true)
      expect(ability.can('create', 'Annotation')).toBe(true)
      expect(ability.can('delete', 'Video')).toBe(false)
    })

    it('grants full access with admin rules', () => {
      useAbilityStore.getState().setAbility([
        { action: 'manage', subject: 'all' },
      ])

      const { ability } = useAbilityStore.getState()
      expect(ability.can('read', 'Video')).toBe(true)
      expect(ability.can('create', 'Annotation')).toBe(true)
      expect(ability.can('delete', 'Project')).toBe(true)
      expect(ability.can('manage_members', 'UserGroup')).toBe(true)
      expect(ability.can('share', 'Annotation')).toBe(true)
    })

    it('replaces previous rules with new ones', () => {
      const { setAbility } = useAbilityStore.getState()

      setAbility([{ action: 'read', subject: 'Video' }])
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(true)
      expect(useAbilityStore.getState().ability.can('create', 'Annotation')).toBe(false)

      setAbility([{ action: 'create', subject: 'Annotation' }])
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(false)
      expect(useAbilityStore.getState().ability.can('create', 'Annotation')).toBe(true)
    })
  })

  describe('Reset ability', () => {
    it('clears to empty when set with empty array', () => {
      const { setAbility } = useAbilityStore.getState()

      setAbility([{ action: 'manage', subject: 'all' }])
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(true)

      setAbility([])
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(false)
      expect(useAbilityStore.getState().ability.can('create', 'Annotation')).toBe(false)
    })
  })

  describe('Conditional rules', () => {
    it('supports condition-based rules', () => {
      useAbilityStore.getState().setAbility([
        { action: 'read', subject: 'Video' },
        { action: 'update', subject: 'Annotation', conditions: { userId: 'user-1' } },
      ])

      const { ability } = useAbilityStore.getState()
      expect(ability.can('read', 'Video')).toBe(true)
      expect(ability.can('update', 'Annotation')).toBe(true)
    })
  })
})
