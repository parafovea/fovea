import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Chip, Tooltip } from '@mui/material'
import { AppDispatch } from '../../store/store'
import { updateAnnotation, addKeyframe, updateKeyframe } from '../../store/annotationSlice'
import { BoundingBox } from '../../models/types.js'

interface InteractiveBoundingBoxProps {
  annotation: any
  currentFrame: number
  videoWidth: number
  videoHeight: number
  isActive: boolean
  onSelect: () => void
  mode: 'keyframe' | 'interpolated' | 'ghost'
  onUpdate?: (box: Partial<BoundingBox>) => void
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null
type InteractionMode = 'none' | 'dragging' | 'resizing'

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
  const [originalBox, setOriginalBox] = useState(annotation.boundingBox)
  const svgRef = useRef<SVGSVGElement | null>(null)

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
          strokeWidth: 3,
          strokeDasharray: undefined,
        }
      case 'interpolated':
        return {
          opacity: 0.6,
          strokeWidth: 2,
          strokeDasharray: undefined,
        }
      case 'ghost':
        return {
          opacity: 0.3,
          strokeWidth: 2,
          strokeDasharray: '5,5',
        }
    }
  }

  const visualStyle = getVisualStyle()

  // Handle mouse down on main box (for dragging)
  const handleBoxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditable) return

    onSelect()

    const coords = getRelativeCoordinates(e)
    setInteractionMode('dragging')
    setDragStart(coords)
    setOriginalBox({ ...annotation.boundingBox })
  }

  // Handle mouse down on resize handle
  const handleResizeMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    if (!isEditable) return

    onSelect()

    // If interpolated mode, convert to keyframe on handle click
    if (mode === 'interpolated') {
      dispatch(addKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        frameNumber: currentFrame,
        box: annotation.boundingBox,
      }))
      return
    }

    const coords = getRelativeCoordinates(e)
    setInteractionMode('resizing')
    setActiveHandle(handle)
    setDragStart(coords)
    setOriginalBox({ ...annotation.boundingBox })
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
    if (interactionMode === 'none') return

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
  }, [interactionMode, activeHandle, dragStart, originalBox, annotation, videoWidth, videoHeight, dispatch])

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

  const box = annotation.boundingBox

  return (
    <g
      data-annotation-id={annotation.id}
      onMouseEnter={() => isEditable && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ pointerEvents: mode === 'ghost' ? 'none' : 'auto' }}
    >
      {/* Main bounding box */}
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
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
              x={box.x - handleSize / 2}
              y={box.y - handleSize / 2}
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
              x={box.x + box.width - handleSize / 2}
              y={box.y - handleSize / 2}
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
              x={box.x + box.width - handleSize / 2}
              y={box.y + box.height - handleSize / 2}
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
              x={box.x - handleSize / 2}
              y={box.y + box.height - handleSize / 2}
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
                x={box.x + box.width / 2 - handleSize / 2}
                y={box.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 'n-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
              />
              <rect
                x={box.x + box.width - handleSize / 2}
                y={box.y + box.height / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 'e-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
              />
              <rect
                x={box.x + box.width / 2 - handleSize / 2}
                y={box.y + box.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke={strokeColor}
                strokeWidth="1"
                style={{ cursor: 's-resize', pointerEvents: 'auto' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 's')}
              />
              <rect
                x={box.x - handleSize / 2}
                y={box.y + box.height / 2 - handleSize / 2}
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
          x={box.x}
          y={box.y - 25}
          width={Math.max(box.width, 120)}
          height={25}
          style={{ pointerEvents: 'none' }}
        >
          <Chip
            label={annotation.linkedObject.name}
            size="small"
            color={
              annotation.linkedType === 'entity' ? 'success' :
              annotation.linkedType === 'event' ? 'warning' :
              annotation.linkedType === 'location' ? 'secondary' :
              'error'
            }
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        </foreignObject>
      )}
    </g>
  )
}