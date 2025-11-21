/**
 * @module useAutoSaveAnnotations
 * @description Hook for automatically saving annotations to the database.
 * Provides debounced auto-save functionality to prevent excessive API calls
 * while ensuring user data is persisted immediately after creation.
 */

import { useEffect, useRef } from 'react'
import { api } from '../services/api'
import { Annotation } from '../models/types'

/**
 * @interface UseAutoSaveAnnotationsParams
 * @description Parameters for useAutoSaveAnnotations hook.
 */
interface UseAutoSaveAnnotationsParams {
  /** Video ID for annotations */
  videoId: string | undefined
  /** Annotations to auto-save */
  annotations: Annotation[]
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs?: number
}

/**
 * @hook useAutoSaveAnnotations
 * @description Automatically saves annotations to the database with debouncing.
 * - Skips saving on initial load when annotations are loaded from database
 * - Debounces all annotation saves to avoid excessive API calls
 * - Attempts update first, falls back to create if annotation doesn't exist
 * - Handles errors gracefully with console logging
 *
 * @param params - Hook parameters
 *
 * @example
 * ```tsx
 * useAutoSaveAnnotations({
 *   videoId,
 *   annotations,
 *   debounceMs: 500
 * })
 * ```
 */
export function useAutoSaveAnnotations({
  videoId,
  annotations,
  debounceMs = 500,
}: UseAutoSaveAnnotationsParams): void {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const previousAnnotationsRef = useRef<Annotation[]>([])
  const isInitialLoadRef = useRef(true)
  const savedAnnotationIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!videoId || annotations.length === 0) return

    // Skip auto-save on initial load (annotations just loaded from database)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      previousAnnotationsRef.current = annotations
      // Mark all initially loaded annotations as saved
      annotations.forEach(ann => {
        if (ann.id) savedAnnotationIdsRef.current.add(ann.id)
      })
      return
    }

    // Check if annotations actually changed
    if (JSON.stringify(annotations) === JSON.stringify(previousAnnotationsRef.current)) {
      return
    }

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounced save for all annotations
    saveTimeoutRef.current = setTimeout(async () => {
      // Capture current annotations at save time
      const annotationsToSave = annotations
      for (const annotation of annotationsToSave) {
        try {
          if (annotation.id) {
            if (savedAnnotationIdsRef.current.has(annotation.id)) {
              // Annotation exists in database, update it
              await api.updateAnnotation(annotation)
            } else {
              // New annotation, create it
              await api.saveAnnotation(annotation)
              savedAnnotationIdsRef.current.add(annotation.id)
            }
          }
        } catch (error) {
          console.error('Failed to auto-save annotation:', error)
        }
      }
    }, debounceMs)

    // Update ref immediately, not in timeout
    previousAnnotationsRef.current = annotations

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [videoId, annotations, debounceMs])
}
