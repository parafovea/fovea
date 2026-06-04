import { useState, useEffect } from 'react'
import { Calendar, RefreshCw, CalendarDays, Clock, CalendarCheck, Trash2, RotateCw, Globe, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns'
import { useWorld, useAddTimeCollection, useUpdateTimeCollection } from '@store/queries'
import {
  TimeCollection,
  TimeInstant,
  TimeInterval,
  RecurrenceFrequency,
  DayOfWeek,
  RecurrenceByDay,
  RecurrenceRule,
  HabitualPattern,
  CyclicalPattern,
  HabitualFrequency,
} from '@models/types'

/** Vagueness type options for natural language patterns */
type VaguenessType = 'precise' | 'approximate' | 'fuzzy'

/** Anchor type options for temporal patterns */
type AnchorType = 'event' | 'time_of_day' | 'season' | 'cultural'

interface TimeCollectionBuilderProps {
  open: boolean
  onClose: () => void
  collection?: TimeCollection | null
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
  const { data: worldData } = useWorld()
  const times = worldData?.times ?? []
  const events = worldData?.events ?? []
  const { mutate: addTimeCollection } = useAddTimeCollection()
  const { mutate: updateTimeCollection } = useUpdateTimeCollection()

  // Basic fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [collectionType, setCollectionType] = useState<'periodic' | 'calendar' | 'habitual' | 'irregular' | 'anchored'>('calendar')

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
  const [newException, setNewException] = useState<string>('')

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
      setExceptions([...exceptions, new Date(newException)])
      setNewException('')
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

  const toggleTimeId = (id: string) => {
    setSelectedTimeIds(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
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
      // Simple preview logic
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
      updateTimeCollection({ ...collection, ...collectionData })
    } else {
      addTimeCollection(collectionData)
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Waypoints className="size-5 text-primary" />
            Time Collection Builder
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Basic Info */}
          <div className="space-y-1">
            <Label>Collection Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Collection Type Selector */}
          <div>
            <Label className="mb-2 block font-medium">Pattern Type</Label>
            <ToggleGroup
              value={[collectionType]}
              onValueChange={(value) => { if (value.length > 0) setCollectionType(value[0] as 'periodic' | 'calendar' | 'habitual' | 'irregular' | 'anchored') }}
              className="w-full"
            >
              <ToggleGroupItem value="calendar" className="flex flex-1 items-center gap-1 text-xs">
                <Calendar className="size-4" />
                Calendar
              </ToggleGroupItem>
              <ToggleGroupItem value="periodic" className="flex flex-1 items-center gap-1 text-xs">
                <RefreshCw className="size-4" />
                Periodic
              </ToggleGroupItem>
              <ToggleGroupItem value="habitual" className="flex flex-1 items-center gap-1 text-xs">
                <Globe className="size-4" />
                Habitual
              </ToggleGroupItem>
              <ToggleGroupItem value="irregular" className="flex flex-1 items-center gap-1 text-xs">
                <Clock className="size-4" />
                Irregular
              </ToggleGroupItem>
              <ToggleGroupItem value="anchored" className="flex flex-1 items-center gap-1 text-xs">
                <CalendarDays className="size-4" />
                Anchored
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Pattern-specific configuration */}
          {(collectionType === 'calendar' || collectionType === 'periodic') && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-lg font-semibold mb-2">Recurrence Pattern (iCalendar RRULE)</h3>

              <Tabs defaultValue="basic">
                <TabsList>
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                {/* Basic Tab */}
                <TabsContent value="basic">
                  <div className="grid grid-cols-2 gap-4 py-2">
                    <div className="space-y-1">
                      <Label>Frequency</Label>
                      <Select value={frequency} onValueChange={(value) => setFrequency(value as RecurrenceFrequency)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DAILY">Daily</SelectItem>
                          <SelectItem value="WEEKLY">Weekly</SelectItem>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="YEARLY">Yearly</SelectItem>
                          <SelectItem value="HOURLY">Hourly</SelectItem>
                          <SelectItem value="MINUTELY">Minutely</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Every X {getFrequencyLabel(frequency)}</Label>
                      <Input
                        type="number"
                        value={interval}
                        onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                        min={1}
                      />
                    </div>

                    {frequency === 'WEEKLY' && (
                      <div className="col-span-2">
                        <Label className="mb-2 block font-medium">On These Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAYS.map(day => (
                            <label key={day.value} className="flex items-center gap-1.5 text-sm">
                              <Checkbox
                                checked={selectedWeekdays.includes(day.value)}
                                onCheckedChange={() => toggleWeekday(day.value)}
                              />
                              {day.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {frequency === 'MONTHLY' && (
                      <>
                        <div className="col-span-2">
                          <Label className="mb-2 block font-medium">On These Days of the Month</Label>
                          <div className="flex flex-wrap gap-1">
                            {[...Array(31)].map((_, i) => (
                              <Badge
                                key={i + 1}
                                variant={selectedMonthDays.includes(i + 1) ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => toggleMonthDay(i + 1)}
                              >
                                {i + 1}
                              </Badge>
                            ))}
                            <Badge
                              variant={selectedMonthDays.includes(-1) ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => toggleMonthDay(-1)}
                            >
                              Last
                            </Badge>
                          </div>
                        </div>

                        <div className="col-span-2 space-y-1">
                          <Label>Or on the Nth weekday</Label>
                          <Select
                            value={nthWeekday?.toString() || '_none'}
                            onValueChange={(value) => setNthWeekday(!value || value === '_none' ? undefined : parseInt(value))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">None</SelectItem>
                              <SelectItem value="1">First</SelectItem>
                              <SelectItem value="2">Second</SelectItem>
                              <SelectItem value="3">Third</SelectItem>
                              <SelectItem value="4">Fourth</SelectItem>
                              <SelectItem value="-1">Last</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <div className="col-span-2">
                      <Separator className="my-2" />
                      <Label className="mb-2 block font-medium">End Condition</Label>
                      <ToggleGroup
                        value={[endType]}
                        onValueChange={(value) => { if (value.length > 0) setEndType(value[0] as 'never' | 'count' | 'until') }}
                        className="w-full"
                      >
                        <ToggleGroupItem value="never" className="flex-1">Never</ToggleGroupItem>
                        <ToggleGroupItem value="count" className="flex-1">After N occurrences</ToggleGroupItem>
                        <ToggleGroupItem value="until" className="flex-1">Until date</ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    {endType === 'count' && (
                      <div className="col-span-2 space-y-1">
                        <Label>Number of occurrences</Label>
                        <Input
                          type="number"
                          value={endCount}
                          onChange={(e) => setEndCount(parseInt(e.target.value) || 1)}
                          min={1}
                        />
                      </div>
                    )}

                    {endType === 'until' && (
                      <div className="col-span-2 space-y-1">
                        <Label>End date</Label>
                        <Input
                          type="date"
                          value={endDate ? endDate.toISOString().split('T')[0] : ''}
                          onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Advanced Tab */}
                <TabsContent value="advanced">
                  <div className="flex flex-col gap-4 py-2">
                    <div className="space-y-1">
                      <Label>Week Start Day</Label>
                      <Select value={weekStart} onValueChange={(value) => setWeekStart(value as DayOfWeek)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map(day => (
                            <SelectItem key={day.value} value={day.value}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {frequency === 'YEARLY' && (
                      <div>
                        <Label className="mb-2 block font-medium">In These Months</Label>
                        <div className="flex flex-wrap gap-1">
                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
                            <Badge
                              key={i}
                              variant={selectedMonths.includes(i + 1) ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => {
                                const monthNum = i + 1
                                setSelectedMonths(prev =>
                                  prev.includes(monthNum)
                                    ? prev.filter(m => m !== monthNum)
                                    : [...prev, monthNum]
                                )
                              }}
                            >
                              {month}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Exceptions Tab */}
                <TabsContent value="exceptions">
                  <div className="flex flex-col gap-4 py-2">
                    <Alert>
                      <AlertDescription>
                        Add specific dates to exclude from the pattern
                      </AlertDescription>
                    </Alert>

                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={newException}
                        onChange={(e) => setNewException(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={handleAddException}
                        disabled={!newException}
                        className="min-w-[100px]"
                      >
                        Add
                      </Button>
                    </div>

                    {exceptions.length > 0 && (
                      <ul className="space-y-1">
                        {exceptions.map((ex, index) => (
                          <li key={index} className="flex items-center justify-between rounded-lg border px-3 py-2">
                            <span className="text-sm">{format(ex, 'EEEE, MMMM d, yyyy')}</span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveException(index)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </TabsContent>

                {/* Preview Tab */}
                <TabsContent value="preview">
                  <div className="py-2">
                    <Label className="mb-2 block font-medium">Next Occurrences</Label>
                    <ul className="space-y-1">
                      {generatePreviewDates().map((date, index) => (
                        <li key={index} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                          <CalendarCheck className="size-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{format(date, 'EEEE, MMMM d, yyyy')}</div>
                            <div className="text-xs text-muted-foreground">{format(date, 'h:mm a')}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {collectionType === 'habitual' && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-lg font-semibold mb-4">Habitual Pattern</h3>

              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <Label>Natural Language Expression</Label>
                  <Input
                    value={naturalExpression}
                    onChange={(e) => setNaturalExpression(e.target.value)}
                    placeholder="e.g., 'every morning', 'on weekends', 'during lunch'"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Frequency</Label>
                    <Select value={habitualFrequency} onValueChange={(value) => setHabitualFrequency(value as HabitualFrequency)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Always</SelectItem>
                        <SelectItem value="usually">Usually</SelectItem>
                        <SelectItem value="often">Often</SelectItem>
                        <SelectItem value="sometimes">Sometimes</SelectItem>
                        <SelectItem value="rarely">Rarely</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>Vagueness</Label>
                    <Select value={vagueness} onValueChange={(value) => setVagueness(value as VaguenessType)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="precise">Precise</SelectItem>
                        <SelectItem value="approximate">Approximate</SelectItem>
                        <SelectItem value="fuzzy">Fuzzy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">
                    Typicality: {Math.round(typicality * 100)}%
                  </Label>
                  <Slider
                    value={[typicality]}
                    onValueChange={(value) => setTypicality(Array.isArray(value) ? value[0] : value)}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Cultural Context</Label>
                  <Input
                    value={culturalContext}
                    onChange={(e) => setCulturalContext(e.target.value)}
                    placeholder="e.g., 'Western business hours', 'Mediterranean siesta'"
                  />
                </div>

                <Separator />

                <Label className="font-medium">Temporal Anchor</Label>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Anchor Type</Label>
                    <Select value={anchorType} onValueChange={(value) => setAnchorType(value as AnchorType)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time_of_day">Time of Day</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="season">Season</SelectItem>
                        <SelectItem value="cultural">Cultural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    {anchorType === 'event' ? (
                      <>
                        <Label>Anchor Event</Label>
                        <Select value={anchorReference} onValueChange={(v) => setAnchorReference(v ?? '')}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select an event" />
                          </SelectTrigger>
                          <SelectContent>
                            {events.map(event => (
                              <SelectItem key={event.id} value={event.id}>
                                {event.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <>
                        <Label>Anchor Reference</Label>
                        <Input
                          value={anchorReference}
                          onChange={(e) => setAnchorReference(e.target.value)}
                          placeholder={
                            anchorType === 'time_of_day' ? 'e.g., morning, noon, evening' :
                            anchorType === 'season' ? 'e.g., summer, winter' :
                            anchorType === 'cultural' ? 'e.g., Christmas, Ramadan' :
                            ''
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {collectionType === 'irregular' && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-lg font-semibold mb-2">Select Specific Times</h3>

              <Alert className="mb-4">
                <AlertDescription>
                  Choose existing time objects to include in this collection
                </AlertDescription>
              </Alert>

              <div className="space-y-1">
                <Label>Selected Times ({selectedTimeIds.length})</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
                  {times.map(time => (
                    <button
                      key={time.id}
                      type="button"
                      onClick={() => toggleTimeId(time.id)}
                      className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                        selectedTimeIds.includes(time.id)
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {time.type === 'instant'
                        ? `Instant: ${(time as TimeInstant).timestamp || 'unspecified'}`
                        : `Interval: ${(time as TimeInterval).startTime || '?'} to ${(time as TimeInterval).endTime || '?'}`
                      }
                    </button>
                  ))}
                </div>

                {selectedTimeIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedTimeIds.map(id => {
                      const time = times.find(t => t.id === id)
                      return (
                        <Badge key={id} variant="outline">
                          {time?.type === 'instant' ? 'Instant' : 'Interval'}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {collectionType === 'anchored' && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-lg font-semibold mb-2">Event-Anchored Pattern</h3>

              <Alert className="mb-4">
                <AlertDescription>
                  Define times relative to specific events
                </AlertDescription>
              </Alert>

              <div className="space-y-1">
                <Label>Anchor Events</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
                  {events.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      className="w-full text-left px-2 py-1 rounded text-sm transition-colors hover:bg-muted"
                    >
                      {event.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cyclical Phases */}
          {(phases.length > 0 || collectionType === 'periodic') && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-lg font-semibold mb-2">Cyclical Phases (Optional)</h3>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4 space-y-1">
                  <Label>Phase Name</Label>
                  <Input
                    value={phaseName}
                    onChange={(e) => setPhaseName(e.target.value)}
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label>Duration (ISO 8601)</Label>
                  <Input
                    value={phaseDuration}
                    onChange={(e) => setPhaseDuration(e.target.value)}
                    placeholder="e.g., P1D, PT2H"
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label>Description</Label>
                  <Input
                    value={phaseDescription}
                    onChange={(e) => setPhaseDescription(e.target.value)}
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <Button
                    variant="outline"
                    onClick={handleAddPhase}
                    disabled={!phaseName}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {phases.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {phases.map((phase, index) => (
                    <li key={index} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <RotateCw className="size-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{phase.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {phase.duration || 'No duration'} - {phase.description || 'No description'}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemovePhase(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {collection ? 'Update' : 'Create'} Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
