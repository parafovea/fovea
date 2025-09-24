import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  FormControlLabel,
  Switch,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
} from '@mui/material'
import {
  AccessTime as TimeIcon,
  Schedule as InstantIcon,
  DateRange as IntervalIcon,
  QuestionMark as VagueIcon,
  VideoLibrary as VideoIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { AppDispatch, RootState } from '../../store/store'
import { addTime, updateTime } from '../../store/worldSlice'
import { Time, TimeInstant, TimeInterval } from '../../models/types'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'

interface TimeEditorProps {
  open: boolean
  onClose: () => void
  time: Time | null
}

interface VideoReference {
  videoId: string
  frameNumber?: number
  frameRange?: [number, number]
  milliseconds?: number
  millisecondRange?: [number, number]
}

export default function TimeEditor({ open, onClose, time }: TimeEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { videos } = useSelector((state: RootState) => state.videos)
  
  const [timeType, setTimeType] = useState<'instant' | 'interval'>('instant')
  
  // Instant fields
  const [timestamp, setTimestamp] = useState('')
  
  // Interval fields
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  
  // Vagueness fields
  const [hasVagueness, setHasVagueness] = useState(false)
  const [vaguenessType, setVaguenessType] = useState<'approximate' | 'bounded' | 'fuzzy'>('approximate')
  const [vaguenessDescription, setVaguenessDescription] = useState('')
  const [earliestBound, setEarliestBound] = useState('')
  const [latestBound, setLatestBound] = useState('')
  const [typicalTime, setTypicalTime] = useState('')
  const [granularity, setGranularity] = useState<string>('minute')
  
  // Deictic reference
  const [hasDeictic, setHasDeictic] = useState(false)
  const [deicticAnchorType, setDeicticAnchorType] = useState<string>('video_time')
  const [deicticExpression, setDeicticExpression] = useState('')
  
  // Video references
  const [videoReferences, setVideoReferences] = useState<VideoReference[]>([])
  
  // Certainty
  const [certainty, setCertainty] = useState(1.0)

  useEffect(() => {
    if (time) {
      setTimeType(time.type)
      
      if (time.type === 'instant') {
        const instant = time as TimeInstant
        setTimestamp(instant.timestamp || '')
      } else {
        const interval = time as TimeInterval
        setStartTime(interval.startTime || '')
        setEndTime(interval.endTime || '')
      }
      
      if (time.vagueness) {
        setHasVagueness(true)
        setVaguenessType(time.vagueness.type)
        setVaguenessDescription(time.vagueness.description || '')
        setEarliestBound(time.vagueness.bounds?.earliest || '')
        setLatestBound(time.vagueness.bounds?.latest || '')
        setTypicalTime(time.vagueness.bounds?.typical || '')
        setGranularity(time.vagueness.granularity || 'minute')
      }
      
      if (time.deictic) {
        setHasDeictic(true)
        setDeicticAnchorType(time.deictic.anchorType)
        setDeicticExpression(time.deictic.expression || '')
      }
      
      setVideoReferences(time.videoReferences || [])
      setCertainty(time.certainty || 1.0)
    } else {
      // Reset to defaults for new time
      setTimeType('instant')
      setTimestamp('')
      setStartTime('')
      setEndTime('')
      setHasVagueness(false)
      setHasDeictic(false)
      setVideoReferences([])
      setCertainty(1.0)
    }
  }, [time])

  const handleAddVideoReference = () => {
    setVideoReferences([...videoReferences, {
      videoId: '',
    }])
  }

  const handleUpdateVideoReference = (index: number, ref: VideoReference) => {
    const updated = [...videoReferences]
    updated[index] = ref
    setVideoReferences(updated)
  }

  const handleRemoveVideoReference = (index: number) => {
    setVideoReferences(videoReferences.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const baseTime: Omit<Time, 'id'> = {
      type: timeType,
      videoReferences: videoReferences.filter(ref => ref.videoId),
      certainty,
      metadata: {},
    }
    
    if (hasVagueness) {
      baseTime.vagueness = {
        type: vaguenessType,
        description: vaguenessDescription || undefined,
        bounds: (earliestBound || latestBound || typicalTime) ? {
          earliest: earliestBound || undefined,
          latest: latestBound || undefined,
          typical: typicalTime || undefined,
        } : undefined,
        granularity: granularity as any,
      }
    }
    
    if (hasDeictic) {
      baseTime.deictic = {
        anchorType: deicticAnchorType as any,
        anchorTime: undefined, // Would be set based on context
        expression: deicticExpression || undefined,
      }
    }
    
    let timeData: Omit<Time, 'id'>
    
    if (timeType === 'instant') {
      timeData = {
        ...baseTime,
        type: 'instant',
        timestamp,
      } as Omit<TimeInstant, 'id'>
    } else {
      timeData = {
        ...baseTime,
        type: 'interval',
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      } as Omit<TimeInterval, 'id'>
    }
    
    if (time) {
      dispatch(updateTime({ ...time, ...timeData }))
    } else {
      dispatch(addTime(timeData))
    }
    
    onClose()
  }

  const getVideoName = (videoId: string): string => {
    const video = Object.values(videos).find(v => v.id === videoId)
    return video?.title || 'Unknown Video'
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimeIcon color="secondary" />
          {time ? 'Edit Time' : 'Create Time'}
          <TypeObjectBadge isType={false} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <Alert severity="info" icon={<TimeIcon />}>
            A time represents when something happens - either a specific instant or an interval.
            Times can be precise or vague, and can reference specific video frames.
          </Alert>

          {/* Time Type Selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Time Type
            </Typography>
            <ToggleButtonGroup
              value={timeType}
              exclusive
              onChange={(_, value) => value && setTimeType(value)}
              fullWidth
            >
              <ToggleButton value="instant">
                <InstantIcon sx={{ mr: 1 }} />
                Instant (Point in Time)
              </ToggleButton>
              <ToggleButton value="interval">
                <IntervalIcon sx={{ mr: 1 }} />
                Interval (Time Span)
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Instant Fields */}
          {timeType === 'instant' && (
            <TextField
              label="Timestamp"
              type="datetime-local"
              value={timestamp ? timestamp.slice(0, 16) : ''}
              onChange={(e) => setTimestamp(e.target.value ? new Date(e.target.value).toISOString() : '')}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="The specific moment in time"
            />
          )}

          {/* Interval Fields */}
          {timeType === 'interval' && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Time (Optional)"
                type="datetime-local"
                value={startTime ? startTime.slice(0, 16) : ''}
                onChange={(e) => setStartTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Time (Optional)"
                type="datetime-local"
                value={endTime ? endTime.slice(0, 16) : ''}
                onChange={(e) => setEndTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          )}

          <Divider />

          {/* Vagueness */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={hasVagueness}
                  onChange={(e) => setHasVagueness(e.target.checked)}
                />
              }
              label="Add Vagueness Information"
            />
            {hasVagueness && (
              <Box sx={{ mt: 2, pl: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Vagueness Type</InputLabel>
                  <Select
                    value={vaguenessType}
                    onChange={(e) => setVaguenessType(e.target.value as any)}
                    label="Vagueness Type"
                  >
                    <MenuItem value="approximate">Approximate</MenuItem>
                    <MenuItem value="bounded">Bounded</MenuItem>
                    <MenuItem value="fuzzy">Fuzzy</MenuItem>
                  </Select>
                </FormControl>
                
                <TextField
                  label="Description"
                  size="small"
                  value={vaguenessDescription}
                  onChange={(e) => setVaguenessDescription(e.target.value)}
                  placeholder="e.g., 'around noon', 'early morning'"
                  fullWidth
                />
                
                {vaguenessType === 'bounded' && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      label="Earliest"
                      type="datetime-local"
                      size="small"
                      value={earliestBound ? earliestBound.slice(0, 16) : ''}
                      onChange={(e) => setEarliestBound(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="Latest"
                      type="datetime-local"
                      size="small"
                      value={latestBound ? latestBound.slice(0, 16) : ''}
                      onChange={(e) => setLatestBound(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="Typical"
                      type="datetime-local"
                      size="small"
                      value={typicalTime ? typicalTime.slice(0, 16) : ''}
                      onChange={(e) => setTypicalTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                )}
                
                <FormControl fullWidth size="small">
                  <InputLabel>Granularity</InputLabel>
                  <Select
                    value={granularity}
                    onChange={(e) => setGranularity(e.target.value)}
                    label="Granularity"
                  >
                    <MenuItem value="millisecond">Millisecond</MenuItem>
                    <MenuItem value="second">Second</MenuItem>
                    <MenuItem value="minute">Minute</MenuItem>
                    <MenuItem value="hour">Hour</MenuItem>
                    <MenuItem value="day">Day</MenuItem>
                    <MenuItem value="week">Week</MenuItem>
                    <MenuItem value="month">Month</MenuItem>
                    <MenuItem value="year">Year</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>

          <Divider />

          {/* Deictic Reference */}
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={hasDeictic}
                  onChange={(e) => setHasDeictic(e.target.checked)}
                />
              }
              label="Add Deictic Reference"
            />
            {hasDeictic && (
              <Box sx={{ mt: 2, pl: 2, display: 'flex', gap: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Anchor Type</InputLabel>
                  <Select
                    value={deicticAnchorType}
                    onChange={(e) => setDeicticAnchorType(e.target.value)}
                    label="Anchor Type"
                  >
                    <MenuItem value="annotation_time">Annotation Time</MenuItem>
                    <MenuItem value="video_time">Video Time</MenuItem>
                    <MenuItem value="reference_time">Reference Time</MenuItem>
                  </Select>
                </FormControl>
                
                <TextField
                  label="Expression"
                  size="small"
                  value={deicticExpression}
                  onChange={(e) => setDeicticExpression(e.target.value)}
                  placeholder="e.g., 'yesterday', 'at this point'"
                  fullWidth
                />
              </Box>
            )}
          </Box>

          <Divider />

          {/* Video References */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Video References
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Link this time to specific moments in videos
            </Typography>
            
            {videoReferences.map((ref, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel size="small">Video</InputLabel>
                  <Select
                    size="small"
                    value={ref.videoId}
                    onChange={(e) => handleUpdateVideoReference(index, { ...ref, videoId: e.target.value })}
                    label="Video"
                  >
                    <MenuItem value="">None</MenuItem>
                    {Object.values(videos).map(video => (
                      <MenuItem key={video.id} value={video.id}>
                        {video.title}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                {timeType === 'instant' ? (
                  <>
                    <TextField
                      label="Frame"
                      type="number"
                      size="small"
                      value={ref.frameNumber || ''}
                      onChange={(e) => handleUpdateVideoReference(index, { 
                        ...ref, 
                        frameNumber: e.target.value ? parseInt(e.target.value) : undefined 
                      })}
                    />
                    <TextField
                      label="Milliseconds"
                      type="number"
                      size="small"
                      value={ref.milliseconds || ''}
                      onChange={(e) => handleUpdateVideoReference(index, { 
                        ...ref, 
                        milliseconds: e.target.value ? parseInt(e.target.value) : undefined 
                      })}
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      label="Frame Range"
                      size="small"
                      placeholder="start-end"
                      value={ref.frameRange ? `${ref.frameRange[0]}-${ref.frameRange[1]}` : ''}
                      onChange={(e) => {
                        const parts = e.target.value.split('-').map(p => parseInt(p.trim())).filter(n => !isNaN(n))
                        handleUpdateVideoReference(index, {
                          ...ref,
                          frameRange: parts.length === 2 ? [parts[0], parts[1]] : undefined
                        })
                      }}
                    />
                  </>
                )}
                
                <IconButton size="small" onClick={() => handleRemoveVideoReference(index)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
            
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddVideoReference}
            >
              Add Video Reference
            </Button>
          </Box>

          <Divider />

          {/* Certainty */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Certainty: {(certainty * 100).toFixed(0)}%
            </Typography>
            <Slider
              value={certainty}
              onChange={(_, value) => setCertainty(value as number)}
              min={0}
              max={1}
              step={0.1}
              marks
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${(value * 100).toFixed(0)}%`}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          color="secondary"
          disabled={
            timeType === 'instant' 
              ? !timestamp && !hasVagueness && !hasDeictic
              : !startTime && !endTime && !hasVagueness && !hasDeictic
          }
        >
          {time ? 'Update' : 'Create'} Time
        </Button>
      </DialogActions>
    </Dialog>
  )
}