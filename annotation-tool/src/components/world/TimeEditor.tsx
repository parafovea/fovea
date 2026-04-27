import { useState, useEffect } from 'react'
import { Clock, Timer, CalendarRange, Trash2, Plus, Pencil, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { useVideos } from '@store/queries'
import { useAddTime, useUpdateTime } from '@store/queries'
import { Time, TimeInstant, TimeInterval } from '@models/types'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataSearch from '@components/shared/WikidataSearch'
import { generateId } from '@utils/uuid'
import { useUnsavedChangesPrompt } from '../../hooks/data'

/** Granularity options for vagueness */
type VaguenessGranularity = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/** Deictic anchor type options */
type DeicticAnchorType = 'annotation_time' | 'video_time' | 'reference_time'

/** Vagueness type options */
type VaguenessType = 'approximate' | 'bounded' | 'fuzzy'

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
  const { data: videos = [] } = useVideos()
  const { mutateAsync: addTime } = useAddTime()
  const { mutateAsync: updateTime } = useUpdateTime()

  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [timeType, setTimeType] = useState<'instant' | 'interval'>('instant')
  const [label, setLabel] = useState('')
  const [wikidataId, setWikidataId] = useState('')
  const [wikidataUrl, setWikidataUrl] = useState('')

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
  const [granularity, setGranularity] = useState<VaguenessGranularity>('minute')

  // Deictic reference
  const [hasDeictic, setHasDeictic] = useState(false)
  const [deicticAnchorType, setDeicticAnchorType] = useState<DeicticAnchorType>('video_time')
  const [deicticExpression, setDeicticExpression] = useState('')

  // Video references
  const [videoReferences, setVideoReferences] = useState<VideoReference[]>([])

  // Certainty
  const [certainty, setCertainty] = useState(1.0)

  const isDirty = open && (
    time
      ? label !== (time.label || '') ||
        timeType !== time.type ||
        wikidataId !== (time.wikidataId || '') ||
        wikidataUrl !== (time.wikidataUrl || '') ||
        certainty !== (time.certainty ?? 1.0) ||
        JSON.stringify(videoReferences) !== JSON.stringify(time.videoReferences || [])
      : !!label || timestamp !== '' || startTime !== '' || endTime !== '' ||
        videoReferences.length > 0
  )

  const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

  useEffect(() => {
    if (time) {
      setImportMode('manual')
      setTimeType(time.type)
      setLabel(time.label || '')
      setWikidataId(time.wikidataId || '')
      setWikidataUrl(time.wikidataUrl || '')

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
        setGranularity((time.vagueness.granularity || 'minute') as VaguenessGranularity)
      }

      if (time.deictic) {
        setHasDeictic(true)
        setDeicticAnchorType(time.deictic.anchorType as DeicticAnchorType)
        setDeicticExpression(time.deictic.expression || '')
      }

      setVideoReferences(time.videoReferences || [])
      setCertainty(time.certainty || 1.0)
    } else {
      setImportMode('manual')
      setTimeType('instant')
      setLabel('')
      setTimestamp('')
      setStartTime('')
      setEndTime('')
      setWikidataId('')
      setWikidataUrl('')
      setHasVagueness(false)
      setHasDeictic(false)
      setVideoReferences([])
      setCertainty(1.0)
    }
  }, [time, open])

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

  const handleSave = async () => {
    const baseTime: Omit<Time, 'id'> = {
      type: timeType,
      label: label || undefined,
      videoReferences: videoReferences.filter(ref => ref.videoId),
      certainty,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
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
        granularity: granularity,
      }
    }

    if (hasDeictic) {
      baseTime.deictic = {
        anchorType: deicticAnchorType,
        anchorTime: undefined,
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
      await updateTime({ ...time, ...timeData })
    } else {
      await addTime({ ...timeData, id: generateId() } as Time)
    }

    onClose()
  }

  const handleCancel = () => {
    if (!confirmDiscard()) return
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-secondary" />
            {time ? 'Edit Time' : 'Create Time'}
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Alert>
            <Clock className="size-4" />
            <AlertDescription>
              A time represents when something happens, either a specific instant or an interval.
              Times can be precise or vague, and can reference specific video frames.
            </AlertDescription>
          </Alert>

          {/* Import mode selector */}
          {!time && (
            <ToggleGroup
              value={[importMode]}
              onValueChange={(value) => {
                if (value.length > 0) setImportMode(value[0] as 'manual' | 'wikidata')
              }}
              size="sm"
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
          )}

          {/* Wikidata import */}
          {importMode === 'wikidata' && !time && (
            <WikidataSearch
              entityType="time"
              onImport={(data) => {
                setWikidataId(data.wikidataId)
                setWikidataUrl(data.wikidataUrl)

                if (data.temporalData) {
                  const td = data.temporalData

                  if (td.startTime && td.endTime) {
                    setTimeType('interval')
                    setStartTime(td.startTime.timestamp)
                    setEndTime(td.endTime.timestamp)

                    if (td.startTime.granularity !== 'day' || td.endTime.granularity !== 'day') {
                      setHasVagueness(true)
                      setGranularity(td.startTime.granularity as VaguenessGranularity)
                    }
                  } else if (td.pointInTime || td.inception || td.publicationDate) {
                    setTimeType('instant')
                    const timeData = td.pointInTime ?? td.inception ?? td.publicationDate
                    if (timeData) {
                      setTimestamp(timeData.timestamp)

                      if (timeData.granularity !== 'day') {
                        setHasVagueness(true)
                        setGranularity(timeData.granularity as VaguenessGranularity)

                        if (td.circa) {
                          setVaguenessType('approximate')
                          setVaguenessDescription('circa')
                        } else if (td.disputed) {
                          setVaguenessType('fuzzy')
                          setVaguenessDescription('disputed')
                        }
                      }
                    }
                  }
                }
              }}
            />
          )}

          {/* Show Wikidata chip if imported */}
          {wikidataId && (
            <div className="flex items-center gap-2">
              <a href={wikidataUrl} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer">
                  Wikidata: {wikidataId}
                </Badge>
              </a>
              <span className="text-xs text-muted-foreground">
                Imported from Wikidata
              </span>
            </div>
          )}

          {/* Label Field */}
          <div className="space-y-1">
            <Label htmlFor="time-label">Label</Label>
            <Input
              id="time-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Apollo 11 Launch, Summer 2024"
            />
            <p className="text-xs text-muted-foreground">Human-readable name for this time (optional but recommended)</p>
          </div>

          {/* Time Type Selection */}
          <div className="space-y-1">
            <Label>Time Type</Label>
            <ToggleGroup
              value={[timeType]}
              onValueChange={(value) => {
                if (value.length > 0) setTimeType(value[0] as 'instant' | 'interval')
              }}
              className="w-full"
            >
              <ToggleGroupItem value="instant" className="flex flex-1 items-center gap-1">
                <Timer className="size-4" />
                Instant (Point in Time)
              </ToggleGroupItem>
              <ToggleGroupItem value="interval" className="flex flex-1 items-center gap-1">
                <CalendarRange className="size-4" />
                Interval (Time Span)
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Instant Fields */}
          {timeType === 'instant' && (
            <div className="space-y-1">
              <Label>Timestamp</Label>
              <Input
                type="datetime-local"
                value={timestamp ? timestamp.slice(0, 16) : ''}
                onChange={(e) => setTimestamp(e.target.value ? new Date(e.target.value).toISOString() : '')}
              />
              <p className="text-xs text-muted-foreground">The specific moment in time</p>
            </div>
          )}

          {/* Interval Fields */}
          {timeType === 'interval' && (
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <Label>Start Time (Optional)</Label>
                <Input
                  type="datetime-local"
                  value={startTime ? startTime.slice(0, 16) : ''}
                  onChange={(e) => setStartTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label>End Time (Optional)</Label>
                <Input
                  type="datetime-local"
                  value={endTime ? endTime.slice(0, 16) : ''}
                  onChange={(e) => setEndTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                />
              </div>
            </div>
          )}

          <Separator />

          {/* Vagueness */}
          <div>
            <div className="flex items-center gap-2">
              <Switch
                checked={hasVagueness}
                onCheckedChange={setHasVagueness}
              />
              <Label>Add Vagueness Information</Label>
            </div>
            {hasVagueness && (
              <div className="mt-4 pl-4 flex flex-col gap-3">
                <Select value={vaguenessType} onValueChange={(value) => setVaguenessType(value as VaguenessType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approximate">Approximate</SelectItem>
                    <SelectItem value="bounded">Bounded</SelectItem>
                    <SelectItem value="fuzzy">Fuzzy</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  value={vaguenessDescription}
                  onChange={(e) => setVaguenessDescription(e.target.value)}
                  placeholder="e.g., 'around noon', 'early morning'"
                />

                {vaguenessType === 'bounded' && (
                  <div className="flex gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Earliest</Label>
                      <Input
                        type="datetime-local"
                        value={earliestBound ? earliestBound.slice(0, 16) : ''}
                        onChange={(e) => setEarliestBound(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Latest</Label>
                      <Input
                        type="datetime-local"
                        value={latestBound ? latestBound.slice(0, 16) : ''}
                        onChange={(e) => setLatestBound(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Typical</Label>
                      <Input
                        type="datetime-local"
                        value={typicalTime ? typicalTime.slice(0, 16) : ''}
                        onChange={(e) => setTypicalTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      />
                    </div>
                  </div>
                )}

                <Select value={granularity} onValueChange={(value) => setGranularity(value as VaguenessGranularity)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="millisecond">Millisecond</SelectItem>
                    <SelectItem value="second">Second</SelectItem>
                    <SelectItem value="minute">Minute</SelectItem>
                    <SelectItem value="hour">Hour</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Deictic Reference */}
          <div>
            <div className="flex items-center gap-2">
              <Switch
                checked={hasDeictic}
                onCheckedChange={setHasDeictic}
              />
              <Label>Add Deictic Reference</Label>
            </div>
            {hasDeictic && (
              <div className="mt-4 pl-4 flex gap-4">
                <div className="flex-1">
                  <Select value={deicticAnchorType} onValueChange={(value) => setDeicticAnchorType(value as DeicticAnchorType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annotation_time">Annotation Time</SelectItem>
                      <SelectItem value="video_time">Video Time</SelectItem>
                      <SelectItem value="reference_time">Reference Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    value={deicticExpression}
                    onChange={(e) => setDeicticExpression(e.target.value)}
                    placeholder="e.g., 'yesterday', 'at this point'"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Video References */}
          <div>
            <Label className="text-sm font-medium">Video References</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Link this time to specific moments in videos
            </p>

            {videoReferences.map((ref, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <div style={{ minWidth: 200 }}>
                  <Select value={ref.videoId || '_none'} onValueChange={(value) => handleUpdateVideoReference(index, { ...ref, videoId: !value || value === '_none' ? '' : value })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Video" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {videos.map(video => (
                        <SelectItem key={video.id} value={video.id}>
                          {video.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {timeType === 'instant' ? (
                  <>
                    <Input
                      type="number"
                      placeholder="Frame"
                      value={ref.frameNumber || ''}
                      onChange={(e) => handleUpdateVideoReference(index, {
                        ...ref,
                        frameNumber: e.target.value ? parseInt(e.target.value) : undefined
                      })}
                      className="w-24"
                    />
                    <Input
                      type="number"
                      placeholder="Milliseconds"
                      value={ref.milliseconds || ''}
                      onChange={(e) => handleUpdateVideoReference(index, {
                        ...ref,
                        milliseconds: e.target.value ? parseInt(e.target.value) : undefined
                      })}
                      className="w-28"
                    />
                  </>
                ) : (
                  <Input
                    placeholder="Frame Range (start-end)"
                    value={ref.frameRange ? `${ref.frameRange[0]}-${ref.frameRange[1]}` : ''}
                    onChange={(e) => {
                      const parts = e.target.value.split('-').map(p => parseInt(p.trim())).filter(n => !isNaN(n))
                      handleUpdateVideoReference(index, {
                        ...ref,
                        frameRange: parts.length === 2 ? [parts[0], parts[1]] : undefined
                      })
                    }}
                  />
                )}

                <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveVideoReference(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddVideoReference}
            >
              <Plus className="mr-1 size-4" />
              Add Video Reference
            </Button>
          </div>

          <Separator />

          {/* Certainty */}
          <div>
            <Label className="text-sm font-medium">
              Certainty: {(certainty * 100).toFixed(0)}%
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
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={
              !label || (
                timeType === 'instant'
                  ? !timestamp && !hasVagueness && !hasDeictic
                  : !startTime && !endTime && !hasVagueness && !hasDeictic
              )
            }
          >
            {time ? 'Update Time' : 'Create Time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
