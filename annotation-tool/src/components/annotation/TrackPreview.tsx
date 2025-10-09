/**
 * @file TrackPreview.tsx
 * @description Full-screen preview component for reviewing a single tracking result.
 * Displays all bounding boxes for a track with playback controls.
 * Supports keyboard shortcuts for accept/reject and frame navigation.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Slider,
  Stack,
  Chip,
  Alert,
} from '@mui/material'
import {
  Close as CloseIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { TrackingResult } from '../../models/types.js'

/**
 * @interface TrackPreviewProps
 * @description Props for TrackPreview component.
 * @property track - Tracking result to preview, or null if no track selected
 * @property videoId - ID of the video being annotated
 * @property onAccept - Callback when user accepts the track
 * @property onReject - Callback when user rejects the track
 * @property onClose - Callback when user closes the preview
 * @property videoElement - Optional video element for playback control
 */
export interface TrackPreviewProps {
  track: TrackingResult | null
  videoId: string
  onAccept: () => void
  onReject: () => void
  onClose: () => void
  videoElement?: HTMLVideoElement | null
}

/**
 * Get color based on confidence level.
 *
 * @param confidence - Confidence value (0-1)
 * @returns MUI color string
 */
function getConfidenceColor(confidence: number): 'success' | 'warning' | 'error' {
  if (confidence > 0.9) return 'success'
  if (confidence > 0.7) return 'warning'
  return 'error'
}

/**
 * @component TrackPreview
 * @description Full-screen preview dialog for reviewing a single tracking result.
 * Shows all bounding boxes with frame-by-frame scrubbing, playback controls,
 * and keyboard shortcuts for quick accept/reject decisions. Displays confidence
 * per frame and highlights gaps or low-confidence sections.
 *
 * @param props - Component properties
 * @param props.track - Tracking result to preview
 * @param props.videoId - Video ID
 * @param props.onAccept - Callback for accepting track (keyboard: Y)
 * @param props.onReject - Callback for rejecting track (keyboard: N)
 * @param props.onClose - Callback for closing preview (keyboard: Esc)
 * @param props.videoElement - Optional video element reference
 * @returns React component
 *
 * @public
 */
export function TrackPreview({
  track,
  onAccept,
  onReject,
  onClose,
}: TrackPreviewProps) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Reset state when track changes
  useEffect(() => {
    setCurrentFrameIndex(0)
    setIsPlaying(false)
  }, [track])

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!track) return

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'y':
          onAccept()
          break
        case 'n':
          onReject()
          break
        case ' ':
          e.preventDefault()
          setIsPlaying((prev) => !prev)
          break
        case 'arrowright':
          setCurrentFrameIndex((prev) => Math.min(prev + 1, track.frames.length - 1))
          break
        case 'arrowleft':
          setCurrentFrameIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'escape':
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [track, onAccept, onReject, onClose])

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !track) return

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= track.frames.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 100) // ~10 fps playback

    return () => clearInterval(interval)
  }, [isPlaying, track])

  if (!track) {
    return null
  }

  const currentFrame = track.frames[currentFrameIndex]
  const frameNumbers = track.frames.map((f) => f.frameNumber)

  // Find gaps in tracking
  const gaps: Array<{ start: number; end: number }> = []
  const sortedFrames = [...frameNumbers].sort((a, b) => a - b)
  for (let i = 1; i < sortedFrames.length; i++) {
    if (sortedFrames[i] - sortedFrames[i - 1] > 1) {
      gaps.push({
        start: sortedFrames[i - 1] + 1,
        end: sortedFrames[i] - 1,
      })
    }
  }

  // Find low confidence frames
  const lowConfidenceFrames = track.frames.filter((f) => f.confidence < 0.7)

  return (
    <Dialog
      open={Boolean(track)}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          height: '90vh',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">
            Track #{track.trackId}: {track.label}
          </Typography>
          <Chip
            label={`Confidence: ${track.confidence.toFixed(2)}`}
            color={getConfidenceColor(track.confidence)}
            size="small"
          />
        </Box>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        {/* Video preview area (placeholder - actual video rendering would go here) */}
        <Box
          sx={{
            flex: 1,
            backgroundColor: 'grey.900',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            minHeight: 400,
          }}
        >
          <Typography variant="h6" color="grey.500">
            Video Preview with Bounding Box
          </Typography>
          {/* In actual implementation, render video with bounding box overlay */}
          {currentFrame && (
            <Box
              sx={{
                position: 'absolute',
                border: `3px solid ${
                  getConfidenceColor(currentFrame.confidence) === 'success'
                    ? 'green'
                    : getConfidenceColor(currentFrame.confidence) === 'warning'
                    ? 'orange'
                    : 'red'
                }`,
                left: `${currentFrame.box.x}%`,
                top: `${currentFrame.box.y}%`,
                width: `${currentFrame.box.width}%`,
                height: `${currentFrame.box.height}%`,
                pointerEvents: 'none',
              }}
            />
          )}
        </Box>

        {/* Frame info and warnings */}
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">
              Frame {currentFrame.frameNumber} ({currentFrameIndex + 1}/{track.frames.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Confidence: {currentFrame.confidence.toFixed(2)}
            </Typography>
          </Box>

          {gaps.length > 0 && (
            <Alert severity="info" icon={<WarningIcon />}>
              Gaps detected: {gaps.map((g) => `Frame ${g.start}-${g.end}`).join(', ')}
            </Alert>
          )}

          {lowConfidenceFrames.length > 0 && (
            <Alert severity="warning" icon={<WarningIcon />}>
              {lowConfidenceFrames.length} low confidence frame{lowConfidenceFrames.length !== 1 ? 's' : ''} ({'<'}70%):{' '}
              {lowConfidenceFrames
                .slice(0, 5)
                .map((f) => `Frame ${f.frameNumber} (${f.confidence.toFixed(2)})`)
                .join(', ')}
              {lowConfidenceFrames.length > 5 && '...'}
            </Alert>
          )}
        </Stack>

        {/* Timeline slider */}
        <Box sx={{ px: 2 }}>
          <Slider
            value={currentFrameIndex}
            onChange={(_, value) => setCurrentFrameIndex(value as number)}
            min={0}
            max={track.frames.length - 1}
            step={1}
            marks={track.frames
              .filter((_, i) => i % Math.ceil(track.frames.length / 10) === 0)
              .map((frame, i) => ({
                value: i * Math.ceil(track.frames.length / 10),
                label: `${frame.frameNumber}`,
              }))}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `Frame ${track.frames[value].frameNumber}`}
          />
        </Box>

        {/* Transport controls */}
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<PrevIcon />}
            onClick={() => setCurrentFrameIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentFrameIndex === 0}
          >
            Prev
          </Button>

          <Button
            variant="contained"
            startIcon={isPlaying ? <PauseIcon /> : <PlayIcon />}
            onClick={() => setIsPlaying((prev) => !prev)}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </Button>

          <Button
            variant="outlined"
            endIcon={<NextIcon />}
            onClick={() => setCurrentFrameIndex((prev) => Math.min(prev + 1, track.frames.length - 1))}
            disabled={currentFrameIndex === track.frames.length - 1}
          >
            Next
          </Button>
        </Stack>

        {/* Keyboard shortcuts hint */}
        <Typography variant="caption" color="text.secondary" align="center">
          Keyboard: Y (Accept) · N (Reject) · Space (Play/Pause) · ← → (Step) · Esc (Close)
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<RejectIcon />}
          onClick={onReject}
        >
          Reject (N)
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<AcceptIcon />}
          onClick={onAccept}
        >
          Accept (Y)
        </Button>
      </DialogActions>
    </Dialog>
  )
}
