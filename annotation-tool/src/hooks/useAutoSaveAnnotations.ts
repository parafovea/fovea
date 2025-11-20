/**
 * @module useAutoSaveAnnotations
 * @description Hook for automatically saving annotations to the database.
 * Provides debounced auto-save functionality to prevent excessive API calls
 * while ensuring user data is persisted immediately after creation.
 */

import { useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '../store/store'
import { updateAnnotation } from '../store/annotationSlice'
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
 * - Immediately saves new annotations (temporary IDs starting with 'temp-')
 * - Debounces updates to existing annotations to avoid excessive API calls
 * - Updates Redux state with real database IDs after successful save
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
  const dispatch = useDispatch<AppDispatch>()
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const previousAnnotationsRef = useRef<Annotation[]>([])

  useEffect(() => {
    if (!videoId || annotations.length === 0) return

    // Find new annotations (with temporary IDs) that need immediate saving
    const newAnnotations = annotations.filter(
      (annotation) =>
        annotation.id &&
        annotation.id.startsWith('temp-') &&
        !previousAnnotationsRef.current.some((prev) => prev.id === annotation.id)
    )

    // Find updated annotations that need debounced saving
    const updatedAnnotations = annotations.filter((annotation) => {
      if (!annotation.id || annotation.id.startsWith('temp-')) return false

      const previous = previousAnnotationsRef.current.find((prev) => prev.id === annotation.id)
      if (!previous) return false

      // Check if annotation has been modified
      return JSON.stringify(annotation) !== JSON.stringify(previous)
    })

    // Immediately save new annotations
    if (newAnnotations.length > 0) {
      (async () => {
        for (const annotation of newAnnotations) {
          try {
            const savedAnnotation = await api.saveAnnotation(annotation)
            // Update Redux state with real database ID
            dispatch(updateAnnotation(savedAnnotation))
          } catch (error) {
            console.error('Failed to auto-save new annotation:', error)
          }
        }
      })()
    }

    // Debounced save for updated annotations
    if (updatedAnnotations.length > 0) {
      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Set new timeout for debounced save
      saveTimeoutRef.current = setTimeout(async () => {
        for (const annotation of updatedAnnotations) {
          try {
            await api.updateAnnotation(annotation)
          } catch (error) {
            console.error('Failed to auto-save updated annotation:', error)
          }
        }
      }, debounceMs)
    }

    // Update reference for next comparison
    previousAnnotationsRef.current = [...annotations]

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [videoId, annotations, debounceMs, dispatch])
}
