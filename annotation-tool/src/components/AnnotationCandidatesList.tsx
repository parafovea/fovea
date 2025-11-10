/**
 * Component for displaying and managing object detection results as annotation candidates.
 * Allows accepting or rejecting detected objects to create annotations.
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  IconButton,
  Alert,
  Grid,
  TextField,
  Stack,
  Divider,
  Collapse,
} from '@mui/material'
import {
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material'
import { useDispatch } from 'react-redux'
import { addAnnotation } from '../store/annotationSlice'
import type { Detection, FrameDetections } from '../api/client'
import { v4 as uuidv4 } from 'uuid'

/**
 * Props for AnnotationCandidatesList component.
 */
export interface AnnotationCandidatesListProps {
  /**
   * Video identifier for the detections.
   */
  videoId: string
  /**
   * Detection results from the API.
   */
  frames: FrameDetections[]
  /**
   * Persona ID for type-based annotations.
   * If provided, candidates are converted to TypeAnnotations.
   */
  personaId?: string
  /**
   * Type ID for type-based annotations.
   * Required if personaId is provided.
   */
  typeId?: string
  /**
   * Type category for type-based annotations.
   * Required if personaId is provided.
   */
  typeCategory?: 'entity' | 'role' | 'event'
  /**
   * Callback when a detection is accepted.
   */
  onAccept?: (detection: Detection, frameNumber: number) => void
  /**
   * Callback when a detection is rejected.
   */
  onReject?: (detection: Detection, frameNumber: number) => void
  /**
   * Show frame thumbnails with bounding box overlays.
   * @default false
   */
  showThumbnails?: boolean
  /**
   * Initial confidence threshold filter (0-1).
   * @default 0.3
   */
  initialConfidenceThreshold?: number
}

/**
 * Individual detection candidate item.
 */
interface CandidateItem {
  detection: Detection
  frameNumber: number
  timestamp: number
  status: 'pending' | 'accepted' | 'rejected'
}

/**
 * Get confidence level classification.
 */
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

/**
 * Get chip color for confidence level.
 */
function getConfidenceColor(
  level: 'high' | 'medium' | 'low'
): 'success' | 'warning' | 'error' {
  switch (level) {
    case 'high':
      return 'success'
    case 'medium':
      return 'warning'
    case 'low':
      return 'error'
  }
}

/**
 * Component for displaying and managing object detection results.
 * Displays detection candidates with accept/reject controls and confidence filtering.
 *
 * @param props - Component properties
 * @returns AnnotationCandidatesList component
 *
 * @example
 * ```tsx
 * // Basic usage with object annotations
 * <AnnotationCandidatesList
 *   videoId="video-123"
 *   frames={detectionResponse.frames}
 *   onAccept={(detection, frame) => console.log('Accepted:', detection)}
 * />
 *
 * // With type annotations
 * <AnnotationCandidatesList
 *   videoId="video-456"
 *   frames={detectionResponse.frames}
 *   personaId="analyst-1"
 *   typeId="vehicle-type-id"
 *   typeCategory="entity"
 * />
 * ```
 */
export function AnnotationCandidatesList({
  videoId,
  frames,
  personaId,
  typeId,
  typeCategory,
  onAccept,
  onReject,
  initialConfidenceThreshold = 0.3,
}: AnnotationCandidatesListProps) {
  const dispatch = useDispatch()
  const [candidates, setCandidates] = useState<CandidateItem[]>(() => {
    // Flatten all detections into candidate items
    return frames.flatMap((frame) =>
      frame.detections.map((detection) => ({
        detection,
        frameNumber: frame.frameNumber,
        timestamp: frame.timestamp,
        status: 'pending' as const,
      }))
    )
  })
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    initialConfidenceThreshold
  )
  const [showFilters, setShowFilters] = useState(false)

  // Filter candidates by confidence threshold and status
  const filteredCandidates = useMemo(() => {
    return candidates.filter(
      (candidate) =>
        candidate.detection.confidence >= confidenceThreshold &&
        candidate.status === 'pending'
    )
  }, [candidates, confidenceThreshold])

  // Statistics
  const stats = useMemo(() => {
    const accepted = candidates.filter((c) => c.status === 'accepted').length
    const rejected = candidates.filter((c) => c.status === 'rejected').length
    const pending = candidates.filter((c) => c.status === 'pending').length
    return { accepted, rejected, pending, total: candidates.length }
  }, [candidates])

  /**
   * Handle accepting a detection candidate.
   */
  const handleAccept = (index: number) => {
    const candidate = filteredCandidates[index]
    if (!candidate) return

    // Update candidate status
    setCandidates((prev) =>
      prev.map((c) =>
        c === candidate ? { ...c, status: 'accepted' as const } : c
      )
    )

    // Create annotation
    const annotationId = uuidv4()
    const bbox = candidate.detection.boundingBox

    if (personaId && typeId && typeCategory) {
      // Type annotation
      dispatch(
        addAnnotation({
          id: annotationId,
          videoId,
          annotationType: 'type',
          personaId,
          typeCategory,
          typeId,
          boundingBoxSequence: {
            boxes: [{
              x: bbox.x,
              y: bbox.y,
              width: bbox.width,
              height: bbox.height,
              frameNumber: candidate.frameNumber,
              confidence: candidate.detection.confidence,
              isKeyframe: true,
            }],
            interpolationSegments: [],
            visibilityRanges: [{
              startFrame: candidate.frameNumber,
              endFrame: candidate.frameNumber,
              visible: true,
            }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          confidence: candidate.detection.confidence,
          notes: `Detected: ${candidate.detection.label}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      )
    } else {
      // Object annotation (without linking yet - user needs to link manually)
      dispatch(
        addAnnotation({
          id: annotationId,
          videoId,
          annotationType: 'object',
          boundingBoxSequence: {
            boxes: [{
              x: bbox.x,
              y: bbox.y,
              width: bbox.width,
              height: bbox.height,
              frameNumber: candidate.frameNumber,
              confidence: candidate.detection.confidence,
              isKeyframe: true,
            }],
            interpolationSegments: [],
            visibilityRanges: [{
              startFrame: candidate.frameNumber,
              endFrame: candidate.frameNumber,
              visible: true,
            }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          confidence: candidate.detection.confidence,
          notes: `Detected: ${candidate.detection.label}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      )
    }

    // Callback
    onAccept?.(candidate.detection, candidate.frameNumber)
  }

  /**
   * Handle rejecting a detection candidate.
   */
  const handleReject = (index: number) => {
    const candidate = filteredCandidates[index]
    if (!candidate) return

    setCandidates((prev) =>
      prev.map((c) =>
        c === candidate ? { ...c, status: 'rejected' as const } : c
      )
    )

    onReject?.(candidate.detection, candidate.frameNumber)
  }

  /**
   * Accept all filtered candidates.
   */
  const handleAcceptAll = () => {
    filteredCandidates.forEach((_, index) => handleAccept(index))
  }

  /**
   * Reject all filtered candidates.
   */
  const handleRejectAll = () => {
    filteredCandidates.forEach((_, index) => handleReject(index))
  }

  if (candidates.length === 0) {
    return (
      <Alert severity="info">
        No detections found. Try adjusting the query or confidence threshold.
      </Alert>
    )
  }

  return (
    <Box>
      {/* Statistics Bar */}
      <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">Detection Candidates</Typography>
          <Chip label={`Total: ${stats.total}`} size="small" />
          <Chip label={`Pending: ${stats.pending}`} size="small" color="default" />
          <Chip
            label={`Accepted: ${stats.accepted}`}
            size="small"
            color="success"
          />
          <Chip label={`Rejected: ${stats.rejected}`} size="small" color="error" />
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="toggle filters"
          >
            <FilterIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Filters */}
      <Collapse in={showFilters}>
        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Filters
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              label="Confidence Threshold"
              type="number"
              value={confidenceThreshold}
              onChange={(e) =>
                setConfidenceThreshold(parseFloat(e.target.value) || 0)
              }
              inputProps={{ min: 0, max: 1, step: 0.1 }}
              size="small"
              sx={{ width: 200 }}
            />
            <Typography variant="body2" color="text.secondary">
              Showing {filteredCandidates.length} candidates
            </Typography>
          </Stack>
        </Box>
      </Collapse>

      {/* Batch Actions */}
      {filteredCandidates.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="success"
              size="small"
              startIcon={<AcceptIcon />}
              onClick={handleAcceptAll}
            >
              Accept All ({filteredCandidates.length})
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<RejectIcon />}
              onClick={handleRejectAll}
            >
              Reject All ({filteredCandidates.length})
            </Button>
          </Stack>
        </Box>
      )}

      {/* Candidates List */}
      {filteredCandidates.length === 0 ? (
        <Alert severity="info">
          No pending candidates match the current filters. Try lowering the
          confidence threshold.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {filteredCandidates.map((candidate, index) => {
            const confidenceLevel = getConfidenceLevel(
              candidate.detection.confidence
            )
            const confidenceColor = getConfidenceColor(confidenceLevel)

            return (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card>
                  <CardContent>
                    <Stack spacing={1}>
                      {/* Label and Confidence */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography variant="h6" component="div">
                          {candidate.detection.label}
                        </Typography>
                        <Chip
                          label={`${Math.round(candidate.detection.confidence * 100)}%`}
                          color={confidenceColor}
                          size="small"
                        />
                      </Box>

                      <Divider />

                      {/* Frame Information */}
                      <Typography variant="body2" color="text.secondary">
                        Frame: {candidate.frameNumber} ({candidate.timestamp.toFixed(2)}s)
                      </Typography>

                      {/* Bounding Box Info */}
                      <Typography variant="caption" color="text.secondary">
                        Box: ({candidate.detection.boundingBox.x.toFixed(3)}, {candidate.detection.boundingBox.y.toFixed(3)})
                        {' '}W: {candidate.detection.boundingBox.width.toFixed(3)},
                        H: {candidate.detection.boundingBox.height.toFixed(3)}
                      </Typography>

                      {/* Track ID if available */}
                      {candidate.detection.trackId && (
                        <Chip
                          label={`Track ID: ${candidate.detection.trackId}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </CardContent>

                  <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<RejectIcon />}
                      onClick={() => handleReject(index)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="small"
                      color="success"
                      variant="contained"
                      startIcon={<AcceptIcon />}
                      onClick={() => handleAccept(index)}
                    >
                      Accept
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}
    </Box>
  )
}
