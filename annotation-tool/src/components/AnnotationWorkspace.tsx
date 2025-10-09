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
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import './AnnotationWorkspace.css'
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
import { VideoMetadata } from '../models/types'
import { useDetectObjects } from '../hooks/useDetection'
import { useModelConfig } from '../hooks/useModelConfig'
import { TimelineComponent } from './annotation/TimelineComponent'

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
  const isCpuOnly = !modelConfig?.cuda_available
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<any>(null)
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
  const annotations = useSelector((state: RootState) => {
    const videoAnnotations = state.annotations.annotations[videoId || '']
    // Filter annotations by selected persona if one is selected
    if (selectedPersonaId && videoAnnotations) {
      return videoAnnotations.filter(a => {
        // Only TypeAnnotations have personaId
        if (a.annotationType === 'type') {
          return (a as any).personaId === selectedPersonaId
        }
        // Object annotations are not filtered by persona
        return true
      })
    }
    return videoAnnotations || []
  })
  const selectedAnnotation = useSelector((state: RootState) => state.annotations.selectedAnnotation)
  const detectionResults = useSelector((state: RootState) => state.annotations.detectionResults)
  const detectionConfidenceThreshold = useSelector((state: RootState) => state.annotations.detectionConfidenceThreshold)
  const showDetectionCandidates = useSelector((state: RootState) => state.annotations.showDetectionCandidates)

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
    (segmentIndex: number, type: any, controlPoints?: any) => {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Toggle timeline with 'T' key
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setTimelineExpanded(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!videoRef.current || !videoId) return

    // Clean up any existing player
    if (playerRef.current) {
      playerRef.current.dispose()
      playerRef.current = null
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!videoRef.current) return

      // Initialize video.js player with minimal options
      const player = videojs(videoRef.current, {
        controls: false,
        autoplay: false,
        preload: 'auto',
        fluid: false,
        fill: true,
        sources: [{
          src: `/api/videos/${videoId}/stream`,
          type: 'video/mp4'
        }]
      })

      playerRef.current = player

      player.ready(() => {
        // Ensure the video element is visible
        const videoEl = player.el().querySelector('video')
        if (videoEl) {
          videoEl.style.display = 'block'
          videoEl.style.visibility = 'visible'
        }
      })

      player.on('loadedmetadata', () => {
        setDuration(player.duration() ?? 0)
      })

      player.on('timeupdate', () => {
        setCurrentTime(player.currentTime() ?? 0)
      })

      player.on('play', () => setIsPlaying(true))
      player.on('pause', () => setIsPlaying(false))
      
      player.on('error', () => {
        console.error('Video player error:', player.error())
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [videoId])

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

  // Calculate total frames when duration and fps are available
  useEffect(() => {
    if (duration) {
      // Default to 30 FPS if not provided in metadata
      const fps = currentVideo?.fps || 30
      const frames = Math.floor(duration * fps)
      setTotalFrames(frames)
    }
  }, [duration, currentVideo?.fps])

  // Sync currentFrame with video currentTime
  useEffect(() => {
    // Default to 30 FPS if not provided in metadata
    const fps = currentVideo?.fps || 30
    const frame = Math.floor(currentTime * fps)
    setCurrentFrame(frame)
  }, [currentTime, currentVideo?.fps])

  /**
   * Toggles video playback between play and pause states.
   * Updates the isPlaying state through video.js event listeners.
   *
   * @example
   * ```tsx
   * <IconButton onClick={handlePlayPause}>
   *   {isPlaying ? <PauseIcon /> : <PlayIcon />}
   * </IconButton>
   * ```
   */
  const handlePlayPause = () => {
    if (!playerRef.current) return
    if (isPlaying) {
      playerRef.current.pause()
    } else {
      playerRef.current.play()
    }
  }

  /**
   * Seeks video to a specific time position.
   * Called by the timeline slider component when user drags the playhead.
   *
   * @param _event - Material-UI slider event (unused)
   * @param value - Target time in seconds (array or number from slider)
   *
   * @example
   * ```tsx
   * <Slider value={currentTime} max={duration} onChange={handleSeek} />
   * ```
   */
  const handleSeek = (_event: Event, value: number | number[]) => {
    if (!playerRef.current) return
    const time = Array.isArray(value) ? value[0] : value
    playerRef.current.currentTime(time)
  }

  /**
   * Advances video by one frame based on video FPS.
   * Uses video FPS metadata or defaults to 30 FPS if unavailable.
   *
   * @example
   * ```tsx
   * <IconButton onClick={handleNextFrame}>
   *   <NextFrameIcon />
   * </IconButton>
   * ```
   */
  const handleNextFrame = () => {
    if (!playerRef.current) return
    const fps = currentVideo?.fps || 30
    playerRef.current.currentTime(playerRef.current.currentTime() + 1/fps)
  }

  /**
   * Rewinds video by one frame based on video FPS.
   * Clamps minimum time to 0 to prevent negative values.
   *
   * @example
   * ```tsx
   * <IconButton onClick={handlePrevFrame}>
   *   <PrevFrameIcon />
   * </IconButton>
   * ```
   */
  const handlePrevFrame = () => {
    if (!playerRef.current) return
    const fps = currentVideo?.fps || 30
    playerRef.current.currentTime(Math.max(0, playerRef.current.currentTime() - 1/fps))
  }

  /**
   * Selects an annotation and seeks video to its start time.
   * Highlights the annotation in the sidebar and moves playhead to annotation start.
   *
   * @param annotation - Annotation object containing timeSpan with startTime
   *
   * @example
   * ```tsx
   * <ListItem onClick={() => handleAnnotationClick(annotation)}>
   *   {annotation.typeId}
   * </ListItem>
   * ```
   */
  const handleAnnotationClick = (annotation: any) => {
    // Select the annotation
    dispatch(selectAnnotation(annotation))

    // Seek video to start of annotation
    if (playerRef.current) {
      playerRef.current.currentTime(annotation.timeSpan.startTime)
    }
  }

  /**
   * Formats video time in seconds to MM:SS.CS display format.
   * Converts decimal seconds to minutes, seconds, and centiseconds.
   *
   * @param seconds - Time value in seconds (may include fractional component)
   * @returns Formatted time string in MM:SS.CS format
   *
   * @example
   * ```tsx
   * formatTime(65.75)  // returns "1:05.75"
   * formatTime(0.5)    // returns "0:00.50"
   * ```
   */
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
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
  const isAnnotationActive = (annotation: any) =>
    annotation.timeSpan.startTime <= currentTime && annotation.timeSpan.endTime >= currentTime

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack spacing={1}>
            {/* Uploader as main title with clickable link */}
            <Typography variant="h6">
              {currentVideo?.uploader || currentVideo?.uploader_id || 'Loading...'}
              {currentVideo?.uploader_id && currentVideo?.uploader_url && (
                <>
                  {' '}(
                  <Link 
                    href={currentVideo.uploader_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    underline="hover"
                  >
                    @{currentVideo.uploader_id}
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
              {currentVideo && (currentVideo.like_count || currentVideo.repost_count || currentVideo.comment_count) && (
                <>
                  {currentVideo.like_count !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LikeIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.like_count.toLocaleString()}</Typography>
                    </Box>
                  )}
                  {currentVideo.repost_count !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ShareIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.repost_count.toLocaleString()}</Typography>
                    </Box>
                  )}
                  {currentVideo.comment_count !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CommentIcon fontSize="small" color="action" />
                      <Typography variant="caption">{currentVideo.comment_count.toLocaleString()}</Typography>
                    </Box>
                  )}
                </>
              )}
              
              {/* Source Link - More prominent */}
              {currentVideo?.webpage_url && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ExternalLinkIcon />}
                  href={currentVideo.webpage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Original
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>

        <Box sx={{ position: 'relative', flexGrow: 1, bgcolor: 'black', minHeight: 0 }}>
          <div className="annotation-video-container">
            <video
              ref={videoRef}
              className="video-js vjs-big-play-centered vjs-fluid vjs-default-skin"
              playsInline
              muted={false}
              preload="auto"
            >
              <p className="vjs-no-js">
                To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video
              </p>
            </video>
          </div>
          {currentVideo && videoRef.current && (
            <AnnotationOverlay
              videoElement={videoRef.current}
              currentTime={currentTime}
              videoWidth={currentVideo.width}
              videoHeight={currentVideo.height}
              detectionResults={detectionResults}
            />
          )}
        </Box>

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
                  <IconButton onClick={handlePlayPause}>
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                  <IconButton onClick={handlePrevFrame}>
                    <PrevFrameIcon />
                  </IconButton>
                  <IconButton onClick={handleNextFrame}>
                    <NextFrameIcon />
                  </IconButton>
                </Box>

                {/* Time slider */}
                <Box sx={{ flexGrow: 1, px: 2 }}>
                  <Slider
                    value={currentTime}
                    max={duration}
                    onChange={handleSeek}
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
                  totalFrames={totalFrames}
                  videoFps={currentVideo?.fps || 30}
                  onSeek={(frameNumber) => {
                    if (playerRef.current) {
                      const fps = currentVideo?.fps || 30
                      const newTime = frameNumber / fps
                      playerRef.current.currentTime(newTime)
                    }
                  }}
                  videoRef={videoRef}
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
          <Typography variant="h6" gutterBottom>
            All Annotations ({sortedAnnotations.length})
          </Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block', mb: 2 }}>
            Click to seek • Double-click to edit
          </Typography>
          <List dense>
            {sortedAnnotations.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No annotations yet. Select a mode above and draw on the video.
              </Typography>
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
                                {annotation.typeId}
                              </Typography>
                            </>
                          )}
                          {annotation.annotationType === 'object' && (
                            <Typography variant="body2" noWrap>
                              Object Annotation
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
              Found {detectionResults.total_detections} objects for query: "{detectionResults.query}"
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
  )
}