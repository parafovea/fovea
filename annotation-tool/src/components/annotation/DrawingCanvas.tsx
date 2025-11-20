/**
 * @module DrawingCanvas
 * @description SVG canvas for drawing and displaying bounding box annotations on video.
 * Extracted from AnnotationOverlay to provide reusable drawing surface.
 * Supports interactive drawing, annotation display, and detection result visualization.
 */

import { useRef, useMemo } from 'react'
import { Box } from '@mui/material'
import { useAnnotationDrawing } from '../../hooks/annotation/useAnnotationDrawing'
import InteractiveBoundingBox from './InteractiveBoundingBox'
import type { DetectionResponse } from '../../api/client'
import { Annotation } from '../../models/types'

/**
 * @interface DrawingCanvasProps
 * @description Props for DrawingCanvas component.
 */
interface DrawingCanvasProps {
  /** Video ID for annotation association */
  videoId: string | undefined
  /** Current video playback time in seconds */
  currentTime: number
  /** Video frame width in pixels */
  videoWidth: number
  /** Video frame height in pixels */
  videoHeight: number
  /** Annotations to display */
  annotations: any[]
  /** Currently selected annotation */
  selectedAnnotation: Annotation | null
  /** Optional AI detection results to display as read-only overlays */
  detectionResults?: DetectionResponse | null
  /** Callback when annotation is selected */
  onAnnotationSelect: (annotation: any) => void
}

/**
 * @component DrawingCanvas
 * @description SVG canvas component for video annotation drawing and display.
 * Handles rendering of existing annotations, AI detection results, and interactive
 * drawing of new bounding boxes. Uses useAnnotationDrawing hook for mouse interaction logic.
 *
 * @param props - Component props
 * @returns SVG canvas with interactive bounding boxes
 *
 * @example
 * ```tsx
 * <DrawingCanvas
 *   videoId="video-123"
 *   currentTime={5.2}
 *   videoWidth={1920}
 *   videoHeight={1080}
 *   annotations={annotations}
 *   selectedAnnotation={selectedAnnotation}
 *   detectionResults={detectionData}
 *   onAnnotationSelect={handleSelect}
 * />
 * ```
 */
export default function DrawingCanvas({
  videoId,
  currentTime,
  videoWidth,
  videoHeight,
  annotations,
  selectedAnnotation,
  detectionResults,
  onAnnotationSelect,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const {
    temporaryBox,
    canDraw,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useAnnotationDrawing({
    videoId,
    currentTime,
    videoWidth,
    videoHeight,
  })

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
          id: `detection-${frame.frameNumber}-${index}`,
          boundingBox: {
            x: detection.boundingBox.x * videoWidth,
            y: detection.boundingBox.y * videoHeight,
            width: detection.boundingBox.width * videoWidth,
            height: detection.boundingBox.height * videoHeight,
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
          cursor: canDraw ? 'crosshair' : 'default',
          backgroundColor: 'transparent',
        }}
        viewBox={`0 0 ${videoWidth} ${videoHeight}`}
        preserveAspectRatio="none"
        onMouseDown={(e) => handleMouseDown(e, svgRef)}
        onMouseMove={(e) => handleMouseMove(e, svgRef)}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Existing annotations */}
        {annotations.map((ann) => {
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
                onSelect={() => onAnnotationSelect(ann)}
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

        {/* Temporary box being drawn */}
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
