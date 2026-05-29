/**
 * Floating quick actions panel for bounding box editing.
 * Provides quick access to keyframe operations without moving mouse to distant buttons.
 *
 * @module
 */

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Annotation, InterpolationType } from '@models/types'
import { InterpolationModeSelector, BezierControlPointSet } from './InterpolationModeSelector'

/**
 * Props for QuickActionsPanel component.
 */
export interface QuickActionsPanelProps {
  /** Annotation being edited */
  annotation: Annotation
  /** Current frame number */
  currentFrame: number
  /** Bounding box DOMRect for positioning */
  boundingBoxRect: DOMRect
  /** Callback to add keyframe at current frame */
  onAddKeyframe: () => void
  /** Callback to delete keyframe at current frame */
  onDeleteKeyframe: () => void
  /** Callback to copy previous frame's box */
  onCopyPreviousFrame: () => void
  /** Callback when interpolation mode is changed */
  onUpdateInterpolationSegment: (segmentIndex: number, type: InterpolationType, controlPoints?: BezierControlPointSet) => void
  /** Whether current frame is a keyframe */
  isKeyframe: boolean
  /** Video width for edge detection */
  videoWidth: number
}

/**
 * Floating panel with quick actions for bounding box editing.
 */
export const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({
  annotation,
  currentFrame,
  boundingBoxRect,
  onAddKeyframe,
  onDeleteKeyframe,
  onCopyPreviousFrame,
  onUpdateInterpolationSegment,
  isKeyframe,
  videoWidth,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [interpolationDialogOpen, setInterpolationDialogOpen] = useState(false)

  // Calculate position with edge detection
  useEffect(() => {
    if (!boundingBoxRect) return

    const panelWidth = 250
    const panelHeight = 80
    const margin = 10

    let top = boundingBoxRect.top - panelHeight - margin
    let left = boundingBoxRect.left

    // Flip to below if near top edge
    if (top < margin) {
      top = boundingBoxRect.bottom + margin
    }

    // Shift left if near right edge
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin
    }

    // Shift right if near left edge
    if (left < margin) {
      left = margin
    }

    setPosition({ top, left })
  }, [boundingBoxRect, videoWidth])

  // Check if delete is allowed
  const keyframes = annotation.boundingBoxSequence.boxes.filter(
    b => b.isKeyframe || b.isKeyframe === undefined
  )
  const isFirstOrLastKeyframe = isKeyframe && (
    keyframes.length <= 2 ||
    currentFrame === keyframes[0].frameNumber ||
    currentFrame === keyframes[keyframes.length - 1].frameNumber
  )

  // Interpolation requires at least 2 keyframes
  const canInterpolate = keyframes.length >= 2

  return createPortal(
    <div
      data-tour-id="quick-actions-track"
      className="absolute grid grid-cols-2 gap-2 bg-card rounded-lg p-2 shadow-lg ring-1 ring-foreground/10 z-[1000] opacity-95 transition-all duration-200 ease-in-out"
      style={{
        top: position.top,
        left: position.left,
        width: 250,
      }}
    >
      {/* Add Keyframe Button */}
      <Tooltip>
        <TooltipTrigger render={<div />}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddKeyframe}
              disabled={isKeyframe}
              aria-label="Add Keyframe"
              className="w-full flex flex-col items-center p-2 h-auto"
            >
              <span className="text-xl">🔑</span>
              <span className="text-[0.7rem]">Keyframe</span>
            </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Add Keyframe (K)</TooltipContent>
      </Tooltip>

      {/* Delete Keyframe Button */}
      <Tooltip>
        <TooltipTrigger render={<div />}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteKeyframe}
              disabled={!isKeyframe || isFirstOrLastKeyframe}
              aria-label="Delete Keyframe"
              className="w-full flex flex-col items-center p-2 h-auto"
            >
              <span className="text-xl">╳</span>
              <span className="text-[0.7rem]">Delete</span>
            </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {!isKeyframe
            ? 'Not a keyframe'
            : isFirstOrLastKeyframe
            ? 'Cannot delete first/last keyframe'
            : 'Delete Keyframe (Del)'}
        </TooltipContent>
      </Tooltip>

      {/* Copy Previous Frame Button */}
      <Tooltip>
        <TooltipTrigger render={<div />}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyPreviousFrame}
              disabled={currentFrame === 0}
              aria-label="Copy Previous Frame"
              className="w-full flex flex-col items-center p-2 h-auto"
            >
              <span className="text-xl">↻</span>
              <span className="text-[0.7rem]">Previous</span>
            </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copy Previous Frame (Ctrl+C)</TooltipContent>
      </Tooltip>

      {/* Interpolation Menu Button */}
      <Tooltip>
        <TooltipTrigger render={<div />}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInterpolationDialogOpen(true)}
              disabled={!canInterpolate}
              aria-label="Interpolation Mode"
              className="w-full flex flex-col items-center p-2 h-auto"
            >
              <span className="text-xl">~</span>
              <span className="text-[0.7rem]">Interp.</span>
            </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Interpolation Mode (I)</TooltipContent>
      </Tooltip>

      {/* Interpolation Mode Selector Dialog */}
      <InterpolationModeSelector
        annotation={annotation}
        currentFrame={currentFrame}
        open={interpolationDialogOpen}
        onClose={() => setInterpolationDialogOpen(false)}
        onApply={(segmentIndex, type, controlPoints) => {
          onUpdateInterpolationSegment(segmentIndex, type, controlPoints)
          setInterpolationDialogOpen(false)
        }}
      />
    </div>,
    document.body
  )
}
