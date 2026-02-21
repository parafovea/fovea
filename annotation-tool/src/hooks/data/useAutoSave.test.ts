/**
 * Unit tests for useAutoSave hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'

// Mock dependencies
vi.mock('../../services/errorLogging', () => ({
  logWarning: vi.fn(),
  logCritical: vi.fn(),
}))

vi.mock('../../telemetry/tracing', () => ({
  withSpan: vi.fn((_name, _attrs, fn) => fn({ setAttribute: vi.fn() })),
}))

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('returns correct initial values', () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: false,
          onSave,
          entityType: 'annotation',
        })
      )

      expect(result.current.saveStatus).toBe('idle')
      expect(result.current.lastSavedAt).toBeNull()
      expect(result.current.errorMessage).toBeNull()
      expect(result.current.retryCount).toBe(0)
      expect(typeof result.current.forceSave).toBe('function')
    })
  })

  describe('disabled state', () => {
    it('does not save when disabled', async () => {
      vi.useFakeTimers()
      const onSave = vi.fn().mockResolvedValue(undefined)

      renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: false,
          onSave,
          debounceMs: 100,
          entityType: 'annotation',
        })
      )

      // Advance past debounce time
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(onSave).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('forceSave', () => {
    it('calls onSave immediately', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          debounceMs: 10000, // Long debounce
          entityType: 'annotation',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      expect(onSave).toHaveBeenCalledWith({ value: 'test' })
      expect(result.current.saveStatus).toBe('saved')
      expect(result.current.lastSavedAt).not.toBeNull()
    })

    it('updates status to saved on success', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          entityType: 'annotation',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      expect(result.current.saveStatus).toBe('saved')
      expect(result.current.pendingChanges).toBe(false)
    })

    it('does not save if data unchanged since last save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          entityType: 'annotation',
        })
      )

      // First save
      await act(async () => {
        await result.current.forceSave()
      })

      expect(onSave).toHaveBeenCalledTimes(1)

      // Try to save again with same data
      await act(async () => {
        await result.current.forceSave()
      })

      // Should not call onSave again
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('sets error status when save fails after all retries', async () => {
      const error = new Error('Save failed')
      const onSave = vi.fn().mockRejectedValue(error)

      vi.useFakeTimers()

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          debounceMs: 10000,
          maxRetries: 1, // Only 1 retry allowed (no retries)
          entityType: 'annotation',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      // Should be in error state after single failure with maxRetries=1
      expect(result.current.saveStatus).toBe('error')
      expect(result.current.errorMessage).toBe('Save failed')

      vi.useRealTimers()
    })

    it('reports error via logCritical when retries exhausted', async () => {
      const { logCritical } = await import('../../services/errorLogging')
      const error = new Error('Save failed')
      const onSave = vi.fn().mockRejectedValue(error)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          maxRetries: 1,
          entityType: 'annotation',
          entityId: 'test-id',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      expect(logCritical).toHaveBeenCalledWith(error, {
        component: 'useAutoSave:annotation',
        entityId: 'test-id',
      })
    })

    it('does not retry on 401 auth errors', async () => {
      const { logWarning, logCritical } = await import('../../services/errorLogging')
      const error = new Error('401 Unauthorized')
      const onSave = vi.fn().mockRejectedValue(error)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          maxRetries: 3, // Would normally retry 3 times
          entityType: 'annotation',
          entityId: 'test-id',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      // Should only be called once - no retries for auth errors
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(result.current.saveStatus).toBe('error')
      expect(result.current.errorMessage).toBe('Session expired. Please log in again.')
      // Should NOT log as critical for auth errors
      expect(logCritical).not.toHaveBeenCalled()
      // Should log as warning instead
      expect(logWarning).toHaveBeenCalledWith(
        'annotation save failed due to auth error',
        expect.objectContaining({ entityId: 'test-id' })
      )
    })
  })

  describe('pendingChanges tracking', () => {
    it('clears pendingChanges after successful save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          entityType: 'annotation',
        })
      )

      await act(async () => {
        await result.current.forceSave()
      })

      expect(result.current.pendingChanges).toBe(false)
    })
  })

  describe('return value types', () => {
    it('returns correct types', () => {
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { value: 'test' },
          isEnabled: true,
          onSave,
          entityType: 'annotation',
        })
      )

      expect(['idle', 'saving', 'saved', 'error', 'retrying']).toContain(
        result.current.saveStatus
      )
      expect(
        result.current.lastSavedAt === null ||
          result.current.lastSavedAt instanceof Date
      ).toBe(true)
      expect(typeof result.current.pendingChanges).toBe('boolean')
      expect(
        result.current.errorMessage === null ||
          typeof result.current.errorMessage === 'string'
      ).toBe(true)
      expect(typeof result.current.retryCount).toBe('number')
      expect(typeof result.current.forceSave).toBe('function')
    })
  })
})
