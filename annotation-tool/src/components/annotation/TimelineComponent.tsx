/**
 * @module TimelineComponent
 * @description Timeline component for bounding box sequence visualization and navigation.
 * Provides canvas-based rendering with 60fps performance for smooth playhead updates.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { Box, Slider, IconButton, Typography, useTheme } from '@mui/material'
import {
  SkipPrevious,
  FastRewind,
  FastForward,
  SkipNext,
} from '@mui/icons-material'
import { Annotation } from '../../models/types.js'
import { TimelineRenderer, RenderOptions } from './TimelineRenderer.js'
import { useTimelineKeyboardShortcuts } from '../../hooks/useTimelineKeyboardShortcuts.js'
import { AppDispatch } from '../../store/store.js'
import { moveKeyframe } from '../../store/annotationSlice.js'

/**
 * @interface TimelineComponentProps
 * @description Props for TimelineComponent.
 */
export interface TimelineComponentProps {
  /** Annotation with boundingBoxSequence */
  annotation: Annotation
  /** Current frame number */
  currentFrame: number
  /** Total frames in video */
  totalFrames: number
  /** Video frames per second */
  videoFps: number
  /** Callback when user seeks to a frame */
  onSeek: (frameNumber: number) => void
  /** Optional video element ref for playback sync */
  videoRef?: React.RefObject<HTMLVideoElement>
}

/**
 * @component TimelineComponent
 * @description Timeline component with canvas rendering and keyboard navigation.
 */
export const TimelineComponent: React.FC<TimelineComponentProps> = ({
  annotation,
  currentFrame,
  totalFrames,
  videoFps,
  onSeek,
  videoRef,
}) => {
  const theme = useTheme()
  const dispatch = useDispatch<AppDispatch>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<TimelineRenderer | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null)
  const [selectedKeyframes, setLocalSelectedKeyframes] = useState<number[]>([])
  const [draggingKeyframe, setDraggingKeyframe] = useState<number | null>(null)
  const [dragStartFrame, setDragStartFrame] = useState<number | null>(null)

  // Extract keyframes from annotation
  const keyframes = annotation.boundingBoxSequence.boxes.filter(
    b => b.isKeyframe || b.isKeyframe === undefined
  )

  // Setup keyboard shortcuts
  useTimelineKeyboardShortcuts(
    currentFrame,
    totalFrames,
    keyframes,
    onSeek
  )

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = 140  // Updated height for timeline (includes visibility track)
    }

    resizeCanvas()

    // Create renderer
    const renderer = new TimelineRenderer(canvas, totalFrames)
    renderer.setZoom(zoom)
    rendererRef.current = renderer

    // Handle window resize
    const handleResize = () => {
      resizeCanvas()
      if (rendererRef.current) {
        const rect = container.getBoundingClientRect()
        rendererRef.current.resize(rect.width, 140)
        rendererRef.current.invalidate()
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.destroy()
    }
  }, [totalFrames, zoom])

  // Render loop
  useEffect(() => {
    if (!rendererRef.current) return

    const renderer = rendererRef.current

    const renderOptions: RenderOptions = {
      totalFrames,
      currentFrame,
      keyframes,
      interpolationSegments: annotation.boundingBoxSequence.interpolationSegments,
      visibilityRanges: annotation.boundingBoxSequence.visibilityRanges,
      zoom,
      theme: {
        backgroundColor: theme.palette.background.paper,
        textColor: theme.palette.text.primary,
        textSecondary: theme.palette.text.secondary,
        dividerColor: theme.palette.divider,
        primaryMain: theme.palette.primary.main,
        primaryLight: theme.palette.primary.light,
        errorMain: theme.palette.error.main,
      },
    }

    // Render using requestAnimationFrame for smooth 60fps
    const render = () => {
      renderer.render(renderOptions, selectedKeyframes)
    }

    const rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [currentFrame, keyframes, annotation.boundingBoxSequence.interpolationSegments, zoom, totalFrames, theme, selectedKeyframes])

  // Handle mouse down on canvas
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !rendererRef.current) return

      const canvas = canvasRef.current
      const renderer = rendererRef.current
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const frame = renderer.xToFrame(x)

      // Check if clicking on a keyframe
      const clickedKeyframe = renderer.getKeyframeAtX(x, keyframes)

      if (clickedKeyframe !== null) {
        // Clicking on a keyframe
        if (e.ctrlKey || e.metaKey) {
          // Multi-select with Ctrl/Cmd
          if (selectedKeyframes.includes(clickedKeyframe)) {
            setLocalSelectedKeyframes(selectedKeyframes.filter(f => f !== clickedKeyframe))
          } else {
            setLocalSelectedKeyframes([...selectedKeyframes, clickedKeyframe])
          }
        } else {
          // Select single keyframe and prepare for drag
          setLocalSelectedKeyframes([clickedKeyframe])
          setDraggingKeyframe(clickedKeyframe)
          setDragStartFrame(clickedKeyframe)
        }
      } else {
        // Clicking on timeline (not a keyframe)
        const clampedFrame = Math.max(0, Math.min(totalFrames - 1, frame))
        setIsDragging(true)
        setLocalSelectedKeyframes([])
        onSeek(clampedFrame)
      }
    },
    [totalFrames, keyframes, selectedKeyframes, onSeek]
  )

  // Handle mouse move (for dragging playhead or keyframe)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !rendererRef.current) return

      const canvas = canvasRef.current
      const renderer = rendererRef.current
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const frame = renderer.xToFrame(x)

      // Clamp to valid range
      const clampedFrame = Math.max(0, Math.min(totalFrames - 1, frame))

      // Update hovered frame for tooltip
      setHoveredFrame(clampedFrame)

      // If dragging keyframe, update preview position
      if (draggingKeyframe !== null && dragStartFrame !== null) {
        // Show preview at new position (actual move happens on mouse up)
        // For now, just track the target frame
        return
      }

      // If dragging playhead, seek to frame
      if (isDragging) {
        // Snap to nearest keyframe if within 3 frames
        let targetFrame = clampedFrame
        const nearestKeyframe = keyframes.find(
          kf => Math.abs(kf.frameNumber - clampedFrame) <= 3
        )
        if (nearestKeyframe) {
          targetFrame = nearestKeyframe.frameNumber
        }

        onSeek(targetFrame)
      }
    },
    [isDragging, draggingKeyframe, dragStartFrame, totalFrames, keyframes, onSeek]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Handle keyframe drag completion
      if (draggingKeyframe !== null && dragStartFrame !== null && canvasRef.current && rendererRef.current) {
        const canvas = canvasRef.current
        const renderer = rendererRef.current
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const newFrame = Math.max(0, Math.min(totalFrames - 1, renderer.xToFrame(x)))

        // Only move if frame changed and not first/last keyframe
        if (newFrame !== dragStartFrame) {
          const isFirstOrLast =
            dragStartFrame === keyframes[0].frameNumber ||
            dragStartFrame === keyframes[keyframes.length - 1].frameNumber

          if (!isFirstOrLast) {
            // Dispatch move action
            dispatch(
              moveKeyframe({
                videoId: annotation.videoId,
                annotationId: annotation.id,
                oldFrame: dragStartFrame,
                newFrame,
              })
            )
          }
        }
      }

      setIsDragging(false)
      setDraggingKeyframe(null)
      setDragStartFrame(null)
    },
    [draggingKeyframe, dragStartFrame, totalFrames, keyframes, annotation, dispatch]
  )

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setDraggingKeyframe(null)
    setDragStartFrame(null)
    setHoveredFrame(null)
  }, [])

  // Sync with video timeupdate
  useEffect(() => {
    if (!videoRef?.current) return

    const video = videoRef.current

    const handleTimeUpdate = () => {
      const frame = Math.floor(video.currentTime * videoFps)
      // Only update if different to avoid infinite loop
      if (frame !== currentFrame) {
        onSeek(frame)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [videoRef, videoFps, currentFrame, onSeek])

  // Zoom change handler
  const handleZoomChange = (_event: Event, newValue: number | number[]) => {
    const zoomValue = Array.isArray(newValue) ? newValue[0] : newValue
    setZoom(zoomValue)
    if (rendererRef.current) {
      rendererRef.current.setZoom(zoomValue)
      rendererRef.current.invalidate()
    }
  }

  // Transport control handlers
  const handleStepBackward = () => {
    onSeek(Math.max(0, currentFrame - 1))
  }

  const handleStepForward = () => {
    onSeek(Math.min(totalFrames - 1, currentFrame + 1))
  }

  const handleJumpBackward = () => {
    onSeek(Math.max(0, currentFrame - 10))
  }

  const handleJumpForward = () => {
    onSeek(Math.min(totalFrames - 1, currentFrame + 10))
  }

  return (
    <Box
      sx={{
        width: '100%',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        p: 1,
      }}
    >
      {/* Canvas */}
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: 140,
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
          }}
        />

        {/* Tooltip for hovered frame */}
        {hoveredFrame !== null && !isDragging && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 1,
              fontSize: '12px',
              pointerEvents: 'none',
            }}
          >
            Frame {hoveredFrame}
          </Box>
        )}
      </Box>

      {/* Controls */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mt: 1,
        }}
      >
        {/* Transport controls */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={handleJumpBackward} title="Jump 10 frames back (Shift+←)">
            <SkipPrevious />
          </IconButton>
          <IconButton size="small" onClick={handleStepBackward} title="Step 1 frame back (←)">
            <FastRewind />
          </IconButton>
          <IconButton size="small" onClick={handleStepForward} title="Step 1 frame forward (→)">
            <FastForward />
          </IconButton>
          <IconButton size="small" onClick={handleJumpForward} title="Jump 10 frames forward (Shift+→)">
            <SkipNext />
          </IconButton>
        </Box>

        {/* Zoom slider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 40 }}>
            Zoom
          </Typography>
          <Slider
            value={zoom}
            onChange={handleZoomChange}
            min={1}
            max={10}
            step={0.5}
            size="small"
            sx={{ flex: 1, maxWidth: 200 }}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}x`}
          />
        </Box>

        {/* Current frame display */}
        <Typography variant="body2" sx={{ minWidth: 120, textAlign: 'right', fontFamily: 'monospace' }}>
          Frame {currentFrame} / {totalFrames - 1}
        </Typography>
      </Box>
    </Box>
  )
}
