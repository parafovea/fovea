/**
 * Component for displaying audio transcript with timestamps and speaker labels.
 * Highlights active segment based on video playback position and supports click-to-seek functionality.
 */

import { Box, List, ListItem, ListItemButton, Typography, useTheme } from '@mui/material'
import { TranscriptJson } from './types.js'

/**
 * Props for TranscriptViewer component.
 */
export interface TranscriptViewerProps {
  /** Structured transcript with segments, speakers, and language. */
  transcript: TranscriptJson
  /** Current video playback time in seconds. Used to highlight active segment. */
  currentTime: number
  /** Callback invoked when user clicks a segment to seek to that timestamp. */
  onSeek: (time: number) => void
}

/**
 * Format timestamp in seconds to MM:SS format.
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string (e.g., "01:23")
 */
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Component for displaying transcript segments with timestamps and speaker labels.
 * Provides synchronized highlighting with video playback and click-to-seek functionality.
 *
 * @param props - Component properties
 * @returns TranscriptViewer component
 *
 * @example
 * ```tsx
 * const transcript = {
 *   segments: [
 *     { start: 0, end: 5, text: "Hello world", speaker: "Speaker 1", confidence: 0.95 },
 *     { start: 5, end: 10, text: "How are you?", speaker: "Speaker 2", confidence: 0.92 }
 *   ]
 * }
 *
 * <TranscriptViewer
 *   transcript={transcript}
 *   currentTime={3.5}
 *   onSeek={(time) => videoPlayer.currentTime = time}
 * />
 * ```
 */
export function TranscriptViewer({ transcript, currentTime, onSeek }: TranscriptViewerProps) {
  const theme = useTheme()

  // Handle empty transcript
  if (!transcript || !transcript.segments || transcript.segments.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No transcript available.
        </Typography>
      </Box>
    )
  }

  return (
    <List
      sx={{
        width: '100%',
        maxHeight: 400,
        overflow: 'auto',
        bgcolor: 'background.paper',
      }}
    >
      {transcript.segments.map((segment, index) => {
        // Determine if this segment is currently active
        const isActive = currentTime >= segment.start && currentTime < segment.end

        return (
          <ListItem
            key={index}
            disablePadding
            sx={{
              bgcolor: isActive ? theme.palette.primary.light : 'transparent',
              transition: 'background-color 0.2s',
              '&:hover': {
                bgcolor: isActive
                  ? theme.palette.primary.light
                  : theme.palette.action.hover,
              },
            }}
          >
            <ListItemButton onClick={() => onSeek(segment.start)}>
              <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 'medium', minWidth: 50 }}
                  >
                    [{formatTimestamp(segment.start)}]
                  </Typography>
                  {segment.speaker && (
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ fontWeight: 'medium' }}
                    >
                      ({segment.speaker})
                    </Typography>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: isActive ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  {segment.text}
                </Typography>
              </Box>
            </ListItemButton>
          </ListItem>
        )
      })}
    </List>
  )
}
