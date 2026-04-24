/**
 * Video browser component for discovering and managing video content.
 * Displays a searchable grid of video cards with metadata, summaries, and annotation controls.
 * Supports batch summarization and persona-based analysis when AI models are available.
 *
 * @example
 * ```tsx
 * // Used in main application routing
 * <Route path="/videos" element={<VideoBrowser />} />
 * ```
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { usePersonas } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { formatTimestamp, formatDuration } from '@utils/formatters'
import { VideoMetadata, Persona } from '@models/types'
import { useCommands, useCommandContext } from '@hooks/commands'
import { useVideos, useGenerateSummary, useVideoSummary, useModelConfig } from '@store/queries'
import { useVideoUiStore } from '@store/zustand'
import { VideoSummaryCard } from './VideoSummaryCard'
import { JobStatusIndicator } from '@components/shared/JobStatusIndicator'
import { useExternalLinksConfig } from '@hooks/config'

export default function VideoBrowser() {
  const navigate = useNavigate()

  // TanStack Query for server state
  const { data: videos = [], isLoading } = useVideos()
  const { data: personas = [] } = usePersonas()

  // Zustand for UI state
  const searchTerm = useVideoUiStore((state) => state.searchTerm)
  const setSearchTerm = useVideoUiStore((state) => state.setSearchTerm)
  const selectedVideoIndex = useVideoUiStore((state) => state.selectedVideoIndex)
  const setSelectedVideoIndex = useVideoUiStore((state) => state.setSelectedVideoIndex)
  const scrollPosition = useVideoUiStore((state) => state.scrollPosition)
  const setScrollPosition = useVideoUiStore((state) => state.setScrollPosition)
  const activeSummaryJobs = useVideoUiStore((state) => state.activeSummaryJobs)
  const videoSummaries = useVideoUiStore((state) => state.videoSummaries)
  const setActiveSummaryJob = useVideoUiStore((state) => state.setActiveSummaryJob)
  const clearSummaryJob = useVideoUiStore((state) => state.clearSummaryJob)
  const addVideoSummary = useVideoUiStore((state) => state.addVideoSummary)

  // Zustand for active persona selection
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)

  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({})
  const [isBatchSummarizing, setIsBatchSummarizing] = useState(false)
  const { videoSources: allowExternalVideoLinks } = useExternalLinksConfig()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { mutate: generateSummary } = useGenerateSummary()
  const { data: modelConfig } = useModelConfig()
  const modelsDisabled = !modelConfig?.cudaAvailable && !modelConfig?.cpuModelsAvailable

  /**
   * Updates search filter for video list.
   * Filters videos by title, description, uploader, and tags.
   *
   * @param value - Search term to filter videos
   */
  const handleSearch = (value: string) => {
    setLocalSearchTerm(value)
    setSearchTerm(value)
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
          setActiveSummaryJob(videoId, activePersonaId, result.jobId)
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
   * Clears job status and adds summary reference to store.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   */
  const handleSummaryJobComplete = (videoId: string, personaId: string) => {
    clearSummaryJob(videoId, personaId)
    addVideoSummary(videoId, personaId)
  }

  /**
   * Handles failed summary job.
   * Removes job status from store to allow retry.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   */
  const handleSummaryJobFail = (videoId: string, personaId: string) => {
    clearSummaryJob(videoId, personaId)
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
   * Updates Zustand store with selected persona ID.
   *
   * @param personaId - Persona identifier to activate
   */
  const handlePersonaChange = (personaId: string) => {
    setSelectedPersonaId(personaId)
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
      const hasSummaryForVideo = videoSummaries[video.id]?.includes(activePersonaId)
      const hasActiveJob = !!activeSummaryJobs[jobKey]

      // Skip if already has summary or job in progress
      if (hasSummaryForVideo || hasActiveJob) {
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
            setActiveSummaryJob(video.id, activePersonaId, result.jobId)
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

  // Filter videos by search term across multiple fields.
  // Uses optional chaining since metadata fields may be undefined.
  const filteredVideos = videos.filter((video: VideoMetadata) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      video.filename?.toLowerCase().includes(searchLower) ||
      video.title?.toLowerCase().includes(searchLower) ||
      video.description?.toLowerCase().includes(searchLower) ||
      video.uploader?.toLowerCase().includes(searchLower) ||
      video.uploaderId?.toLowerCase().includes(searchLower) ||
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
    // First try webpageUrl as it's the original source
    if (video.webpageUrl) {
      return video.webpageUrl
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

  // Set command context for when clauses
  useCommandContext({
    videoBrowserActive: true,
    annotationWorkspaceActive: false,
    ontologyWorkspaceActive: false,
    objectWorkspaceActive: false,
    dialogOpen: false,
    inputFocused: false, // Updated dynamically by focus events in App.tsx
  })

  // Register command handlers
  useCommands({
    'search.focus': () => {
      searchInputRef.current?.focus()
    },
    'video.open': () => {
      if (filteredVideos[selectedVideoIndex]) {
        navigate(`/annotate/${filteredVideos[selectedVideoIndex].id}`)
      }
    },
    'navigate.left': () => {
      setSelectedVideoIndex(Math.max(0, selectedVideoIndex - 1))
    },
    'navigate.right': () => {
      setSelectedVideoIndex(Math.min(filteredVideos.length - 1, selectedVideoIndex + 1))
    },
    'navigate.up': () => {
      const cols = getGridColumns()
      setSelectedVideoIndex(Math.max(0, selectedVideoIndex - cols))
    },
    'navigate.down': () => {
      const cols = getGridColumns()
      setSelectedVideoIndex(Math.min(filteredVideos.length - 1, selectedVideoIndex + cols))
    },
  }, {
    context: 'videoBrowser',
    enabled: true,
    enableOnFormTags: false
  })
  
  // Reset selection when search changes
  useEffect(() => {
    setSelectedVideoIndex(0)
  }, [searchTerm, setSelectedVideoIndex])

  // Find the scrollable parent container (Layout's overflow: auto Box)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // Walk up from the component root to find the scrollable ancestor
    const el = document.getElementById('video-browser-root')
    if (el) {
      let parent = el.parentElement
      while (parent) {
        const style = getComputedStyle(parent)
        if (style.overflow === 'auto' || style.overflowY === 'auto') {
          scrollContainerRef.current = parent
          break
        }
        parent = parent.parentElement
      }
    }
  }, [])

  // Restore scroll position on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollPosition > 0 && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollPosition
      }
    })
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save scroll position on scroll
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handleScroll = () => {
      setScrollPosition(container.scrollTop)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [setScrollPosition])

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
    <Box id="video-browser-root">
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

      {/* Only show toolbar when AI models are available */}
      {!modelsDisabled && (
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
          // Use backend thumbnail endpoint instead of external CDN URLs
          const thumbnailUrl = `/api/videos/${video.id}/thumbnail?size=medium`

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
              modelsDisabled={modelsDisabled}
              allowExternalVideoLinks={allowExternalVideoLinks}
              addVideoSummary={addVideoSummary}
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
          {searchTerm && (
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
  personas: Persona[]
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
  /** Whether AI models are unavailable (no GPU and no CPU models) */
  modelsDisabled: boolean
  /** Whether external video source links are allowed */
  allowExternalVideoLinks: boolean
  /** Handler to sync discovered summaries to local state */
  addVideoSummary: (videoId: string, personaId: string) => void
}

/**
 * Video card component displaying metadata, thumbnail, and summary controls.
 * Supports keyboard navigation and persona-based summarization when AI models are available.
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
  modelsDisabled,
  allowExternalVideoLinks,
  addVideoSummary,
}: VideoCardProps) {
  const jobKey = activePersonaId ? `${video.id}:${activePersonaId}` : null
  const activeJobId = jobKey ? activeSummaryJobs[jobKey] : null
  const hasSummary = Boolean(activePersonaId && videoSummaries[video.id]?.includes(activePersonaId))
  const activePersona = personas.find((p) => p.id === activePersonaId)

  const { data: summary, isLoading: summaryLoading } = useVideoSummary(
    video.id,
    activePersonaId || '',
    {
      // Always attempt to fetch summary when persona is active - don't rely on local state
      // This ensures summaries created in other browsers/sessions are discovered
      enabled: !!activePersonaId,
    }
  )

  // Sync discovered summaries to local state for badge display
  useEffect(() => {
    if (summary && activePersonaId && !hasSummary) {
      addVideoSummary(video.id, activePersonaId)
    }
  }, [summary, activePersonaId, hasSummary, video.id, addVideoSummary])

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
            {video.uploader || video.uploaderId || 'Unknown User'}
            {video.uploaderId && (
              <>
                {' '}(
                {allowExternalVideoLinks && video.uploaderUrl ? (
                  <Link
                    href={video.uploaderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{video.uploaderId}
                  </Link>
                ) : (
                  <Typography component="span" color="text.secondary">
                    @{video.uploaderId}
                  </Typography>
                )}
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

          {(video.likeCount || video.repostCount || video.commentCount) && (
            <Stack direction="row" spacing={1.5} sx={{ mb: 1 }}>
              {video.likeCount !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LikeIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.likeCount.toLocaleString()}</Typography>
                </Box>
              )}
              {video.repostCount !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShareIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.repostCount.toLocaleString()}</Typography>
                </Box>
              )}
              {video.commentCount !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CommentIcon fontSize="small" color="action" />
                  <Typography variant="caption">{video.commentCount.toLocaleString()}</Typography>
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
            <Tooltip title={modelsDisabled ? 'No AI models available for video summarization' : ''}>
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
                  disabled={!!activeJobId || !activePersonaId || modelsDisabled}
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

          {!activePersonaId && !modelsDisabled && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Select a persona to generate summaries
            </Alert>
          )}
        </CardActions>
      </Card>
    </Grid>
  )
}