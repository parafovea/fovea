/**
 * @module MotionPathOverlay
 * @description SVG overlay for visualizing bounding box motion path.
 * Shows trajectory through all keyframes with interpolation.
 */

import React from 'react'
import { Annotation } from '../../models/types.js'
import { selectMotionPath } from '../../store/annotationSlice.js'
import { useAppSelector } from '../../store/store.js'

/**
 * @interface MotionPathOverlayProps
 * @description Props for MotionPathOverlay component.
 */
export interface MotionPathOverlayProps {
  /** Annotation with bounding box sequence */
  annotation: Annotation
  /** Video width for coordinate system */
  videoWidth: number
  /** Video height for coordinate system */
  videoHeight: number
  /** Whether overlay is visible */
  visible: boolean
}

/**
 * @component MotionPathOverlay
 * @description Overlay showing motion path trajectory for bounding box sequence.
 */
export const MotionPathOverlay: React.FC<MotionPathOverlayProps> = ({
  annotation,
  visible,
}) => {
  // Get motion path from Redux selector
  const motionPath = useAppSelector((state) =>
    selectMotionPath(state, annotation.videoId, annotation.id)
  )

  if (!visible || motionPath.length < 2) {
    return null
  }

  // Get stroke color based on annotation type
  const getStrokeColor = () => {
    if (annotation.annotationType === 'type') {
      if (annotation.typeCategory === 'entity') return '#4caf50'
      if (annotation.typeCategory === 'event') return '#ff9800'
      if (annotation.typeCategory === 'role') return '#2196f3'
    } else if (annotation.annotationType === 'object') {
      if (annotation.linkedEntityId) return '#4caf50'
      if (annotation.linkedEventId) return '#ff9800'
      if (annotation.linkedLocationId) return '#9c27b0'
      if (annotation.linkedCollectionType) return '#ff5722'
    }
    return '#757575'
  }

  const strokeColor = getStrokeColor()

  // Build SVG path from motion path points
  const pathData = motionPath
    .map((point: any, index: number) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`
      }

      // For now, use straight lines for all interpolation types
      // Session 5 will add bezier curves
      const prevPoint = motionPath[index - 1]
      const segment = annotation.boundingBoxSequence.interpolationSegments.find(
        s => s.startFrame === prevPoint.frameNumber && s.endFrame === point.frameNumber
      )

      if (segment?.type === 'hold') {
        // Step function for hold
        return `L ${prevPoint.x} ${point.y} L ${point.x} ${point.y}`
      }

      // Linear or other types (draw straight line for now)
      return `L ${point.x} ${point.y}`
    })
    .join(' ')

  return (
    <g data-testid="motion-path-overlay" style={{ pointerEvents: 'none' }}>
      {/* Path line */}
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        opacity={0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Keyframe dots */}
      {motionPath
        .filter((point: any) => point.isKeyframe)
        .map((point: any) => (
          <circle
            key={`keyframe-${point.frameNumber}`}
            cx={point.x}
            cy={point.y}
            r={6}
            fill={strokeColor}
            opacity={0.6}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}
    </g>
  )
}
