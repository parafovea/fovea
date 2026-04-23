/**
 * User-level overrides for inference parameters.
 *
 * Persisted to localStorage under a single namespaced key. Fields map 1:1 to
 * the ``GenerationOverrides`` / ``AudioOverrides`` shapes accepted by the
 * backend summarization endpoint, so merging them into a request body is
 * direct. A field set to ``null`` means "use backend default" — equivalent
 * to omitting the override.
 */

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'fovea.inferencePreferences.v1'

export interface GenerationPreferences {
  temperature: number | null
  topP: number | null
  maxTokens: number | null
}

export interface AudioPreferences {
  beamSize: number | null
  computeType: 'float16' | 'float32' | 'int8' | 'int8_float16' | null
  numSpeakers: number | null
  minSpeakers: number | null
  maxSpeakers: number | null
  vadThreshold: number | null
}

export interface DetectionPreferences {
  confidenceThreshold: number | null
}

export interface InferencePreferences {
  generation: GenerationPreferences
  audio: AudioPreferences
  detection: DetectionPreferences
}

const emptyPreferences: InferencePreferences = {
  generation: { temperature: null, topP: null, maxTokens: null },
  audio: {
    beamSize: null,
    computeType: null,
    numSpeakers: null,
    minSpeakers: null,
    maxSpeakers: null,
    vadThreshold: null,
  },
  detection: { confidenceThreshold: null },
}

function readPreferences(): InferencePreferences {
  if (typeof window === 'undefined') {
    return emptyPreferences
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyPreferences
    const parsed = JSON.parse(raw) as Partial<InferencePreferences>
    return {
      generation: { ...emptyPreferences.generation, ...parsed.generation },
      audio: { ...emptyPreferences.audio, ...parsed.audio },
      detection: { ...emptyPreferences.detection, ...parsed.detection },
    }
  } catch {
    return emptyPreferences
  }
}

// Keep a stable snapshot so useSyncExternalStore's getSnapshot returns the
// same reference between renders when nothing has changed.
let currentSnapshot: InferencePreferences = readPreferences()

function writePreferences(next: InferencePreferences): void {
  currentSnapshot = next
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  listeners.forEach((listener) => {
    listener()
  })
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): InferencePreferences {
  return currentSnapshot
}

/**
 * Read + write inference-time preferences.
 *
 * The returned updater accepts either a full ``InferencePreferences`` or a
 * partial patch scoped to one subgroup. Changes persist synchronously to
 * localStorage and re-render every subscribed component.
 */
export function useInferencePreferences(): {
  preferences: InferencePreferences
  setGeneration: (patch: Partial<GenerationPreferences>) => void
  setAudio: (patch: Partial<AudioPreferences>) => void
  setDetection: (patch: Partial<DetectionPreferences>) => void
  resetAll: () => void
} {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setGeneration = useCallback((patch: Partial<GenerationPreferences>) => {
    writePreferences({
      ...currentSnapshot,
      generation: { ...currentSnapshot.generation, ...patch },
    })
  }, [])

  const setAudio = useCallback((patch: Partial<AudioPreferences>) => {
    writePreferences({
      ...currentSnapshot,
      audio: { ...currentSnapshot.audio, ...patch },
    })
  }, [])

  const setDetection = useCallback((patch: Partial<DetectionPreferences>) => {
    writePreferences({
      ...currentSnapshot,
      detection: { ...currentSnapshot.detection, ...patch },
    })
  }, [])

  const resetAll = useCallback(() => {
    writePreferences(emptyPreferences)
  }, [])

  return { preferences, setGeneration, setAudio, setDetection, resetAll }
}

/**
 * Drop ``null`` entries from a preferences record so the wire payload only
 * carries explicit overrides. Useful when building a request body that
 * includes the override blocks.
 */
export function compactPreferences<T extends Record<string, unknown>>(
  preferences: T
): Partial<T> | undefined {
  const out: Partial<T> = {}
  let hasAny = false
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== null && value !== undefined) {
      out[key as keyof T] = value as T[keyof T]
      hasAny = true
    }
  }
  return hasAny ? out : undefined
}
