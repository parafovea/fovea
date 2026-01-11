/**
 * @module AnnotationOverlay
 * @description Orchestrates video annotation display and linked object enrichment.
 * Filters and enriches annotations with world state data before delegating rendering
 * to DrawingCanvas component. Supports both type-based annotations (persona-specific)
 * and object-based annotations (links to world entities, events, locations, and collections).
 */

import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAnnotationUiStore } from '@store/zustand'
import { useAnnotations } from '@store/queries'
import { useEntities, useEvents, useEntityCollections, useEventCollections } from '@store/queries/useWorld'
import DrawingCanvas from './DrawingCanvas'
import type { DetectionResponse } from '@api/client'
import { getAnnotationTimeBounds } from '@models/annotation'
import type { Annotation, Entity, Event, EntityCollection, EventCollection } from '@models/types'

/**
 * @description Annotation with resolved linked object information for display.
 */
type EnrichedAnnotation = Annotation & {
  /** Resolved linked object (entity, event, location, or collection) */
  linkedObject?: Entity | Event | EntityCollection | EventCollection
  /** Type of the linked object */
  linkedType?: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection'
}

/**
 * @interface AnnotationOverlayProps
 * @description Props for AnnotationOverlay component.
 */
interface AnnotationOverlayProps {
  /** Reference to video element (currently unused but reserved for future features) */
  videoElement: HTMLVideoElement | null
  /** Current video playback time in seconds */
  currentTime: number
  /** Video frame width in pixels */
  videoWidth: number
  /** Video frame height in pixels */
  videoHeight: number
  /** Optional AI detection results to display as read-only overlays */
  detectionResults?: DetectionResponse | null
}

/**
 * @component AnnotationOverlay
 * @description Orchestrates video annotation display by filtering, enriching, and rendering annotations.
 * Filters annotations by selected persona and time window, enriches object annotations with
 * linked world state data (entities, events, collections), and delegates rendering to DrawingCanvas.
 *
 * @param props - Component props
 * @returns DrawingCanvas with filtered and enriched annotations
 *
 * @example
 * ```tsx
 * <AnnotationOverlay
 *   videoElement={videoRef.current}
 *   currentTime={5.2}
 *   videoWidth={1920}
 *   videoHeight={1080}
 *   detectionResults={detectionData}
 * />
 * ```
 */
export default function AnnotationOverlay({
  currentTime,
  videoWidth,
  videoHeight,
  detectionResults,
}: AnnotationOverlayProps) {
  const { videoId } = useParams()

  // Zustand UI state
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const annotationMode = useAnnotationUiStore((state) => state.annotationMode)
  const selectedAnnotation = useAnnotationUiStore((state) => state.selectedAnnotation)
  const setSelectedAnnotation = useAnnotationUiStore((state) => state.setSelectedAnnotation)

  // TanStack Query for annotations
  const { data: allAnnotations = [] } = useAnnotations(videoId)

  // Filter annotations by selected persona if one is selected and in type mode
  const annotations = useMemo(() => {
    if (selectedPersonaId && annotationMode === 'type') {
      return allAnnotations.filter(a => a.annotationType === 'type' && a.personaId === selectedPersonaId)
    }
    return allAnnotations
  }, [allAnnotations, selectedPersonaId, annotationMode])

  // TanStack Query for world objects used in linked annotations
  const entities = useEntities()
  const events = useEvents()
  const entityCollections = useEntityCollections()
  const eventCollections = useEventCollections()

  /**
   * Compute annotations with linked object information for display.
   * Filters annotations to current video time window and enriches object annotations
   * with linked entity/event/location/collection data from world state.
   * Type annotations are displayed as-is without additional lookups.
   *
   * @returns Array of annotations enriched with linkedObject and linkedType fields
   */
  const annotationsWithInfo = useMemo(() => {
    return annotations.filter(ann => {
      // Always show selected annotation (for ghost box after last keyframe)
      if (selectedAnnotation && ann.id === selectedAnnotation.id) {
        return true
      }
      // Show annotations within their time bounds (derived from keyframes)
      const bounds = getAnnotationTimeBounds(ann)
      return bounds && bounds.startTime <= currentTime && bounds.endTime >= currentTime
    }).map((ann): EnrichedAnnotation => {
      // Start with base annotation
      const enriched: EnrichedAnnotation = { ...ann }

      // Get linked object info (only for object annotations)
      if (ann.annotationType === 'object') {
        if (ann.linkedEntityId) {
          const entity = entities.find(e => e.id === ann.linkedEntityId)
          if (entity) {
            enriched.linkedObject = entity
            enriched.linkedType = 'entity'
          }
        } else if (ann.linkedEventId) {
          const event = events.find(e => e.id === ann.linkedEventId)
          if (event) {
            enriched.linkedObject = event
            enriched.linkedType = 'event'
          }
        } else if (ann.linkedLocationId) {
          const location = entities.find(e => e.id === ann.linkedLocationId && 'locationType' in e)
          if (location) {
            enriched.linkedObject = location
            enriched.linkedType = 'location'
          }
        } else if (ann.linkedCollectionId) {
          const collection = ann.linkedCollectionType === 'entity'
            ? entityCollections.find(c => c.id === ann.linkedCollectionId)
            : eventCollections.find(c => c.id === ann.linkedCollectionId)
          if (collection) {
            enriched.linkedObject = collection
            enriched.linkedType = ann.linkedCollectionType === 'entity' ? 'entity-collection' : 'event-collection'
          }
        }
      }

      return enriched
    })
  }, [annotations, currentTime, entities, events, entityCollections, eventCollections, selectedAnnotation])

  return (
    <DrawingCanvas
      videoId={videoId}
      currentTime={currentTime}
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      annotations={annotationsWithInfo}
      selectedAnnotation={selectedAnnotation}
      detectionResults={detectionResults}
      onAnnotationSelect={setSelectedAnnotation}
    />
  )
}
