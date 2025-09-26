import React, { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { v4 as uuidv4 } from 'uuid'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Paper,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Tabs,
  Tab,
  Link,
} from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import {
  AccessTime as TimeIcon,
  Schedule as InstantIcon,
  DateRange as IntervalIcon,
  VideoLibrary as VideoIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Pattern as PatternIcon,
  Language as WikidataIcon,
  Edit as EditIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material'
import { AppDispatch, RootState } from '../../store/store'
import { addTime, updateTime, addTimeCollection } from '../../store/worldSlice'
import { 
  Time, 
  TimeInstant, 
  TimeInterval, 
  TimeCollection,
  RecurrenceFrequency,
} from '../../models/types'
import WikidataSearch from '../WikidataSearch'

interface TimeBuilderProps {
  open: boolean
  onClose: () => void
  initialMode?: 'single' | 'pattern'
  existingTime?: Time | null
  existingCollection?: TimeCollection | null
}

interface VideoReference {
  id: string
  videoId: string
  frameNumber?: number
  frameRange?: [number, number]
  milliseconds?: number
  millisecondRange?: [number, number]
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`time-builder-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  )
}

export default function TimeBuilder({
  open,
  onClose,
  initialMode = 'single',
  existingTime,
  existingCollection,
}: TimeBuilderProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { videos } = useSelector((state: RootState) => state.videos)
  const { events } = useSelector((state: RootState) => state.world)
  
  // Import mode
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedName, setImportedName] = useState<string>('')
  
  // Mode selection
  const [mode, setMode] = useState<'single' | 'pattern'>(initialMode)
  const [tabValue, setTabValue] = useState(0)
  
  // Time type
  const [timeType, setTimeType] = useState<'instant' | 'interval'>('instant')
  
  // Instant fields
  const [instantDate, setInstantDate] = useState<Date | null>(new Date())
  const [instantTime, setInstantTime] = useState<Date | null>(new Date())
  
  // Interval fields
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  
  // Vagueness
  const [hasVagueness, setHasVagueness] = useState(false)
  const [vaguenessType, setVaguenessType] = useState<'approximate' | 'bounded' | 'fuzzy'>('approximate')
  const [vaguenessDescription, setVaguenessDescription] = useState('')
  const [vaguenessGranularity, setVaguenessGranularity] = useState<string>('hour')
  const [earliestBound, setEarliestBound] = useState<Date | null>(null)
  const [latestBound, setLatestBound] = useState<Date | null>(null)
  const [typicalTime, setTypicalTime] = useState<Date | null>(null)
  
  // Deictic reference
  const [hasDeictic, setHasDeictic] = useState(false)
  const [deicticAnchorType, setDeicticAnchorType] = useState<'annotation_time' | 'video_time' | 'reference_time'>('video_time')
  const [deicticExpression, setDeicticExpression] = useState('')
  const [deicticAnchorTime, setDeicticAnchorTime] = useState('')
  
  // Video references
  const [videoReferences, setVideoReferences] = useState<VideoReference[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [frameNumber, setFrameNumber] = useState<number | undefined>()
  const [frameRangeStart, setFrameRangeStart] = useState<number | undefined>()
  const [frameRangeEnd, setFrameRangeEnd] = useState<number | undefined>()
  const [milliseconds, setMilliseconds] = useState<number | undefined>()
  const [millisecondsRangeStart, setMillisecondsRangeStart] = useState<number | undefined>()
  const [millisecondsRangeEnd, setMillisecondsRangeEnd] = useState<number | undefined>()
  
  // Certainty
  const [certainty, setCertainty] = useState(1.0)
  
  // Pattern fields
  const [patternName, setPatternName] = useState('')
  const [patternDescription, setPatternDescription] = useState('')
  const [quickPattern, setQuickPattern] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('custom')
  
  useEffect(() => {
    if (existingTime) {
      // Load existing time data
      setTimeType(existingTime.type)
      setWikidataId(existingTime.wikidataId || '')
      setWikidataUrl(existingTime.wikidataUrl || '')
      setImportedName(existingTime.wikidataId ? 'Imported' : '')
      
      if (existingTime.type === 'instant') {
        const instant = existingTime as TimeInstant
        if (instant.timestamp) {
          const date = new Date(instant.timestamp)
          setInstantDate(date)
          setInstantTime(date)
        }
      } else {
        const interval = existingTime as TimeInterval
        if (interval.startTime) setStartDate(new Date(interval.startTime))
        if (interval.endTime) setEndDate(new Date(interval.endTime))
      }
      
      if (existingTime.vagueness) {
        setHasVagueness(true)
        setVaguenessType(existingTime.vagueness.type || 'approximate')
        setVaguenessDescription(existingTime.vagueness.description || '')
        setVaguenessGranularity(existingTime.vagueness.granularity || 'hour')
        
        if (existingTime.vagueness.bounds) {
          if (existingTime.vagueness.bounds.earliest) {
            setEarliestBound(new Date(existingTime.vagueness.bounds.earliest))
          }
          if (existingTime.vagueness.bounds.latest) {
            setLatestBound(new Date(existingTime.vagueness.bounds.latest))
          }
          if (existingTime.vagueness.bounds.typical) {
            setTypicalTime(new Date(existingTime.vagueness.bounds.typical))
          }
        }
      }
      
      if (existingTime.deictic) {
        setHasDeictic(true)
        setDeicticAnchorType(existingTime.deictic.anchorType)
        setDeicticExpression(existingTime.deictic.expression || '')
        setDeicticAnchorTime(existingTime.deictic.anchorTime || '')
      }
      
      if (existingTime.videoReferences) {
        setVideoReferences(existingTime.videoReferences.map(ref => ({
          id: uuidv4(),
          ...ref
        })))
      }
      
      setCertainty(existingTime.certainty || 1)
    }
    
    if (existingCollection) {
      setMode('pattern')
      setPatternName(existingCollection.name)
      setPatternDescription(existingCollection.description)
    }
  }, [existingTime, existingCollection])
  
  const handleAddVideoReference = () => {
    if (!selectedVideoId) return
    
    const newRef: VideoReference = {
      id: uuidv4(),
      videoId: selectedVideoId,
      frameNumber: timeType === 'instant' ? frameNumber : undefined,
      frameRange: timeType === 'interval' && frameRangeStart && frameRangeEnd 
        ? [frameRangeStart, frameRangeEnd] 
        : undefined,
      milliseconds: timeType === 'instant' ? milliseconds : undefined,
      millisecondRange: timeType === 'interval' && millisecondsRangeStart && millisecondsRangeEnd
        ? [millisecondsRangeStart, millisecondsRangeEnd]
        : undefined,
    }
    
    setVideoReferences([...videoReferences, newRef])
    
    // Reset form
    setSelectedVideoId('')
    setFrameNumber(undefined)
    setFrameRangeStart(undefined)
    setFrameRangeEnd(undefined)
    setMilliseconds(undefined)
    setMillisecondsRangeStart(undefined)
    setMillisecondsRangeEnd(undefined)
  }
  
  const handleRemoveVideoReference = (id: string) => {
    setVideoReferences(videoReferences.filter(ref => ref.id !== id))
  }
  
  const handleSave = () => {
    if (mode === 'single') {
      // Create or update a single time object
      let timeData: Omit<Time, 'id'>
      
      if (timeType === 'instant') {
        const timestamp = instantDate && instantTime
          ? new Date(
              instantDate.getFullYear(),
              instantDate.getMonth(),
              instantDate.getDate(),
              instantTime.getHours(),
              instantTime.getMinutes(),
              instantTime.getSeconds()
            ).toISOString()
          : new Date().toISOString()
        
        timeData = {
          type: 'instant',
          timestamp,
        } as Omit<TimeInstant, 'id'>
      } else {
        timeData = {
          type: 'interval',
          startTime: startDate?.toISOString(),
          endTime: endDate?.toISOString(),
        } as Omit<TimeInterval, 'id'>
      }
      
      // Add common fields
      const now = new Date().toISOString()
      const commonFields: Partial<Time> = {
        videoReferences: videoReferences.length > 0
          ? videoReferences.map(({ id, ...ref }) => ref)
          : undefined,
        certainty: certainty < 1 ? certainty : undefined,
        wikidataId: wikidataId || undefined,
        wikidataUrl: wikidataUrl || undefined,
        importedFrom: wikidataId ? (existingTime?.importedFrom || 'wikidata') : undefined,
        importedAt: wikidataId ? (existingTime?.importedAt || now) : undefined,
      }
      
      if (hasVagueness) {
        commonFields.vagueness = {
          type: vaguenessType,
          description: vaguenessDescription || undefined,
          granularity: vaguenessGranularity as any,
          bounds: (earliestBound || latestBound || typicalTime) ? {
            earliest: earliestBound?.toISOString(),
            latest: latestBound?.toISOString(),
            typical: typicalTime?.toISOString(),
          } : undefined,
        }
      }
      
      if (hasDeictic) {
        commonFields.deictic = {
          anchorType: deicticAnchorType,
          expression: deicticExpression || undefined,
          anchorTime: deicticAnchorTime || undefined,
        }
      }
      
      const finalTime = { ...timeData, ...commonFields }
      
      if (existingTime) {
        dispatch(updateTime({ ...existingTime, ...finalTime }))
      } else {
        dispatch(addTime(finalTime as Omit<Time, 'id'>))
      }
    } else {
      // Create a time collection for patterns
      const collectionData: Omit<TimeCollection, 'id'> = {
        name: patternName,
        description: patternDescription,
        times: [],
        collectionType: quickPattern === 'daily' ? 'periodic' :
                       quickPattern === 'weekly' ? 'periodic' :
                       quickPattern === 'monthly' ? 'calendar' : 
                       'irregular',
        recurrence: quickPattern !== 'custom' ? {
          frequency: quickPattern === 'daily' ? 'DAILY' :
                    quickPattern === 'weekly' ? 'WEEKLY' :
                    'MONTHLY' as RecurrenceFrequency,
          interval: 1,
        } : undefined,
        metadata: {},
      }
      
      dispatch(addTimeCollection(collectionData))
    }
    
    onClose()
  }
  
  const granularityOptions = [
    { value: 'millisecond', label: 'Millisecond' },
    { value: 'second', label: 'Second' },
    { value: 'minute', label: 'Minute' },
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
  ]
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TimeIcon color="primary" />
          <Typography variant="h6">Advanced Time Builder</Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, value) => value && setMode(value)}
            size="small"
          >
            <ToggleButton value="single">
              <InstantIcon sx={{ mr: 1 }} />
              Single Time
            </ToggleButton>
            <ToggleButton value="pattern">
              <PatternIcon sx={{ mr: 1 }} />
              Time Pattern
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          {mode === 'single' ? (
            <Box>
              {/* Import mode selector */}
              {!existingTime && (
                <Box sx={{ mb: 2 }}>
                  <ToggleButtonGroup
                    value={importMode}
                    exclusive
                    onChange={(_, value) => value && setImportMode(value)}
                    size="small"
                    fullWidth
                  >
                    <ToggleButton value="manual">
                      <EditIcon sx={{ mr: 1 }} />
                      Manual Entry
                    </ToggleButton>
                    <ToggleButton value="wikidata">
                      <WikidataIcon sx={{ mr: 1 }} />
                      Import from Wikidata
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              )}

              {/* Wikidata import */}
              {importMode === 'wikidata' && !existingTime && (
                <Box sx={{ mb: 2 }}>
                  <WikidataSearch
                    entityType="time"
                    onImport={(data: any) => {
                      setImportedName(data.name)
                      setWikidataId(data.wikidataId)
                      setWikidataUrl(data.wikidataUrl)
                      
                      if (data.temporalData) {
                        const td = data.temporalData
                        
                        // Handle point in time
                        if (td.pointInTime) {
                          setTimeType('instant')
                          const date = new Date(td.pointInTime.timestamp)
                          setInstantDate(date)
                          setInstantTime(date)
                          
                          // Set vagueness based on granularity
                          if (td.pointInTime.granularity !== 'day' && td.pointInTime.granularity !== 'hour') {
                            setHasVagueness(true)
                            setVaguenessGranularity(td.pointInTime.granularity)
                            
                            if (td.circa) {
                              setVaguenessType('approximate')
                              setVaguenessDescription('circa')
                            } else if (td.disputed) {
                              setVaguenessType('fuzzy')
                              setVaguenessDescription('disputed')
                            } else if (td.presumably) {
                              setVaguenessType('bounded')
                              setVaguenessDescription('presumably')
                            }
                          }
                        }
                        
                        // Handle start/end time (interval)
                        else if (td.startTime && td.endTime) {
                          setTimeType('interval')
                          setStartDate(new Date(td.startTime.timestamp))
                          setEndDate(new Date(td.endTime.timestamp))
                          
                          // Set vagueness if dates are imprecise
                          if (td.startTime.granularity !== 'day' || td.endTime.granularity !== 'day') {
                            setHasVagueness(true)
                            setVaguenessGranularity(td.startTime.granularity)
                          }
                        }
                        
                        // Handle bounded dates (earliest/latest)
                        else if (td.earliestDate && td.latestDate) {
                          setTimeType('instant')
                          // Use midpoint as typical
                          const earliest = new Date(td.earliestDate.timestamp)
                          const latest = new Date(td.latestDate.timestamp)
                          const typical = new Date((earliest.getTime() + latest.getTime()) / 2)
                          
                          setInstantDate(typical)
                          setInstantTime(typical)
                          setHasVagueness(true)
                          setVaguenessType('bounded')
                          setEarliestBound(earliest)
                          setLatestBound(latest)
                          setTypicalTime(typical)
                        }
                        
                        // Handle other single dates
                        else if (td.inception || td.dissolved || td.publicationDate) {
                          const timeData = td.inception || td.dissolved || td.publicationDate
                          setTimeType('instant')
                          const date = new Date(timeData.timestamp)
                          setInstantDate(date)
                          setInstantTime(date)
                          
                          if (timeData.granularity !== 'day') {
                            setHasVagueness(true)
                            setVaguenessGranularity(timeData.granularity)
                          }
                        }
                      }
                    }}
                  />
                </Box>
              )}

              {/* Show Wikidata link if imported */}
              {wikidataUrl && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WikidataIcon color="action" />
                    <Typography variant="body2">Imported from Wikidata:</Typography>
                    <Link
                      href={wikidataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      {wikidataId} - {importedName}
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  </Box>
                </Paper>
              )}

              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                <Tab label="Basic" />
                <Tab label="Vagueness" />
                <Tab label="Video Mapping" />
                <Tab label="Deictic Reference" />
              </Tabs>
              
              {/* Basic Tab */}
              <TabPanel value={tabValue} index={0}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <ToggleButtonGroup
                    value={timeType}
                    exclusive
                    onChange={(_, value) => value && setTimeType(value)}
                    fullWidth
                  >
                    <ToggleButton value="instant">
                      <InstantIcon sx={{ mr: 1 }} />
                      Instant
                    </ToggleButton>
                    <ToggleButton value="interval">
                      <IntervalIcon sx={{ mr: 1 }} />
                      Interval
                    </ToggleButton>
                  </ToggleButtonGroup>
                  
                  {timeType === 'instant' ? (
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <DateTimePicker
                          label="Date"
                          value={instantDate}
                          onChange={setInstantDate}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TimePicker
                          label="Time"
                          value={instantTime}
                          onChange={setInstantTime}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </Grid>
                    </Grid>
                  ) : (
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <DateTimePicker
                          label="Start Time"
                          value={startDate}
                          onChange={setStartDate}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <DateTimePicker
                          label="End Time"
                          value={endDate}
                          onChange={setEndDate}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </Grid>
                    </Grid>
                  )}
                  
                  <Box>
                    <Typography gutterBottom>
                      Certainty: {Math.round(certainty * 100)}%
                    </Typography>
                    <Slider
                      value={certainty}
                      onChange={(_, value) => setCertainty(value as number)}
                      min={0}
                      max={1}
                      step={0.1}
                      marks
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                    />
                  </Box>
                </Box>
              </TabPanel>
              
              {/* Vagueness Tab */}
              <TabPanel value={tabValue} index={1}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={hasVagueness}
                        onChange={(e) => setHasVagueness(e.target.checked)}
                      />
                    }
                    label="This time is vague or uncertain"
                  />
                  
                  {hasVagueness && (
                    <>
                      <ToggleButtonGroup
                        value={vaguenessType}
                        exclusive
                        onChange={(_, value) => value && setVaguenessType(value)}
                        fullWidth
                      >
                        <ToggleButton value="approximate">Approximate</ToggleButton>
                        <ToggleButton value="bounded">Bounded</ToggleButton>
                        <ToggleButton value="fuzzy">Fuzzy</ToggleButton>
                      </ToggleButtonGroup>
                      
                      <TextField
                        label="Natural Language Description"
                        value={vaguenessDescription}
                        onChange={(e) => setVaguenessDescription(e.target.value)}
                        placeholder="e.g., 'around noon', 'early morning', 'sometime last week'"
                        fullWidth
                      />
                      
                      <FormControl fullWidth>
                        <InputLabel>Granularity</InputLabel>
                        <Select
                          value={vaguenessGranularity}
                          onChange={(e) => setVaguenessGranularity(e.target.value)}
                          label="Granularity"
                        >
                          {granularityOptions.map(opt => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      
                      {vaguenessType === 'bounded' && (
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Time Bounds
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <DateTimePicker
                                label="Earliest Possible"
                                value={earliestBound}
                                onChange={setEarliestBound}
                                slotProps={{ textField: { fullWidth: true } }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <DateTimePicker
                                label="Latest Possible"
                                value={latestBound}
                                onChange={setLatestBound}
                                slotProps={{ textField: { fullWidth: true } }}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <DateTimePicker
                                label="Most Likely"
                                value={typicalTime}
                                onChange={setTypicalTime}
                                slotProps={{ textField: { fullWidth: true } }}
                              />
                            </Grid>
                          </Grid>
                        </Paper>
                      )}
                    </>
                  )}
                </Box>
              </TabPanel>
              
              {/* Video Mapping Tab */}
              <TabPanel value={tabValue} index={2}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert severity="info" icon={<VideoIcon />}>
                    Map this time to specific frames or timestamps in videos
                  </Alert>
                  
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Add Video Reference
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Video</InputLabel>
                          <Select
                            value={selectedVideoId}
                            onChange={(e) => setSelectedVideoId(e.target.value)}
                            label="Video"
                          >
                            {videos.map(video => (
                              <MenuItem key={video.id} value={video.id}>
                                {video.title}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      
                      {timeType === 'instant' ? (
                        <>
                          <Grid item xs={6}>
                            <TextField
                              label="Frame Number"
                              type="number"
                              value={frameNumber || ''}
                              onChange={(e) => setFrameNumber(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              label="Milliseconds"
                              type="number"
                              value={milliseconds || ''}
                              onChange={(e) => setMilliseconds(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                        </>
                      ) : (
                        <>
                          <Grid item xs={3}>
                            <TextField
                              label="Start Frame"
                              type="number"
                              value={frameRangeStart || ''}
                              onChange={(e) => setFrameRangeStart(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="End Frame"
                              type="number"
                              value={frameRangeEnd || ''}
                              onChange={(e) => setFrameRangeEnd(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Start MS"
                              type="number"
                              value={millisecondsRangeStart || ''}
                              onChange={(e) => setMillisecondsRangeStart(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="End MS"
                              type="number"
                              value={millisecondsRangeEnd || ''}
                              onChange={(e) => setMillisecondsRangeEnd(e.target.value ? parseInt(e.target.value) : undefined)}
                              fullWidth
                              size="small"
                            />
                          </Grid>
                        </>
                      )}
                      
                      <Grid item xs={12}>
                        <Button
                          variant="outlined"
                          startIcon={<AddIcon />}
                          onClick={handleAddVideoReference}
                          disabled={!selectedVideoId}
                        >
                          Add Reference
                        </Button>
                      </Grid>
                    </Grid>
                  </Paper>
                  
                  {videoReferences.length > 0 && (
                    <List>
                      {videoReferences.map((ref) => {
                        const video = videos.find(v => v.id === ref.videoId)
                        return (
                          <ListItem key={ref.id}>
                            <ListItemText
                              primary={video?.title || 'Unknown Video'}
                              secondary={
                                ref.frameNumber !== undefined
                                  ? `Frame ${ref.frameNumber}`
                                  : ref.frameRange
                                  ? `Frames ${ref.frameRange[0]}-${ref.frameRange[1]}`
                                  : ref.milliseconds !== undefined
                                  ? `${ref.milliseconds}ms`
                                  : ref.millisecondRange
                                  ? `${ref.millisecondRange[0]}-${ref.millisecondRange[1]}ms`
                                  : 'No frame/time specified'
                              }
                            />
                            <ListItemSecondaryAction>
                              <IconButton
                                edge="end"
                                onClick={() => handleRemoveVideoReference(ref.id)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        )
                      })}
                    </List>
                  )}
                </Box>
              </TabPanel>
              
              {/* Deictic Reference Tab */}
              <TabPanel value={tabValue} index={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={hasDeictic}
                        onChange={(e) => setHasDeictic(e.target.checked)}
                      />
                    }
                    label="This is a relative/deictic time reference"
                  />
                  
                  {hasDeictic && (
                    <>
                      <FormControl fullWidth>
                        <InputLabel>Anchor Type</InputLabel>
                        <Select
                          value={deicticAnchorType}
                          onChange={(e) => setDeicticAnchorType(e.target.value as any)}
                          label="Anchor Type"
                        >
                          <MenuItem value="annotation_time">
                            Time of Annotation
                          </MenuItem>
                          <MenuItem value="video_time">
                            Time in Video
                          </MenuItem>
                          <MenuItem value="reference_time">
                            Reference Event
                          </MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        label="Deictic Expression"
                        value={deicticExpression}
                        onChange={(e) => setDeicticExpression(e.target.value)}
                        placeholder="e.g., 'yesterday', 'at this point', 'now', 'then'"
                        fullWidth
                      />
                      
                      {deicticAnchorType === 'reference_time' && (
                        <FormControl fullWidth>
                          <InputLabel>Anchor Event</InputLabel>
                          <Select
                            value={deicticAnchorTime}
                            onChange={(e) => setDeicticAnchorTime(e.target.value)}
                            label="Anchor Event"
                          >
                            {events.map(event => (
                              <MenuItem key={event.id} value={event.id}>
                                {event.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </>
                  )}
                </Box>
              </TabPanel>
            </Box>
          ) : (
            /* Pattern Mode */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="info" icon={<PatternIcon />}>
                Create a time pattern or collection. For advanced pattern design,
                use the Time Collection Builder.
              </Alert>
              
              <TextField
                label="Pattern Name"
                value={patternName}
                onChange={(e) => setPatternName(e.target.value)}
                fullWidth
                required
              />
              
              <TextField
                label="Description"
                value={patternDescription}
                onChange={(e) => setPatternDescription(e.target.value)}
                fullWidth
                multiline
                rows={2}
              />
              
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Quick Pattern Templates
                </Typography>
                <ToggleButtonGroup
                  value={quickPattern}
                  exclusive
                  onChange={(_, value) => value && setQuickPattern(value)}
                  fullWidth
                >
                  <ToggleButton value="daily">Daily</ToggleButton>
                  <ToggleButton value="weekly">Weekly</ToggleButton>
                  <ToggleButton value="monthly">Monthly</ToggleButton>
                  <ToggleButton value="custom">Custom</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              
              {quickPattern === 'custom' && (
                <Alert severity="warning">
                  For custom patterns, save this and use the Time Collection Builder
                  for advanced configuration.
                </Alert>
              )}
            </Box>
          )}
        </LocalizationProvider>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={
            mode === 'single' 
              ? false 
              : !patternName.trim()
          }
        >
          {existingTime || existingCollection ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}