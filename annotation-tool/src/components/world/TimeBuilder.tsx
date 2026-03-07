import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Clock, Timer, CalendarRange, Video, Trash2, Plus, Waypoints, Globe, Pencil, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
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
import {
  useVideos,
  useWorld,
  useAddTime,
  useUpdateTime,
  useAddTimeCollection,
} from '@store/queries'
import {
  Time,
  TimeInstant,
  TimeInterval,
  TimeCollection,
  RecurrenceFrequency,
} from '@models/types'

/** Granularity options for vagueness */
type VaguenessGranularity = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/** Deictic anchor type options */
type DeicticAnchorType = 'annotation_time' | 'video_time' | 'reference_time'
import WikidataSearch from '@components/shared/WikidataSearch'
import { WikidataImportData } from '@hooks/wikidata/useWikidataImport'

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

/** Helper to format a Date to datetime-local input value */
function toDatetimeLocal(date: Date | null): string {
  if (!date) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Helper to format a Date to time input value */
function toTimeInput(date: Date | null): string {
  if (!date) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Parse datetime-local string to Date */
function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null
  return new Date(value)
}

/** Parse time input string to Date (preserving existing date) */
function parseTimeInput(value: string, existingDate: Date | null): Date | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  const base = existingDate || new Date()
  const result = new Date(base)
  result.setHours(hours, minutes, 0, 0)
  return result
}

export default function TimeBuilder({
  open,
  onClose,
  initialMode = 'single',
  existingTime,
  existingCollection,
}: TimeBuilderProps) {
  const { data: videos = [] } = useVideos()
  const { data: worldData } = useWorld()
  const events = worldData?.events ?? []
  const { mutate: addTime } = useAddTime()
  const { mutate: updateTime } = useUpdateTime()
  const { mutate: addTimeCollection } = useAddTimeCollection()

  // Import mode
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedName, setImportedName] = useState<string>('')

  // Mode selection
  const [mode, setMode] = useState<'single' | 'pattern'>(initialMode)

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
  const [vaguenessGranularity, setVaguenessGranularity] = useState<VaguenessGranularity>('hour')
  const [earliestBound, setEarliestBound] = useState<Date | null>(null)
  const [latestBound, setLatestBound] = useState<Date | null>(null)
  const [typicalTime, setTypicalTime] = useState<Date | null>(null)

  // Deictic reference
  const [hasDeictic, setHasDeictic] = useState(false)
  const [deicticAnchorType, setDeicticAnchorType] = useState<DeicticAnchorType>('video_time')
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
          ? videoReferences.map(({ id: _id, ...ref }) => ref)
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
          granularity: vaguenessGranularity,
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
        updateTime({ ...existingTime, ...finalTime })
      } else {
        addTime(finalTime as Omit<Time, 'id'>)
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

      addTimeCollection(collectionData)
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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Advanced Time Builder
            <ToggleGroup
              value={[mode]}
              onValueChange={(value) => { if (value.length > 0) setMode(value[0] as 'single' | 'pattern') }}
              className="ml-2"
            >
              <ToggleGroupItem value="single" className="flex items-center gap-1 text-xs">
                <Timer className="size-4" />
                Single Time
              </ToggleGroupItem>
              <ToggleGroupItem value="pattern" className="flex items-center gap-1 text-xs">
                <Waypoints className="size-4" />
                Time Pattern
              </ToggleGroupItem>
            </ToggleGroup>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {mode === 'single' ? (
            <div>
              {/* Import mode selector */}
              {!existingTime && (
                <div className="mb-4">
                  <ToggleGroup
                    value={[importMode]}
                    onValueChange={(value) => { if (value.length > 0) setImportMode(value[0] as 'manual' | 'wikidata') }}
                    className="w-full"
                  >
                    <ToggleGroupItem value="manual" className="flex flex-1 items-center gap-1">
                      <Pencil className="size-4" />
                      Manual Entry
                    </ToggleGroupItem>
                    <ToggleGroupItem value="wikidata" className="flex flex-1 items-center gap-1">
                      <Globe className="size-4" />
                      Import from Wikidata
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}

              {/* Wikidata import */}
              {importMode === 'wikidata' && !existingTime && (
                <div className="mb-4">
                  <WikidataSearch
                    entityType="time"
                    onImport={(data: WikidataImportData) => {
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
                            setVaguenessGranularity(td.pointInTime.granularity as VaguenessGranularity)

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
                            setVaguenessGranularity(td.startTime.granularity as VaguenessGranularity)
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
                          if (timeData) {
                            setTimeType('instant')
                            const date = new Date(timeData.timestamp)
                            setInstantDate(date)
                            setInstantTime(date)

                            if (timeData.granularity !== 'day') {
                              setHasVagueness(true)
                              setVaguenessGranularity(timeData.granularity as VaguenessGranularity)
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              )}

              {/* Show Wikidata link if imported */}
              {wikidataUrl && (
                <div className="rounded-lg border bg-card p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <span className="text-sm">Imported from Wikidata:</span>
                    <a
                      href={wikidataUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {wikidataId} - {importedName}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              )}

              <Tabs defaultValue="basic">
                <TabsList>
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="vagueness">Vagueness</TabsTrigger>
                  <TabsTrigger value="video">Video Mapping</TabsTrigger>
                  <TabsTrigger value="deictic">Deictic Reference</TabsTrigger>
                </TabsList>

                {/* Basic Tab */}
                <TabsContent value="basic">
                  <div className="flex flex-col gap-4 py-2">
                    <ToggleGroup
                      value={[timeType]}
                      onValueChange={(value) => { if (value.length > 0) setTimeType(value[0] as 'instant' | 'interval') }}
                      className="w-full"
                    >
                      <ToggleGroupItem value="instant" className="flex flex-1 items-center gap-1">
                        <Timer className="size-4" />
                        Instant
                      </ToggleGroupItem>
                      <ToggleGroupItem value="interval" className="flex flex-1 items-center gap-1">
                        <CalendarRange className="size-4" />
                        Interval
                      </ToggleGroupItem>
                    </ToggleGroup>

                    {timeType === 'instant' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Date &amp; Time</Label>
                          <Input
                            type="datetime-local"
                            value={toDatetimeLocal(instantDate)}
                            onChange={(e) => setInstantDate(parseDatetimeLocal(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Time</Label>
                          <Input
                            type="time"
                            value={toTimeInput(instantTime)}
                            onChange={(e) => setInstantTime(parseTimeInput(e.target.value, instantTime))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Start Time</Label>
                          <Input
                            type="datetime-local"
                            value={toDatetimeLocal(startDate)}
                            onChange={(e) => setStartDate(parseDatetimeLocal(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>End Time</Label>
                          <Input
                            type="datetime-local"
                            value={toDatetimeLocal(endDate)}
                            onChange={(e) => setEndDate(parseDatetimeLocal(e.target.value))}
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="mb-2 block">
                        Certainty: {Math.round(certainty * 100)}%
                      </Label>
                      <Slider
                        value={[certainty]}
                        onValueChange={(value) => setCertainty(Array.isArray(value) ? value[0] : value)}
                        min={0}
                        max={1}
                        step={0.1}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Vagueness Tab */}
                <TabsContent value="vagueness">
                  <div className="flex flex-col gap-4 py-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hasVagueness}
                        onCheckedChange={setHasVagueness}
                      />
                      <Label>This time is vague or uncertain</Label>
                    </div>

                    {hasVagueness && (
                      <>
                        <ToggleGroup
                          value={[vaguenessType]}
                          onValueChange={(value) => { if (value.length > 0) setVaguenessType(value[0] as 'approximate' | 'bounded' | 'fuzzy') }}
                          className="w-full"
                        >
                          <ToggleGroupItem value="approximate" className="flex-1">Approximate</ToggleGroupItem>
                          <ToggleGroupItem value="bounded" className="flex-1">Bounded</ToggleGroupItem>
                          <ToggleGroupItem value="fuzzy" className="flex-1">Fuzzy</ToggleGroupItem>
                        </ToggleGroup>

                        <div className="space-y-1">
                          <Label>Natural Language Description</Label>
                          <Input
                            value={vaguenessDescription}
                            onChange={(e) => setVaguenessDescription(e.target.value)}
                            placeholder="e.g., 'around noon', 'early morning', 'sometime last week'"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label>Granularity</Label>
                          <Select value={vaguenessGranularity} onValueChange={(value) => setVaguenessGranularity(value as VaguenessGranularity)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {granularityOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {vaguenessType === 'bounded' && (
                          <div className="rounded-lg border bg-card p-4">
                            <Label className="mb-2 block font-medium">Time Bounds</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label>Earliest Possible</Label>
                                <Input
                                  type="datetime-local"
                                  value={toDatetimeLocal(earliestBound)}
                                  onChange={(e) => setEarliestBound(parseDatetimeLocal(e.target.value))}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Latest Possible</Label>
                                <Input
                                  type="datetime-local"
                                  value={toDatetimeLocal(latestBound)}
                                  onChange={(e) => setLatestBound(parseDatetimeLocal(e.target.value))}
                                />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label>Most Likely</Label>
                                <Input
                                  type="datetime-local"
                                  value={toDatetimeLocal(typicalTime)}
                                  onChange={(e) => setTypicalTime(parseDatetimeLocal(e.target.value))}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Video Mapping Tab */}
                <TabsContent value="video">
                  <div className="flex flex-col gap-4 py-2">
                    <Alert>
                      <Video className="size-4" />
                      <AlertDescription>
                        Map this time to specific frames or timestamps in videos
                      </AlertDescription>
                    </Alert>

                    <div className="rounded-lg border bg-card p-4">
                      <Label className="mb-2 block font-medium">Add Video Reference</Label>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1">
                          <Label>Video</Label>
                          <Select value={selectedVideoId} onValueChange={(v) => setSelectedVideoId(v ?? '')}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a video" />
                            </SelectTrigger>
                            <SelectContent>
                              {videos.map(video => (
                                <SelectItem key={video.id} value={video.id}>
                                  {video.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {timeType === 'instant' ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label>Frame Number</Label>
                              <Input
                                type="number"
                                value={frameNumber || ''}
                                onChange={(e) => setFrameNumber(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Milliseconds</Label>
                              <Input
                                type="number"
                                value={milliseconds || ''}
                                onChange={(e) => setMilliseconds(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <Label>Start Frame</Label>
                              <Input
                                type="number"
                                value={frameRangeStart || ''}
                                onChange={(e) => setFrameRangeStart(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>End Frame</Label>
                              <Input
                                type="number"
                                value={frameRangeEnd || ''}
                                onChange={(e) => setFrameRangeEnd(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Start MS</Label>
                              <Input
                                type="number"
                                value={millisecondsRangeStart || ''}
                                onChange={(e) => setMillisecondsRangeStart(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>End MS</Label>
                              <Input
                                type="number"
                                value={millisecondsRangeEnd || ''}
                                onChange={(e) => setMillisecondsRangeEnd(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <Button
                            variant="outline"
                            onClick={handleAddVideoReference}
                            disabled={!selectedVideoId}
                          >
                            <Plus className="mr-1 size-4" />
                            Add Reference
                          </Button>
                        </div>
                      </div>
                    </div>

                    {videoReferences.length > 0 && (
                      <ul className="space-y-1">
                        {videoReferences.map((ref) => {
                          const video = videos.find(v => v.id === ref.videoId)
                          return (
                            <li key={ref.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                              <div>
                                <div className="text-sm font-medium">{video?.title || 'Unknown Video'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {ref.frameNumber !== undefined
                                    ? `Frame ${ref.frameNumber}`
                                    : ref.frameRange
                                    ? `Frames ${ref.frameRange[0]}-${ref.frameRange[1]}`
                                    : ref.milliseconds !== undefined
                                    ? `${ref.milliseconds}ms`
                                    : ref.millisecondRange
                                    ? `${ref.millisecondRange[0]}-${ref.millisecondRange[1]}ms`
                                    : 'No frame/time specified'}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemoveVideoReference(ref.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </TabsContent>

                {/* Deictic Reference Tab */}
                <TabsContent value="deictic">
                  <div className="flex flex-col gap-4 py-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hasDeictic}
                        onCheckedChange={setHasDeictic}
                      />
                      <Label>This is a relative/deictic time reference</Label>
                    </div>

                    {hasDeictic && (
                      <>
                        <div className="space-y-1">
                          <Label>Anchor Type</Label>
                          <Select value={deicticAnchorType} onValueChange={(value) => setDeicticAnchorType(value as DeicticAnchorType)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="annotation_time">Time of Annotation</SelectItem>
                              <SelectItem value="video_time">Time in Video</SelectItem>
                              <SelectItem value="reference_time">Reference Event</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label>Deictic Expression</Label>
                          <Input
                            value={deicticExpression}
                            onChange={(e) => setDeicticExpression(e.target.value)}
                            placeholder="e.g., 'yesterday', 'at this point', 'now', 'then'"
                          />
                        </div>

                        {deicticAnchorType === 'reference_time' && (
                          <div className="space-y-1">
                            <Label>Anchor Event</Label>
                            <Select value={deicticAnchorTime} onValueChange={(v) => setDeicticAnchorTime(v ?? '')}>
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
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            /* Pattern Mode */
            <div className="flex flex-col gap-4">
              <Alert>
                <Waypoints className="size-4" />
                <AlertDescription>
                  Create a time pattern or collection. For advanced pattern design,
                  use the Time Collection Builder.
                </AlertDescription>
              </Alert>

              <div className="space-y-1">
                <Label>Pattern Name *</Label>
                <Input
                  value={patternName}
                  onChange={(e) => setPatternName(e.target.value)}
                  placeholder="Pattern name"
                />
              </div>

              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={patternDescription}
                  onChange={(e) => setPatternDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <Label className="mb-2 block font-medium">Quick Pattern Templates</Label>
                <ToggleGroup
                  value={[quickPattern]}
                  onValueChange={(value) => { if (value.length > 0) setQuickPattern(value[0] as 'daily' | 'weekly' | 'monthly' | 'custom') }}
                  className="w-full"
                >
                  <ToggleGroupItem value="daily" className="flex-1">Daily</ToggleGroupItem>
                  <ToggleGroupItem value="weekly" className="flex-1">Weekly</ToggleGroupItem>
                  <ToggleGroupItem value="monthly" className="flex-1">Monthly</ToggleGroupItem>
                  <ToggleGroupItem value="custom" className="flex-1">Custom</ToggleGroupItem>
                </ToggleGroup>
              </div>

              {quickPattern === 'custom' && (
                <Alert>
                  <AlertDescription>
                    For custom patterns, save this and use the Time Collection Builder
                    for advanced configuration.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={
              mode === 'single'
                ? false
                : !patternName.trim()
            }
          >
            {existingTime || existingCollection ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
