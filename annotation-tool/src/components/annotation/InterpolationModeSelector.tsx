/**
 * Modal dialog for selecting interpolation modes between keyframes.
 * Provides preset options and real-time preview of interpolation effects.
 *
 * @module
 */

import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Annotation, InterpolationType, INTERPOLATION_PRESETS, BezierControlPoint } from '@models/types'

/**
 * Control points for bezier interpolation, organized by property.
 */
export interface BezierControlPointSet {
  x?: BezierControlPoint[]
  y?: BezierControlPoint[]
  width?: BezierControlPoint[]
  height?: BezierControlPoint[]
}
import { BezierCurveEditor } from './BezierCurveEditor'

/**
 * Props for InterpolationModeSelector component.
 */
export interface InterpolationModeSelectorProps {
  /** Annotation being edited (optional) */
  annotation: Annotation | null
  /** Current frame number */
  currentFrame: number
  /** Whether dialog is open */
  open: boolean
  /** Callback to close dialog */
  onClose: () => void
  /** Callback to apply interpolation mode */
  onApply: (segmentIndex: number, mode: InterpolationType, controlPoints?: BezierControlPointSet) => void
}

/**
 * Modal dialog for selecting and previewing interpolation modes.
 */
export const InterpolationModeSelector: React.FC<InterpolationModeSelectorProps> = ({
  annotation,
  currentFrame,
  open,
  onClose,
  onApply,
}) => {
  // Find segment containing current frame
  const segment = useMemo(() => {
    return annotation?.boundingBoxSequence?.interpolationSegments.find(
      s => s.startFrame <= currentFrame && s.endFrame >= currentFrame
    )
  }, [annotation?.boundingBoxSequence?.interpolationSegments, currentFrame])

  const segmentIndex = useMemo(() => {
    return annotation?.boundingBoxSequence?.interpolationSegments.findIndex(
      s => s.startFrame <= currentFrame && s.endFrame >= currentFrame
    ) ?? -1
  }, [annotation?.boundingBoxSequence?.interpolationSegments, currentFrame])

  // State
  const [selectedMode, setSelectedMode] = useState<InterpolationType>(
    segment?.type || 'linear'
  )
  const [previewFrame, setPreviewFrame] = useState(currentFrame)
  const [showBezierEditor, setShowBezierEditor] = useState(false)
  const [bezierControlPoints, setBezierControlPoints] = useState<BezierControlPointSet>(
    segment?.controlPoints || {}
  )

  // Handle mode change
  const handleModeChange = (value: string) => {
    const mode = value as InterpolationType
    setSelectedMode(mode)

    // Show bezier editor if custom selected
    if (mode === 'bezier') {
      setShowBezierEditor(true)
    } else {
      setShowBezierEditor(false)
    }
  }

  // Handle apply
  const handleApply = () => {
    if (segmentIndex === -1) {
      onClose()
      return
    }

    const controlPoints = selectedMode === 'bezier' ? bezierControlPoints : undefined
    onApply(segmentIndex, selectedMode, controlPoints)
    onClose()
  }

  // Handle cancel
  const handleCancel = () => {
    setSelectedMode(segment?.type || 'linear')
    setShowBezierEditor(false)
    onClose()
  }

  if (!segment) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
        <DialogContent data-tour-id="interpolation-mode-selector">
          <DialogHeader>
            <DialogTitle>Interpolation Mode</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Current frame is not in an interpolation segment.</p>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const presets = [
    { value: 'linear', preset: INTERPOLATION_PRESETS.linear },
    { value: 'ease-in-out', preset: INTERPOLATION_PRESETS.easeInOut },
    { value: 'ease-in', preset: INTERPOLATION_PRESETS.easeIn },
    { value: 'ease-out', preset: INTERPOLATION_PRESETS.easeOut },
    { value: 'hold', preset: INTERPOLATION_PRESETS.hold },
  ]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Interpolation Mode</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Segment: Frame {segment.startFrame} → {segment.endFrame}
        </p>

        {/* Mode Selection */}
        <RadioGroup value={selectedMode} onValueChange={handleModeChange} className="mt-4">
          {presets.map(({ value, preset }) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem value={value} id={`interp-${value}`} />
              <Label htmlFor={`interp-${value}`} className="flex items-center gap-2 cursor-pointer">
                <span>{preset.icon}</span>
                <div>
                  <p className="text-sm">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                </div>
              </Label>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <RadioGroupItem value="bezier" id="interp-bezier" />
            <Label htmlFor="interp-bezier" className="flex items-center gap-2 cursor-pointer">
              <span>⌢</span>
              <div>
                <p className="text-sm">Custom (Bezier)</p>
                <p className="text-xs text-muted-foreground">Custom curve with control points</p>
              </div>
            </Label>
          </div>
        </RadioGroup>

        {/* Bezier Editor (if custom selected) */}
        {showBezierEditor && (
          <div className="mt-6">
            <BezierCurveEditor
              property="x"
              initialControlPoints={bezierControlPoints.x || [
                { x: 0.42, y: 0 },
                { x: 0.58, y: 1 },
              ]}
              onChange={(controlPoints) => {
                setBezierControlPoints((prev: BezierControlPointSet) => ({
                  ...prev,
                  x: controlPoints,
                  y: controlPoints, // Apply same curve to y for simplicity
                  width: controlPoints,
                  height: controlPoints,
                }))
              }}
            />
          </div>
        )}

        {/* Preview Slider */}
        <div className="mt-6">
          <p className="text-xs font-medium mb-2">Preview</p>
          <Slider
            value={[previewFrame]}
            onValueChange={(val) => setPreviewFrame(Array.isArray(val) ? val[0] : val)}
            min={segment.startFrame}
            max={segment.endFrame}
            step={1}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Scrub to preview interpolation at different frames
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
