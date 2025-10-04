import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Slider,
  Chip,
  Alert,
  IconButton,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material'
import {
  AccessTime as TimeIcon,
  Sync as SyncIcon,
  Movie as VideoIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '../../store/store'
import { Time } from '../../models/types'
import { generateId } from '../../utils/uuid'
import { addTime } from '../../store/worldSlice'

interface TemporalAnnotatorProps {
  videoId: string
  currentTime: number  // Current video time in seconds
  duration: number     // Video duration in seconds
  fps?: number         // Video frames per second
  onTimeCreated?: (time: Time) => void
  existingTime?: Time  // For editing existing time
}

interface VideoReference {
  videoId: string
  frameNumber?: number
  frameRange?: [number, number]
  milliseconds?: number
  millisecondRange?: [number, number]
}

export default function TemporalAnnotator({
  videoId,
  currentTime,
  duration,
  fps = 30,
  onTimeCreated,
  existingTime,
}: TemporalAnnotatorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [timeType, setTimeType] = useState<'instant' | 'interval'>(
    existingTime?.type || 'instant'
  )
  
  // Time range for intervals
  const [startTime, setStartTime] = useState(currentTime)
  const [endTime, setEndTime] = useState(Math.min(currentTime + 1, duration))
  
  // Vagueness settings
  const [hasVagueness, setHasVagueness] = useState(false)
  const [vaguenessType, setVaguenessType] = useState<'approximate' | 'bounded' | 'fuzzy'>('approximate')
  const [vaguenessDescription, setVaguenessDescription] = useState('')
  const [granularity, setGranularity] = useState<string>('second')
  
  // Deictic reference
  const [hasDeictic, setHasDeictic] = useState(false)
  const [deicticExpression, setDeicticExpression] = useState('')
  
  // Multi-video references
  const [videoReferences, setVideoReferences] = useState<VideoReference[]>([
    {
      videoId,
      frameNumber: timeType === 'instant' ? Math.floor(currentTime * fps) : undefined,
      frameRange: timeType === 'interval' ? [
        Math.floor(startTime * fps),
        Math.floor(endTime * fps)
      ] : undefined,
      milliseconds: timeType === 'instant' ? Math.floor(currentTime * 1000) : undefined,
      millisecondRange: timeType === 'interval' ? [
        Math.floor(startTime * 1000),
        Math.floor(endTime * 1000)
      ] : undefined,
    }
  ])
  
  // Certainty
  const [certainty, setCertainty] = useState(1.0)
  
  // Metadata
  const [notes, setNotes] = useState('')
  
  // Update video references when time changes
  useEffect(() => {
    const newRefs = [...videoReferences]
    const primaryRef = newRefs.find(ref => ref.videoId === videoId)

    if (primaryRef) {
      if (timeType === 'instant') {
        primaryRef.frameNumber = Math.floor(currentTime * fps)
        primaryRef.milliseconds = Math.floor(currentTime * 1000)
        delete primaryRef.frameRange
        delete primaryRef.millisecondRange
      } else {
        primaryRef.frameRange = [
          Math.floor(startTime * fps),
          Math.floor(endTime * fps)
        ]
        primaryRef.millisecondRange = [
          Math.floor(startTime * 1000),
          Math.floor(endTime * 1000)
        ]
        delete primaryRef.frameNumber
        delete primaryRef.milliseconds
      }
      setVideoReferences(newRefs)
    }
  }, [currentTime, startTime, endTime, timeType, fps, videoId, videoReferences])
  
  // Initialize from existing time
  useEffect(() => {
    if (existingTime) {
      setTimeType(existingTime.type)
      
      if (existingTime.videoReferences) {
        setVideoReferences(existingTime.videoReferences)
        
        // Extract start/end times from primary video reference
        const primaryRef = existingTime.videoReferences.find(ref => ref.videoId === videoId)
        if (primaryRef) {
          if (existingTime.type === 'instant' && primaryRef.milliseconds) {
            setStartTime(primaryRef.milliseconds / 1000)
          } else if (existingTime.type === 'interval' && primaryRef.millisecondRange) {
            setStartTime(primaryRef.millisecondRange[0] / 1000)
            setEndTime(primaryRef.millisecondRange[1] / 1000)
          }
        }
      }
      
      if (existingTime.vagueness) {
        setHasVagueness(true)
        setVaguenessType(existingTime.vagueness.type)
        setVaguenessDescription(existingTime.vagueness.description || '')
        setGranularity(existingTime.vagueness.granularity || 'second')
      }
      
      if (existingTime.deictic) {
        setHasDeictic(true)
        setDeicticExpression(existingTime.deictic.expression || '')
      }
      
      setCertainty(existingTime.certainty || 1.0)
      setNotes(existingTime.metadata?.notes || '')
    }
  }, [existingTime, videoId])
  
  const handleAddVideoReference = () => {
    const newRef: VideoReference = {
      videoId: '',
    }
    setVideoReferences([...videoReferences, newRef])
  }
  
  const handleRemoveVideoReference = (index: number) => {
    if (videoReferences[index].videoId !== videoId) {
      setVideoReferences(videoReferences.filter((_, i) => i !== index))
    }
  }
  
  const handleUpdateVideoReference = (index: number, field: string, value: any) => {
    const newRefs = [...videoReferences]
    newRefs[index] = { ...newRefs[index], [field]: value }
    setVideoReferences(newRefs)
  }
  
  const createTimeObject = (): Time => {
    const baseTime: any = {
      id: existingTime?.id || generateId(),
      type: timeType,
      videoReferences,
      certainty,
    }
    
    // Add timestamp for instants
    if (timeType === 'instant') {
      baseTime.timestamp = new Date(startTime * 1000).toISOString()
    } else {
      baseTime.startTime = new Date(startTime * 1000).toISOString()
      baseTime.endTime = new Date(endTime * 1000).toISOString()
    }
    
    // Add vagueness if specified
    if (hasVagueness) {
      baseTime.vagueness = {
        type: vaguenessType,
        description: vaguenessDescription || undefined,
        granularity: granularity as any,
      }
    }
    
    // Add deictic reference if specified
    if (hasDeictic) {
      baseTime.deictic = {
        anchorType: 'video_time',
        expression: deicticExpression || undefined,
      }
    }
    
    // Add metadata
    if (notes) {
      baseTime.metadata = { notes }
    }
    
    return baseTime
  }
  
  const handleSaveTime = () => {
    const time = createTimeObject()
    dispatch(addTime(time))
    
    if (onTimeCreated) {
      onTimeCreated(time)
    }
  }
  
  const formatTimeDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
  
  const formatFrameDisplay = (seconds: number) => {
    return `Frame ${Math.floor(seconds * fps)}`
  }
  
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TimeIcon />
        Temporal Annotation
      </Typography>
      
      <Stack spacing={3}>
        {/* Time Type Selection */}
        <FormControl fullWidth>
          <InputLabel>Time Type</InputLabel>
          <Select
            value={timeType}
            onChange={(e) => setTimeType(e.target.value as 'instant' | 'interval')}
            label="Time Type"
          >
            <MenuItem value="instant">Instant (single point in time)</MenuItem>
            <MenuItem value="interval">Interval (time range)</MenuItem>
          </Select>
        </FormControl>
        
        {/* Time Selection */}
        {timeType === 'instant' ? (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Time Point</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {formatTimeDisplay(currentTime)} / {formatFrameDisplay(currentTime)}
              </Typography>
            </Alert>
            <Button
              variant="outlined"
              startIcon={<SyncIcon />}
              onClick={() => setStartTime(currentTime)}
              fullWidth
            >
              Use Current Video Time
            </Button>
          </Box>
        ) : (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Time Range</Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Start: {formatTimeDisplay(startTime)} / {formatFrameDisplay(startTime)}
                </Typography>
                <Slider
                  value={startTime}
                  onChange={(_, value) => setStartTime(value as number)}
                  min={0}
                  max={duration}
                  step={1 / fps}
                  valueLabelDisplay="auto"
                  valueLabelFormat={formatTimeDisplay}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  End: {formatTimeDisplay(endTime)} / {formatFrameDisplay(endTime)}
                </Typography>
                <Slider
                  value={endTime}
                  onChange={(_, value) => setEndTime(value as number)}
                  min={startTime}
                  max={duration}
                  step={1 / fps}
                  valueLabelDisplay="auto"
                  valueLabelFormat={formatTimeDisplay}
                />
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setStartTime(currentTime)
                    setEndTime(Math.min(currentTime + 1, duration))
                  }}
                >
                  Use Current Time
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setStartTime(0)
                    setEndTime(duration)
                  }}
                >
                  Full Video
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
        
        <Divider />
        
        {/* Vagueness Settings */}
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={hasVagueness}
                onChange={(e) => setHasVagueness(e.target.checked)}
              />
            }
            label="Add Vagueness/Uncertainty"
          />
          
          {hasVagueness && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Vagueness Type</InputLabel>
                <Select
                  value={vaguenessType}
                  onChange={(e) => setVaguenessType(e.target.value as any)}
                  label="Vagueness Type"
                >
                  <MenuItem value="approximate">Approximate (around this time)</MenuItem>
                  <MenuItem value="bounded">Bounded (within a range)</MenuItem>
                  <MenuItem value="fuzzy">Fuzzy (unclear boundaries)</MenuItem>
                </Select>
              </FormControl>
              
              <TextField
                label="Description (optional)"
                placeholder="e.g., 'around noon', 'early morning'"
                value={vaguenessDescription}
                onChange={(e) => setVaguenessDescription(e.target.value)}
                size="small"
                fullWidth
              />
              
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
                </Select>
              </FormControl>
            </Stack>
          )}
        </Box>
        
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
            <TextField
              label="Deictic Expression"
              placeholder="e.g., 'at this point', 'right now', 'just before'"
              value={deicticExpression}
              onChange={(e) => setDeicticExpression(e.target.value)}
              size="small"
              fullWidth
              sx={{ mt: 2 }}
            />
          )}
        </Box>
        
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
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${(value * 100).toFixed(0)}%`}
          />
        </Box>
        
        {/* Multi-Video References */}
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideoIcon />
            Video References
          </Typography>
          
          {videoReferences.map((ref, index) => (
            <Paper key={index} variant="outlined" sx={{ p: 2, mb: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                {ref.videoId === videoId ? (
                  <Chip label="Primary Video" color="primary" size="small" />
                ) : (
                  <TextField
                    label="Video ID"
                    value={ref.videoId}
                    onChange={(e) => handleUpdateVideoReference(index, 'videoId', e.target.value)}
                    size="small"
                    sx={{ flexGrow: 1 }}
                  />
                )}
                
                {ref.videoId !== videoId && (
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveVideoReference(index)}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Stack>
              
              {ref.videoId === videoId && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {timeType === 'instant'
                    ? `Frame ${ref.frameNumber}, ${ref.milliseconds}ms`
                    : `Frames ${ref.frameRange?.[0]}-${ref.frameRange?.[1]}, ${ref.millisecondRange?.[0]}-${ref.millisecondRange?.[1]}ms`
                  }
                </Typography>
              )}
            </Paper>
          ))}
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddVideoReference}
          >
            Add Video Reference
          </Button>
        </Box>
        
        {/* Notes */}
        <TextField
          label="Notes (optional)"
          multiline
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
        />
        
        {/* Save Button */}
        <Button
          variant="contained"
          size="large"
          onClick={handleSaveTime}
          startIcon={<TimeIcon />}
        >
          {existingTime ? 'Update' : 'Create'} Time Object
        </Button>
      </Stack>
    </Paper>
  )
}