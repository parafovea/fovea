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

    it('forceSave saves even when data is unchanged since the last save', async () => {
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

      // forceSave is the explicit "save now" path: it bypasses change
      // detection and fires again even when the comparison snapshot is
      // unchanged. This matters for discrete edits (e.g. adding a keyframe)
      // whose mutation has not yet reached the data ref when the caller
      // forces the save — the change-detection debounce alone would skip it.
      await act(async () => {
        await result.current.forceSave()
      })

      expect(onSave).toHaveBeenCalledTimes(2)
    })

    it('forceSave(dataOverride) persists the override, not the render-time data', async () => {
      // The annotation workspace adds a keyframe by mutating the query cache,
      // then forces a save in the SAME tick — before the cache update has
      // propagated back into the `data` prop. Without an override the hook
      // would read the stale (pre-keyframe) data and silently drop the edit.
      // Passing the freshly-mutated array as dataOverride persists it exactly.
      const onSave = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() =>
        useAutoSave({
          data: { boxes: ['kf@0'] },
          isEnabled: true,
          onSave,
          debounceMs: 100000, // never debounce-fire on its own
          periodicMs: 0,
          entityType: 'annotation',
        })
      )

      const edited = { boxes: ['kf@0', 'kf@20'] }
      await act(async () => {
        await result.current.forceSave(edited)
      })

      // onSave received the override, not the render-time { boxes: ['kf@0'] }.
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(edited)
    })

    it('forceSave(dataOverride) updates the change baseline so a later identical render does not re-save', async () => {
      // After a forced override save, a subsequent render whose data now equals
      // the override (the cache update finally propagating) must NOT look like a
      // fresh change and fire a second save — that would be the idle loop.
      vi.useFakeTimers()
      try {
        const onSave = vi.fn().mockResolvedValue(undefined)
        const edited = { boxes: ['kf@0', 'kf@20'] }

        const { result, rerender } = renderHook(
          ({ data }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'annotation',
            }),
          { initialProps: { data: { boxes: ['kf@0'] } as { boxes: string[] } } },
        )

        // Flush the initial save of the starting data.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        onSave.mockClear()

        // Force the override save (the keyframe edit).
        await act(async () => {
          await result.current.forceSave(edited)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // The cache update now reaches `data`. Its serialized snapshot equals
        // the override already persisted, so no additional save fires.
        rerender({ data: edited })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        expect(onSave).toHaveBeenCalledTimes(0)
      } finally {
        vi.useRealTimers()
      }
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

  describe('getComparisonSnapshot — ignores server-managed fields', () => {
    // Change detection runs through getComparisonSnapshot when provided. The
    // annotation workspace passes a snapshot that strips server-managed
    // timestamps so a post-save refetch echoing a fresh updatedAt into the
    // cache does not read as a real edit and re-fire a save (the idle loop).

    it('does not save when only a stripped server field changes', async () => {
      vi.useFakeTimers()
      try {
        const onSave = vi.fn().mockResolvedValue(undefined)
        const getComparisonSnapshot = (d: { value: string; updatedAt: string }) => ({
          value: d.value,
        })
        const { rerender } = renderHook(
          ({ data }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'annotation',
              getComparisonSnapshot,
            }),
          { initialProps: { data: { value: 'box', updatedAt: '2025-01-01T00:00:00Z' } } },
        )

        // Flush the initial save (data differs from the empty baseline).
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // Simulate the post-save refetch: a new object identity whose only
        // difference is the server-managed updatedAt. The stripped snapshot
        // is unchanged, so no save should fire.
        rerender({ data: { value: 'box', updatedAt: '2025-06-19T12:00:00Z' } })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        expect(onSave).toHaveBeenCalledTimes(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('saves when a content field changes even if a stripped field also changes', async () => {
      vi.useFakeTimers()
      try {
        const onSave = vi.fn().mockResolvedValue(undefined)
        const getComparisonSnapshot = (d: { value: string; updatedAt: string }) => ({
          value: d.value,
        })
        const { rerender } = renderHook(
          ({ data }) =>
            useAutoSave({
              data,
              isEnabled: true,
              onSave,
              debounceMs: 100,
              periodicMs: 0,
              entityType: 'annotation',
              getComparisonSnapshot,
            }),
          { initialProps: { data: { value: 'box', updatedAt: '2025-01-01T00:00:00Z' } } },
        )

        // Flush the initial save.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // A real edit: the content field changes (updatedAt also bumps, as it
        // would in practice). Exactly one save should fire, and onSave still
        // receives the full data, not the stripped snapshot.
        rerender({ data: { value: 'edited box', updatedAt: '2025-06-19T12:00:00Z' } })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        expect(onSave).toHaveBeenCalledWith({
          value: 'edited box',
          updatedAt: '2025-06-19T12:00:00Z',
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('falls back to comparing whole data when no snapshot is provided', async () => {
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
              entityType: 'annotation',
            }),
          { initialProps: { data: { value: 'box', updatedAt: '2025-01-01T00:00:00Z' } } },
        )

        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
        onSave.mockClear()

        // Without a snapshot, the timestamp change is part of the compared
        // value, so it does count as a change and a save fires. This pins the
        // default (back-compatible) behavior other callers rely on.
        rerender({ data: { value: 'box', updatedAt: '2025-06-19T12:00:00Z' } })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150)
        })
        expect(onSave).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
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
