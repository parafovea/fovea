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

  describe('debounce stability — does not reschedule on identity churn', () => {
    // These tests pin the fix for the v0.4.0 regression where the
    // Edit Video Summary dialog shook at ~60 Hz because the
    // debounce useEffect listed `performSave` in its deps, and the
    // caller's onSave identity changed on every render (because
    // currentSummary changed on every TanStack Query refetch). The
    // fix holds performSave in a ref; the tests below verify it.

    it('data change triggers exactly one save after debounceMs', async () => {
      vi.useFakeTimers()
      try {
        const onSave = vi.fn().mockResolvedValue(undefined)
        const { rerender } = renderHook(
          ({ data }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'summary',
            }),
          { initialProps: { data: { v: 'initial' } } },
        )

        // Initial render schedules a save (data is non-empty and
        // differs from lastSavedDataRef which starts ''). Flush it.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // Change data. Expect exactly ONE additional save after the
        // debounce window — not one per intermediate render.
        rerender({ data: { v: 'changed' } })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('rerenders WITHOUT data change trigger zero saves', async () => {
      vi.useFakeTimers()
      try {
        const onSave = vi.fn().mockResolvedValue(undefined)
        // Pass the SAME data reference each render to assert that
        // useAutoSave does not save on identity-only churn of the
        // surrounding props.
        const data = { v: 'pinned' }
        const { rerender } = renderHook(
          ({ tick }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'summary',
              // tick is captured to force a rerender; useAutoSave
              // should ignore it because data is unchanged
              entityId: `tick-${tick}`,
            }),
          { initialProps: { tick: 0 } },
        )

        // Flush the initial save from the first render.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // Now force 20 rerenders WITHOUT touching data. The fixed
        // hook should NOT re-arm the debounce timer because data is
        // referentially identical; advance time and confirm zero
        // additional saves. The pre-fix hook would have rescheduled
        // a save on every render and the test would catch that as
        // multiple onSave calls.
        for (let i = 1; i <= 20; i++) {
          rerender({ tick: i })
        }
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        expect(onSave).toHaveBeenCalledTimes(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('swapping onSave mid-stream calls the LATEST onSave on the next scheduled save', async () => {
      vi.useFakeTimers()
      try {
        const onSaveA = vi.fn().mockResolvedValue(undefined)
        const onSaveB = vi.fn().mockResolvedValue(undefined)

        const { rerender } = renderHook(
          ({ data, onSave }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'summary',
            }),
          { initialProps: { data: { v: 'first' }, onSave: onSaveA } },
        )

        // Flush the initial save — should hit onSaveA.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSaveA).toHaveBeenCalledTimes(1)
        expect(onSaveB).toHaveBeenCalledTimes(0)
        onSaveA.mockClear()

        // Swap onSave AND change data so the next scheduled save fires.
        rerender({ data: { v: 'second' }, onSave: onSaveB })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        // The next save MUST use onSaveB (the latest closure), not the
        // onSaveA that was the value of `onSave` when the timer was
        // originally armed.
        expect(onSaveA).toHaveBeenCalledTimes(0)
        expect(onSaveB).toHaveBeenCalledTimes(1)
        expect(onSaveB).toHaveBeenCalledWith({ v: 'second' })
      } finally {
        vi.useRealTimers()
      }
    })

    it('swapping onSave WITHOUT a data change does not schedule a new save', async () => {
      // A pure identity churn of onSave (the v0.4.0 regression
      // pattern — currentSummary changes object identity on every
      // refetch, which cascades to handleAutoSave, which cascades to
      // performSave, which used to retrigger the debounce effect)
      // must NOT cause a save. Confirms the ref-based fix isolates
      // the schedule from the callback identity.
      vi.useFakeTimers()
      try {
        const data = { v: 'pinned' }
        const onSaveA = vi.fn().mockResolvedValue(undefined)
        const onSaveB = vi.fn().mockResolvedValue(undefined)

        const { rerender } = renderHook(
          ({ onSave }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'summary',
            }),
          { initialProps: { onSave: onSaveA } },
        )

        // Flush initial save.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSaveA).toHaveBeenCalledTimes(1)
        onSaveA.mockClear()

        // Swap onSave 10 times without touching data. Zero saves.
        for (let i = 0; i < 10; i++) {
          rerender({ onSave: i % 2 === 0 ? onSaveB : onSaveA })
        }
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        expect(onSaveA).toHaveBeenCalledTimes(0)
        expect(onSaveB).toHaveBeenCalledTimes(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
