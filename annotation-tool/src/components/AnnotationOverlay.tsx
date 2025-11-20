/**
 * @module AnnotationOverlay
 * @description Orchestrates video annotation display and linked object enrichment.
 * Filters and enriches annotations with world state data before delegating rendering
 * to DrawingCanvas component. Supports both type-based annotations (persona-specific)
 * and object-based annotations (links to world entities, events, locations, and collections).
 */

import { useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '../store/store'
import { selectAnnotation } from '../store/annotationSlice'
import { useParams } from 'react-router-dom'
import DrawingCanvas from './annotation/DrawingCanvas'
import type { DetectionResponse } from '../api/client'

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
  const dispatch = useDispatch<AppDispatch>()

  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)
  const selectedAnnotation = useSelector((state: RootState) => state.annotations.selectedAnnotation)
  const annotations = useSelector((state: RootState) => {
    const videoAnnotations = state.annotations.annotations[videoId || '']
    // Filter annotations by selected persona if one is selected and in type mode
    if (selectedPersonaId && videoAnnotations && annotationMode === 'type') {
      return videoAnnotations.filter(a => a.annotationType === 'type' && a.personaId === selectedPersonaId)
    }
    return videoAnnotations || []
  })

  // Get world objects for linked annotations
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  const entityCollections = useSelector((state: RootState) => state.world.entityCollections)
  const eventCollections = useSelector((state: RootState) => state.world.eventCollections)

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
      // Show annotations within their timeSpan
      return ann.timeSpan && ann.timeSpan.startTime <= currentTime && ann.timeSpan.endTime >= currentTime
    }).map(ann => {
      const displayInfo: any = { ...ann }

      // Get linked object info (only for object annotations)
      if (ann.annotationType === 'object') {
        if (ann.linkedEntityId) {
          const entity = entities.find(e => e.id === ann.linkedEntityId)
          if (entity) {
            displayInfo.linkedObject = entity
            displayInfo.linkedType = 'entity'
          }
        } else if (ann.linkedEventId) {
          const event = events.find(e => e.id === ann.linkedEventId)
          if (event) {
            displayInfo.linkedObject = event
            displayInfo.linkedType = 'event'
          }
        } else if (ann.linkedLocationId) {
          const location = entities.find(e => e.id === ann.linkedLocationId && 'locationType' in e)
          if (location) {
            displayInfo.linkedObject = location
            displayInfo.linkedType = 'location'
          }
        } else if (ann.linkedCollectionId) {
          const collection = ann.linkedCollectionType === 'entity'
            ? entityCollections.find(c => c.id === ann.linkedCollectionId)
            : eventCollections.find(c => c.id === ann.linkedCollectionId)
          if (collection) {
            displayInfo.linkedObject = collection
            displayInfo.linkedType = `${ann.linkedCollectionType}-collection`
          }
        }
      }

      return displayInfo
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
      onAnnotationSelect={(annotation) => dispatch(selectAnnotation(annotation))}
    />
  )
}
