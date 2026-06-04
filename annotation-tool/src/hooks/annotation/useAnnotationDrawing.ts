/**
 * @module useAnnotationDrawing
 * @description Hook for managing bounding box drawing state and interactions.
 * Extracted from AnnotationOverlay to provide reusable drawing logic for video annotations.
 */

import { useState, useCallback, RefObject } from 'react'
import { useAnnotationUiStore } from '@store/zustand'
import { useAddAnnotation } from '@store/queries'
import type { Annotation } from '@models/types'

/**
 * @description Input type for creating new annotations.
 * Matches the expected input for useAddAnnotation mutation.
 */
type NewAnnotationInput = Partial<Annotation> & Pick<Annotation, 'videoId' | 'annotationType' | 'boundingBoxSequence'>

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
  /** Video frame rate (defaults to 30) */
  videoFps?: number
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
  /** Temporary box being drawn (from Zustand state) */
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
  videoWidth: _videoWidth,
  videoHeight: _videoHeight,
  videoFps = 30,
}: UseAnnotationDrawingParams): UseAnnotationDrawingReturn {
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })

  // Zustand selectors for drawing mode and state
  const drawingMode = useAnnotationUiStore((state) => state.drawingMode)
  const temporaryBox = useAnnotationUiStore((state) => state.temporaryBox)
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const selectedTypeId = useAnnotationUiStore((state) => state.selectedTypeId)
  const annotationMode = useAnnotationUiStore((state) => state.annotationMode)
  const linkTargetId = useAnnotationUiStore((state) => state.linkTargetId)
  const linkTargetType = useAnnotationUiStore((state) => state.linkTargetType)

  // Zustand actions
  const setTemporaryBox = useAnnotationUiStore((state) => state.setTemporaryBox)
  const setSelectedAnnotation = useAnnotationUiStore((state) => state.setSelectedAnnotation)
  const resetDrawingState = useAnnotationUiStore((state) => state.resetDrawingState)

  // TanStack Query mutation for adding annotations
  const { mutate: addAnnotation } = useAddAnnotation()

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
   * Uses SVG's native coordinate transformation matrix to correctly handle
   * viewBox scaling and preserveAspectRatio (letterboxing/pillarboxing).
   * Falls back to simple ratio calculation in test environments (jsdom) where
   * SVG methods aren't fully implemented.
   *
   * @param e - Mouse event from SVG element
   * @param svgRef - Reference to SVG element
   * @returns Coordinates in video frame space (0 to videoWidth/videoHeight)
   */
  const getRelativeCoordinates = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, svgRef: RefObject<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }

      // Use SVG's native coordinate transformation matrix when available
      // This correctly handles viewBox and preserveAspectRatio="xMidYMid meet"
      if (typeof svg.createSVGPoint === 'function' && typeof svg.getScreenCTM === 'function') {
        const ctm = svg.getScreenCTM()
        if (ctm) {
          const pt = svg.createSVGPoint()
          pt.x = e.clientX
          pt.y = e.clientY
          const svgPoint = pt.matrixTransform(ctm.inverse())
          return { x: svgPoint.x, y: svgPoint.y }
        }
      }

      // Fallback for test environments (jsdom) where SVG methods aren't available
      const rect = svg.getBoundingClientRect()
      const viewBox = typeof svg.getAttribute === 'function' ? svg.getAttribute('viewBox') : null
      if (viewBox) {
        const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number)
        return {
          x: ((e.clientX - rect.left) / rect.width) * vbWidth,
          y: ((e.clientY - rect.top) / rect.height) * vbHeight,
        }
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    },
    []
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
   * and updates Zustand store for visual preview.
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

      setTemporaryBox(box)
    },
    [isDrawing, startPoint, getRelativeCoordinates, setTemporaryBox]
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
      const currentFrame = Math.floor(currentTime * videoFps)
      const endFrame = currentFrame + videoFps // 1 second duration

      const baseAnnotation = {
        videoId,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (annotationMode === 'type') {
        const typeCategory = drawingMode as 'entity' | 'role' | 'event'

        // Create a single annotation for the currently selected persona and type
        const annotation: NewAnnotationInput = {
          ...baseAnnotation,
          annotationType: 'type',
          personaId: selectedPersonaId ?? undefined,
          typeCategory,
          typeId: selectedTypeId ?? 'temp-type',
        }

        addAnnotation(annotation, {
          onSuccess: (savedAnnotation) => {
            setSelectedAnnotation(savedAnnotation)
          },
        })
      } else {
        // Object annotation mode - single annotation
        const objectAnnotation: NewAnnotationInput = {
          ...baseAnnotation,
          annotationType: 'object',
        }
        if (linkTargetType === 'entity') {
          objectAnnotation.linkedEntityId = linkTargetId ?? undefined
        } else if (linkTargetType === 'event') {
          objectAnnotation.linkedEventId = linkTargetId ?? undefined
        } else if (linkTargetType === 'location') {
          objectAnnotation.linkedLocationId = linkTargetId ?? undefined
        } else if (linkTargetType?.includes('collection')) {
          objectAnnotation.linkedCollectionId = linkTargetId ?? undefined
          objectAnnotation.linkedCollectionType = linkTargetType.replace('-collection', '') as 'entity' | 'event' | 'time'
        }

        addAnnotation(objectAnnotation, {
          onSuccess: (savedAnnotation) => {
            setSelectedAnnotation(savedAnnotation)
          },
        })
      }
    }

    setIsDrawing(false)
    resetDrawingState()
  }, [
    isDrawing,
    temporaryBox,
    videoId,
    currentTime,
    videoFps,
    annotationMode,
    selectedPersonaId,
    drawingMode,
    selectedTypeId,
    linkTargetId,
    linkTargetType,
    canDraw,
    addAnnotation,
    setSelectedAnnotation,
    resetDrawingState,
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
