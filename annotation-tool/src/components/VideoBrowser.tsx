import { useEffect, useState, useRef } from 'react'
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
} from '@mui/material'
import {
  Search as SearchIcon,
  Edit as AnnotateIcon,
  Schedule as TimeIcon,
  ThumbUp as LikeIcon,
  Share as ShareIcon,
  Comment as CommentIcon,
  OpenInNew as ExternalLinkIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import { setVideos, setSearchTerm, setLoading } from '../store/videoSlice'
import { formatTimestamp, formatDuration } from '../utils/formatters'
import { VideoMetadata } from '../models/types'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

export default function VideoBrowser() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const { videos, isLoading, filter } = useSelector((state: RootState) => state.videos)
  const [localSearchTerm, setLocalSearchTerm] = useState(filter.searchTerm)
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadVideos()
  }, [])

  const loadVideos = async () => {
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
  }

  const handleSearch = (value: string) => {
    setLocalSearchTerm(value)
    dispatch(setSearchTerm(value))
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

  // Calculate grid columns based on screen size
  const getGridColumns = () => {
    // This assumes the grid breakpoints: xs=12, sm=6, md=4, lg=3
    // Which means 1, 2, 3, or 4 columns respectively
    const width = window.innerWidth
    if (width >= 1200) return 4 // lg
    if (width >= 900) return 3 // md
    if (width >= 600) return 2 // sm
    return 1 // xs
  }
  
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
          }}
        />
      </Box>

      <Grid container spacing={3}>
        {filteredVideos.map((video: VideoMetadata, index) => {
          const videoUrl = getVideoUrl(video)
          const thumbnailUrl = video.thumbnail || 
            (video.thumbnails && video.thumbnails.length > 0 
              ? video.thumbnails[video.thumbnails.length - 1].url 
              : '')
          
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
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
                </CardMedia>
                <CardContent sx={{ flexGrow: 1 }}>
                  {/* Uploader as main title with clickable link */}
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
                  
                  {/* Description (no need for title since it duplicates uploader + description) */}
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

                  {/* Timestamp */}
                  {video.timestamp && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <TimeIcon fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(video.timestamp)}
                      </Typography>
                    </Box>
                  )}

                  {/* Engagement Metrics */}
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

                  {/* Tags */}
                  {video.tags && video.tags.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {video.tags.slice(0, 3).map((tag, index) => (
                        <Chip
                          key={index}
                          label={tag}
                          size="small"
                          variant="outlined"
                        />
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
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<AnnotateIcon />}
                    onClick={() => navigate(`/annotate/${video.id}`)}
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
                </CardActions>
              </Card>
            </Grid>
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