/**
 * Tests for ProjectContextStore.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectContextStore } from './projectContextStore'

vi.mock('../../telemetry/tracing', () => ({
  getTracer: () => ({
    startSpan: () => ({ setAttribute: vi.fn(), end: vi.fn() }),
  }),
}))

describe('ProjectContextStore', () => {
  beforeEach(() => {
    useProjectContextStore.getState().clearProject()
  })

  describe('Initial State', () => {
    it('has null values for all fields', () => {
      const state = useProjectContextStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.activeProjectName).toBeNull()
      expect(state.activeProjectRole).toBeNull()
    })
  })

  describe('setActiveProject', () => {
    it('sets id, name, and role', () => {
      useProjectContextStore.getState().setActiveProject('proj-1', 'My Project', 'annotator')

      const state = useProjectContextStore.getState()
      expect(state.activeProjectId).toBe('proj-1')
      expect(state.activeProjectName).toBe('My Project')
      expect(state.activeProjectRole).toBe('annotator')
    })

    it('overwrites previous project context', () => {
      const { setActiveProject } = useProjectContextStore.getState()
      setActiveProject('proj-1', 'First', 'annotator')
      setActiveProject('proj-2', 'Second', 'project_owner')

      const state = useProjectContextStore.getState()
      expect(state.activeProjectId).toBe('proj-2')
      expect(state.activeProjectName).toBe('Second')
      expect(state.activeProjectRole).toBe('project_owner')
    })
  })

  describe('clearProject', () => {
    it('resets all fields to null', () => {
      const { setActiveProject, clearProject } = useProjectContextStore.getState()
      setActiveProject('proj-1', 'My Project', 'annotator')

      clearProject()

      const state = useProjectContextStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.activeProjectName).toBeNull()
      expect(state.activeProjectRole).toBeNull()
    })
  })

  describe('Multiple set/clear cycles', () => {
    it('works across repeated set and clear operations', () => {
      const { setActiveProject, clearProject } = useProjectContextStore.getState()

      setActiveProject('proj-1', 'First', 'viewer')
      expect(useProjectContextStore.getState().activeProjectId).toBe('proj-1')

      clearProject()
      expect(useProjectContextStore.getState().activeProjectId).toBeNull()

      setActiveProject('proj-2', 'Second', 'annotator')
      expect(useProjectContextStore.getState().activeProjectId).toBe('proj-2')
      expect(useProjectContextStore.getState().activeProjectName).toBe('Second')

      clearProject()
      expect(useProjectContextStore.getState().activeProjectId).toBeNull()

      setActiveProject('proj-3', 'Third', 'project_owner')
      expect(useProjectContextStore.getState().activeProjectId).toBe('proj-3')
      expect(useProjectContextStore.getState().activeProjectRole).toBe('project_owner')
    })
  })
})
