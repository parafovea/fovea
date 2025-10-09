/**
 * @module InterpolationModeSelector
 * @description Modal dialog for selecting interpolation modes between keyframes.
 * Provides preset options and real-time preview of interpolation effects.
 */

import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Slider,
  Typography,
  Box,
} from '@mui/material'
import { Annotation, InterpolationType, INTERPOLATION_PRESETS } from '../../models/types.js'
import { BezierCurveEditor } from './BezierCurveEditor.js'

/**
 * @interface InterpolationModeSelectorProps
 * @description Props for InterpolationModeSelector component.
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
  onApply: (segmentIndex: number, mode: InterpolationType, controlPoints?: any) => void
}

/**
 * @component InterpolationModeSelector
 * @description Modal dialog for selecting and previewing interpolation modes.
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
  const [bezierControlPoints, setBezierControlPoints] = useState<any>(
    segment?.controlPoints || {}
  )

  // Handle mode change
  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const mode = event.target.value as InterpolationType
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
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>Interpolation Mode</DialogTitle>
        <DialogContent>
          <Typography>Current frame is not in an interpolation segment.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Interpolation Mode</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Segment: Frame {segment.startFrame} → {segment.endFrame}
        </Typography>

        {/* Mode Selection */}
        <FormControl component="fieldset" fullWidth sx={{ mt: 2 }}>
          <RadioGroup value={selectedMode} onChange={handleModeChange}>
            <FormControlLabel
              value="linear"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{INTERPOLATION_PRESETS.linear.icon}</Typography>
                  <Box>
                    <Typography variant="body1">
                      {INTERPOLATION_PRESETS.linear.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {INTERPOLATION_PRESETS.linear.description}
                    </Typography>
                  </Box>
                </Box>
              }
            />

            <FormControlLabel
              value="ease-in-out"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{INTERPOLATION_PRESETS.easeInOut.icon}</Typography>
                  <Box>
                    <Typography variant="body1">
                      {INTERPOLATION_PRESETS.easeInOut.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {INTERPOLATION_PRESETS.easeInOut.description}
                    </Typography>
                  </Box>
                </Box>
              }
            />

            <FormControlLabel
              value="ease-in"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{INTERPOLATION_PRESETS.easeIn.icon}</Typography>
                  <Box>
                    <Typography variant="body1">
                      {INTERPOLATION_PRESETS.easeIn.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {INTERPOLATION_PRESETS.easeIn.description}
                    </Typography>
                  </Box>
                </Box>
              }
            />

            <FormControlLabel
              value="ease-out"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{INTERPOLATION_PRESETS.easeOut.icon}</Typography>
                  <Box>
                    <Typography variant="body1">
                      {INTERPOLATION_PRESETS.easeOut.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {INTERPOLATION_PRESETS.easeOut.description}
                    </Typography>
                  </Box>
                </Box>
              }
            />

            <FormControlLabel
              value="hold"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{INTERPOLATION_PRESETS.hold.icon}</Typography>
                  <Box>
                    <Typography variant="body1">
                      {INTERPOLATION_PRESETS.hold.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {INTERPOLATION_PRESETS.hold.description}
                    </Typography>
                  </Box>
                </Box>
              }
            />

            <FormControlLabel
              value="bezier"
              control={<Radio />}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>⌢</Typography>
                  <Box>
                    <Typography variant="body1">Custom (Bezier)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Custom curve with control points
                    </Typography>
                  </Box>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Bezier Editor (if custom selected) */}
        {showBezierEditor && (
          <Box sx={{ mt: 3 }}>
            <BezierCurveEditor
              property="x"
              initialControlPoints={bezierControlPoints.x || [
                { x: 0.42, y: 0 },
                { x: 0.58, y: 1 },
              ]}
              onChange={(controlPoints) => {
                setBezierControlPoints((prev: any) => ({
                  ...prev,
                  x: controlPoints,
                  y: controlPoints, // Apply same curve to y for simplicity
                  width: controlPoints,
                  height: controlPoints,
                }))
              }}
            />
          </Box>
        )}

        {/* Preview Slider */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" gutterBottom>
            Preview
          </Typography>
          <Slider
            value={previewFrame}
            onChange={(_event, newValue) => setPreviewFrame(newValue as number)}
            min={segment.startFrame}
            max={segment.endFrame}
            step={1}
            marks
            valueLabelDisplay="auto"
            size="small"
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            Scrub to preview interpolation at different frames
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleApply} variant="contained" color="primary">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  )
}
