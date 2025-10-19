import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { Chip, Tooltip } from '@mui/material'
import { AppDispatch } from '../../store/store'
import { updateAnnotation, updateKeyframe, addKeyframe } from '../../store/annotationSlice'
import { BoundingBox } from '../../models/types.js'
import { BoundingBoxInterpolator } from '../../utils/interpolation.js'

/**
 * Props for InteractiveBoundingBox component.
 */
interface InteractiveBoundingBoxProps {
  /** Annotation object containing bounding box sequence and metadata */
  annotation: any
  /** Current video frame number */
  currentFrame: number
  /** Video width in pixels */
  videoWidth: number
  /** Video height in pixels */
  videoHeight: number
  /** Whether this bounding box is currently selected */
  isActive: boolean
  /** Callback fired when bounding box is selected */
  onSelect: () => void
  /** Display mode for the bounding box */
  mode: 'keyframe' | 'interpolated' | 'ghost'
  /** Optional callback fired when bounding box is updated */
  onUpdate?: (box: Partial<BoundingBox>) => void
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null
type InteractionMode = 'none' | 'dragging' | 'resizing'

/**
 * @component InteractiveBoundingBox
 * @description Interactive bounding box component with drag, resize, and keyframe management.
 * Supports keyframe-based animation with interpolation between frames. Provides resize handles
 * for corner and edge manipulation, and displays quick actions panel when active.
 *
 * @param {InteractiveBoundingBoxProps} props - Component properties
 * @returns {JSX.Element} SVG group containing bounding box and interaction handles
 *
 * @example
 * ```tsx
 * <InteractiveBoundingBox
 *   annotation={annotation}
 *   currentFrame={30}
 *   videoWidth={1920}
 *   videoHeight={1080}
 *   isActive={true}
 *   onSelect={() => handleSelect(annotation.id)}
 *   mode="keyframe"
 * />
 * ```
 *
 * @public
 */
export default function InteractiveBoundingBox({
  annotation,
  currentFrame,
  videoWidth,
  videoHeight,
  isActive,
  onSelect,
  mode,
  onUpdate,
}: InteractiveBoundingBoxProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [hovering, setHovering] = useState(false)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none')
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rectRef = useRef<SVGRectElement | null>(null)

  // Get all interpolated frames for this annotation
  const allFrames = useMemo(() => {
    if (!annotation.boundingBoxSequence) return []
    const interpolator = new BoundingBoxInterpolator()
    const result = interpolator.interpolate(
      annotation.boundingBoxSequence.boxes,
      annotation.boundingBoxSequence.interpolationSegments || [],
      annotation.boundingBoxSequence.visibilityRanges
    )
    return result
  }, [annotation.boundingBoxSequence])

  // Get the box for the current frame
  // If no box at current frame, use the nearest keyframe for ghost display
  const currentBox = useMemo(() => {
    const exactFrame = allFrames.find(f => f.frameNumber === currentFrame)
    if (exactFrame) {
      return exactFrame
    }

    // If seeking beyond annotation range, show the nearest keyframe as ghost
    if (annotation.boundingBoxSequence?.boxes?.length > 0) {
      const keyframes = annotation.boundingBoxSequence.boxes.filter((b: BoundingBox) => b.isKeyframe !== false)
      if (keyframes.length > 0) {
        // Find nearest keyframe
        const nearest = keyframes.reduce((prev: BoundingBox, curr: BoundingBox) => {
          return Math.abs(curr.frameNumber - currentFrame) < Math.abs(prev.frameNumber - currentFrame) ? curr : prev
        })
        return nearest
      }
    }

    return null
  }, [allFrames, currentFrame, annotation.boundingBoxSequence])

  const [originalBox, setOriginalBox] = useState(currentBox)

  const handleSize = 8 // Size of resize handles in pixels

  // Determine if box is editable based on mode
  const isEditable = mode !== 'ghost'
  const showAllHandles = mode === 'keyframe'

  // Get stroke color based on type
  const getStrokeColor = () => {
    if (annotation.linkedType === 'entity' || annotation.typeCategory === 'entity') return '#4caf50'
    if (annotation.linkedType === 'event' || annotation.typeCategory === 'event') return '#ff9800'
    if (annotation.linkedType === 'location') return '#9c27b0'
    if (annotation.linkedType?.includes('collection')) return '#ff5722'
    if (annotation.typeCategory === 'role') return '#2196f3'
    return '#757575'
  }

  const strokeColor = getStrokeColor()

  // Get visual style based on mode
  const getVisualStyle = () => {
    switch (mode) {
      case 'keyframe':
        return {
          opacity: isActive || hovering ? 1.0 : 0.8,
          strokeWidth: 4,
          strokeDasharray: undefined,
        }
      case 'interpolated':
        return {
          opacity: 0.6,
          strokeWidth: 3,
          strokeDasharray: undefined,
        }
      case 'ghost':
        return {
          opacity: 0.5,
          strokeWidth: 3,
          strokeDasharray: '5,5',
        }
    }
  }

  const visualStyle = getVisualStyle()

  // Handle mouse down on main box (for dragging)
  const handleBoxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditable || !currentBox) return

    onSelect()

    const coords = getRelativeCoordinates(e)
    setInteractionMode('dragging')
    setDragStart(coords)
    setOriginalBox({ ...currentBox })
  }

  // Handle mouse down on resize handle
  const handleResizeMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    if (!isEditable || !currentBox) return

    onSelect()

    // If interpolated mode, convert to keyframe on handle click
    if (mode === 'interpolated') {
      dispatch(addKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        frameNumber: currentFrame,
        box: currentBox,
      }))
      return
    }

    const coords = getRelativeCoordinates(e)
    setInteractionMode('resizing')
    setActiveHandle(handle)
    setDragStart(coords)
    setOriginalBox({ ...currentBox })
  }

  // Store reference to parent SVG
  useEffect(() => {
    if (!svgRef.current) {
      // Find parent SVG element
      const gElement = document.querySelector(`g[data-annotation-id="${annotation.id}"]`)
      if (gElement) {
        svgRef.current = gElement.closest('svg')
      }
    }
  }, [annotation.id])

  // Get relative coordinates within the SVG
  const getRelativeCoordinates = (e: React.MouseEvent): { x: number; y: number } => {
    // Get the SVG element - look for parent SVG
    let svg: SVGSVGElement | null = svgRef.current
    if (!svg) {
      let element = e.currentTarget as Element
      while (element && element.tagName.toLowerCase() !== 'svg') {
        element = element.parentElement as Element
      }
      svg = element as SVGSVGElement
      svgRef.current = svg
    }
    
    if (!svg) return { x: 0, y: 0 }
    
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * videoHeight,
    }
  }

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (interactionMode === 'none' || !originalBox) return

    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const currentX = ((e.clientX - rect.left) / rect.width) * videoWidth
    const currentY = ((e.clientY - rect.top) / rect.height) * videoHeight

    const deltaX = currentX - dragStart.x
    const deltaY = currentY - dragStart.y

    const newBox = { ...originalBox }

    if (interactionMode === 'dragging') {
      // Move the entire box
      newBox.x = Math.max(0, Math.min(videoWidth - originalBox.width, originalBox.x + deltaX))
      newBox.y = Math.max(0, Math.min(videoHeight - originalBox.height, originalBox.y + deltaY))
    } else if (interactionMode === 'resizing' && activeHandle) {
      // Resize based on which handle is being dragged
      switch (activeHandle) {
        case 'nw':
          newBox.x = Math.min(originalBox.x + originalBox.width - 10, originalBox.x + deltaX)
          newBox.y = Math.min(originalBox.y + originalBox.height - 10, originalBox.y + deltaY)
          newBox.width = originalBox.width - (newBox.x - originalBox.x)
          newBox.height = originalBox.height - (newBox.y - originalBox.y)
          break
        case 'n':
          newBox.y = Math.min(originalBox.y + originalBox.height - 10, originalBox.y + deltaY)
          newBox.height = originalBox.height - (newBox.y - originalBox.y)
          break
        case 'ne':
          newBox.y = Math.min(originalBox.y + originalBox.height - 10, originalBox.y + deltaY)
          newBox.width = Math.max(10, originalBox.width + deltaX)
          newBox.height = originalBox.height - (newBox.y - originalBox.y)
          break
        case 'e':
          newBox.width = Math.max(10, originalBox.width + deltaX)
          break
        case 'se':
          newBox.width = Math.max(10, originalBox.width + deltaX)
          newBox.height = Math.max(10, originalBox.height + deltaY)
          break
        case 's':
          newBox.height = Math.max(10, originalBox.height + deltaY)
          break
        case 'sw':
          newBox.x = Math.min(originalBox.x + originalBox.width - 10, originalBox.x + deltaX)
          newBox.width = originalBox.width - (newBox.x - originalBox.x)
          newBox.height = Math.max(10, originalBox.height + deltaY)
          break
        case 'w':
          newBox.x = Math.min(originalBox.x + originalBox.width - 10, originalBox.x + deltaX)
          newBox.width = originalBox.width - (newBox.x - originalBox.x)
          break
      }
    }

    // Update the annotation with the new bounding box
    if (onUpdate) {
      onUpdate(newBox)
    } else if (mode === 'keyframe') {
      // Update keyframe directly
      dispatch(updateKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        frameNumber: currentFrame,
        box: newBox,
      }))
    } else {
      // Fallback to updating annotation (legacy support)
      dispatch(updateAnnotation({
        ...annotation,
        boundingBox: newBox,
        updatedAt: new Date().toISOString(),
      }))
    }
  }, [interactionMode, activeHandle, dragStart, originalBox, annotation, videoWidth, videoHeight, dispatch, onUpdate, mode, currentFrame])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setInteractionMode('none')
    setActiveHandle(null)
  }, [])

  // Add/remove event listeners
  useEffect(() => {
    if (interactionMode !== 'none') {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [interactionMode, handleMouseMove, handleMouseUp])


  // Safety check: return null if no box available (after all hooks have been called)
  if (!currentBox) {
    return null
  }

  return (
    <g
      data-testid="bounding-box"
      data-annotation-id={annotation.id}
      onMouseEnter={() => isEditable && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ pointerEvents: mode === 'ghost' ? 'none' : 'auto' }}
    >
      {/* Main bounding box */}
      <rect
        ref={rectRef}
        x={currentBox.x}
        y={currentBox.y}
        width={currentBox.width}
        height={currentBox.height}
        fill="none"
        stroke={strokeColor}
        strokeWidth={visualStyle.strokeWidth}
        strokeDasharray={visualStyle.strokeDasharray}
        opacity={visualStyle.opacity}
        style={{ cursor: isEditable ? 'move' : 'default', pointerEvents: mode === 'ghost' ? 'none' : 'auto' }}
        onMouseDown={handleBoxMouseDown}
      />

      {/* Show resize handles when active or hovering and not in ghost mode */}
      {isEditable && (isActive || hovering) && (
        <>
          {/* Corner handles (always shown for keyframe and interpolated) */}
          <Tooltip title={mode === 'interpolated' ? 'Convert to Keyframe' : ''} arrow placement="top">
            <rect
              x={currentBox.x - handleSize / 2}
              y={currentBox.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="white"
              stroke={strokeColor}
              strokeWidth="1"
              style={{ cursor: 'nw-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
            />
          </Tooltip>
          <Tooltip title={mode === 'interpolated' ? 'Convert to Keyframe' : ''} arrow placement="top">
            <rect
              x={currentBox.x + currentBox.width - handleSize / 2}
              y={currentBox.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="white"
              stroke={strokeColor}
              strokeWidth="1"
              style={{ cursor: 'ne-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
            />
          </Tooltip>
          <Tooltip title={mode === 'interpolated' ? 'Convert to Keyframe' : ''} arrow placement="bottom">
            <rect
              x={currentBox.x + currentBox.width - handleSize / 2}
              y={currentBox.y + currentBox.height - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="white"
              stroke={strokeColor}
              strokeWidth="1"
              style={{ cursor: 'se-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            />
          </Tooltip>
          <Tooltip title={mode === 'interpolated' ? 'Convert to Keyframe' : ''} arrow placement="bottom">
            <rect
              x={currentBox.x - handleSize / 2}
              y={currentBox.y + currentBox.height - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill="white"
              stroke={strokeColor}
              strokeWidth="1"
              style={{ cursor: 'sw-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            />
          </Tooltip>

          {/* Edge handles (only for keyframe mode) */}
          {showAllHandles && (
            <>
              <rect
                x={currentBox.x + currentBox.width / 2 - handleSize / 2}
                y={currentBox.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 'n-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
              />
              <rect
                x={currentBox.x + currentBox.width - handleSize / 2}
                y={currentBox.y + currentBox.height / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 'e-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
              />
              <rect
                x={currentBox.x + currentBox.width / 2 - handleSize / 2}
                y={currentBox.y + currentBox.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 's-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 's')}
              />
              <rect
                x={currentBox.x - handleSize / 2}
                y={currentBox.y + currentBox.height / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 'w-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
              />
            </>
          )}
        </>
      )}

      {/* Label for linked objects */}
      {annotation.linkedObject && mode !== 'ghost' && (
        <foreignObject
          x={currentBox.x}
          y={currentBox.y - 30}
          width={Math.max(currentBox.width, 150)}
          height={30}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
            <Chip
              label={annotation.linkedObject.name}
              size="small"
              color={
                annotation.linkedType === 'entity' ? 'success' :
                annotation.linkedType === 'event' ? 'warning' :
                annotation.linkedType === 'location' ? 'secondary' :
                'error'
              }
              sx={{
                fontSize: '0.75rem',
                height: 24,
                maxWidth: '100%',
                '& .MuiChip-label': {
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  paddingLeft: '8px',
                  paddingRight: '8px',
                }
              }}
            />
          </div>
        </foreignObject>
      )}

    </g>
  )
}