/**
 * Server-backed user and persona inference preferences.
 *
 * Replaces the earlier localStorage-only implementation with TanStack Query
 * reads and mutations against ``/api/me/preferences`` and
 * ``/api/personas/:id/preferences``. A session-lived localStorage draft is
 * kept so slider drags feel instantaneous even while the network write is
 * in flight — the draft is always overwritten by a fresh server response.
 *
 * Merge order at request submit time:
 *   backend dataclass default (from ``/api/models/defaults``)
 *     ↓ user-level preferences (this hook's ``preferences``)
 *       ↓ persona-level overrides (``usePersonaPreferences(personaId)``)
 *         ↓ per-request overrides from a dialog (not this hook)
 *
 * A helper ``mergeOverrides`` produces the single ``GenerationOverrides`` /
 * ``AudioOverrides`` block that lands in the outgoing request body.
 */

import { useCallback, useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query'
import {
  apiClient,
  ApiError,
  AudioOverridesRequest,
  GenerationOverridesRequest,
  PersonaInferenceOverrides,
  PersonaPreferencesResponse,
  UserInferencePreferences,
  UserPreferencesResponse,
} from '@api/client'

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

export const EMPTY_PREFERENCES: InferencePreferences = {
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

export const preferenceKeys = {
  all: ['preferences'] as const,
  me: () => [...preferenceKeys.all, 'me'] as const,
  persona: (personaId: string) => [...preferenceKeys.all, 'persona', personaId] as const,
}

// ---------- user-level hook ----------

/**
 * Read+write hook for the current user's inference preferences.
 *
 * Returns the same shape the earlier localStorage implementation did so
 * callers don't need to change, plus a ``isLoading`` flag while the first
 * fetch resolves. Setters issue PUTs against the full document — there is
 * no server-side patch endpoint by design, since the document is small.
 */
export function useInferencePreferences(
  options?: Omit<UseQueryOptions<UserPreferencesResponse, ApiError>, 'queryKey' | 'queryFn'>
): {
  preferences: InferencePreferences
  isLoading: boolean
  setGeneration: (patch: Partial<GenerationPreferences>) => void
  setAudio: (patch: Partial<AudioPreferences>) => void
  setDetection: (patch: Partial<DetectionPreferences>) => void
  resetAll: () => void
} {
  const queryClient = useQueryClient()

  const query = useQuery<UserPreferencesResponse, ApiError>({
    queryKey: preferenceKeys.me(),
    queryFn: () => apiClient.getMyPreferences(),
    staleTime: 60 * 1000,
    ...options,
  })

  const mutation = useMutation<UserPreferencesResponse, ApiError, UserInferencePreferences>({
    mutationFn: (prefs) =>
      apiClient.updateMyPreferences({ inferencePreferences: prefs }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: preferenceKeys.me() })
      const previous = queryClient.getQueryData<UserPreferencesResponse>(preferenceKeys.me())
      queryClient.setQueryData<UserPreferencesResponse>(preferenceKeys.me(), {
        inferencePreferences: next,
        updatedAt: new Date().toISOString(),
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      const snapshot = ctx as { previous?: UserPreferencesResponse } | undefined
      if (snapshot?.previous) {
        queryClient.setQueryData(preferenceKeys.me(), snapshot.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: preferenceKeys.me() })
    },
  })

  const preferences = query.data?.inferencePreferences ?? EMPTY_PREFERENCES

  const writePatch = useCallback(
    (
      scope: 'generation' | 'audio' | 'detection',
      patch: Partial<GenerationPreferences | AudioPreferences | DetectionPreferences>
    ) => {
      const current = query.data?.inferencePreferences ?? EMPTY_PREFERENCES
      const next: InferencePreferences = {
        ...current,
        [scope]: { ...current[scope], ...patch },
      }
      mutation.mutate(next)
    },
    [mutation, query.data]
  )

  const setGeneration = useCallback(
    (patch: Partial<GenerationPreferences>) => {
      writePatch('generation', patch)
    },
    [writePatch]
  )
  const setAudio = useCallback(
    (patch: Partial<AudioPreferences>) => {
      writePatch('audio', patch)
    },
    [writePatch]
  )
  const setDetection = useCallback(
    (patch: Partial<DetectionPreferences>) => {
      writePatch('detection', patch)
    },
    [writePatch]
  )
  const resetAll = useCallback(() => {
    mutation.mutate(EMPTY_PREFERENCES)
  }, [mutation])

  return {
    preferences,
    isLoading: query.isLoading,
    setGeneration,
    setAudio,
    setDetection,
    resetAll,
  }
}

// ---------- persona-level hook ----------

/**
 * Read+write hook for a persona's override document. Partial at every
 * level; fields absent from the document fall through to user-level prefs.
 */
export function usePersonaPreferences(
  personaId: string | null,
  options?: Omit<UseQueryOptions<PersonaPreferencesResponse, ApiError>, 'queryKey' | 'queryFn'>
): {
  overrides: PersonaInferenceOverrides
  isLoading: boolean
  setOverrides: (next: PersonaInferenceOverrides) => void
  resetAll: () => void
} {
  const queryClient = useQueryClient()
  const key = personaId ? preferenceKeys.persona(personaId) : preferenceKeys.persona('__none__')

  const query = useQuery<PersonaPreferencesResponse, ApiError>({
    queryKey: key,
    queryFn: () => {
      if (!personaId) {
        return Promise.resolve<PersonaPreferencesResponse>({
          personaId: '',
          inferencePreferences: {},
          updatedAt: new Date(0).toISOString(),
        })
      }
      return apiClient.getPersonaPreferences(personaId)
    },
    enabled: Boolean(personaId),
    staleTime: 60 * 1000,
    ...options,
  })

  const mutation = useMutation<PersonaPreferencesResponse, ApiError, PersonaInferenceOverrides>({
    mutationFn: (overrides) => {
      if (!personaId) {
        return Promise.reject(new Error('personaId required to update persona preferences'))
      }
      return apiClient.updatePersonaPreferences(personaId, { inferencePreferences: overrides })
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PersonaPreferencesResponse>(key)
      queryClient.setQueryData<PersonaPreferencesResponse>(key, {
        personaId: personaId ?? '',
        inferencePreferences: next,
        updatedAt: new Date().toISOString(),
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      const snapshot = ctx as { previous?: PersonaPreferencesResponse } | undefined
      if (snapshot?.previous) {
        queryClient.setQueryData(key, snapshot.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })

  const overrides = query.data?.inferencePreferences ?? {}

  return {
    overrides,
    isLoading: query.isLoading,
    setOverrides: (next) => {
      mutation.mutate(next)
    },
    resetAll: () => {
      mutation.mutate({})
    },
  }
}

// ---------- merge helpers ----------

/**
 * Drop ``null``/``undefined`` entries from a preferences object so the wire
 * payload only carries explicit overrides. Returns ``undefined`` if every
 * field is absent.
 */
export function compactPreferences<T extends object>(preferences: T): Partial<T> | undefined {
  const out: Partial<T> = {}
  let hasAny = false
  for (const [key, value] of Object.entries(preferences) as Array<[keyof T, T[keyof T]]>) {
    if (value !== null && value !== undefined) {
      out[key] = value
      hasAny = true
    }
  }
  return hasAny ? out : undefined
}

/**
 * Merge user + persona preferences into a single wire payload pair.
 *
 * Persona overrides win when both levels set the same field. Fields that
 * are null at the user level (explicit "defer to default") and absent at
 * the persona level are dropped entirely so the backend falls back to its
 * dataclass default.
 */
export function mergeOverrides(
  user: InferencePreferences,
  persona: PersonaInferenceOverrides
): {
  generation: GenerationOverridesRequest | undefined
  audio: AudioOverridesRequest | undefined
} {
  const gen: GenerationOverridesRequest = {
    temperature: persona.generation?.temperature ?? user.generation.temperature ?? undefined,
    topP: persona.generation?.topP ?? user.generation.topP ?? undefined,
    maxTokens: persona.generation?.maxTokens ?? user.generation.maxTokens ?? undefined,
  }
  const audio: AudioOverridesRequest = {
    beamSize: persona.audio?.beamSize ?? user.audio.beamSize ?? undefined,
    computeType: persona.audio?.computeType ?? user.audio.computeType ?? undefined,
    numSpeakers: persona.audio?.numSpeakers ?? user.audio.numSpeakers ?? undefined,
    minSpeakers: persona.audio?.minSpeakers ?? user.audio.minSpeakers ?? undefined,
    maxSpeakers: persona.audio?.maxSpeakers ?? user.audio.maxSpeakers ?? undefined,
    vadThreshold: persona.audio?.vadThreshold ?? user.audio.vadThreshold ?? undefined,
  }
  return {
    generation: compactPreferences(gen),
    audio: compactPreferences(audio),
  }
}

/**
 * Convenience hook returning the merged wire payload for the current user
 * and a given persona. Memoized so a render that passes the same persona
 * doesn't allocate fresh objects.
 */
export function useMergedOverrides(personaId: string | null): {
  generationOverrides: GenerationOverridesRequest | undefined
  audioOverrides: AudioOverridesRequest | undefined
} {
  const { preferences } = useInferencePreferences()
  const { overrides: personaOverrides } = usePersonaPreferences(personaId)

  return useMemo(() => {
    const merged = mergeOverrides(preferences, personaOverrides)
    return {
      generationOverrides: merged.generation,
      audioOverrides: merged.audio,
    }
  }, [preferences, personaOverrides])
}
