/**
 * @module AnnotationOverlay
 * @description SVG overlay for drawing and displaying bounding box annotations on video.
 * Supports both type-based annotations (persona-specific ontology types) and object-based
 * annotations (links to world entities, events, locations, and collections).
 * Provides interactive drawing, editing, and visualization of annotations and AI detections.
 */

import { useRef, useState, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Box } from '@mui/material'
import { RootState, AppDispatch } from '../store/store'
import { generateId } from '../utils/uuid'
import {
  setTemporaryBox,
  addAnnotation,
  clearDrawingState,
  selectAnnotation
} from '../store/annotationSlice'
import { useParams } from 'react-router-dom'
import InteractiveBoundingBox from './annotation/InteractiveBoundingBox'
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
 * @description SVG overlay component for video annotation.
 * Handles drawing new bounding boxes, displaying existing annotations with keyframe support,
 * and showing AI detection results. Supports two annotation modes: type assignment (persona-specific)
 * and object linking (world entities/events/collections).
 *
 * @param props - Component props
 * @returns SVG overlay with interactive bounding boxes
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
  const svgRef = useRef<SVGSVGElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })

  const drawingMode = useSelector((state: RootState) => state.annotations.drawingMode)
  const temporaryBox = useSelector((state: RootState) => state.annotations.temporaryBox)
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const selectedTypeId = useSelector((state: RootState) => state.annotations.selectedTypeId)
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)
  const linkTargetId = useSelector((state: RootState) => state.annotations.linkTargetId)
  const linkTargetType = useSelector((state: RootState) => state.annotations.linkTargetType)
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
   * Convert mouse event coordinates to video coordinate space.
   * Transforms screen pixel coordinates to video frame coordinates accounting for
   * SVG viewBox scaling and viewport positioning.
   *
   * @param e - Mouse event from SVG element
   * @returns Coordinates in video frame space (0 to videoWidth/videoHeight)
   */
  const getRelativeCoordinates = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 }

    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * videoHeight,
    }
  }

  /**
   * Handle mouse down event to start drawing new bounding box.
   * Only initiates drawing if clicking on SVG background (not existing annotations)
   * and all required mode prerequisites are met (persona + type for type mode, or
   * link target for object mode).
   *
   * @param e - Mouse event from SVG element
   */
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Check if we're clicking on an existing annotation (not the SVG background)
    if (e.target !== e.currentTarget) return

    // In type mode, need both drawing mode and persona
    if (annotationMode === 'type' && (!drawingMode || !selectedPersonaId)) return
    // In object mode, need a link target
    if (annotationMode === 'object' && !linkTargetId) return

    const coords = getRelativeCoordinates(e)
    setIsDrawing(true)
    setStartPoint(coords)
  }

  /**
   * Handle mouse move event during drawing to update temporary bounding box.
   * Calculates normalized rectangle from start point to current cursor position
   * and dispatches to Redux for visual preview.
   *
   * @param e - Mouse event from SVG element
   */
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return

    const coords = getRelativeCoordinates(e)

    const box = {
      x: Math.min(startPoint.x, coords.x),
      y: Math.min(startPoint.y, coords.y),
      width: Math.abs(coords.x - startPoint.x),
      height: Math.abs(coords.y - startPoint.y),
    }

    dispatch(setTemporaryBox(box))
  }

  /**
   * Handle mouse up event to finalize bounding box and create annotation.
   * Validates box size (minimum 5x5 pixels) and mode requirements before creating
   * annotation. For type mode, creates TypeAnnotation with persona and type IDs.
   * For object mode, creates ObjectAnnotation linked to entity/event/location/collection.
   */
  const handleMouseUp = () => {
    if (!isDrawing || !temporaryBox || !videoId) return

    // Check requirements based on mode
    if (annotationMode === 'type' && (!drawingMode || !selectedPersonaId)) return
    if (annotationMode === 'object' && !linkTargetId) return

    if (temporaryBox.width > 5 && temporaryBox.height > 5) {
      const fps = 30
      const currentFrame = Math.floor(currentTime * fps)
      const endFrame = currentFrame + fps  // 1 second duration

      const annotation: any = {
        id: generateId(),
        videoId,
        annotationType: annotationMode,
        boundingBoxSequence: {
          boxes: [{
            x: temporaryBox.x,
            y: temporaryBox.y,
            width: temporaryBox.width,
            height: temporaryBox.height,
            frameNumber: currentFrame,
            isKeyframe: true
          }],
          interpolationSegments: [],
          visibilityRanges: [{
            startFrame: currentFrame,
            endFrame: endFrame,
            visible: true
          }],
          totalFrames: endFrame - currentFrame + 1,
          keyframeCount: 1,
          interpolatedFrameCount: endFrame - currentFrame
        },
        timeSpan: {
          startTime: currentTime,
          endTime: currentTime + 1,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (annotationMode === 'type') {
        annotation.personaId = selectedPersonaId
        annotation.typeCategory = drawingMode
        annotation.typeId = selectedTypeId || 'temp-type'
      } else {
        if (linkTargetType === 'entity') {
          annotation.linkedEntityId = linkTargetId
        } else if (linkTargetType === 'event') {
          annotation.linkedEventId = linkTargetId
        } else if (linkTargetType === 'location') {
          annotation.linkedLocationId = linkTargetId
        } else if (linkTargetType?.includes('collection')) {
          annotation.linkedCollectionId = linkTargetId
          annotation.linkedCollectionType = linkTargetType.replace('-collection', '')
        }
      }

      dispatch(addAnnotation(annotation))
      // Auto-select the newly created annotation to show timeline
      dispatch(selectAnnotation(annotation))
    }

    setIsDrawing(false)
    dispatch(clearDrawingState())
  }

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

  /**
   * Extract detection bounding boxes for current video time.
   * Filters AI detection results to frames within 0.1 seconds of current playback time
   * and transforms normalized coordinates to video pixel space.
   *
   * @returns Array of detection boxes with pixel coordinates, labels, and confidence scores
   */
  const detectionBoxes = useMemo(() => {
    if (!detectionResults || !detectionResults.frames) return []

    return detectionResults.frames
      .filter(frame => Math.abs(frame.timestamp - currentTime) < 0.1)
      .flatMap(frame =>
        frame.detections.map((detection, index) => ({
          id: `detection-${frame.frame_number}-${index}`,
          boundingBox: {
            x: detection.bounding_box.x * videoWidth,
            y: detection.bounding_box.y * videoHeight,
            width: detection.bounding_box.width * videoWidth,
            height: detection.bounding_box.height * videoHeight,
          },
          label: detection.label,
          confidence: detection.confidence,
        }))
      )
  }, [detectionResults, currentTime, videoWidth, videoHeight])

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'auto', // Always allow pointer events so existing annotations can be interacted with
        zIndex: 2, // Ensure overlay is above video but allows video to show through
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          cursor: ((annotationMode === 'type' && drawingMode) ||
                   (annotationMode === 'object' && linkTargetId))
                   ? 'crosshair' : 'default',
          backgroundColor: 'transparent',
        }}
        viewBox={`0 0 ${videoWidth} ${videoHeight}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {annotationsWithInfo.map((ann) => {
          if (!ann.boundingBoxSequence) return null

          const fps = 30
          const currentFrame = Math.floor(currentTime * fps)

          const isKeyframe = ann.boundingBoxSequence.boxes.some(
            (b: any) => (b.isKeyframe || b.isKeyframe === undefined) && b.frameNumber === currentFrame
          )

          // Check if current frame is within any visibility range
          const isVisible = ann.boundingBoxSequence.visibilityRanges?.some(
            (range: any) => currentFrame >= range.startFrame && currentFrame <= range.endFrame && range.visible
          ) || false

          const mode: 'keyframe' | 'interpolated' | 'ghost' =
            !isVisible ? 'ghost' : (isKeyframe ? 'keyframe' : 'interpolated')

          return (
            <g key={ann.id} style={{ pointerEvents: 'auto' }}>
              <InteractiveBoundingBox
                annotation={ann}
                currentFrame={currentFrame}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                isActive={selectedAnnotation?.id === ann.id}
                onSelect={() => dispatch(selectAnnotation(ann))}
                mode={mode}
              />
            </g>
          )
        })}

        {/* Detection boxes (read-only, shown in yellow) */}
        {detectionBoxes.map((detection) => (
          <g key={detection.id}>
            <rect
              x={detection.boundingBox.x}
              y={detection.boundingBox.y}
              width={detection.boundingBox.width}
              height={detection.boundingBox.height}
              fill="none"
              stroke="#ffeb3b"
              strokeWidth="3"
              opacity="0.8"
            />
            <text
              x={detection.boundingBox.x}
              y={detection.boundingBox.y - 5}
              fill="#ffeb3b"
              fontSize="14"
              fontWeight="bold"
              stroke="black"
              strokeWidth="0.5"
            >
              {detection.label} ({Math.round(detection.confidence * 100)}%)
            </text>
          </g>
        ))}

        {temporaryBox && (
          <rect
            x={temporaryBox.x}
            y={temporaryBox.y}
            width={temporaryBox.width}
            height={temporaryBox.height}
            fill="none"
            stroke="#f50057"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.8"
          />
        )}
      </svg>
    </Box>
  )
}