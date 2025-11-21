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
  /**
   * Timestamp of last API load. When this changes, it signals that annotations
   * were just loaded from the database and should not trigger auto-save.
   * This provides explicit, deterministic tracking instead of heuristics.
   */
  lastLoadTimestamp: number
  /** Debounce delay in milliseconds (default: 1000ms to match ontology/world) */
  debounceMs?: number
}

/**
 * @hook useAutoSaveAnnotations
 * @description Automatically saves annotations to the database with debouncing.
 *
 * @param params - Hook parameters
 *
 * @example
 * ```tsx
 * useAutoSaveAnnotations({
 *   videoId,
 *   personaId,
 *   annotations,
 *   lastLoadTimestamp,
 *   debounceMs: 1000
 * })
 * ```
 */
export function useAutoSaveAnnotations({
  videoId,
  personaId,
  annotations,
  lastLoadTimestamp,
  debounceMs = 1000,
}: UseAutoSaveAnnotationsParams): void {
  const dispatch = useDispatch<AppDispatch>()
  const previousAnnotationsRef = useRef<Annotation[]>([])
  const loadedAnnotationIdsRef = useRef<Set<string>>(new Set())
  const lastProcessedLoadTimestampRef = useRef<number>(0)

  // When lastLoadTimestamp changes, it means annotations were just loaded from API
  // Update our tracking of which IDs came from the database
  useEffect(() => {
    if (lastLoadTimestamp !== lastProcessedLoadTimestampRef.current) {
      // Clear and rebuild the set of loaded IDs based on current annotations
      loadedAnnotationIdsRef.current.clear()
      annotations.forEach(ann => {
        if (ann.id) {
          loadedAnnotationIdsRef.current.add(ann.id)
        }
      })

      // Update our reference so we know this is the baseline
      previousAnnotationsRef.current = annotations
      lastProcessedLoadTimestampRef.current = lastLoadTimestamp
    }
  }, [lastLoadTimestamp, annotations])

  // Auto-save annotations on changes (debounced)
  // This matches the pattern used by OntologyWorkspace and ObjectWorkspace
  useEffect(() => {
    if (!videoId) {
      return
    }

    // Check if annotations actually changed
    const currentStr = JSON.stringify(annotations)
    const previousStr = JSON.stringify(previousAnnotationsRef.current)
    if (currentStr === previousStr) {
      return
    }

    // Skip auto-save if this change happened immediately after a load
    // We track this explicitly via lastLoadTimestamp
    if (lastLoadTimestamp === lastProcessedLoadTimestampRef.current &&
        previousAnnotationsRef.current === annotations) {
      return
    }

    const timeoutId = setTimeout(() => {
      if (annotations.length === 0) {
        return
      }

      dispatch(saveAnnotations({
        videoId,
        personaId,
        annotations,
        loadedAnnotationIds: Array.from(loadedAnnotationIdsRef.current) // Convert Set to Array for Redux
      }))
    }, debounceMs)

    // Update ref immediately so we can detect future changes
    previousAnnotationsRef.current = annotations

    return () => clearTimeout(timeoutId)
  }, [videoId, personaId, annotations, lastLoadTimestamp, debounceMs, dispatch])
}
