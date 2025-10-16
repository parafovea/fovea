/**
 * Card component for displaying video summary information.
 * Shows summary text, metadata, and actions for a video summary.
 */

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
  IconButton,
  Alert,
  Skeleton,
  Tabs,
  Tab,
  Divider,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import { format } from 'date-fns'
import { VideoSummary } from '../api/client'
import { TranscriptViewer } from './video-summary/TranscriptViewer.js'
import { TranscriptJson } from './video-summary/types.js'

/**
 * Props for VideoSummaryCard component.
 */
export interface VideoSummaryCardProps {
  summary: VideoSummary | null
  personaName?: string
  personaRole?: string
  loading?: boolean
  error?: string | null
  onEdit?: (summary: VideoSummary) => void
  onDelete?: (summary: VideoSummary) => void
  onRegenerate?: (videoId: string, personaId: string) => void
  showActions?: boolean
  expanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  /** Current video playback time in seconds (for transcript highlighting). */
  currentTime?: number
  /** Callback to seek video to specific timestamp. */
  onSeek?: (time: number) => void
}

/**
 * Card component for displaying video summary information.
 * Displays summary text with optional persona information and actions.
 *
 * @param props - Component properties
 * @returns VideoSummaryCard component
 */
export function VideoSummaryCard({
  summary,
  personaName,
  personaRole,
  loading = false,
  error = null,
  onEdit,
  onDelete,
  onRegenerate,
  showActions = true,
  expanded: controlledExpanded,
  onExpandChange,
  currentTime = 0,
  onSeek,
}: VideoSummaryCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const handleExpandClick = () => {
    const newExpanded = !expanded
    if (isControlled && onExpandChange) {
      onExpandChange(newExpanded)
    } else {
      setInternalExpanded(newExpanded)
    }
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  const handleEdit = () => {
    if (summary && onEdit) {
      onEdit(summary)
    }
  }

  const handleDelete = () => {
    if (summary && onDelete) {
      onDelete(summary)
    }
  }

  const handleRegenerate = () => {
    if (summary && onRegenerate) {
      onRegenerate(summary.videoId, summary.personaId)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="60%" height={32} />
          <Skeleton variant="text" width="40%" height={24} sx={{ mt: 1 }} />
          <Skeleton variant="rectangular" height={100} sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error" icon={<ErrorIcon />}>
            {error}
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!summary) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            No summary available. Generate a summary to get started.
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const confidencePercentage = summary.confidence
    ? Math.round(summary.confidence * 100)
    : null

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            {personaName && (
              <Typography variant="h6" component="div" gutterBottom>
                {personaName}
              </Typography>
            )}
            {personaRole && (
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {personaRole}
              </Typography>
            )}
          </Box>
          {confidencePercentage !== null && (
            <Chip
              label={`${confidencePercentage}% confidence`}
              color={confidencePercentage >= 80 ? 'success' : 'warning'}
              size="small"
              icon={<CheckCircleIcon />}
            />
          )}
        </Box>

        <Typography variant="body1" paragraph>
          {summary.summary}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          {summary.keyFrames && summary.keyFrames.length > 0 && (
            <Chip
              label={`${summary.keyFrames.length} key frames`}
              size="small"
              variant="outlined"
            />
          )}
          {summary.visualAnalysis && (
            <Chip label="Visual analysis available" size="small" variant="outlined" />
          )}
          {summary.audioTranscript && (
            <Chip label="Audio transcript available" size="small" variant="outlined" />
          )}
        </Box>

{expanded && (
          <Box sx={{ mt: 2 }}>
            {/* Show tabs if transcript exists, otherwise show summary details directly */}
            {summary.transcriptJson ? (
              <Box>
                <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <Tab label="Summary" />
                  <Tab label="Transcript" />
                </Tabs>

                {/* Summary Tab Content */}
                {activeTab === 0 && (
                  <Box sx={{ mt: 2 }}>
                    {summary.visualAnalysis && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Visual Analysis
                        </Typography>
                        <Typography variant="body2">{summary.visualAnalysis}</Typography>
                      </Box>
                    )}

                    {summary.audioTranscript && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Audio Transcript (Legacy)
                        </Typography>
                        <Typography variant="body2">{summary.audioTranscript}</Typography>
                      </Box>
                    )}

                    {summary.keyFrames && summary.keyFrames.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Key Frames
                        </Typography>
                        <Typography variant="body2">
                          Frames: {summary.keyFrames.join(', ')}
                        </Typography>
                      </Box>
                    )}

                    {/* Audio Metadata */}
                    {(summary.audioLanguage || summary.speakerCount || summary.audioModelUsed || summary.visualModelUsed || summary.fusionStrategy) && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Processing Details
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {summary.audioLanguage && (
                            <Typography variant="body2">
                              Language: <strong>{summary.audioLanguage}</strong>
                            </Typography>
                          )}
                          {summary.speakerCount != null && (
                            <Typography variant="body2">
                              Speakers: <strong>{summary.speakerCount}</strong>
                            </Typography>
                          )}
                          {summary.audioModelUsed && (
                            <Typography variant="body2">
                              Audio Model: <strong>{summary.audioModelUsed}</strong>
                            </Typography>
                          )}
                          {summary.visualModelUsed && (
                            <Typography variant="body2">
                              Visual Model: <strong>{summary.visualModelUsed}</strong>
                            </Typography>
                          )}
                          {summary.fusionStrategy && (
                            <Typography variant="body2">
                              Fusion Strategy: <strong>{summary.fusionStrategy}</strong>
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )}

                    {/* Processing Times */}
                    {(summary.processingTimeAudio != null || summary.processingTimeVisual != null || summary.processingTimeFusion != null) && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Processing Times
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {summary.processingTimeAudio != null && (
                            <Typography variant="body2">
                              Audio: <strong>{summary.processingTimeAudio.toFixed(2)}s</strong>
                            </Typography>
                          )}
                          {summary.processingTimeVisual != null && (
                            <Typography variant="body2">
                              Visual: <strong>{summary.processingTimeVisual.toFixed(2)}s</strong>
                            </Typography>
                          )}
                          {summary.processingTimeFusion != null && (
                            <Typography variant="body2">
                              Fusion: <strong>{summary.processingTimeFusion.toFixed(2)}s</strong>
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Created: {format(new Date(summary.createdAt), 'PPpp')}
                      </Typography>
                      {summary.updatedAt !== summary.createdAt && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Updated: {format(new Date(summary.updatedAt), 'PPpp')}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {/* Transcript Tab Content */}
                {activeTab === 1 && (
                  <Box sx={{ mt: 2 }}>
                    <TranscriptViewer
                      transcript={summary.transcriptJson as TranscriptJson}
                      currentTime={currentTime}
                      onSeek={onSeek || (() => {})}
                    />
                  </Box>
                )}
              </Box>
            ) : (
              /* No transcript - show summary details directly without tabs */
              <Box sx={{ mt: 2 }}>
                {summary.visualAnalysis && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Visual Analysis
                    </Typography>
                    <Typography variant="body2">{summary.visualAnalysis}</Typography>
                  </Box>
                )}

                {summary.audioTranscript && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Audio Transcript
                    </Typography>
                    <Typography variant="body2">{summary.audioTranscript}</Typography>
                  </Box>
                )}

                {summary.keyFrames && summary.keyFrames.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Key Frames
                    </Typography>
                    <Typography variant="body2">
                      Frames: {summary.keyFrames.join(', ')}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Created: {format(new Date(summary.createdAt), 'PPpp')}
                  </Typography>
                  {summary.updatedAt !== summary.createdAt && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Updated: {format(new Date(summary.updatedAt), 'PPpp')}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </CardContent>

      {showActions && (
        <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
          <Box>
            <Button
              size="small"
              onClick={handleExpandClick}
              endIcon={
                <ExpandMoreIcon
                  sx={{
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s',
                  }}
                />
              }
            >
              {expanded ? 'Show less' : 'Show more'}
            </Button>
          </Box>
          <Box>
            {onRegenerate && (
              <IconButton
                size="small"
                onClick={handleRegenerate}
                aria-label="regenerate summary"
                title="Regenerate summary"
              >
                <RefreshIcon />
              </IconButton>
            )}
            {onEdit && (
              <IconButton
                size="small"
                onClick={handleEdit}
                aria-label="edit summary"
                title="Edit summary"
              >
                <EditIcon />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                size="small"
                onClick={handleDelete}
                aria-label="delete summary"
                title="Delete summary"
                color="error"
              >
                <DeleteIcon />
              </IconButton>
            )}
          </Box>
        </CardActions>
      )}
    </Card>
  )
}
