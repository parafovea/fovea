/**
 * @module useAutoSaveAnnotations
 * @description Hook for automatically saving annotations to the database.
 * Follows the same pattern as ontology and world object auto-save:
 * - Simple debounced save using Redux async thunk
 * - Tracks which IDs were initially loaded to distinguish create vs update
 * - Prevents saving on initial load (annotations just fetched from database)
 */

import { useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '../store/store'
import { saveAnnotations } from '../store/annotationSlice'
import { Annotation } from '../models/types'

/**
 * @interface UseAutoSaveAnnotationsParams
 * @description Parameters for useAutoSaveAnnotations hook.
 */
interface UseAutoSaveAnnotationsParams {
  /** Video ID for annotations */
  videoId: string | undefined
  /** Persona ID for filtering annotations */
  personaId: string | null
  /** Annotations to auto-save */
  annotations: Annotation[]
  /** Debounce delay in milliseconds (default: 1000ms to match ontology/world) */
  debounceMs?: number
}

/**
 * @hook useAutoSaveAnnotations
 * @description Automatically saves annotations to the database with debouncing.
 * Simplified to match the ontology/world object auto-save pattern.
 *
 * Key improvements:
 * - Uses Redux async thunk instead of direct API calls
 * - Consistent with other auto-save implementations
 * - Simpler logic, easier to maintain
 * - Tracks loaded IDs only on initial fetch
 *
 * @param params - Hook parameters
 *
 * @example
 * ```tsx
 * useAutoSaveAnnotations({
 *   videoId,
 *   personaId,
 *   annotations,
 *   debounceMs: 1000
 * })
 * ```
 */
export function useAutoSaveAnnotations({
  videoId,
  personaId,
  annotations,
  debounceMs = 1000,
}: UseAutoSaveAnnotationsParams): void {
  const dispatch = useDispatch<AppDispatch>()
  const isInitialLoadRef = useRef(true)
  const loadedAnnotationIdsRef = useRef<Set<string>>(new Set())

  // Track loaded annotation IDs on initial load
  useEffect(() => {
    if (isInitialLoadRef.current && annotations.length > 0) {
      isInitialLoadRef.current = false
      // Store IDs of initially loaded annotations
      annotations.forEach(ann => {
        if (ann.id) {
          loadedAnnotationIdsRef.current.add(ann.id)
        }
      })
    }
  }, [annotations])

  // Auto-save annotations on changes (debounced)
  // This matches the pattern used by OntologyWorkspace and ObjectWorkspace
  useEffect(() => {
    if (!videoId) return

    const timeoutId = setTimeout(() => {
      // Don't save if we're still on initial load or no annotations
      if (isInitialLoadRef.current || annotations.length === 0) return

      dispatch(saveAnnotations({
        videoId,
        personaId,
        annotations,
        loadedAnnotationIds: loadedAnnotationIdsRef.current
      }))
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [videoId, personaId, annotations, debounceMs, dispatch])
}
