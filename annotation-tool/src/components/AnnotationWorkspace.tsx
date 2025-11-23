import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Box,
  Paper,
  Typography,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Slider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Drawer,
  Toolbar,
  Chip,
  Button,
  Link,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Fab,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as NextFrameIcon,
  SkipPrevious as PrevFrameIcon,
  Delete as DeleteIcon,
  Schedule as TimeIcon,
  ThumbUp as LikeIcon,
  Share as ShareIcon,
  Comment as CommentIcon,
  OpenInNew as ExternalLinkIcon,
  Build as BuildIcon,
  Search as DetectIcon,
} from '@mui/icons-material'
import './AnnotationWorkspace.css'
import { VideoPlayer, VideoPlayerHandle } from './annotation/VideoPlayer'
import { RootState, AppDispatch } from '../store/store'
import { setCurrentVideo, setLastAnnotation } from '../store/videoSlice'
import {
  setDrawingMode,
  setSelectedType,
  selectAnnotation,
  deleteAnnotation,
  setSelectedPersona,
  setAnnotationMode,
  setDetectionResults,
  setShowDetectionCandidates,
  clearDetectionState,
  addKeyframe,
  removeKeyframe,
  updateKeyframe,
  updateInterpolationSegment,
  setAnnotations,
  saveAnnotations,
} from '../store/annotationSlice'
import AnnotationOverlay from './AnnotationOverlay'
import AnnotationEditor from './AnnotationEditor'
import AnnotationAutocomplete from './annotation/AnnotationAutocomplete'
import VideoSummaryDialog from './VideoSummaryDialog'
import { AnnotationCandidatesList } from './AnnotationCandidatesList'
import { DetectionDialog } from './dialogs/DetectionDialog'
import type { DetectionRequest } from './dialogs/DetectionDialog'
import { Edit as EditIcon } from '@mui/icons-material'
import { formatTimestamp } from '../utils/formatters'
import { VideoMetadata, Annotation, TypeAnnotation, ObjectAnnotation, InterpolationType, InterpolationSegment } from '../models/types'
import { useDetectObjects } from '../hooks/useDetection'
import { useModelConfig } from '../hooks/useModelConfig'
import { TimelineComponent } from './annotation/TimelineComponent'
import { useCommands, useCommandContext } from '../hooks/useCommands.js'
import { api } from '../services/api'

const DRAWER_WIDTH = 300

/**
 * Video annotation workspace providing video playback, annotation drawing, and AI-assisted analysis.
 * Supports persona-based type annotation and object linking with integrated detection and summarization.
 *
 * @returns React component rendering video player, annotation controls, and annotation list
 *
 * @example
 * ```tsx
 * <Route path="/annotate/:videoId" element={<AnnotationWorkspace />} />
 * ```
 */
export default function AnnotationWorkspace() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const { data: modelConfig } = useModelConfig()
  const isCpuOnly = !modelConfig?.cudaAvailable
  const videoPlayerRef = useRef<VideoPlayerHandle>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [detectionDialogOpen, setDetectionDialogOpen] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [timelineMounted, setTimelineMounted] = useState(false)

  // Delayed mount/unmount for smooth animation
  useEffect(() => {
    if (timelineExpanded) {
      // Delay mount to allow slide-in animation to start
      const timer = setTimeout(() => setTimelineMounted(true), 50)
      return () => clearTimeout(timer)
    } else {
      // Unmount after slide-out animation completes
      const timer = setTimeout(() => setTimelineMounted(false), 300)
      return () => clearTimeout(timer)
    }
  }, [timelineExpanded])

  const currentVideo = useSelector((state: RootState) => state.videos.currentVideo) as VideoMetadata | null
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const personas = useSelector((state: RootState) => state.persona.personas)
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)

  // Get annotations directly from Redux (stable reference, not filtered/computed)
  const annotationsRecord = useSelector((state: RootState) => state.annotations.annotations)

  // Get annotations for this video (stable reference from Redux)
  const videoAnnotations = videoId ? annotationsRecord[videoId] : undefined

  // Get filtered annotations for display (by selected persona)
  const annotations = useMemo(() => {
    // Filter annotations by selected persona if one is selected
    if (selectedPersonaId && videoAnnotations) {
      return videoAnnotations.filter(a => {
        // Only TypeAnnotations have personaId
        if (a.annotationType === 'type') {
          return (a as TypeAnnotation).personaId === selectedPersonaId
        }
        // Object annotations are not filtered by persona
        return true
      })
    }
    return videoAnnotations || []
  }, [videoAnnotations, selectedPersonaId])
  const selectedAnnotation = useSelector((state: RootState) => state.annotations.selectedAnnotation)
  const detectionResults = useSelector((state: RootState) => state.annotations.detectionResults)
  const detectionConfidenceThreshold = useSelector((state: RootState) => state.annotations.detectionConfidenceThreshold)
  const showDetectionCandidates = useSelector((state: RootState) => state.annotations.showDetectionCandidates)
  const personaOntologies = useSelector((state: RootState) => state.persona.personaOntologies)
  const worldEntities = useSelector((state: RootState) => state.world.entities)
  const worldEvents = useSelector((state: RootState) => state.world.events)
  const worldTimes = useSelector((state: RootState) => state.world.times)

  // Detection mutation
  const detectMutation = useDetectObjects({
    onSuccess: (data) => {
      dispatch(setDetectionResults(data))
      dispatch(setShowDetectionCandidates(true))
      setDetectionDialogOpen(false)
    },
    onError: (error) => {
      console.error('Detection failed:', error)
    },
  })

  // Auto-save annotations to database (debounced 1 second, matching ontology/world auto-save)
  // CRITICAL: saveAnnotations.fulfilled must NOT update annotations in Redux (only loadedAnnotationIds)
  // This will trigger on initial load (saving the just-loaded annotations), but that's OK - they're UPDATEs
  useEffect(() => {
    if (!videoId || !videoAnnotations) return

    const timeoutId = setTimeout(() => {
      dispatch(saveAnnotations({
        videoId,
        personaId: selectedPersonaId,
        annotations: videoAnnotations
      }))
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [videoId, videoAnnotations, selectedPersonaId, dispatch])

  // Helper function to get type name from typeId (for displaying human-readable names)
  const getTypeName = useCallback((annotation: TypeAnnotation): string => {
    const ontology = personaOntologies.find(o => o.personaId === annotation.personaId)
    if (!ontology) return annotation.typeId

    // Search in entities, roles, and events
    const entity = ontology.entities.find(e => e.id === annotation.typeId)
    if (entity) return entity.name

    const role = ontology.roles.find(r => r.id === annotation.typeId)
    if (role) return role.name

    const event = ontology.events.find(e => e.id === annotation.typeId)
    if (event) return event.name

    return annotation.typeId // Fallback to ID if not found
  }, [personaOntologies])

  // Helper function to get object name from linkedEntityId/linkedEventId/linkedTimeId
  const getObjectName = useCallback((annotation: ObjectAnnotation): string => {
    if (annotation.linkedEntityId) {
      const entity = worldEntities.find(e => e.id === annotation.linkedEntityId)
      return entity?.name || annotation.linkedEntityId
    }
    if (annotation.linkedEventId) {
      const event = worldEvents.find(e => e.id === annotation.linkedEventId)
      return event?.name || annotation.linkedEventId
    }
    if (annotation.linkedTimeId) {
      const time = worldTimes.find(t => t.id === annotation.linkedTimeId)
      return time?.label || annotation.linkedTimeId
    }
    return 'Object Annotation'
  }, [worldEntities, worldEvents, worldTimes])

  // Keyframe control callbacks
  const handleAddKeyframe = useCallback(() => {
    if (!selectedAnnotation) return

    // Get current box from annotation sequence (interpolated or existing)
    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    let currentBox = allBoxes.find(b => b.frameNumber === currentFrame)

    // If no box exists at current frame, compute interpolated position
    if (!currentBox) {
      const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
      if (keyframes.length === 0) return

      // Find surrounding keyframes
      const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
      const nextKeyframes = keyframes.filter(k => k.frameNumber > currentFrame)

      if (prevKeyframes.length === 0 && nextKeyframes.length === 0) return

      // Use nearest keyframe or interpolate
      if (prevKeyframes.length === 0) {
        currentBox = { ...nextKeyframes[0], frameNumber: currentFrame }
      } else if (nextKeyframes.length === 0) {
        currentBox = { ...prevKeyframes[prevKeyframes.length - 1], frameNumber: currentFrame }
      } else {
        // Linear interpolation
        const prev = prevKeyframes[prevKeyframes.length - 1]
        const next = nextKeyframes[0]
        const t = (currentFrame - prev.frameNumber) / (next.frameNumber - prev.frameNumber)
        currentBox = {
          x: prev.x + (next.x - prev.x) * t,
          y: prev.y + (next.y - prev.y) * t,
          width: prev.width + (next.width - prev.width) * t,
          height: prev.height + (next.height - prev.height) * t,
          frameNumber: currentFrame,
        }
      }
    }

    dispatch(addKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      box: currentBox,
      fps: currentVideo?.fps || 30,
    }))
  }, [selectedAnnotation, currentFrame, currentVideo, dispatch])

  const handleDeleteKeyframe = useCallback(() => {
    if (!selectedAnnotation) return

    dispatch(removeKeyframe({
      videoId: selectedAnnotation.videoId,
      annotationId: selectedAnnotation.id,
      frameNumber: currentFrame,
      fps: currentVideo?.fps || 30,
    }))
  }, [selectedAnnotation, currentFrame, currentVideo, dispatch])

  const handleCopyPreviousFrame = useCallback(() => {
    if (!selectedAnnotation) return

    const allBoxes = selectedAnnotation.boundingBoxSequence?.boxes || []
    const keyframes = allBoxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)

    // Find nearest previous keyframe
    const prevKeyframes = keyframes.filter(k => k.frameNumber < currentFrame)
    if (prevKeyframes.length === 0) {
      return
    }

    const prevBox = prevKeyframes[prevKeyframes.length - 1]

    const isCurrentKeyframe = keyframes.some(k => k.frameNumber === currentFrame)

    if (isCurrentKeyframe) {
      dispatch(updateKeyframe({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        frameNumber: currentFrame,
        box: { ...prevBox, frameNumber: currentFrame },
      }))
    } else {
      dispatch(addKeyframe({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        frameNumber: currentFrame,
        box: { ...prevBox, frameNumber: currentFrame },
        fps: currentVideo?.fps || 30,
      }))
    }
  }, [selectedAnnotation, currentFrame, currentVideo, dispatch])

  const handleUpdateInterpolationSegment = useCallback(
    (segmentIndex: number, type: InterpolationType, controlPoints?: InterpolationSegment['controlPoints']) => {
      if (!selectedAnnotation) return

      dispatch(updateInterpolationSegment({
        videoId: selectedAnnotation.videoId,
        annotationId: selectedAnnotation.id,
        segmentIndex,
        type,
        controlPoints,
      }))
    },
    [selectedAnnotation, dispatch]
  )

  // Track this as the last annotation when we load the component
  useEffect(() => {
    if (videoId) {
      dispatch(setLastAnnotation({ videoId, timestamp: Date.now() }))
    }
  }, [videoId, dispatch])

  // Load annotations from backend when component mounts
  useEffect(() => {
    const loadAnnotations = async () => {
      if (!videoId) return

      try {
        const savedAnnotations = await api.getAnnotations(videoId)
        dispatch(setAnnotations({ videoId, annotations: savedAnnotations }))
      } catch (error) {
        console.error('Failed to load annotations:', error)
      }
    }

    loadAnnotations()
  }, [videoId, dispatch])

  // Set command context for when clauses
  useCommandContext({
    annotationWorkspaceActive: true,
    ontologyWorkspaceActive: false,
    objectWorkspaceActive: false,
    videoBrowserActive: false,
    dialogOpen: editorOpen || summaryDialogOpen || detectionDialogOpen,
    inputFocused: false, // Updated dynamically by focus events
    annotationSelected: !!selectedAnnotation,
    keyframeSelected: !!selectedAnnotation && (selectedAnnotation.boundingBoxSequence?.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    ) || []).some(kf => kf.frameNumber === currentFrame),
    hasKeyframes: !!selectedAnnotation && (selectedAnnotation.boundingBoxSequence?.boxes.filter(
      b => b.isKeyframe || b.isKeyframe === undefined
    ) || []).length > 0,
    timelineVisible: timelineExpanded,
    drawingMode: false, // TODO: track drawing mode state
  })

  // Register command handlers
  useCommands({
    'timeline.toggle': () => {
      setTimelineExpanded(prev => !prev)
    },
    'video.playPause': () => {
      videoPlayerRef.current?.handlePlayPause()
    },
    'video.nextFrame': () => {
      videoPlayerRef.current?.handleNextFrame()
    },
    'video.previousFrame': () => {
      videoPlayerRef.current?.handlePrevFrame()
    },
    'video.nextFrame10': () => {
      videoPlayerRef.current?.handleNextFrame10()
    },
    'video.previousFrame10': () => {
      videoPlayerRef.current?.handlePrevFrame10()
    },
    'video.jumpToStart': () => {
      videoPlayerRef.current?.handleJumpToStart()
    },
    'video.jumpToEnd': () => {
      videoPlayerRef.current?.handleJumpToEnd()
    },
    'annotation.addKeyframe': () => {
      handleAddKeyframe()
    },
    'annotation.copyPreviousKeyframe': () => {
      handleCopyPreviousFrame()
    },
    'annotation.deleteKeyframe': () => {
      handleDeleteKeyframe()
    },
  }, {
    context: 'annotationWorkspace',
    enabled: true,
    enableOnFormTags: false
  })


  /**
   * Loads video metadata from the API and stores it in Redux state.
   * Fetches video information including dimensions, FPS, uploader data, and timestamps.
   *
   * @returns Promise that resolves when video metadata is loaded
   *
   * @example
   * ```tsx
   * // Called automatically on mount when videoId changes
   * useEffect(() => {
   *   loadVideo()
   * }, [loadVideo])
   * ```
   */
  const loadVideo = useCallback(async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}`)
      const data = await response.json()
      dispatch(setCurrentVideo(data))
    } catch (error) {
      console.error('Failed to load video:', error)
    }
  }, [videoId, dispatch])

  useEffect(() => {
    loadVideo()
  }, [loadVideo])


  /**
   * Selects an annotation and seeks video to its start time.
   * Highlights the annotation in the sidebar and moves playhead to annotation start.
   */
  const handleAnnotationClick = (annotation: Annotation) => {
    // Select the annotation
    dispatch(selectAnnotation(annotation))

    // Seek video to start of annotation
    if (videoPlayerRef.current && annotation.timeSpan) {
      videoPlayerRef.current.handleSeek(annotation.timeSpan.startTime)
    }
  }

  /**
   * Formats video time using the video player's formatTime function.
   */
  const formatTime = (seconds: number) => {
    return videoPlayerRef.current?.formatTime(seconds) || '0:00.00'
  }

  /**
   * Navigates to the ontology builder and saves current annotation context.
   * Stores the current video ID and timestamp for resuming annotation later.
   *
   * @example
   * ```tsx
   * <Fab onClick={handleGoToOntology}>
   *   <BuildIcon />
   * </Fab>
   * ```
   */
  const handleGoToOntology = () => {
    // Save current annotation state before navigating
    if (videoId) {
      dispatch(setLastAnnotation({ videoId, timestamp: currentTime }))
    }
    navigate('/ontology')
  }


  /**
   * Initiates object detection request using AI model.
   * Triggers detection mutation and opens results dialog on success.
   *
   * @param request - Detection parameters including video ID, query, frames, and options
   *
   * @example
   * ```tsx
   * <DetectionDialog onDetect={handleRunDetection} />
   * ```
   */
  const handleRunDetection = (request: DetectionRequest) => {
    detectMutation.mutate(request)
  }

  /**
   * Sorts annotations by start time for chronological display.
   * Memoized to avoid re-sorting on every render.
   *
   * @returns Array of annotations sorted by timeSpan.startTime in ascending order
   */
  const sortedAnnotations = useMemo(() =>
    [...annotations].sort((a, b) => {
      if (!a.timeSpan || !b.timeSpan) return 0
      return a.timeSpan.startTime - b.timeSpan.startTime
    }),
    [annotations]
  )

  /**
   * Checks if an annotation is active at the current video time.
   * Used to highlight annotations in the sidebar during playback.
   *
   * @param annotation - Annotation with timeSpan containing start and end times
   * @returns True if current time falls within annotation's time span
   *
   * @example
   * ```tsx
   * <ListItem sx={{ borderLeft: isAnnotationActive(annotation) ? '3px solid' : 'none' }}>
   * ```
   */
  const isAnnotationActive = (annotation: Annotation) =>
    annotation.timeSpan && annotation.timeSpan.startTime <= currentTime && annotation.timeSpan.endTime >= currentTime

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={1}>
            {/* Uploader as main title with clickable link */}
            <Typography variant="h2" sx={{ fontSize: '1.25rem' }}>
              {currentVideo?.uploader || currentVideo?.uploaderId || 'Loading...'}
              {currentVideo?.uploaderId && currentVideo?.uploaderUrl && (
                <>
                  {' '}(
                  <Link
                    href={currentVideo.uploaderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                  >
                    @{currentVideo.uploaderId}
                  </Link>
                  )
                </>
              )}
            </Typography>
            
            {/* Description (no need for title since it duplicates uploader + description) */}
            {currentVideo?.description && (
              <Typography variant="body2">
                {currentVideo.description}
              </Typography>
            )}

            {/* Metadata Row */}
            <Stack direction="row" spacing={2} alignItems="center">
              {/* Timestamp */}
              {currentVideo?.timestamp && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TimeIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(currentVideo.timestamp)}
                  </Typography>
                </Box>
              )}
              
              {/* Engagement Metrics */}
              {currentVideo && (currentVideo.likeCount || currentVideo.repostCount || currentVideo.commentCount) && (
                <>
                  {currentVideo.likeCount !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LikeIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.likeCount.toLocaleString()}</Typography>
                    </Box>
                  )}
                  {currentVideo.repostCount !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ShareIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.repostCount.toLocaleString()}</Typography>
                    </Box>
                  )}
                  {currentVideo.commentCount !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CommentIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.commentCount.toLocaleString()}</Typography>
                    </Box>
                  )}
                </>
              )}

              {/* Source Link - More prominent */}
              {currentVideo?.webpageUrl && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ExternalLinkIcon />}
                  href={currentVideo.webpageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Original
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>

        <VideoPlayer
          ref={videoPlayerRef}
          videoId={videoId}
          videoMetadata={currentVideo}
          onTimeUpdate={setCurrentTime}
          onFrameChange={setCurrentFrame}
          onDurationChange={setDuration}
        >
          {currentVideo && videoPlayerRef.current?.videoRef.current && (
            <AnnotationOverlay
              videoElement={videoPlayerRef.current.videoRef.current}
              currentTime={currentTime}
              videoWidth={videoPlayerRef.current.videoRef.current.videoWidth || currentVideo.width}
              videoHeight={videoPlayerRef.current.videoRef.current.videoHeight || currentVideo.height}
              detectionResults={detectionResults}
            />
          )}
        </VideoPlayer>

        <Paper sx={{ p: 2, mt: 2 }}>
          {/* Container for sliding panels */}
          <Box data-testid="dynamic-controls-wrapper" sx={{ position: 'relative', overflow: 'hidden', minHeight: '140px' }}>
            {/* Standard Controls Panel - slides left */}
            <Box
              data-testid="standard-controls-panel"
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
                transform: timelineExpanded ? 'translateX(-100%)' : 'translateX(0)',
                opacity: timelineExpanded ? 0 : 1,
                pointerEvents: timelineExpanded ? 'none' : 'auto',
              }}
            >
              {/* Playback Controls Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                {/* Mode Toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">Mode:</Typography>
                  <ToggleButtonGroup
                    value={annotationMode}
                    exclusive
                    onChange={(_, newMode) => {
                      if (newMode) {
                        dispatch(setAnnotationMode(newMode))
                        if (newMode === 'object') {
                          dispatch(setSelectedPersona(null))
                        }
                      }
                    }}
                    size="small"
                  >
                    <ToggleButton value="type">
                      Type
                    </ToggleButton>
                    <ToggleButton value="object">
                      Object
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Play/pause controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton onClick={() => videoPlayerRef.current?.handlePlayPause()} aria-label={videoPlayerRef.current?.isPlaying ? "Pause video" : "Play video"}>
                    {videoPlayerRef.current?.isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                  <IconButton onClick={() => videoPlayerRef.current?.handlePrevFrame()} aria-label="Previous frame">
                    <PrevFrameIcon />
                  </IconButton>
                  <IconButton onClick={() => videoPlayerRef.current?.handleNextFrame()} aria-label="Next frame">
                    <NextFrameIcon />
                  </IconButton>
                </Box>

                {/* Time slider */}
                <Box sx={{ flexGrow: 1, px: 2 }}>
                  <Slider
                    value={currentTime}
                    max={duration}
                    onChange={(_event, value) => {
                      const time = Array.isArray(value) ? value[0] : value
                      videoPlayerRef.current?.handleSeek(time)
                    }}
                    size="small"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => formatTime(value)}
                  />
                </Box>

                {/* Current time display */}
                <Typography variant="body2" sx={{ minWidth: 100, fontFamily: 'monospace' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </Typography>

                {/* Timeline Toggle Button */}
                <Tooltip title={timelineExpanded ? 'Hide timeline' : 'Show timeline'}>
                  <Button
                    variant={timelineExpanded ? 'contained' : 'outlined'}
                    onClick={() => setTimelineExpanded(!timelineExpanded)}
                    size="small"
                  >
                    {timelineExpanded ? 'Hide Timeline' : 'Show Timeline'}
                  </Button>
                </Tooltip>
              </Box>

              {/* Second Row: Persona Selector and Type/Object Selection */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Persona Selector */}
                <FormControl size="small" sx={{ width: 250 }} disabled={annotationMode === 'object'}>
                  <InputLabel id="persona-select-label">Select Persona</InputLabel>
                  <Select
                    labelId="persona-select-label"
                    id="persona-select"
                    value={selectedPersonaId || ''}
                    label="Select Persona"
                    onChange={(e) => dispatch(setSelectedPersona(e.target.value || null))}
                    disabled={annotationMode === 'object'}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {personas.map((persona) => (
                      <MenuItem key={persona.id} value={persona.id}>
                        {persona.name} - {persona.role}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Type/Object Selection */}
                {(annotationMode === 'type' || annotationMode === 'object') && (
                  <Box sx={{ flex: 1, maxWidth: 400 }}>
                    <AnnotationAutocomplete
                      mode={annotationMode}
                      personaId={selectedPersonaId}
                      onSelect={(option) => {
                        if (option) {
                          if (annotationMode === 'type') {
                            const drawMode = option.type as 'entity' | 'role' | 'event'
                            dispatch(setSelectedType({
                              typeId: option.id,
                              category: drawMode
                            }))
                          } else {
                            dispatch(setDrawingMode('entity'))
                          }
                        } else {
                          dispatch(setSelectedType({ typeId: null, category: null }))
                        }
                      }}
                      disabled={annotationMode === 'type' && !selectedPersonaId}
                    />
                  </Box>
                )}

                {/* Right-aligned action buttons */}
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                  {/* Detect Objects Button */}
                  {currentVideo && videoId && (
                    <Tooltip title={isCpuOnly ? 'GPU required for object detection (CPU-only mode detected)' : ''}>
                      <span>
                        <Button
                          variant="outlined"
                          startIcon={<DetectIcon />}
                          onClick={() => setDetectionDialogOpen(true)}
                          size="small"
                          disabled={isCpuOnly}
                        >
                          Detect Objects
                        </Button>
                      </span>
                    </Tooltip>
                  )}

                  {/* Video Summary Button */}
                  {currentVideo && videoId && (
                    <Button
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => setSummaryDialogOpen(true)}
                      size="small"
                    >
                      Edit Summary
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>

            {/* Timeline Panel - slides in from right to replace standard controls */}
            <Box
              data-testid="timeline-panel"
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
                transform: timelineExpanded ? 'translateX(0)' : 'translateX(100%)',
                opacity: timelineExpanded ? 1 : 0,
                pointerEvents: timelineExpanded ? 'auto' : 'none',
                visibility: timelineExpanded ? 'visible' : 'hidden',
              }}
            >
              {timelineMounted && (
                <TimelineComponent
                  annotation={selectedAnnotation}
                  currentFrame={currentFrame}
                  totalFrames={videoPlayerRef.current?.totalFrames || 0}
                  videoFps={currentVideo?.fps || 30}
                  onSeek={(frameNumber) => {
                    if (videoPlayerRef.current) {
                      const fps = currentVideo?.fps || 30
                      const newTime = frameNumber / fps
                      videoPlayerRef.current.handleSeek(newTime)
                    }
                  }}
                  videoRef={videoPlayerRef.current?.videoRef}
                  onAddKeyframe={handleAddKeyframe}
                  onDeleteKeyframe={handleDeleteKeyframe}
                  onCopyPreviousFrame={handleCopyPreviousFrame}
                  onUpdateInterpolationSegment={handleUpdateInterpolationSegment}
                  onClose={() => setTimelineExpanded(false)}
                />
              )}
            </Box>
          </Box>
        </Paper>

      </Box>

      <Drawer
        variant="permanent"
        anchor="right"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h3" sx={{ fontSize: '1.25rem' }}>
              All Annotations ({sortedAnnotations.length})
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block', mb: 2 }}>
            Click to seek • Double-click to edit
          </Typography>
          <List dense>
            {sortedAnnotations.length === 0 && (
              <ListItem>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', width: '100%' }}>
                  No annotations yet. Select a mode above and draw on the video.
                </Typography>
              </ListItem>
            )}
            {sortedAnnotations.map((annotation) => {
              const isActive = isAnnotationActive(annotation)
              const isSelected = selectedAnnotation?.id === annotation.id
              
              return (
                <React.Fragment key={annotation.id}>
                  <ListItem
                    onClick={() => handleAnnotationClick(annotation)}
                    onDoubleClick={() => {
                      setEditingAnnotation(annotation)
                      setEditorOpen(true)
                    }}
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'action.selected' : (isActive ? 'action.hover' : 'transparent'),
                      borderLeft: isActive ? '3px solid' : '3px solid transparent',
                      borderLeftColor: isActive ? 'primary.main' : 'transparent',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {annotation.annotationType === 'type' && (
                            <>
                              <Chip
                                label={annotation.typeCategory}
                                size="small"
                                color={
                                  annotation.typeCategory === 'entity' ? 'success' :
                                  annotation.typeCategory === 'role' ? 'primary' :
                                  'warning'
                                }
                                sx={{ height: 20, fontSize: '0.75rem' }}
                              />
                              <Typography variant="body2" noWrap>
                                {getTypeName(annotation as TypeAnnotation)}
                              </Typography>
                            </>
                          )}
                          {annotation.annotationType === 'object' && (
                            <Typography variant="body2" noWrap>
                              {getObjectName(annotation as ObjectAnnotation)}
                            </Typography>
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          {annotation.timeSpan && (
                            <Typography variant="caption" color="text.secondary">
                              {formatTime(annotation.timeSpan.startTime)} → {formatTime(annotation.timeSpan.endTime)}
                            </Typography>
                          )}
                          {annotation.notes && (
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              {annotation.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                      primaryTypographyProps={{ component: 'div' }}
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch(deleteAnnotation({ videoId: videoId || '', annotationId: annotation.id }))
                        }}
                        aria-label="Delete annotation"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              )
            })}
          </List>
        </Box>
      </Drawer>
      
      <AnnotationEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingAnnotation(null)
        }}
        annotation={editingAnnotation}
        videoFps={currentVideo?.fps}
      />
      
      {/* Video Summary Dialog */}
      {videoId && (
        <VideoSummaryDialog
          open={summaryDialogOpen}
          onClose={() => setSummaryDialogOpen(false)}
          videoId={videoId}
          initialPersonaId={selectedPersonaId}
        />
      )}

      {/* Detection Dialog */}
      {videoId && currentVideo && (
        <DetectionDialog
          open={detectionDialogOpen}
          onClose={() => setDetectionDialogOpen(false)}
          onDetect={handleRunDetection}
          videoId={videoId}
          currentTime={currentTime}
          duration={duration}
          fps={currentVideo.fps || 30}
          isLoading={detectMutation.isPending}
          error={detectMutation.isError ? detectMutation.error.message : null}
        />
      )}

      {/* Detection Candidates Dialog */}
      {detectionResults && showDetectionCandidates && videoId && (
        <Dialog
          open={showDetectionCandidates}
          onClose={() => dispatch(setShowDetectionCandidates(false))}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            Detection Results
            <Typography variant="body2" color="text.secondary">
              Found {detectionResults.totalDetections} objects for query: "{detectionResults.query}"
            </Typography>
          </DialogTitle>
          <DialogContent>
            <AnnotationCandidatesList
              videoId={videoId}
              frames={detectionResults.frames}
              personaId={annotationMode === 'type' ? selectedPersonaId || undefined : undefined}
              typeId={annotationMode === 'type' ? undefined : undefined}
              typeCategory={annotationMode === 'type' ? 'entity' : undefined}
              initialConfidenceThreshold={detectionConfidenceThreshold}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              dispatch(setShowDetectionCandidates(false))
              dispatch(clearDetectionState())
            }}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Floating Action Button to go to Ontology */}
      <Box role="complementary" aria-label="Quick actions">
        <Tooltip title="Go to Ontology Builder (Cmd/Ctrl + O)" placement="left">
          <Fab
            color="primary"
            aria-label="go to ontology"
            onClick={handleGoToOntology}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1000,
            }}
          >
            <BuildIcon />
          </Fab>
        </Tooltip>
      </Box>
    </Box>
  )
}