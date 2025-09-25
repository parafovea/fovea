import React, { useEffect, useRef, useState, useMemo } from 'react'
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
  Alert,
  Fab,
  Tooltip,
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as NextFrameIcon,
  SkipPrevious as PrevFrameIcon,
  Category as EntityIcon,
  AccountTree as RoleIcon,
  Event as EventIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Schedule as TimeIcon,
  ThumbUp as LikeIcon,
  Share as ShareIcon,
  Comment as CommentIcon,
  OpenInNew as ExternalLinkIcon,
  Build as BuildIcon,
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
  setLinkTarget,
  clearLinkTarget
} from '../store/annotationSlice'
import AnnotationOverlay from './AnnotationOverlay'
import AnnotationEditor from './AnnotationEditor'
import AnnotationAutocomplete from './annotation/AnnotationAutocomplete'
import VideoSummaryDialog from './VideoSummaryDialog'
import { Edit as EditIcon } from '@mui/icons-material'
import { formatTimestamp } from '../utils/formatters'
import { VideoMetadata } from '../models/types'

const DRAWER_WIDTH = 300

export default function AnnotationWorkspace() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<any>(null)
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)

  const currentVideo = useSelector((state: RootState) => state.videos.currentVideo) as VideoMetadata | null
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const personas = useSelector((state: RootState) => state.persona.personas)
  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const personaOntology = useSelector((state: RootState) => 
    state.persona.personaOntologies.find(o => o.personaId === selectedPersonaId) || null
  )
  const annotationMode = useSelector((state: RootState) => state.annotations.annotationMode)
  const linkTargetId = useSelector((state: RootState) => state.annotations.linkTargetId)
  const linkTargetType = useSelector((state: RootState) => state.annotations.linkTargetType)
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
  const drawingMode = useSelector((state: RootState) => state.annotations.drawingMode)
  const selectedAnnotation = useSelector((state: RootState) => state.annotations.selectedAnnotation)

  // Track this as the last annotation when we load the component
  useEffect(() => {
    if (videoId) {
      dispatch(setLastAnnotation({ videoId, timestamp: Date.now() }))
    }
  }, [videoId, dispatch])

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
        console.log('Player ready for video:', videoId)
        // Ensure the video element is visible
        const videoEl = player.el().querySelector('video')
        if (videoEl) {
          videoEl.style.display = 'block'
          videoEl.style.visibility = 'visible'
        }
      })

      player.on('loadedmetadata', () => {
        setDuration(player.duration())
        console.log('Video loaded, duration:', player.duration())
      })

      player.on('timeupdate', () => {
        setCurrentTime(player.currentTime())
      })

      player.on('play', () => setIsPlaying(true))
      player.on('pause', () => setIsPlaying(false))
      
      player.on('error', (e: any) => {
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

  useEffect(() => {
    loadVideo()
  }, [videoId])

  const loadVideo = async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}`)
      const data = await response.json()
      dispatch(setCurrentVideo(data))
    } catch (error) {
      console.error('Failed to load video:', error)
    }
  }

  const handlePlayPause = () => {
    if (!playerRef.current) return
    if (isPlaying) {
      playerRef.current.pause()
    } else {
      playerRef.current.play()
    }
  }

  const handleSeek = (_event: Event, value: number | number[]) => {
    if (!playerRef.current) return
    const time = Array.isArray(value) ? value[0] : value
    playerRef.current.currentTime(time)
  }

  const handleNextFrame = () => {
    if (!playerRef.current) return
    const fps = currentVideo?.fps || 30
    playerRef.current.currentTime(playerRef.current.currentTime() + 1/fps)
  }

  const handlePrevFrame = () => {
    if (!playerRef.current) return
    const fps = currentVideo?.fps || 30
    playerRef.current.currentTime(Math.max(0, playerRef.current.currentTime() - 1/fps))
  }

  const handleDrawingModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: 'entity' | 'role' | 'event' | null
  ) => {
    dispatch(setDrawingMode(newMode))
  }

  const handleAnnotationClick = (annotation: any) => {
    // Select the annotation
    dispatch(selectAnnotation(annotation))
    
    // Seek video to start of annotation
    if (playerRef.current) {
      playerRef.current.currentTime(annotation.timeSpan.startTime)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const handleGoToOntology = () => {
    // Save current annotation state before navigating
    if (videoId) {
      dispatch(setLastAnnotation({ videoId, timestamp: currentTime }))
    }
    navigate('/ontology')
  }

  // Show all annotations sorted by start time
  const sortedAnnotations = useMemo(() => 
    [...annotations].sort((a, b) => a.timeSpan.startTime - b.timeSpan.startTime),
    [annotations]
  )
  
  // Highlight annotations at current time
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
            />
          )}
        </Box>

        <Paper sx={{ p: 2, mt: 2 }}>
          {/* Playback Controls Row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            {/* Mode Toggle (now to the left of play button) */}
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

            <Typography variant="body2" sx={{ minWidth: 100 }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>
            <Slider
              value={currentTime}
              max={duration}
              onChange={handleSeek}
              sx={{ flexGrow: 1 }}
            />
          </Box>

          {/* Second Row: Persona Selector and Type/Object Selection */}
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Persona Selector (left side) */}
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
              
              {/* Type/Object Selection (right of persona selector) */}
              {(annotationMode === 'type' || annotationMode === 'object') && (
                <Box sx={{ flex: 1, maxWidth: 400 }}>
                  <AnnotationAutocomplete
                    mode={annotationMode}
                    personaId={selectedPersonaId}
                    onSelect={(option) => {
                      if (option) {
                        // Set drawing mode based on selection
                        if (annotationMode === 'type') {
                          const drawMode = option.type as 'entity' | 'role' | 'event'
                          dispatch(setSelectedType({ 
                            typeId: option.id, 
                            category: drawMode 
                          }))
                        } else {
                          // For object mode, we'll use entity drawing mode
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
              
              {/* Video Summary Button - moved to far right */}
              {currentVideo && videoId && (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setSummaryDialogOpen(true)}
                  size="small"
                  sx={{ ml: 'auto' }}
                >
                  Edit Summary
                </Button>
              )}
            </Box>
            
          </Stack>
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
                    selected={isSelected}
                    onClick={() => handleAnnotationClick(annotation)}
                    onDoubleClick={() => {
                      setEditingAnnotation(annotation)
                      setEditorOpen(true)
                    }}
                    sx={{ 
                      cursor: 'pointer',
                      backgroundColor: isActive ? 'action.hover' : 'transparent',
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
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatTime(annotation.timeSpan.startTime)} → {formatTime(annotation.timeSpan.endTime)}
                          </Typography>
                          {annotation.notes && (
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              {annotation.notes}
                            </Typography>
                          )}
                        </Box>
                      }
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