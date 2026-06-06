import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useAddKeyframe, useUpdateKeyframe, useUpdateAnnotation } from '@store/queries'
import { BoundingBox, Annotation, TypeAnnotation, ObjectAnnotation } from '@models/types'
import { BoundingBoxHUD } from './BoundingBoxHUD'
import { useBoundingBoxKeyboard } from './useBoundingBoxKeyboard'

/**
 * Type guard to check if annotation is a TypeAnnotation.
 */
function isTypeAnnotation(ann: Annotation): ann is TypeAnnotation {
  return ann.annotationType === 'type'
}

/**
 * Type guard to check if annotation is an ObjectAnnotation.
 */
function isObjectAnnotation(ann: Annotation): ann is ObjectAnnotation {
  return ann.annotationType === 'object'
}
import { LazyBoundingBoxSequence } from '@utils/interpolation'

/**
 * Props for InteractiveBoundingBox component.
 */
interface InteractiveBoundingBoxProps {
  /** Annotation object containing bounding box sequence and metadata */
  annotation: Annotation
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
  /** Optional callback fired when edit is complete (drag/resize finished) */
  onEditComplete?: () => void
  /** Resolved type name from ontology (for type annotations) */
  typeName?: string
  /** Resolved linked object with name (for object annotations) */
  linkedObject?: { name: string }
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null
type InteractionMode = 'none' | 'dragging' | 'resizing'

/**
 * Interactive bounding box component with drag, resize, and keyframe management.
 * Supports keyframe-based animation with interpolation between frames. Provides resize handles
 * for corner and edge manipulation, and displays quick actions panel when active.
 *
 * @param props - Component properties
 * @returns SVG group containing bounding box and interaction handles
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
  onEditComplete,
  typeName,
  linkedObject,
}: InteractiveBoundingBoxProps) {
  // TanStack Query mutations for annotation operations
  const addKeyframe = useAddKeyframe()
  const updateKeyframe = useUpdateKeyframe()
  const { mutate: updateAnnotationMutation } = useUpdateAnnotation()

  const [hovering, setHovering] = useState(false)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none')
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rectRef = useRef<SVGRectElement | null>(null)

  // Create lazy interpolator for on-demand frame lookup with caching
  // This is more efficient than pre-generating all frames
  const lazySequence = useMemo(() => {
    if (!annotation.boundingBoxSequence) return null
    const keyframes = annotation.boundingBoxSequence.boxes.filter(
      (b: BoundingBox) => b.isKeyframe !== false
    )
    return new LazyBoundingBoxSequence(
      keyframes,
      annotation.boundingBoxSequence.interpolationSegments || []
    )
  }, [annotation.boundingBoxSequence])

  // Get the box for the current frame using lazy evaluation
  // If no box at current frame, use the nearest keyframe for ghost display
  const currentBox = useMemo(() => {
    if (!lazySequence) return null

    // Try to get interpolated box for current frame (O(1) cached lookup)
    const exactFrame = lazySequence.getBoxAtFrame(currentFrame)
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
  }, [lazySequence, currentFrame, annotation.boundingBoxSequence])

  const [originalBox, setOriginalBox] = useState(currentBox)

  const handleSize = 8 // Size of resize handles in pixels

  // Determine if box is editable based on mode
  const isEditable = mode !== 'ghost'
  const showAllHandles = mode === 'keyframe'

  // Get stroke color based on type
  const getStrokeColor = () => {
    if (isTypeAnnotation(annotation)) {
      // Type annotation - color by type category
      if (annotation.typeCategory === 'entity') return '#4caf50'
      if (annotation.typeCategory === 'event') return '#ff9800'
      if (annotation.typeCategory === 'role') return '#2196f3'
    } else if (isObjectAnnotation(annotation)) {
      // Object annotation - color by linked object type
      if (annotation.linkedEntityId) return '#4caf50'
      if (annotation.linkedEventId) return '#ff9800'
      if (annotation.linkedLocationId) return '#9c27b0'
      if (annotation.linkedCollectionId) return '#ff5722'
    }
    return '#757575'
  }

  const strokeColor = getStrokeColor()

  // Get visual style based on mode
  // Type annotations use thinner stroke (2px), object annotations use thicker stroke (4px)
  const getVisualStyle = () => {
    const baseStroke = annotation.annotationType === 'type' ? 2 : 4
    switch (mode) {
      case 'keyframe':
        return {
          opacity: isActive || hovering ? 1.0 : 0.8,
          strokeWidth: baseStroke,
          strokeDasharray: undefined,
        }
      case 'interpolated':
        return {
          opacity: 0.6,
          strokeWidth: baseStroke * 0.75,
          strokeDasharray: undefined,
        }
      case 'ghost':
        return {
          opacity: 0.5,
          strokeWidth: baseStroke * 0.75,
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
      addKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        frameNumber: currentFrame,
        box: currentBox,
      })
      // Save immediately after adding keyframe
      if (onEditComplete) {
        onEditComplete()
      }
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

  // Get relative coordinates within the SVG using native matrix transformation
  // This correctly handles viewBox and preserveAspectRatio (letterboxing/pillarboxing)
  // Falls back to simple ratio calculation in test environments (jsdom)
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

    // Use SVG's native coordinate transformation matrix when available
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

    // Calculate current coordinates using SVG matrix transformation when available
    // Falls back to simple ratio calculation in test environments (jsdom)
    let currentX: number
    let currentY: number

    if (typeof svg.createSVGPoint === 'function' && typeof svg.getScreenCTM === 'function') {
      const ctm = svg.getScreenCTM()
      if (ctm) {
        const pt = svg.createSVGPoint()
        pt.x = e.clientX
        pt.y = e.clientY
        const svgPoint = pt.matrixTransform(ctm.inverse())
        currentX = svgPoint.x
        currentY = svgPoint.y
      } else {
        return
      }
    } else {
      // Fallback for test environments
      const rect = svg.getBoundingClientRect()
      currentX = ((e.clientX - rect.left) / rect.width) * videoWidth
      currentY = ((e.clientY - rect.top) / rect.height) * videoHeight
    }

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

      // Shift-lock aspect ratio when resizing from a corner — the smaller
      // of the two dimension deltas wins so the ratio of the original box
      // is preserved. The anchored edge of the corner handle determines
      // which direction the constraint grows.
      if (e.shiftKey && (activeHandle === 'nw' || activeHandle === 'ne' ||
          activeHandle === 'se' || activeHandle === 'sw')) {
        const aspect = originalBox.width / originalBox.height
        const wFromH = newBox.height * aspect
        const hFromW = newBox.width / aspect
        // Honour whichever axis drifted farther.
        if (Math.abs(newBox.width - originalBox.width) > Math.abs(newBox.height - originalBox.height)) {
          const nextHeight = hFromW
          if (activeHandle === 'nw' || activeHandle === 'ne') {
            newBox.y = originalBox.y + originalBox.height - nextHeight
          }
          newBox.height = nextHeight
        } else {
          const nextWidth = wFromH
          if (activeHandle === 'nw' || activeHandle === 'sw') {
            newBox.x = originalBox.x + originalBox.width - nextWidth
          }
          newBox.width = nextWidth
        }
      }
    }

    // Update the annotation with the new bounding box
    if (onUpdate) {
      onUpdate(newBox)
    } else if (mode === 'keyframe') {
      // Update keyframe directly
      updateKeyframe({
        videoId: annotation.videoId,
        annotationId: annotation.id,
        frameNumber: currentFrame,
        box: newBox,
      })
    } else {
      // Fallback to updating annotation - update the first keyframe in the sequence
      const updatedSequence = {
        ...annotation.boundingBoxSequence,
        boxes: annotation.boundingBoxSequence.boxes.map((box, idx) =>
          idx === 0 ? { ...box, ...newBox } : box
        ),
      }
      updateAnnotationMutation({
        ...annotation,
        boundingBoxSequence: updatedSequence,
        updatedAt: new Date().toISOString(),
      })
    }
  }, [interactionMode, activeHandle, dragStart, originalBox, annotation, videoWidth, videoHeight, updateKeyframe, updateAnnotationMutation, onUpdate, mode, currentFrame])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    const wasEditing = interactionMode !== 'none'
    setInteractionMode('none')
    setActiveHandle(null)
    // Notify parent that edit is complete so it can save immediately
    if (wasEditing && onEditComplete) {
      onEditComplete()
    }
  }, [interactionMode, onEditComplete])

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

  // Arrow-key nudging. Enabled only for the currently selected box in an
  // editable mode; shift multiplies the step to 10 pixels per press. Uses
  // onUpdate so the caller's persistence pipeline runs on every nudge.
  useBoundingBoxKeyboard({
    enabled: isActive && isEditable,
    box: currentBox,
    videoWidth,
    videoHeight,
    onNudge: (patch) => {
      if (onUpdate) {
        onUpdate(patch)
      } else if (mode === 'keyframe' && currentBox) {
        updateKeyframe({
          videoId: annotation.videoId,
          annotationId: annotation.id,
          frameNumber: currentFrame,
          box: { ...currentBox, ...patch },
        })
      }
    },
    onCommit: () => {
      onEditComplete?.()
    },
  })


  // Safety check: return null if no box available (after all hooks have been called)
  if (!currentBox) {
    return null
  }

  // Get badge label. For type annotations show the resolved type name
  // (falling back to a category-prefixed id snippet so the visitor sees
  // "entity • d20a07" instead of the literal category word "entity"
  // which reads as if it were the actual type name). For object
  // annotations, show the linked world object's name; only fall back
  // to the kind-word literal ("Entity", "Event", …) when no linked
  // object resolved at all, in which case the visitor at least sees
  // what KIND of link the annotation declared.
  const badgeLabel =
    isTypeAnnotation(annotation)
      ? (typeName || `${annotation.typeCategory} • ${annotation.typeId.slice(0, 6)}`)
      : linkedObject?.name ||
        (isObjectAnnotation(annotation) && annotation.linkedEntityId
          ? `Entity • ${annotation.linkedEntityId.slice(0, 6)}`
          : isObjectAnnotation(annotation) && annotation.linkedEventId
          ? `Event • ${annotation.linkedEventId.slice(0, 6)}`
          : isObjectAnnotation(annotation) && annotation.linkedLocationId
          ? `Location • ${annotation.linkedLocationId.slice(0, 6)}`
          : isObjectAnnotation(annotation) && annotation.linkedCollectionId
          ? `Collection • ${annotation.linkedCollectionId.slice(0, 6)}`
          : 'Annotation')

  // Get badge variant based on annotation type
  const getBadgeVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (isObjectAnnotation(annotation) && annotation.linkedEntityId) return 'default'
    if (isObjectAnnotation(annotation) && annotation.linkedEventId) return 'secondary'
    if (isTypeAnnotation(annotation) && annotation.typeCategory === 'entity') return 'default'
    if (isTypeAnnotation(annotation) && annotation.typeCategory === 'event') return 'secondary'
    return 'outline'
  }

  // Render resize handle with optional tooltip
  const renderResizeHandle = (
    x: number, y: number, cursor: string, handle: ResizeHandle, tooltipText?: string
  ) => {
    const rect = (
      <rect
        x={x}
        y={y}
        width={handleSize}
        height={handleSize}
        fill="white"
        stroke={strokeColor}
        strokeWidth="1"
        style={{ cursor, pointerEvents: 'auto' }}
        onMouseDown={(e) => handleResizeMouseDown(e, handle)}
      />
    )

    if (tooltipText) {
      return (
        <Tooltip>
          <TooltipTrigger render={rect} />
          <TooltipContent side="top">{tooltipText}</TooltipContent>
        </Tooltip>
      )
    }

    return rect
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
          {renderResizeHandle(
            currentBox.x - handleSize / 2, currentBox.y - handleSize / 2,
            'nw-resize', 'nw',
            mode === 'interpolated' ? 'Convert to Keyframe' : undefined
          )}
          {renderResizeHandle(
            currentBox.x + currentBox.width - handleSize / 2, currentBox.y - handleSize / 2,
            'ne-resize', 'ne',
            mode === 'interpolated' ? 'Convert to Keyframe' : undefined
          )}
          {renderResizeHandle(
            currentBox.x + currentBox.width - handleSize / 2, currentBox.y + currentBox.height - handleSize / 2,
            'se-resize', 'se',
            mode === 'interpolated' ? 'Convert to Keyframe' : undefined
          )}
          {renderResizeHandle(
            currentBox.x - handleSize / 2, currentBox.y + currentBox.height - handleSize / 2,
            'sw-resize', 'sw',
            mode === 'interpolated' ? 'Convert to Keyframe' : undefined
          )}

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

      {/* Label for annotation type indicator */}
      {mode !== 'ghost' && (
        <foreignObject
          x={currentBox.x}
          y={currentBox.y - 30}
          width={200}
          height={30}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{ width: 'fit-content', display: 'flex', justifyContent: 'flex-start' }}>
            <Badge
              variant={getBadgeVariant()}
              className="h-6 min-w-[60px] max-w-[180px] text-[clamp(10px,0.75rem,14px)] truncate"
            >
              {badgeLabel}
            </Badge>
          </div>
        </foreignObject>
      )}

      {/* Dimension HUD — only while interacting, anchored below the box. */}
      {interactionMode !== 'none' && (
        <foreignObject
          x={currentBox.x}
          y={currentBox.y + currentBox.height}
          width={240}
          height={36}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <BoundingBoxHUD
            width={currentBox.width}
            height={currentBox.height}
            x={currentBox.x}
            y={currentBox.y}
            anchor="bottom"
            accent={strokeColor}
          />
        </foreignObject>
      )}

    </g>
  )
}
