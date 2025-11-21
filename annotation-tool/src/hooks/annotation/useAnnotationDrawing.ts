/**
 * @module useAnnotationDrawing
 * @description Hook for managing bounding box drawing state and interactions.
 * Extracted from AnnotationOverlay to provide reusable drawing logic for video annotations.
 */

import { useState, useCallback, RefObject } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '../../store/store'
import {
  setTemporaryBox,
  addAnnotation,
  clearDrawingState,
  selectAnnotation,
} from '../../store/annotationSlice'
import { generateId } from '../../utils/uuid'

/**
 * @interface BoundingBox
 * @description Bounding box coordinates in video space.
 */
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * @interface UseAnnotationDrawingParams
 * @description Parameters for useAnnotationDrawing hook.
 */
interface UseAnnotationDrawingParams {
  /** Video ID for annotation association */
  videoId: string | undefined
  /** Current playback time in seconds */
  currentTime: number
  /** Video frame width in pixels */
  videoWidth: number
  /** Video frame height in pixels */
  videoHeight: number
}

/**
 * @interface UseAnnotationDrawingReturn
 * @description Return value from useAnnotationDrawing hook.
 */
interface UseAnnotationDrawingReturn {
  /** Whether user is currently drawing a box */
  isDrawing: boolean
  /** Start point of drawing in video coordinates */
  startPoint: { x: number; y: number }
  /** Temporary box being drawn (from Redux state) */
  temporaryBox: BoundingBox | null
  /** Whether drawing is allowed based on current mode */
  canDraw: boolean
  /** Convert mouse coordinates to video space */
  getRelativeCoordinates: (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => { x: number; y: number }
  /** Handle mouse down to start drawing */
  handleMouseDown: (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => void
  /** Handle mouse move while drawing */
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => void
  /** Handle mouse up to complete drawing */
  handleMouseUp: () => void
}

/**
 * @hook useAnnotationDrawing
 * @description Manages state and interactions for drawing bounding box annotations on video.
 * Handles mouse events, coordinate transformations, and annotation creation for both
 * type-based annotations (persona-specific) and object-based annotations (world entities).
 *
 * @param params - Hook parameters
 * @returns Drawing state and event handlers
 *
 * @example
 * ```tsx
 * const {
 *   isDrawing,
 *   temporaryBox,
 *   canDraw,
 *   handleMouseDown,
 *   handleMouseMove,
 *   handleMouseUp
 * } = useAnnotationDrawing({
 *   videoId,
 *   currentTime,
 *   videoWidth: 1920,
 *   videoHeight: 1080
 * })
 * ```
 */
export function useAnnotationDrawing({
  videoId,
  currentTime,
  videoWidth,
  videoHeight,
}: UseAnnotationDrawingParams): UseAnnotationDrawingReturn {
  const dispatch = useDispatch<AppDispatch>()
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })

  // Redux selectors for drawing mode and state
  const drawingMode = useSelector((state: RootState) => state.annotations.drawingMode)
  const temporaryBox = useSelector((state: RootState) => state.annotations.temporaryBox)
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const selectedTypeId = useSelector((state: RootState) => state.annotations.selectedTypeId)
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)
  const linkTargetId = useSelector((state: RootState) => state.annotations.linkTargetId)
  const linkTargetType = useSelector((state: RootState) => state.annotations.linkTargetType)

  /**
   * Determines if drawing is allowed based on current annotation mode and requirements.
   * Type mode requires: drawingMode and selectedPersonaId
   * Object mode requires: linkTargetId
   */
  const canDraw = useCallback(() => {
    if (annotationMode === 'type') {
      return !!(drawingMode && selectedPersonaId)
    }
    if (annotationMode === 'object') {
      return !!linkTargetId
    }
    return false
  }, [annotationMode, drawingMode, selectedPersonaId, linkTargetId])

  /**
   * Convert mouse event coordinates to video coordinate space.
   * Transforms screen pixel coordinates to video frame coordinates accounting for
   * SVG viewBox scaling and viewport positioning.
   *
   * @param e - Mouse event from SVG element
   * @param svgRef - Reference to SVG element
   * @returns Coordinates in video frame space (0 to videoWidth/videoHeight)
   */
  const getRelativeCoordinates = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => {
      if (!svgRef.current) return { x: 0, y: 0 }

      const rect = svgRef.current.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * videoWidth,
        y: ((e.clientY - rect.top) / rect.height) * videoHeight,
      }
    },
    [videoWidth, videoHeight]
  )

  /**
   * Handle mouse down event to start drawing new bounding box.
   * Only initiates drawing if clicking on SVG background (not existing annotations)
   * and all required mode prerequisites are met.
   *
   * @param e - Mouse event from SVG element
   * @param svgRef - Reference to SVG element
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => {
      // Check if we're clicking on an existing annotation (not the SVG background)
      if (e.target !== e.currentTarget) return

      // Check if drawing is allowed based on current mode
      if (!canDraw()) return

      const coords = getRelativeCoordinates(e, svgRef)
      setIsDrawing(true)
      setStartPoint(coords)
    },
    [canDraw, getRelativeCoordinates]
  )

  /**
   * Handle mouse move event during drawing to update temporary bounding box.
   * Calculates normalized rectangle from start point to current cursor position
   * and dispatches to Redux for visual preview.
   *
   * @param e - Mouse event from SVG element
   * @param svgRef - Reference to SVG element
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => {
      if (!isDrawing) return

      const coords = getRelativeCoordinates(e, svgRef)

      const box = {
        x: Math.min(startPoint.x, coords.x),
        y: Math.min(startPoint.y, coords.y),
        width: Math.abs(coords.x - startPoint.x),
        height: Math.abs(coords.y - startPoint.y),
      }

      dispatch(setTemporaryBox(box))
    },
    [isDrawing, startPoint, getRelativeCoordinates, dispatch]
  )

  /**
   * Handle mouse up event to finalize bounding box and create annotation.
   * Validates box size (minimum 5x5 pixels) and mode requirements before creating
   * annotation. For type mode, creates TypeAnnotation with persona and type IDs.
   * For object mode, creates ObjectAnnotation linked to entity/event/location/collection.
   */
  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !temporaryBox || !videoId) return

    // Check requirements based on mode
    if (!canDraw()) return

    if (temporaryBox.width > 5 && temporaryBox.height > 5) {
      const fps = 30
      const currentFrame = Math.floor(currentTime * fps)
      const endFrame = currentFrame + fps // 1 second duration

      const annotation: any = {
        id: generateId(),
        videoId,
        annotationType: annotationMode,
        boundingBoxSequence: {
          boxes: [
            {
              x: temporaryBox.x,
              y: temporaryBox.y,
              width: temporaryBox.width,
              height: temporaryBox.height,
              frameNumber: currentFrame,
              isKeyframe: true,
            },
          ],
          interpolationSegments: [],
          visibilityRanges: [
            {
              startFrame: currentFrame,
              endFrame: endFrame,
              visible: true,
            },
          ],
          totalFrames: endFrame - currentFrame + 1,
          keyframeCount: 1,
          interpolatedFrameCount: endFrame - currentFrame,
        },
        timeSpan: {
          startTime: currentTime,
          endTime: currentTime + 1,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (annotationMode === 'type') {
        annotation.annotationType = 'type'
        annotation.personaId = selectedPersonaId
        annotation.typeCategory = drawingMode
        annotation.typeId = selectedTypeId || 'temp-type'
      } else {
        annotation.annotationType = 'object'
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
  }, [
    isDrawing,
    temporaryBox,
    videoId,
    currentTime,
    annotationMode,
    selectedPersonaId,
    drawingMode,
    selectedTypeId,
    linkTargetId,
    linkTargetType,
    canDraw,
    dispatch,
  ])

  return {
    isDrawing,
    startPoint,
    temporaryBox,
    canDraw: canDraw(),
    getRelativeCoordinates,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  }
}
