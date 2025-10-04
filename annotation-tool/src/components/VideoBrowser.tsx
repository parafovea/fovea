/**
 * Video browser component for discovering and managing video content.
 * Displays a searchable grid of video cards with metadata, summaries, and annotation controls.
 * Supports batch summarization and persona-based analysis in GPU mode.
 *
 * @example
 * ```tsx
 * // Used in main application routing
 * <Route path="/videos" element={<VideoBrowser />} />
 * ```
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Chip,
  CircularProgress,
  Stack,
  Link,
  Badge,
  Collapse,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Toolbar,
  Paper,
  Tooltip,
} from '@mui/material'
import {
  Search as SearchIcon,
  Edit as AnnotateIcon,
  Schedule as TimeIcon,
  ThumbUp as LikeIcon,
  Share as ShareIcon,
  Comment as CommentIcon,
  OpenInNew as ExternalLinkIcon,
  AutoAwesome as SummarizeIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import {
  setVideos,
  setSearchTerm,
  setLoading,
  setActiveSummaryJob,
  clearSummaryJob,
  addVideoSummary,
} from '../store/videoSlice'
import { setActivePersona } from '../store/personaSlice'
import { formatTimestamp, formatDuration } from '../utils/formatters'
import { VideoMetadata } from '../models/types'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useGenerateSummary, useVideoSummary } from '../hooks/useSummaries'
import { VideoSummaryCard } from './VideoSummaryCard'
import { JobStatusIndicator } from './JobStatusIndicator'
import { useModelConfig } from '../hooks/useModelConfig'

export default function VideoBrowser() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const { videos, isLoading, filter, activeSummaryJobs, videoSummaries } = useSelector(
    (state: RootState) => state.videos
  )
  const activePersonaId = useSelector((state: RootState) => state.persona.activePersonaId)
  const personas = useSelector((state: RootState) => state.persona.personas)
  const [localSearchTerm, setLocalSearchTerm] = useState(filter.searchTerm)
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0)
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({})
  const [isBatchSummarizing, setIsBatchSummarizing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { mutate: generateSummary } = useGenerateSummary()
  const { data: modelConfig } = useModelConfig()
  const isCpuOnly = !modelConfig?.cuda_available

  /**
   * Fetches video list from backend API.
   * Updates Redux store with video metadata and manages loading state.
   */
  const loadVideos = useCallback(async () => {
    dispatch(setLoading(true))
    try {
      const response = await fetch('/api/videos')
      const data = await response.json()
      dispatch(setVideos(data))
    } catch (error) {
      console.error('Failed to load videos:', error)
    } finally {
      dispatch(setLoading(false))
    }
  }, [dispatch])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  /**
   * Updates search filter for video list.
   * Filters videos by title, description, uploader, and tags.
   *
   * @param value - Search term to filter videos
   */
  const handleSearch = (value: string) => {
    setLocalSearchTerm(value)
    dispatch(setSearchTerm(value))
  }

  /**
   * Queues a video summary generation job.
   * Requires an active persona to be selected. Expands summary section on success.
   *
   * @param videoId - Video identifier to summarize
   */
  const handleGenerateSummary = (videoId: string) => {
    if (!activePersonaId) {
      alert('Please select a persona first')
      return
    }

    generateSummary(
      {
        videoId,
        personaId: activePersonaId,
        frameSampleRate: 1,
        maxFrames: 30,
      },
      {
        onSuccess: (result) => {
          dispatch(
            setActiveSummaryJob({
              videoId,
              personaId: activePersonaId,
              jobId: result.jobId,
            })
          )
          setExpandedSummaries((prev) => ({ ...prev, [videoId]: true }))
        },
        onError: (error) => {
          console.error('Failed to generate summary:', error)
        },
      }
    )
  }

  /**
   * Handles successful completion of a summary job.
   * Clears job status and adds summary reference to Redux store.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   */
  const handleSummaryJobComplete = (videoId: string, personaId: string) => {
    dispatch(clearSummaryJob({ videoId, personaId }))
    dispatch(addVideoSummary({ videoId, personaId }))
  }

  /**
   * Handles failed summary job.
   * Removes job status from Redux store to allow retry.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   */
  const handleSummaryJobFail = (videoId: string, personaId: string) => {
    dispatch(clearSummaryJob({ videoId, personaId }))
  }

  /**
   * Toggles summary visibility for a video card.
   *
   * @param videoId - Video identifier
   */
  const toggleSummaryExpand = (videoId: string) => {
    setExpandedSummaries((prev) => ({
      ...prev,
      [videoId]: !prev[videoId],
    }))
  }

  /**
   * Sets the active persona for video analysis.
   * Updates Redux store with selected persona ID.
   *
   * @param personaId - Persona identifier to activate
   */
  const handlePersonaChange = (personaId: string) => {
    dispatch(setActivePersona(personaId))
  }

  /**
   * Batch summarizes all filtered videos without existing summaries.
   * Queues jobs sequentially with delay to avoid server overload.
   * Requires an active persona to be selected.
   */
  const handleSummarizeAll = async () => {
    if (!activePersonaId) {
      alert('Please select a persona first')
      return
    }

    setIsBatchSummarizing(true)

    // Generate summaries for all filtered videos that don't already have one
    for (const video of filteredVideos) {
      const jobKey = `${video.id}:${activePersonaId}`
      const hasSummary = videoSummaries[video.id]?.includes(activePersonaId)
      const hasActiveJob = !!activeSummaryJobs[jobKey]

      // Skip if already has summary or job in progress
      if (hasSummary || hasActiveJob) {
        continue
      }

      // Generate summary for this video
      generateSummary(
        {
          videoId: video.id,
          personaId: activePersonaId,
          frameSampleRate: 1,
          maxFrames: 30,
        },
        {
          onSuccess: (result) => {
            dispatch(
              setActiveSummaryJob({
                videoId: video.id,
                personaId: activePersonaId,
                jobId: result.jobId,
              })
            )
          },
          onError: (error) => {
            console.error(`Failed to generate summary for video ${video.id}:`, error)
          },
        }
      )

      // Add a small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setIsBatchSummarizing(false)
  }

  const filteredVideos = videos.filter((video: VideoMetadata) => {
    if (!filter.searchTerm) return true
    const searchLower = filter.searchTerm.toLowerCase()
    return (
      video.title.toLowerCase().includes(searchLower) ||
      video.description.toLowerCase().includes(searchLower) ||
      video.uploader?.toLowerCase().includes(searchLower) ||
      video.uploader_id?.toLowerCase().includes(searchLower) ||
      video.tags?.some(tag => tag.toLowerCase().includes(searchLower))
    )
  })

  /**
   * Calculates grid layout columns based on viewport width.
   * Returns 1, 2, 3, or 4 columns for xs, sm, md, lg breakpoints.
   *
   * @returns Number of grid columns
   */
  const getGridColumns = () => {
    // This assumes the grid breakpoints: xs=12, sm=6, md=4, lg=3
    // Which means 1, 2, 3, or 4 columns respectively
    const width = window.innerWidth
    if (width >= 1200) return 4 // lg
    if (width >= 900) return 3 // md
    if (width >= 600) return 2 // sm
    return 1 // xs
  }

  /**
   * Extracts video URL from metadata.
   * Prefers original webpage URL, then highest quality format URL.
   *
   * @param video - Video metadata object
   * @returns Video URL or empty string
   */
  const getVideoUrl = (video: VideoMetadata) => {
    // First try webpage_url as it's the original source
    if (video.webpage_url) {
      return video.webpage_url
    }
    // Then try to get the highest quality video URL from formats
    if (video.formats && video.formats.length > 0) {
      // Find the format with both video and audio, preferring higher resolutions
      const httpFormats = video.formats.filter(f =>
        f.url && f.url.startsWith('http') && f.width && f.height
      )
      if (httpFormats.length > 0) {
        httpFormats.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))
        return httpFormats[0].url
      }
      return video.formats.find(f => f.url)?.url || ''
    }
    return ''
  }
  
  // Setup keyboard shortcuts
  useWorkspaceKeyboardShortcuts('videoBrowser', {
    'search.focus': () => {
      searchInputRef.current?.focus()
    },
    'video.open': () => {
      if (filteredVideos[selectedVideoIndex]) {
        navigate(`/annotate/${filteredVideos[selectedVideoIndex].id}`)
      }
    },
    'video.preview': () => {
      // TODO: Implement video preview
      console.log('Video preview not yet implemented')
    },
    'navigate.left': () => {
      setSelectedVideoIndex(prev => Math.max(0, prev - 1))
    },
    'navigate.right': () => {
      setSelectedVideoIndex(prev => Math.min(filteredVideos.length - 1, prev + 1))
    },
    'navigate.up': () => {
      const cols = getGridColumns()
      setSelectedVideoIndex(prev => Math.max(0, prev - cols))
    },
    'navigate.down': () => {
      const cols = getGridColumns()
      setSelectedVideoIndex(prev => Math.min(filteredVideos.length - 1, prev + cols))
    },
  })
  
  // Reset selection when search changes
  useEffect(() => {
    setSelectedVideoIndex(0)
  }, [filter.searchTerm])

  /**
   * Selects a video card for keyboard navigation.
   *
   * @param index - Index of video in filtered list
   */
  const handleCardClick = (index: number) => {
    setSelectedVideoIndex(index)
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box mb={3}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search videos by title, description, uploader, or tags..."
          value={localSearchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          inputRef={searchInputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="body2" color="text.secondary">
                  {filteredVideos.length} video{filteredVideos.length !== 1 ? 's' : ''}
                </Typography>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Only show toolbar in GPU mode */}
      {!isCpuOnly && (
        <Paper elevation={0} sx={{ mb: 3, p: 2, bgcolor: 'background.default' }}>
          <Toolbar disableGutters sx={{ gap: 2, flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel id="persona-select-label">Persona</InputLabel>
              <Select
                labelId="persona-select-label"
                id="persona-select"
                value={activePersonaId || ''}
                label="Persona"
                onChange={(e) => handlePersonaChange(e.target.value)}
              >
                {personas.length === 0 && (
                  <MenuItem value="" disabled>
                    No personas available
                  </MenuItem>
                )}
                {personas.map((persona) => (
                  <MenuItem key={persona.id} value={persona.id}>
                    {persona.name}
                    {persona.role && ` (${persona.role})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={isBatchSummarizing ? <CircularProgress size={16} /> : <SummarizeIcon />}
              onClick={handleSummarizeAll}
              disabled={!activePersonaId || isBatchSummarizing || filteredVideos.length === 0}
            >
              {isBatchSummarizing ? 'Summarizing...' : 'Summarize All Videos'}
            </Button>
          </Toolbar>
        </Paper>
      )}

      <Grid container spacing={3}>
        {filteredVideos.map((video: VideoMetadata, index) => {
          const videoUrl = getVideoUrl(video)
          const thumbnailUrl = video.thumbnail ||
            (video.thumbnails && video.thumbnails.length > 0
              ? video.thumbnails[video.thumbnails.length - 1].url
              : '')

          return (
            <VideoCard
              key={video.id}
              video={video}
              index={index}
              videoUrl={videoUrl}
              thumbnailUrl={thumbnailUrl}
              selectedVideoIndex={selectedVideoIndex}
              handleCardClick={handleCardClick}
              navigate={navigate}
              activePersonaId={activePersonaId}
              personas={personas}
              activeSummaryJobs={activeSummaryJobs}
              videoSummaries={videoSummaries}
              expandedSummaries={expandedSummaries}
              handleGenerateSummary={handleGenerateSummary}
              toggleSummaryExpand={toggleSummaryExpand}
              handleSummaryJobComplete={handleSummaryJobComplete}
              handleSummaryJobFail={handleSummaryJobFail}
              isCpuOnly={isCpuOnly}
            />
          )
        })}
      </Grid>

      {filteredVideos.length === 0 && !isLoading && (
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          height="300px"
        >
          <Typography variant="h6" color="text.secondary">
            No videos found
          </Typography>
          {filter.searchTerm && (
            <Typography variant="body2" color="text.secondary">
              Try adjusting your search query
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

/**
 * Props for VideoCard component.
 */
interface VideoCardProps {
  /** Video metadata object */
  video: VideoMetadata
  /** Index in filtered video list */
  index: number
  /** External video URL */
  videoUrl: string
  /** Thumbnail image URL */
  thumbnailUrl: string
  /** Currently selected video index for keyboard navigation */
  selectedVideoIndex: number
  /** Handler for card click events */
  handleCardClick: (index: number) => void
  /** React Router navigation function */
  navigate: ReturnType<typeof useNavigate>
  /** Active persona identifier */
  activePersonaId: string | null
  /** List of all personas */
  personas: any[]
  /** Active summary jobs keyed by video:persona */
  activeSummaryJobs: Record<string, string>
  /** Video summaries keyed by video ID */
  videoSummaries: Record<string, string[]>
  /** Expanded summary states keyed by video ID */
  expandedSummaries: Record<string, boolean>
  /** Handler for summary generation */
  handleGenerateSummary: (videoId: string) => void
  /** Handler for toggling summary visibility */
  toggleSummaryExpand: (videoId: string) => void
  /** Handler for summary job completion */
  handleSummaryJobComplete: (videoId: string, personaId: string) => void
  /** Handler for summary job failure */
  handleSummaryJobFail: (videoId: string, personaId: string) => void
  /** Whether system is running in CPU-only mode */
  isCpuOnly: boolean
}

/**
 * Video card component displaying metadata, thumbnail, and summary controls.
 * Supports keyboard navigation and persona-based summarization in GPU mode.
 */
function VideoCard({
  video,
  index,
  videoUrl,
  thumbnailUrl,
  selectedVideoIndex,
  handleCardClick,
  navigate,
  activePersonaId,
  personas,
  activeSummaryJobs,
  videoSummaries,
  expandedSummaries,
  handleGenerateSummary,
  toggleSummaryExpand,
  handleSummaryJobComplete,
  handleSummaryJobFail,
  isCpuOnly,
}: VideoCardProps) {
  const jobKey = activePersonaId ? `${video.id}:${activePersonaId}` : null
  const activeJobId = jobKey ? activeSummaryJobs[jobKey] : null
  const hasSummary = Boolean(activePersonaId && videoSummaries[video.id]?.includes(activePersonaId))
  const activePersona = personas.find((p) => p.id === activePersonaId)

  const { data: summary, isLoading: summaryLoading } = useVideoSummary(
    video.id,
    activePersonaId || '',
    {
      enabled: !!activePersonaId && hasSummary,
    }
  )

  return (
    <Grid item xs={12} sm={6} md={4} lg={3}>
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          outline: selectedVideoIndex === index ? 2 : 0,
          outlineColor: 'primary.main',
          cursor: 'pointer',
        }}
        onClick={() => handleCardClick(index)}
      >
        <CardMedia
          component="div"
          sx={{
            pt: '56.25%',
            bgcolor: 'grey.300',
            backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              bgcolor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              px: 1,
              borderRadius: 1,
            }}
          >
            {formatDuration(video.duration)}
          </Typography>
          {video.width && video.height && (
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                bgcolor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                px: 1,
                borderRadius: 1,
              }}
            >
              {video.width}×{video.height}
            </Typography>
          )}
          {hasSummary && (
            <Badge
              badgeContent="✓"
              color="success"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
              }}
            />
          )}
        </CardMedia>
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography gutterBottom variant="h6" component="h2">
            {video.uploader || video.uploader_id || 'Unknown User'}
            {video.uploader_id && video.uploader_url && (
              <>
                {' '}(
                <Link
                  href={video.uploader_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{video.uploader_id}
                </Link>
                )
              </>
            )}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              mb: 1,
            }}
          >
            {video.description}
          </Typography>

          {video.timestamp && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {formatTimestamp(video.timestamp)}
              </Typography>
            </Box>
          )}

          {(video.like_count || video.repost_count || video.comment_count) && (
            <Stack direction="row" spacing={1.5} sx={{ mb: 1 }}>
              {video.like_count !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LikeIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.like_count.toLocaleString()}</Typography>
                </Box>
              )}
              {video.repost_count !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShareIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.repost_count.toLocaleString()}</Typography>
                </Box>
              )}
              {video.comment_count !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CommentIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.comment_count.toLocaleString()}</Typography>
                </Box>
              )}
            </Stack>
          )}

          {video.tags && video.tags.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {video.tags.slice(0, 3).map((tag, idx) => (
                <Chip key={idx} label={tag} size="small" variant="outlined" />
              ))}
              {video.tags.length > 3 && (
                <Chip
                  label={`+${video.tags.length - 3}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
            </Box>
          )}
        </CardContent>
        <CardActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 2, pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<AnnotateIcon />}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/annotate/${video.id}`)
              }}
            >
              Annotate
            </Button>
            {videoUrl && (
              <Button
                size="small"
                startIcon={<ExternalLinkIcon />}
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Source
              </Button>
            )}
            <Tooltip title={isCpuOnly ? 'GPU required for video summarization (CPU-only mode detected)' : ''}>
              <span>
                <Button
                  size="small"
                  startIcon={<SummarizeIcon />}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasSummary) {
                      toggleSummaryExpand(video.id)
                    } else {
                      handleGenerateSummary(video.id)
                    }
                  }}
                  disabled={!!activeJobId || !activePersonaId || isCpuOnly}
                >
                  {hasSummary ? 'View' : 'Summarize'}
                </Button>
              </span>
            </Tooltip>
          </Box>

          {activeJobId && (
            <Box onClick={(e) => e.stopPropagation()}>
              <JobStatusIndicator
                jobId={activeJobId}
                title="Generating summary"
                onComplete={() => activePersonaId && handleSummaryJobComplete(video.id, activePersonaId)}
                onFail={() => activePersonaId && handleSummaryJobFail(video.id, activePersonaId)}
              />
            </Box>
          )}

          {hasSummary && expandedSummaries[video.id] && (
            <Collapse in={expandedSummaries[video.id]} onClick={(e) => e.stopPropagation()}>
              <VideoSummaryCard
                summary={summary ?? null}
                personaName={activePersona?.name}
                personaRole={activePersona?.role}
                loading={summaryLoading}
                showActions={false}
              />
            </Collapse>
          )}

          {!activePersonaId && !isCpuOnly && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Select a persona to generate summaries
            </Alert>
          )}
        </CardActions>
      </Card>
    </Grid>
  )
}