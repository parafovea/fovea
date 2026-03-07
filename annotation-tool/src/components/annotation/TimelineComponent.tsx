/**
 * Timeline component for bounding box sequence visualization and navigation.
 *
 * @packageDocumentation
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { SkipBack, Rewind, FastForward, SkipForward } from 'lucide-react'
import { Annotation, InterpolationType } from '@models/types'
import { TimelineRenderer, RenderOptions } from './TimelineRenderer'
import { useMoveKeyframe } from '@store/queries'
import { InterpolationModeSelector, BezierControlPointSet } from './InterpolationModeSelector'

export interface TimelineComponentProps {
  annotation: Annotation | null
  currentFrame: number
  totalFrames: number
  videoFps: number
  onSeek: (frameNumber: number) => void
  videoRef?: React.RefObject<HTMLVideoElement>
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onUpdateInterpolationSegment: (segmentIndex: number, type: InterpolationType, controlPoints?: BezierControlPointSet) => void
  onClose: () => void
}

/**
 * Reads CSS custom properties from the document to pass to the canvas renderer.
 * Falls back to sensible defaults if properties are not set.
 */
function getThemeColors(): RenderOptions['theme'] {
  const style = getComputedStyle(document.documentElement)
  const getCssVar = (name: string, fallback: string): string => {
    const val = style.getPropertyValue(name).trim()
    return val || fallback
  }

  return {
    backgroundColor: getCssVar('--color-card', '#ffffff'),
    textColor: getCssVar('--color-foreground', '#0a0a0a'),
    textSecondary: getCssVar('--color-muted-foreground', '#737373'),
    dividerColor: getCssVar('--color-border', '#e5e5e5'),
    primaryMain: getCssVar('--color-primary', '#2563eb'),
    primaryLight: getCssVar('--color-primary', '#60a5fa'),
    errorMain: getCssVar('--color-destructive', '#dc2626'),
  }
}

/**
 * Canvas-based timeline with keyboard navigation and keyframe management.
 */
export const TimelineComponent: React.FC<TimelineComponentProps> = ({
  annotation,
  currentFrame,
  totalFrames,
  videoFps,
  onSeek,
  videoRef,
  onAddKeyframe,
  onDeleteKeyframe,
  onCopyPreviousFrame,
  onUpdateInterpolationSegment,
  onClose,
}) => {
  const moveKeyframe = useMoveKeyframe()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<TimelineRenderer | null>(null)
  const currentFrameRef = useRef(currentFrame)
  const [isDragging, setIsDragging] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null)
  const [hoveredSegmentInfo, setHoveredSegmentInfo] = useState<string | null>(null)

  // Update ref without triggering re-render
  useEffect(() => {
    currentFrameRef.current = currentFrame
  }, [currentFrame])
  const [selectedKeyframes, setLocalSelectedKeyframes] = useState<number[]>([])
  const [draggingKeyframe, setDraggingKeyframe] = useState<number | null>(null)
  const [dragStartFrame, setDragStartFrame] = useState<number | null>(null)
  const [interpolationDialogOpen, setInterpolationDialogOpen] = useState(false)

  // Extract keyframes from annotation
  const keyframes = useMemo(() =>
    annotation?.boundingBoxSequence?.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    ) || [],
    [annotation]
  )

  // Check if current frame is a keyframe
  const isKeyframe = keyframes.some(kf => kf.frameNumber === currentFrame)

  // Check if delete is allowed
  const isFirstOrLastKeyframe = isKeyframe && (
    keyframes.length <= 2 ||
    currentFrame === keyframes[0].frameNumber ||
    currentFrame === keyframes[keyframes.length - 1].frameNumber
  )

  // Interpolation requires at least 2 keyframes
  const canInterpolate = keyframes.length >= 2

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = 60  // Fixed height for timeline
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
        rendererRef.current.resize(rect.width, 60)
        rendererRef.current.invalidate()
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.destroy()
    }
  }, [totalFrames, zoom])

  // Track previous values to detect changes and gate invalidation
  const prevFrameRef = useRef<number>(-1)
  const prevKeyframesLengthRef = useRef<number>(0)
  const prevZoomRef = useRef<number>(1)
  const prevSelectedRef = useRef<number[]>([])

  // Render loop - use ref to avoid triggering React re-renders on every frame
  useEffect(() => {
    if (!rendererRef.current) return

    const renderer = rendererRef.current
    let lastRenderTime = 0
    let rafId: number | null = null

    const render = (timestamp: number) => {
      // Throttle to max 15fps (66ms between frames) to avoid affecting video playback
      if (timestamp - lastRenderTime < 66) {
        rafId = requestAnimationFrame(render)
        return
      }
      lastRenderTime = timestamp

      const themeColors = getThemeColors()

      const renderOptions: RenderOptions = {
        totalFrames,
        currentFrame: currentFrameRef.current,
        keyframes,
        interpolationSegments: annotation?.boundingBoxSequence?.interpolationSegments || [],
        zoom,
        theme: themeColors,
      }

      // Only invalidate if something actually changed
      // This prevents unnecessary redraws and improves performance
      const frameChanged = currentFrameRef.current !== prevFrameRef.current
      const keyframesChanged = keyframes.length !== prevKeyframesLengthRef.current
      const zoomChanged = zoom !== prevZoomRef.current
      const selectedChanged = selectedKeyframes.length !== prevSelectedRef.current.length ||
        selectedKeyframes.some((f, i) => f !== prevSelectedRef.current[i])

      if (frameChanged || keyframesChanged || zoomChanged || selectedChanged) {
        renderer.invalidate()
        prevFrameRef.current = currentFrameRef.current
        prevKeyframesLengthRef.current = keyframes.length
        prevZoomRef.current = zoom
        prevSelectedRef.current = [...selectedKeyframes]
      }

      renderer.render(renderOptions, selectedKeyframes)
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [keyframes, annotation?.boundingBoxSequence?.interpolationSegments, zoom, totalFrames, selectedKeyframes])

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

      // Check if hovering over an interpolation segment
      const segments = annotation?.boundingBoxSequence?.interpolationSegments || []
      const segmentInfo = renderer.getSegmentAtX(x, segments)
      setHoveredSegmentInfo(segmentInfo?.label || null)

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
    [isDragging, draggingKeyframe, dragStartFrame, totalFrames, keyframes, onSeek, annotation?.boundingBoxSequence?.interpolationSegments]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Handle keyframe drag completion
      if (draggingKeyframe !== null && dragStartFrame !== null && canvasRef.current && rendererRef.current && annotation) {
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
            // Move keyframe
            moveKeyframe({
              videoId: annotation.videoId,
              annotationId: annotation.id,
              oldFrame: dragStartFrame,
              newFrame,
              fps: videoFps,
            })
          }
        }
      }

      setIsDragging(false)
      setDraggingKeyframe(null)
      setDragStartFrame(null)
    },
    [draggingKeyframe, dragStartFrame, totalFrames, keyframes, annotation, moveKeyframe, videoFps]
  )

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setDraggingKeyframe(null)
    setDragStartFrame(null)
    setHoveredFrame(null)
    setHoveredSegmentInfo(null)
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
  const handleZoomChange = (newValue: number | readonly number[]) => {
    const zoomValue = Array.isArray(newValue) ? newValue[0] : newValue
    setZoom(zoomValue)
    if (rendererRef.current) {
      rendererRef.current.setZoom(zoomValue)
      rendererRef.current.invalidate()
    }
  }

  // Transport control handlers
  const handleStepBackward = () => {
    const newFrame = Math.max(0, currentFrame - 1)
    onSeek(newFrame)
  }

  const handleStepForward = () => {
    const newFrame = Math.min(totalFrames - 1, currentFrame + 1)
    onSeek(newFrame)
  }

  const handleJumpBackward = () => {
    const newFrame = Math.max(0, currentFrame - 10)
    onSeek(newFrame)
  }

  const handleJumpForward = () => {
    const newFrame = Math.min(totalFrames - 1, currentFrame + 10)
    onSeek(newFrame)
  }

  return (
    <div className="w-full bg-card border border-border rounded p-2">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="w-full relative"
        style={{
          height: 60,
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
          aria-label="Video annotation timeline showing keyframes and interpolated positions"
          role="img"
          data-testid="timeline-canvas"
        />

        {/* Tooltip for hovered frame and segment */}
        {hoveredFrame !== null && !isDragging && (
          <div
            className="absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs pointer-events-none"
          >
            Frame {hoveredFrame}
            {hoveredSegmentInfo && (
              <span className="ml-2 opacity-80">
                | {hoveredSegmentInfo}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mt-2">
        {/* Hide Timeline Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          aria-label="Hide timeline and show standard controls"
        >
          Hide Timeline
        </Button>

        {/* Transport controls */}
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handleJumpBackward} title="Jump 10 frames back (Shift+←)" aria-label="Jump 10 frames back">
            <SkipBack className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleStepBackward} title="Step 1 frame back (←)" aria-label="Step 1 frame back">
            <Rewind className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleStepForward} title="Step 1 frame forward (→)" aria-label="Step 1 frame forward">
            <FastForward className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleJumpForward} title="Jump 10 frames forward (Shift+→)" aria-label="Jump 10 frames forward">
            <SkipForward className="size-4" />
          </Button>
        </div>

        {/* Keyframe controls */}
        <div className="flex gap-1 border-l border-border pl-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onAddKeyframe}
                  disabled={!annotation || isKeyframe}
                  aria-label="Add Keyframe"
                />
              }
            >
              <span className="text-base">🔑</span>
            </TooltipTrigger>
            <TooltipContent>Add Keyframe (K)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onDeleteKeyframe}
                  disabled={!annotation || !isKeyframe || isFirstOrLastKeyframe}
                  aria-label="Delete Keyframe"
                />
              }
            >
              <span className="text-base">╳</span>
            </TooltipTrigger>
            <TooltipContent>
              {!annotation
                ? 'No annotation selected'
                : !isKeyframe
                ? 'Not a keyframe'
                : isFirstOrLastKeyframe
                ? 'Cannot delete first/last keyframe'
                : 'Delete Keyframe (Del)'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onCopyPreviousFrame}
                  disabled={!annotation || currentFrame === 0}
                  aria-label="Copy Previous Frame"
                />
              }
            >
              <span className="text-base">↻</span>
            </TooltipTrigger>
            <TooltipContent>Copy Previous Frame (Ctrl+C)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setInterpolationDialogOpen(true)}
                  disabled={!annotation || !canInterpolate}
                  aria-label="Interpolation Mode"
                />
              }
            >
              <span className="text-base">~</span>
            </TooltipTrigger>
            <TooltipContent>Interpolation Mode (I)</TooltipContent>
          </Tooltip>
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs min-w-[40px]">
            Zoom
          </span>
          <Slider
            value={[zoom]}
            onValueChange={handleZoomChange}
            min={1}
            max={10}
            step={0.5}
            className="flex-1 max-w-[200px]"
          />
        </div>

        {/* Current frame display */}
        <span className="text-sm min-w-[120px] text-right font-mono">
          Frame {currentFrame} / {totalFrames - 1}
        </span>
      </div>

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
    </div>
  )
}
