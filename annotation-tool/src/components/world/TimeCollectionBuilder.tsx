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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Paper,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  Tabs,
  Tab,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Slider,
  IconButton,
  Divider,
} from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import {
  CalendarMonth as CalendarIcon,
  Schedule as ScheduleIcon,
  Loop as RecurringIcon,
  Event as EventIcon,
  AccessTime as TimeIcon,
  Today as TodayIcon,
  DateRange as DateRangeIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as CyclicalIcon,
  Language as LinguisticIcon,
  Pattern as PatternIcon,
} from '@mui/icons-material'
import { format, addDays, addWeeks, addMonths, addYears, startOfWeek } from 'date-fns'
import { AppDispatch, RootState } from '../../store/store'
import { addTimeCollection, updateTimeCollection } from '../../store/worldSlice'
import {
  TimeCollection,
  RecurrenceFrequency,
  DayOfWeek,
  RecurrenceByDay,
  RecurrenceRule,
  HabitualPattern,
  CyclicalPattern,
  HabitualFrequency,
  Time,
} from '../../models/types'

interface TimeCollectionBuilderProps {
  open: boolean
  onClose: () => void
  collection?: TimeCollection | null
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
      id={`time-collection-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  )
}

const WEEKDAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MO', label: 'Monday' },
  { value: 'TU', label: 'Tuesday' },
  { value: 'WE', label: 'Wednesday' },
  { value: 'TH', label: 'Thursday' },
  { value: 'FR', label: 'Friday' },
  { value: 'SA', label: 'Saturday' },
  { value: 'SU', label: 'Sunday' },
]

export default function TimeCollectionBuilder({
  open,
  onClose,
  collection,
}: TimeCollectionBuilderProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { times, events } = useSelector((state: RootState) => state.world)
  
  // Basic fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [collectionType, setCollectionType] = useState<'periodic' | 'calendar' | 'habitual' | 'irregular' | 'anchored'>('calendar')
  const [tabValue, setTabValue] = useState(0)
  
  // Selected times (for irregular collections)
  const [selectedTimeIds, setSelectedTimeIds] = useState<string[]>([])
  
  // Recurrence fields (RRULE-based)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('DAILY')
  const [interval, setInterval] = useState(1)
  const [endType, setEndType] = useState<'never' | 'count' | 'until'>('never')
  const [endCount, setEndCount] = useState(10)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [weekStart, setWeekStart] = useState<DayOfWeek>('MO')
  
  // BY rules
  const [selectedWeekdays, setSelectedWeekdays] = useState<DayOfWeek[]>([])
  const [selectedMonthDays, setSelectedMonthDays] = useState<number[]>([])
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [nthWeekday, setNthWeekday] = useState<number | undefined>()
  const [byHour, setByHour] = useState<number[]>([])
  const [byMinute, setByMinute] = useState<number[]>([])
  
  // Exceptions
  const [exceptions, setExceptions] = useState<Date[]>([])
  const [newException, setNewException] = useState<Date | null>(null)
  
  // Habitual pattern fields
  const [habitualFrequency, setHabitualFrequency] = useState<HabitualFrequency>('sometimes')
  const [typicality, setTypicality] = useState(0.5)
  const [naturalExpression, setNaturalExpression] = useState('')
  const [culturalContext, setCulturalContext] = useState('')
  const [vagueness, setVagueness] = useState<'precise' | 'approximate' | 'fuzzy'>('approximate')
  const [anchorType, setAnchorType] = useState<'event' | 'time_of_day' | 'season' | 'cultural'>('time_of_day')
  const [anchorReference, setAnchorReference] = useState('')
  
  // Cyclical pattern fields
  const [phases, setPhases] = useState<Array<{ name: string; duration?: string; description?: string }>>([])
  const [phaseName, setPhaseName] = useState('')
  const [phaseDuration, setPhaseDuration] = useState('')
  const [phaseDescription, setPhaseDescription] = useState('')
  
  useEffect(() => {
    if (collection) {
      setName(collection.name)
      setDescription(collection.description)
      setCollectionType(collection.collectionType)
      
      if (collection.times) {
        setSelectedTimeIds(collection.times.map(t => t.id))
      }
      
      if (collection.recurrence) {
        const rec = collection.recurrence
        setFrequency(rec.frequency)
        setInterval(rec.interval || 1)
        
        if (rec.endCondition) {
          setEndType(rec.endCondition.type)
          if (rec.endCondition.count) setEndCount(rec.endCondition.count)
          if (rec.endCondition.until) setEndDate(new Date(rec.endCondition.until))
        }
        
        if (rec.weekStart) setWeekStart(rec.weekStart)
        
        if (rec.byRules) {
          if (rec.byRules.byDay) {
            setSelectedWeekdays(rec.byRules.byDay.map(d => d.day))
            if (rec.byRules.byDay[0]?.nth) {
              setNthWeekday(rec.byRules.byDay[0].nth)
            }
          }
          if (rec.byRules.byMonthDay) setSelectedMonthDays(rec.byRules.byMonthDay)
          if (rec.byRules.byMonth) setSelectedMonths(rec.byRules.byMonth)
          if (rec.byRules.byHour) setByHour(rec.byRules.byHour)
          if (rec.byRules.byMinute) setByMinute(rec.byRules.byMinute)
        }
        
        if (rec.exceptions) {
          setExceptions(rec.exceptions.map(e => new Date(e)))
        }
      }
      
      if (collection.habituality) {
        const hab = collection.habituality
        setHabitualFrequency(hab.frequency)
        setTypicality(hab.typicality)
        
        if (hab.naturalLanguage) {
          setNaturalExpression(hab.naturalLanguage.expression)
          setCulturalContext(hab.naturalLanguage.culturalContext || '')
          setVagueness(hab.naturalLanguage.vagueness || 'approximate')
        }
        
        if (hab.anchors && hab.anchors.length > 0) {
          setAnchorType(hab.anchors[0].type)
          setAnchorReference(hab.anchors[0].reference)
        }
      }
      
      if (collection.cycle) {
        setPhases(collection.cycle.phases)
      }
    }
  }, [collection])
  
  const handleAddException = () => {
    if (newException) {
      setExceptions([...exceptions, newException])
      setNewException(null)
    }
  }
  
  const handleRemoveException = (index: number) => {
    setExceptions(exceptions.filter((_, i) => i !== index))
  }
  
  const handleAddPhase = () => {
    if (phaseName) {
      setPhases([...phases, {
        name: phaseName,
        duration: phaseDuration || undefined,
        description: phaseDescription || undefined,
      }])
      setPhaseName('')
      setPhaseDuration('')
      setPhaseDescription('')
    }
  }
  
  const handleRemovePhase = (index: number) => {
    setPhases(phases.filter((_, i) => i !== index))
  }
  
  const toggleWeekday = (day: DayOfWeek) => {
    setSelectedWeekdays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    )
  }
  
  const toggleMonthDay = (day: number) => {
    setSelectedMonthDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    )
  }
  
  const generatePreviewDates = (): Date[] => {
    const dates: Date[] = []
    const startDate = new Date()
    let currentDate = startDate
    let count = 0
    const maxCount = endType === 'count' ? endCount : 10
    const untilDate = endType === 'until' ? endDate : addYears(startDate, 1)
    
    while (count < maxCount && (!untilDate || currentDate <= untilDate)) {
      // Simple preview logic - in production, use a proper RRULE library
      if (!exceptions.some(ex => ex.toDateString() === currentDate.toDateString())) {
        dates.push(new Date(currentDate))
        count++
      }
      
      switch (frequency) {
        case 'DAILY':
          currentDate = addDays(currentDate, interval)
          break
        case 'WEEKLY':
          currentDate = addWeeks(currentDate, interval)
          break
        case 'MONTHLY':
          currentDate = addMonths(currentDate, interval)
          break
        case 'YEARLY':
          currentDate = addYears(currentDate, interval)
          break
        default:
          currentDate = addDays(currentDate, interval)
      }
    }
    
    return dates
  }
  
  const handleSave = () => {
    let recurrence: RecurrenceRule | undefined
    let habituality: HabitualPattern | undefined
    let cycle: CyclicalPattern | undefined
    
    if (collectionType === 'calendar' || collectionType === 'periodic') {
      const byDay: RecurrenceByDay[] = selectedWeekdays.map(day => ({
        day,
        nth: nthWeekday,
      }))
      
      recurrence = {
        frequency,
        interval: interval > 1 ? interval : undefined,
        endCondition: endType !== 'never' ? {
          type: endType,
          count: endType === 'count' ? endCount : undefined,
          until: endType === 'until' && endDate ? endDate.toISOString() : undefined,
        } : undefined,
        byRules: (byDay.length > 0 || selectedMonthDays.length > 0 || selectedMonths.length > 0) ? {
          byDay: byDay.length > 0 ? byDay : undefined,
          byMonthDay: selectedMonthDays.length > 0 ? selectedMonthDays : undefined,
          byMonth: selectedMonths.length > 0 ? selectedMonths : undefined,
          byHour: byHour.length > 0 ? byHour : undefined,
          byMinute: byMinute.length > 0 ? byMinute : undefined,
        } : undefined,
        weekStart,
        exceptions: exceptions.map(e => e.toISOString()),
      }
    }
    
    if (collectionType === 'habitual') {
      habituality = {
        frequency: habitualFrequency,
        typicality,
        naturalLanguage: naturalExpression ? {
          expression: naturalExpression,
          culturalContext: culturalContext || undefined,
          vagueness,
        } : undefined,
        anchors: anchorReference ? [{
          type: anchorType,
          reference: anchorReference,
          offset: undefined,
        }] : undefined,
      }
    }
    
    if (phases.length > 0) {
      cycle = {
        phases,
        currentPhase: 0,
        startTime: new Date().toISOString(),
      }
    }
    
    const collectionData: Omit<TimeCollection, 'id'> = {
      name,
      description,
      times: times.filter(t => selectedTimeIds.includes(t.id)),
      collectionType,
      recurrence,
      habituality,
      cycle,
      metadata: {},
    }
    
    if (collection) {
      dispatch(updateTimeCollection({ ...collection, ...collectionData }))
    } else {
      dispatch(addTimeCollection(collectionData))
    }
    
    onClose()
  }
  
  const getFrequencyLabel = (freq: RecurrenceFrequency): string => {
    const labels: Record<RecurrenceFrequency, string> = {
      'YEARLY': 'Year(s)',
      'MONTHLY': 'Month(s)',
      'WEEKLY': 'Week(s)',
      'DAILY': 'Day(s)',
      'HOURLY': 'Hour(s)',
      'MINUTELY': 'Minute(s)',
      'SECONDLY': 'Second(s)',
    }
    return labels[freq]
  }
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PatternIcon color="primary" />
          <Typography variant="h6">Time Collection Builder</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Basic Info */}
            <TextField
              label="Collection Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
            />
            
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            
            {/* Collection Type Selector */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Pattern Type
              </Typography>
              <ToggleButtonGroup
                value={collectionType}
                exclusive
                onChange={(_, value) => value && setCollectionType(value)}
                fullWidth
              >
                <ToggleButton value="calendar">
                  <CalendarIcon sx={{ mr: 1 }} />
                  Calendar
                </ToggleButton>
                <ToggleButton value="periodic">
                  <RecurringIcon sx={{ mr: 1 }} />
                  Periodic
                </ToggleButton>
                <ToggleButton value="habitual">
                  <LinguisticIcon sx={{ mr: 1 }} />
                  Habitual
                </ToggleButton>
                <ToggleButton value="irregular">
                  <TimeIcon sx={{ mr: 1 }} />
                  Irregular
                </ToggleButton>
                <ToggleButton value="anchored">
                  <EventIcon sx={{ mr: 1 }} />
                  Anchored
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            
            {/* Pattern-specific configuration */}
            {(collectionType === 'calendar' || collectionType === 'periodic') && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Recurrence Pattern (iCalendar RRULE)
                </Typography>
                
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                  <Tab label="Basic" />
                  <Tab label="Advanced" />
                  <Tab label="Exceptions" />
                  <Tab label="Preview" />
                </Tabs>
                
                {/* Basic Tab */}
                <TabPanel value={tabValue} index={0}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <FormControl fullWidth>
                        <InputLabel>Frequency</InputLabel>
                        <Select
                          value={frequency}
                          onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                          label="Frequency"
                        >
                          <MenuItem value="DAILY">Daily</MenuItem>
                          <MenuItem value="WEEKLY">Weekly</MenuItem>
                          <MenuItem value="MONTHLY">Monthly</MenuItem>
                          <MenuItem value="YEARLY">Yearly</MenuItem>
                          <MenuItem value="HOURLY">Hourly</MenuItem>
                          <MenuItem value="MINUTELY">Minutely</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={6}>
                      <TextField
                        label={`Every X ${getFrequencyLabel(frequency)}`}
                        type="number"
                        value={interval}
                        onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                        inputProps={{ min: 1 }}
                        fullWidth
                      />
                    </Grid>
                    
                    {frequency === 'WEEKLY' && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                          On These Days
                        </Typography>
                        <FormGroup row>
                          {WEEKDAYS.map(day => (
                            <FormControlLabel
                              key={day.value}
                              control={
                                <Checkbox
                                  checked={selectedWeekdays.includes(day.value)}
                                  onChange={() => toggleWeekday(day.value)}
                                />
                              }
                              label={day.label}
                            />
                          ))}
                        </FormGroup>
                      </Grid>
                    )}
                    
                    {frequency === 'MONTHLY' && (
                      <>
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" gutterBottom>
                            On These Days of the Month
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {[...Array(31)].map((_, i) => (
                              <Chip
                                key={i + 1}
                                label={i + 1}
                                onClick={() => toggleMonthDay(i + 1)}
                                color={selectedMonthDays.includes(i + 1) ? 'primary' : 'default'}
                                variant={selectedMonthDays.includes(i + 1) ? 'filled' : 'outlined'}
                              />
                            ))}
                            <Chip
                              label="Last"
                              onClick={() => toggleMonthDay(-1)}
                              color={selectedMonthDays.includes(-1) ? 'primary' : 'default'}
                              variant={selectedMonthDays.includes(-1) ? 'filled' : 'outlined'}
                            />
                          </Box>
                        </Grid>
                        
                        <Grid item xs={12}>
                          <FormControl fullWidth>
                            <InputLabel>Or on the Nth weekday</InputLabel>
                            <Select
                              value={nthWeekday || ''}
                              onChange={(e) => setNthWeekday(e.target.value as number || undefined)}
                              label="Or on the Nth weekday"
                            >
                              <MenuItem value="">None</MenuItem>
                              <MenuItem value={1}>First</MenuItem>
                              <MenuItem value={2}>Second</MenuItem>
                              <MenuItem value={3}>Third</MenuItem>
                              <MenuItem value={4}>Fourth</MenuItem>
                              <MenuItem value={-1}>Last</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                      </>
                    )}
                    
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        End Condition
                      </Typography>
                      <ToggleButtonGroup
                        value={endType}
                        exclusive
                        onChange={(_, value) => value && setEndType(value)}
                        fullWidth
                      >
                        <ToggleButton value="never">Never</ToggleButton>
                        <ToggleButton value="count">After N occurrences</ToggleButton>
                        <ToggleButton value="until">Until date</ToggleButton>
                      </ToggleButtonGroup>
                    </Grid>
                    
                    {endType === 'count' && (
                      <Grid item xs={12}>
                        <TextField
                          label="Number of occurrences"
                          type="number"
                          value={endCount}
                          onChange={(e) => setEndCount(parseInt(e.target.value) || 1)}
                          inputProps={{ min: 1 }}
                          fullWidth
                        />
                      </Grid>
                    )}
                    
                    {endType === 'until' && (
                      <Grid item xs={12}>
                        <DatePicker
                          label="End date"
                          value={endDate}
                          onChange={setEndDate}
                          slotProps={{ textField: { fullWidth: true } }}
                        />
                      </Grid>
                    )}
                  </Grid>
                </TabPanel>
                
                {/* Advanced Tab */}
                <TabPanel value={tabValue} index={1}>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel>Week Start Day</InputLabel>
                        <Select
                          value={weekStart}
                          onChange={(e) => setWeekStart(e.target.value as DayOfWeek)}
                          label="Week Start Day"
                        >
                          {WEEKDAYS.map(day => (
                            <MenuItem key={day.value} value={day.value}>
                              {day.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    {frequency === 'YEARLY' && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                          In These Months
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                            <Chip
                              key={i}
                              label={month}
                              onClick={() => {
                                const monthNum = i + 1
                                setSelectedMonths(prev =>
                                  prev.includes(monthNum)
                                    ? prev.filter(m => m !== monthNum)
                                    : [...prev, monthNum]
                                )
                              }}
                              color={selectedMonths.includes(i + 1) ? 'primary' : 'default'}
                              variant={selectedMonths.includes(i + 1) ? 'filled' : 'outlined'}
                            />
                          ))}
                        </Box>
                      </Grid>
                    )}
                  </Grid>
                </TabPanel>
                
                {/* Exceptions Tab */}
                <TabPanel value={tabValue} index={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Alert severity="info">
                      Add specific dates to exclude from the pattern
                    </Alert>
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <DatePicker
                        label="Exception date"
                        value={newException}
                        onChange={setNewException}
                        slotProps={{ textField: { fullWidth: true } }}
                      />
                      <Button
                        variant="outlined"
                        onClick={handleAddException}
                        disabled={!newException}
                        sx={{ minWidth: 100 }}
                      >
                        Add
                      </Button>
                    </Box>
                    
                    {exceptions.length > 0 && (
                      <List>
                        {exceptions.map((ex, index) => (
                          <ListItem key={index}>
                            <ListItemText
                              primary={format(ex, 'EEEE, MMMM d, yyyy')}
                            />
                            <IconButton
                              edge="end"
                              onClick={() => handleRemoveException(index)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                </TabPanel>
                
                {/* Preview Tab */}
                <TabPanel value={tabValue} index={3}>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Next Occurrences
                    </Typography>
                    <List>
                      {generatePreviewDates().map((date, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <TodayIcon />
                          </ListItemIcon>
                          <ListItemText
                            primary={format(date, 'EEEE, MMMM d, yyyy')}
                            secondary={format(date, 'h:mm a')}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </TabPanel>
              </Paper>
            )}
            
            {collectionType === 'habitual' && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Habitual Pattern
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="Natural Language Expression"
                      value={naturalExpression}
                      onChange={(e) => setNaturalExpression(e.target.value)}
                      placeholder="e.g., 'every morning', 'on weekends', 'during lunch'"
                      fullWidth
                    />
                  </Grid>
                  
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Frequency</InputLabel>
                      <Select
                        value={habitualFrequency}
                        onChange={(e) => setHabitualFrequency(e.target.value as HabitualFrequency)}
                        label="Frequency"
                      >
                        <MenuItem value="always">Always</MenuItem>
                        <MenuItem value="usually">Usually</MenuItem>
                        <MenuItem value="often">Often</MenuItem>
                        <MenuItem value="sometimes">Sometimes</MenuItem>
                        <MenuItem value="rarely">Rarely</MenuItem>
                        <MenuItem value="never">Never</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Vagueness</InputLabel>
                      <Select
                        value={vagueness}
                        onChange={(e) => setVagueness(e.target.value as any)}
                        label="Vagueness"
                      >
                        <MenuItem value="precise">Precise</MenuItem>
                        <MenuItem value="approximate">Approximate</MenuItem>
                        <MenuItem value="fuzzy">Fuzzy</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Typography gutterBottom>
                      Typicality: {Math.round(typicality * 100)}%
                    </Typography>
                    <Slider
                      value={typicality}
                      onChange={(_, value) => setTypicality(value as number)}
                      min={0}
                      max={1}
                      step={0.1}
                      marks
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      label="Cultural Context"
                      value={culturalContext}
                      onChange={(e) => setCulturalContext(e.target.value)}
                      placeholder="e.g., 'Western business hours', 'Mediterranean siesta'"
                      fullWidth
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Temporal Anchor
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={6}>
                    <FormControl fullWidth>
                      <InputLabel>Anchor Type</InputLabel>
                      <Select
                        value={anchorType}
                        onChange={(e) => setAnchorType(e.target.value as any)}
                        label="Anchor Type"
                      >
                        <MenuItem value="time_of_day">Time of Day</MenuItem>
                        <MenuItem value="event">Event</MenuItem>
                        <MenuItem value="season">Season</MenuItem>
                        <MenuItem value="cultural">Cultural</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={6}>
                    {anchorType === 'event' ? (
                      <FormControl fullWidth>
                        <InputLabel>Anchor Event</InputLabel>
                        <Select
                          value={anchorReference}
                          onChange={(e) => setAnchorReference(e.target.value)}
                          label="Anchor Event"
                        >
                          {events.map(event => (
                            <MenuItem key={event.id} value={event.id}>
                              {event.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        label="Anchor Reference"
                        value={anchorReference}
                        onChange={(e) => setAnchorReference(e.target.value)}
                        placeholder={
                          anchorType === 'time_of_day' ? 'e.g., morning, noon, evening' :
                          anchorType === 'season' ? 'e.g., summer, winter' :
                          anchorType === 'cultural' ? 'e.g., Christmas, Ramadan' :
                          ''
                        }
                        fullWidth
                      />
                    )}
                  </Grid>
                </Grid>
              </Paper>
            )}
            
            {collectionType === 'irregular' && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Select Specific Times
                </Typography>
                
                <Alert severity="info" sx={{ mb: 2 }}>
                  Choose existing time objects to include in this collection
                </Alert>
                
                <FormControl fullWidth>
                  <InputLabel>Selected Times</InputLabel>
                  <Select
                    multiple
                    value={selectedTimeIds}
                    onChange={(e) => setSelectedTimeIds(e.target.value as string[])}
                    label="Selected Times"
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map(id => {
                          const time = times.find(t => t.id === id)
                          return (
                            <Chip
                              key={id}
                              label={time?.type === 'instant' ? 'Instant' : 'Interval'}
                              size="small"
                            />
                          )
                        })}
                      </Box>
                    )}
                  >
                    {times.map(time => (
                      <MenuItem key={time.id} value={time.id}>
                        {time.type === 'instant' 
                          ? `Instant: ${(time as any).timestamp || 'unspecified'}`
                          : `Interval: ${(time as any).startTime || '?'} to ${(time as any).endTime || '?'}`
                        }
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Paper>
            )}
            
            {collectionType === 'anchored' && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Event-Anchored Pattern
                </Typography>
                
                <Alert severity="info" sx={{ mb: 2 }}>
                  Define times relative to specific events
                </Alert>
                
                <FormControl fullWidth>
                  <InputLabel>Anchor Events</InputLabel>
                  <Select
                    multiple
                    value={[]}
                    onChange={() => {}}
                    label="Anchor Events"
                  >
                    {events.map(event => (
                      <MenuItem key={event.id} value={event.id}>
                        {event.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Paper>
            )}
            
            {/* Cyclical Phases */}
            {phases.length > 0 || collectionType === 'periodic' ? (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Cyclical Phases (Optional)
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <TextField
                      label="Phase Name"
                      value={phaseName}
                      onChange={(e) => setPhaseName(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={3}>
                    <TextField
                      label="Duration (ISO 8601)"
                      value={phaseDuration}
                      onChange={(e) => setPhaseDuration(e.target.value)}
                      placeholder="e.g., P1D, PT2H"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      label="Description"
                      value={phaseDescription}
                      onChange={(e) => setPhaseDescription(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <Button
                      variant="outlined"
                      onClick={handleAddPhase}
                      disabled={!phaseName}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>
                
                {phases.length > 0 && (
                  <List sx={{ mt: 2 }}>
                    {phases.map((phase, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <CyclicalIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={phase.name}
                          secondary={`${phase.duration || 'No duration'} - ${phase.description || 'No description'}`}
                        />
                        <IconButton
                          edge="end"
                          onClick={() => handleRemovePhase(index)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            ) : null}
          </Box>
        </LocalizationProvider>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={!name.trim()}
        >
          {collection ? 'Update' : 'Create'} Collection
        </Button>
      </DialogActions>
    </Dialog>
  )
}