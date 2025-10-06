/**
 * @module QuickActionsPanel
 * @description Floating quick actions panel for bounding box editing.
 * Provides quick access to keyframe operations without moving mouse to distant buttons.
 */

import React, { useState, useEffect } from 'react'
import { Paper, IconButton, Typography, Box, Tooltip } from '@mui/material'
import { Annotation } from '../../models/types.js'

/**
 * @interface QuickActionsPanelProps
 * @description Props for QuickActionsPanel component.
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
  /** Callback to open interpolation menu */
  onOpenInterpolationMenu: () => void
  /** Whether current frame is a keyframe */
  isKeyframe: boolean
  /** Video width for edge detection */
  videoWidth: number
}

/**
 * @component QuickActionsPanel
 * @description Floating panel with quick actions for bounding box editing.
 */
export const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({
  annotation,
  currentFrame,
  boundingBoxRect,
  onAddKeyframe,
  onDeleteKeyframe,
  onCopyPreviousFrame,
  onOpenInterpolationMenu,
  isKeyframe,
  videoWidth,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Calculate position with edge detection
  useEffect(() => {
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
    if (left + panelWidth > videoWidth - margin) {
      left = videoWidth - panelWidth - margin
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

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: 250,
        padding: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        backgroundColor: 'background.paper',
        zIndex: 1000,
        opacity: 0.95,
        transition: 'all 200ms ease-in-out',
      }}
    >
      {/* Add Keyframe Button */}
      <Tooltip title="Add Keyframe (K)" arrow placement="top">
        <Box>
          <IconButton
            size="small"
            onClick={onAddKeyframe}
            disabled={isKeyframe}
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 1,
              '&:disabled': {
                opacity: 0.5,
              },
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '1.2rem' }}>
              🔑
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              Keyframe
            </Typography>
          </IconButton>
        </Box>
      </Tooltip>

      {/* Delete Keyframe Button */}
      <Tooltip
        title={
          !isKeyframe
            ? 'Not a keyframe'
            : isFirstOrLastKeyframe
            ? 'Cannot delete first/last keyframe'
            : 'Delete Keyframe (Del)'
        }
        arrow
        placement="top"
      >
        <Box>
          <IconButton
            size="small"
            onClick={onDeleteKeyframe}
            disabled={!isKeyframe || isFirstOrLastKeyframe}
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 1,
              '&:disabled': {
                opacity: 0.5,
              },
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '1.2rem' }}>
              ╳
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              Delete
            </Typography>
          </IconButton>
        </Box>
      </Tooltip>

      {/* Copy Previous Frame Button */}
      <Tooltip title="Copy Previous Frame (Ctrl+C)" arrow placement="bottom">
        <Box>
          <IconButton
            size="small"
            onClick={onCopyPreviousFrame}
            disabled={currentFrame === 0}
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 1,
              '&:disabled': {
                opacity: 0.5,
              },
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '1.2rem' }}>
              ↻
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              Previous
            </Typography>
          </IconButton>
        </Box>
      </Tooltip>

      {/* Interpolation Menu Button */}
      <Tooltip title="Interpolation Mode (I) - Coming in Session 5" arrow placement="bottom">
        <Box>
          <IconButton
            size="small"
            onClick={onOpenInterpolationMenu}
            disabled={true}
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 1,
              '&:disabled': {
                opacity: 0.5,
              },
            }}
          >
            <Typography variant="caption" sx={{ fontSize: '1.2rem' }}>
              ~
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              Interp.
            </Typography>
          </IconButton>
        </Box>
      </Tooltip>
    </Paper>
  )
}
