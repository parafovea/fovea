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
import { useAnnotations, usePersonas, useAllPersonaOntologies } from '@store/queries'
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
  /** Resolved type name from ontology (for type annotations) */
  typeName?: string
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
  /** Video frame rate (defaults to 30) */
  videoFps?: number
  /** Optional AI detection results to display as read-only overlays */
  detectionResults?: DetectionResponse | null
  /** Optional callback when annotation edit is complete (drag/resize finished) */
  onAnnotationEditComplete?: () => void
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
  videoFps = 30,
  detectionResults,
  onAnnotationEditComplete,
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
  // Note: Both type and object annotations should always be visible regardless of toggle state
  // The toggle only affects which type of annotation can be created, not which are displayed
  const annotations = useMemo(() => {
    if (selectedPersonaId && annotationMode === 'type') {
      // When in type mode with persona selected, filter type annotations by persona
      // but always include all object annotations
      return allAnnotations.filter(a => 
        (a.annotationType === 'type' && a.personaId === selectedPersonaId) || 
        a.annotationType === 'object'
      )
    }
    // In object mode or no persona selected, show all annotations
    return allAnnotations
  }, [allAnnotations, selectedPersonaId, annotationMode])

  // TanStack Query for world objects used in linked annotations
  const entities = useEntities()
  const events = useEvents()
  const entityCollections = useEntityCollections()
  const eventCollections = useEventCollections()

  // TanStack Query for persona ontologies (to look up type names)
  const { data: personas = [] } = usePersonas()
  const personaIds = useMemo(() => personas.map(p => p.id), [personas])
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)

  // Create lookup maps for O(1) entity/event/collection lookups
  // This is much faster than O(n) .find() calls per annotation
  const entityMap = useMemo(
    () => new Map(entities.map(e => [e.id, e])),
    [entities]
  )
  const eventMap = useMemo(
    () => new Map(events.map(e => [e.id, e])),
    [events]
  )
  const entityCollectionMap = useMemo(
    () => new Map(entityCollections.map(c => [c.id, c])),
    [entityCollections]
  )
  const eventCollectionMap = useMemo(
    () => new Map(eventCollections.map(c => [c.id, c])),
    [eventCollections]
  )

  // Create lookup map for type names from ontologies
  // Maps typeId -> typeName for O(1) lookups
  const typeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ontology of personaOntologies) {
      for (const entity of ontology.entities) {
        map.set(entity.id, entity.name)
      }
      for (const role of ontology.roles) {
        map.set(role.id, role.name)
      }
      for (const event of ontology.events) {
        map.set(event.id, event.name)
      }
    }
    return map
  }, [personaOntologies])

  /**
   * Compute annotations with linked object information for display.
   * Filters annotations to current video time window and enriches object annotations
   * with linked entity/event/location/collection data from world state.
   * Type annotations are displayed as-is without additional lookups.
   * Uses Map-based O(1) lookups instead of O(n) .find() calls.
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

      // Enrich type annotations with type name from ontology
      if (ann.annotationType === 'type') {
        const typeName = typeNameMap.get(ann.typeId)
        if (typeName) {
          enriched.typeName = typeName
        }
      }

      // Get linked object info (only for object annotations)
      // Using O(1) Map lookups instead of O(n) .find() calls
      if (ann.annotationType === 'object') {
        if (ann.linkedEntityId) {
          const entity = entityMap.get(ann.linkedEntityId)
          if (entity) {
            enriched.linkedObject = entity
            enriched.linkedType = 'entity'
          }
        } else if (ann.linkedEventId) {
          const event = eventMap.get(ann.linkedEventId)
          if (event) {
            enriched.linkedObject = event
            enriched.linkedType = 'event'
          }
        } else if (ann.linkedLocationId) {
          // Locations are stored as entities with locationType field
          const location = entityMap.get(ann.linkedLocationId)
          if (location && 'locationType' in location) {
            enriched.linkedObject = location
            enriched.linkedType = 'location'
          }
        } else if (ann.linkedCollectionId) {
          const collection = ann.linkedCollectionType === 'entity'
            ? entityCollectionMap.get(ann.linkedCollectionId)
            : eventCollectionMap.get(ann.linkedCollectionId)
          if (collection) {
            enriched.linkedObject = collection
            enriched.linkedType = ann.linkedCollectionType === 'entity' ? 'entity-collection' : 'event-collection'
          }
        }
      }

      return enriched
    })
  }, [annotations, currentTime, entityMap, eventMap, entityCollectionMap, eventCollectionMap, typeNameMap, selectedAnnotation])

  return (
    <DrawingCanvas
      videoId={videoId}
      currentTime={currentTime}
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      videoFps={videoFps}
      annotations={annotationsWithInfo}
      selectedAnnotation={selectedAnnotation}
      detectionResults={detectionResults}
      onAnnotationSelect={setSelectedAnnotation}
      onAnnotationEditComplete={onAnnotationEditComplete}
    />
  )
}
