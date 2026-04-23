// @vitest-environment happy-dom
/**
 * Unit tests for the pure merge helpers in ``useInferencePreferences``.
 *
 * The hook-level behavior (TanStack Query integration, optimistic updates)
 * is exercised in component tests; this suite pins the deterministic merge
 * rules that the hook composes on top: persona overrides win over
 * user-level prefs, nulls collapse to "use backend default" (absent key in
 * the wire payload), and an all-null document produces ``undefined``.
 */

import { describe, it, expect } from 'vitest'
import {
  EMPTY_PREFERENCES,
  compactPreferences,
  mergeOverrides,
  type InferencePreferences,
} from './useInferencePreferences'
import type { PersonaInferenceOverrides } from '@/api/client'

describe('compactPreferences', () => {
  it('returns undefined when every field is null or undefined', () => {
    const result = compactPreferences({ a: null, b: undefined })
    expect(result).toBeUndefined()
  })

  it('drops null and undefined entries but keeps falsy non-null values', () => {
    const result = compactPreferences({ a: 0, b: '', c: false, d: null, e: undefined })
    expect(result).toEqual({ a: 0, b: '', c: false })
  })
})

describe('mergeOverrides', () => {
  const baseUser: InferencePreferences = {
    ...EMPTY_PREFERENCES,
    generation: { temperature: 0.3, topP: 0.9, maxTokens: 512 },
  }

  it('produces user-level values when persona has no overrides', () => {
    const merged = mergeOverrides(baseUser, {})
    expect(merged.generation).toEqual({ temperature: 0.3, topP: 0.9, maxTokens: 512 })
  })

  it('persona override wins over user value on the same field', () => {
    const persona: PersonaInferenceOverrides = {
      generation: { temperature: 0.9 },
    }
    const merged = mergeOverrides(baseUser, persona)
    expect(merged.generation?.temperature).toBe(0.9)
    expect(merged.generation?.topP).toBe(0.9)
    expect(merged.generation?.maxTokens).toBe(512)
  })

  it('returns undefined for generation when every source field is absent', () => {
    const merged = mergeOverrides(EMPTY_PREFERENCES, {})
    expect(merged.generation).toBeUndefined()
    expect(merged.audio).toBeUndefined()
  })

  it('persona audio override merges per field without clobbering unset ones', () => {
    const user: InferencePreferences = {
      ...EMPTY_PREFERENCES,
      audio: {
        beamSize: 5,
        computeType: 'float16',
        numSpeakers: null,
        minSpeakers: null,
        maxSpeakers: null,
        vadThreshold: 0.4,
      },
    }
    const persona: PersonaInferenceOverrides = {
      audio: { beamSize: 10 },
    }
    const merged = mergeOverrides(user, persona)
    expect(merged.audio).toEqual({
      beamSize: 10,
      computeType: 'float16',
      vadThreshold: 0.4,
    })
  })
})
