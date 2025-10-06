/**
 * @file TrackingResultsPanel.tsx
 * @description Panel for reviewing and managing tracking results.
 * Displays candidate tracks with confidence indicators and frame coverage.
 * Allows preview, accept, and reject actions for each track.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material'
import { TrackingResult } from '../../models/types.js'

/**
 * @interface TrackingResultsPanelProps
 * @description Props for TrackingResultsPanel component.
 * @property trackingResults - Array of tracking results from model service
 * @property videoId - ID of the video being annotated
 * @property onAcceptTrack - Callback when track is accepted
 * @property onRejectTrack - Callback when track is rejected
 * @property onPreviewTrack - Callback when track preview is requested
 */
export interface TrackingResultsPanelProps {
  trackingResults: TrackingResult[]
  videoId: string
  onAcceptTrack: (trackId: string | number) => void
  onRejectTrack: (trackId: string | number) => void
  onPreviewTrack: (trackId: string | number) => void
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
 * @component TrackingResultsPanel
 * @description Panel for reviewing tracking results from automated tracking.
 * Displays list of tracked candidates with confidence indicators, frame coverage
 * visualization, and preview, accept, and reject actions.
 *
 * @param props - Component properties
 * @param props.trackingResults - Array of tracking results to display
 * @param props.videoId - ID of the video being annotated
 * @param props.onAcceptTrack - Callback fired when user accepts a track
 * @param props.onRejectTrack - Callback fired when user rejects a track
 * @param props.onPreviewTrack - Callback fired when user requests track preview
 * @returns React component
 *
 * @public
 */
export function TrackingResultsPanel({
  trackingResults,
  onAcceptTrack,
  onRejectTrack,
  onPreviewTrack,
}: TrackingResultsPanelProps) {
  const [hoveredTrack, setHoveredTrack] = useState<string | number | null>(null)

  const handleAcceptAll = () => {
    trackingResults
      .filter((track) => track.confidence > 0.9)
      .forEach((track) => onAcceptTrack(track.trackId))
  }

  const handleRejectAll = () => {
    trackingResults
      .filter((track) => track.confidence < 0.7)
      .forEach((track) => onRejectTrack(track.trackId))
  }

  return (
    <Paper elevation={2} sx={{ p: 2, maxHeight: '400px', overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Tracking Results</Typography>
        <Typography variant="body2" color="text.secondary">
          Found {trackingResults.length} track{trackingResults.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {trackingResults.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            size="small"
            onClick={handleAcceptAll}
            disabled={trackingResults.filter((t) => t.confidence > 0.9).length === 0}
          >
            Accept All High Confidence ({'>'}90%)
          </Button>
          <Button
            size="small"
            onClick={handleRejectAll}
            disabled={trackingResults.filter((t) => t.confidence < 0.7).length === 0}
          >
            Reject All Low Confidence ({'<'}70%)
          </Button>
        </Stack>
      )}

      <Stack spacing={2}>
        {trackingResults.map((track) => {
          const frameNumbers = track.frames.map((f) => f.frameNumber)
          const minFrame = Math.min(...frameNumbers)
          const maxFrame = Math.max(...frameNumbers)
          const totalRange = maxFrame - minFrame + 1
          const coverage = (track.frames.length / totalRange) * 100

          // Calculate gaps
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

          return (
            <Paper
              key={track.trackId}
              variant="outlined"
              sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                backgroundColor: hoveredTrack === track.trackId ? 'action.hover' : 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
              onMouseEnter={() => setHoveredTrack(track.trackId)}
              onMouseLeave={() => setHoveredTrack(null)}
              onClick={() => onPreviewTrack(track.trackId)}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2">
                    Track #{track.trackId}
                  </Typography>
                  <Chip
                    label={track.label}
                    size="small"
                    color={getConfidenceColor(track.confidence)}
                  />
                  <Typography variant="caption" color="text.secondary">
                    conf: {track.confidence.toFixed(2)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Preview Track">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPreviewTrack(track.trackId)
                      }}
                    >
                      <PreviewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Accept Track">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAcceptTrack(track.trackId)
                      }}
                    >
                      <AcceptIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Reject Track">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRejectTrack(track.trackId)
                      }}
                    >
                      <RejectIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Frames {minFrame}-{maxFrame} ({gaps.length > 0 ? `${gaps.length} gap${gaps.length !== 1 ? 's' : ''}` : 'continuous'})
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
                  <LinearProgress
                    variant="determinate"
                    value={coverage}
                    sx={{
                      height: 20,
                      borderRadius: 1,
                      backgroundColor: 'action.disabledBackground',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getConfidenceColor(track.confidence) === 'success'
                          ? 'success.main'
                          : getConfidenceColor(track.confidence) === 'warning'
                          ? 'warning.main'
                          : 'error.main',
                      },
                    }}
                  />
                  {/* Show gaps as overlays */}
                  {gaps.map((gap, idx) => {
                    const gapStart = ((gap.start - minFrame) / totalRange) * 100
                    const gapWidth = ((gap.end - gap.start + 1) / totalRange) * 100
                    return (
                      <Box
                        key={idx}
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: `${gapStart}%`,
                          width: `${gapWidth}%`,
                          height: 20,
                          backgroundColor: 'action.disabledBackground',
                          borderLeft: '1px solid',
                          borderRight: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )
                  })}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60 }}>
                  {track.frames.length}/{totalRange} frames
                </Typography>
              </Box>
            </Paper>
          )
        })}
      </Stack>

      {trackingResults.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No tracking results available
          </Typography>
        </Box>
      )}
    </Paper>
  )
}
