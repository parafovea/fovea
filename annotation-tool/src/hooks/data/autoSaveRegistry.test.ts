/**
 * Unit tests for the auto-save flush registry.
 */

import { describe, it, expect } from 'vitest'
import { registerAutoSaveFlush, flushAllAutoSaves } from './autoSaveRegistry'

describe('flushAllAutoSaves', () => {
  it('counts only editors that actually persisted, not blocked/skipped/superseded no-ops', async () => {
    // A resolved flush that wrote nothing (blocked by an in-flight save, skipped
    // by change detection, or superseded by a newer force) must not be tallied
    // as saved — otherwise the session-expiry flush over-reports preservation.
    const unregister = [
      registerAutoSaveFlush(async () => 'saved'),
      registerAutoSaveFlush(async () => 'saved'),
      registerAutoSaveFlush(async () => 'skipped'),
      registerAutoSaveFlush(async () => 'blocked'),
      registerAutoSaveFlush(async () => 'superseded'),
      registerAutoSaveFlush(async () => {
        throw new Error('boom')
      }),
    ]

    try {
      const { saved, errors } = await flushAllAutoSaves()
      expect(saved).toBe(2)
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('boom')
    } finally {
      unregister.forEach((u) => u())
    }
  })

  it('reports zero saved when every editor no-ops', async () => {
    const unregister = [
      registerAutoSaveFlush(async () => 'blocked'),
      registerAutoSaveFlush(async () => 'skipped'),
    ]
    try {
      const { saved, errors } = await flushAllAutoSaves()
      expect(saved).toBe(0)
      expect(errors).toHaveLength(0)
    } finally {
      unregister.forEach((u) => u())
    }
  })
})
