import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Clock, RefreshCw, Film, Plus, Trash2 } from 'lucide-react'
import { Time, TimeInstant, TimeInterval } from '@models/types'
import { generateId } from '@utils/uuid'
import { useAddTime } from '@store/queries'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

/** Vagueness type options */
type VaguenessType = 'approximate' | 'bounded' | 'fuzzy'

/** Granularity options for time vagueness */
type GranularityType = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/** Video reference field names */
type VideoRefField = keyof VideoReference

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
  const { mutate: addTime } = useAddTime()
  const temporalAnnotatorAnchor = useTourAnchor('temporal-annotator')
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
  const [granularity, setGranularity] = useState<GranularityType>('second')

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
      const notesValue = existingTime.metadata?.notes
      setNotes(typeof notesValue === 'string' ? notesValue : '')
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

  const handleUpdateVideoReference = (index: number, field: VideoRefField, value: VideoReference[VideoRefField]) => {
    const newRefs = [...videoReferences]
    newRefs[index] = { ...newRefs[index], [field]: value }
    setVideoReferences(newRefs)
  }

  const createTimeData = (): Omit<Time, 'id'> => {
    // Build vagueness if specified
    const vagueness = hasVagueness ? {
      type: vaguenessType,
      description: vaguenessDescription || undefined,
      granularity,
    } : undefined

    // Build deictic reference if specified
    const deictic = hasDeictic ? {
      anchorType: 'video_time' as const,
      expression: deicticExpression || undefined,
    } : undefined

    // Build metadata if notes exist
    const metadata = notes ? { notes } : undefined

    // Build time data based on type
    if (timeType === 'instant') {
      const instantTime: Omit<TimeInstant, 'id'> = {
        type: 'instant',
        timestamp: new Date(startTime * 1000).toISOString(),
        videoReferences,
        certainty,
        vagueness,
        deictic,
        metadata,
      }
      return instantTime
    } else {
      const intervalTime: Omit<TimeInterval, 'id'> = {
        type: 'interval',
        startTime: new Date(startTime * 1000).toISOString(),
        endTime: new Date(endTime * 1000).toISOString(),
        videoReferences,
        certainty,
        vagueness,
        deictic,
        metadata,
      }
      return intervalTime
    }
  }

  const handleSaveTime = () => {
    const timeData = createTimeData()
    const newId = generateId()
    const timeWithId: Time = { ...timeData, id: newId } as Time

    addTime({ ...timeData, id: newId })

    if (onTimeCreated) {
      onTimeCreated(timeWithId)
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
    <div ref={temporalAnnotatorAnchor} className="rounded-lg ring-1 ring-foreground/10 bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Clock className="size-5" />
        Temporal Annotation
      </h3>

      <div className="flex flex-col gap-6">
        {/* Time Type Selection */}
        <div className="flex flex-col gap-2">
          <Label>Time Type</Label>
          <Select value={timeType} onValueChange={(val) => setTimeType(val as 'instant' | 'interval')}>
            <SelectTrigger>
              <SelectValue placeholder="Select time type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instant">Instant (single point in time)</SelectItem>
              <SelectItem value="interval">Interval (time range)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Time Selection */}
        {timeType === 'instant' ? (
          <div>
            <p className="text-sm font-medium mb-2">Time Point</p>
            <Alert className="mb-4">
              <AlertDescription>
                <p className="text-sm">
                  {formatTimeDisplay(currentTime)} / {formatFrameDisplay(currentTime)}
                </p>
              </AlertDescription>
            </Alert>
            <Button
              variant="outline"
              onClick={() => setStartTime(currentTime)}
              className="w-full"
            >
              <RefreshCw className="size-4 mr-2" />
              Use Current Video Time
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium mb-2">Time Range</p>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Start: {formatTimeDisplay(startTime)} / {formatFrameDisplay(startTime)}
                </p>
                <Slider
                  value={[startTime]}
                  onValueChange={(v) => setStartTime(Array.isArray(v) ? v[0] : v)}
                  min={0}
                  max={duration}
                  step={1 / fps}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  End: {formatTimeDisplay(endTime)} / {formatFrameDisplay(endTime)}
                </p>
                <Slider
                  value={[endTime]}
                  onValueChange={(v) => setEndTime(Array.isArray(v) ? v[0] : v)}
                  min={startTime}
                  max={duration}
                  step={1 / fps}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartTime(currentTime)
                    setEndTime(Math.min(currentTime + 1, duration))
                  }}
                >
                  Use Current Time
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartTime(0)
                    setEndTime(duration)
                  }}
                >
                  Full Video
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Vagueness Settings */}
        <div>
          <div className="flex items-center gap-3">
            <Switch
              checked={hasVagueness}
              onCheckedChange={setHasVagueness}
            />
            <Label>Add Vagueness/Uncertainty</Label>
          </div>

          {hasVagueness && (
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-2">
                <Label>Vagueness Type</Label>
                <Select value={vaguenessType} onValueChange={(val) => setVaguenessType(val as VaguenessType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approximate">Approximate (around this time)</SelectItem>
                    <SelectItem value="bounded">Bounded (within a range)</SelectItem>
                    <SelectItem value="fuzzy">Fuzzy (unclear boundaries)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="e.g., 'around noon', 'early morning'"
                  value={vaguenessDescription}
                  onChange={(e) => setVaguenessDescription(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Granularity</Label>
                <Select value={granularity} onValueChange={(val) => setGranularity(val as GranularityType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="millisecond">Millisecond</SelectItem>
                    <SelectItem value="second">Second</SelectItem>
                    <SelectItem value="minute">Minute</SelectItem>
                    <SelectItem value="hour">Hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Deictic Reference */}
        <div>
          <div className="flex items-center gap-3">
            <Switch
              checked={hasDeictic}
              onCheckedChange={setHasDeictic}
            />
            <Label>Add Deictic Reference</Label>
          </div>

          {hasDeictic && (
            <div className="flex flex-col gap-2 mt-4">
              <Label>Deictic Expression</Label>
              <Input
                placeholder="e.g., 'at this point', 'right now', 'just before'"
                value={deicticExpression}
                onChange={(e) => setDeicticExpression(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Certainty */}
        <div>
          <p className="text-sm font-medium mb-2">
            Certainty: {(certainty * 100).toFixed(0)}%
          </p>
          <Slider
            value={[certainty]}
            onValueChange={(v) => setCertainty(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        {/* Multi-Video References */}
        <div>
          <p className="text-sm font-medium flex items-center gap-2 mb-2">
            <Film className="size-4" />
            Video References
          </p>

          {videoReferences.map((ref, index) => (
            <div key={index} className="rounded-md ring-1 ring-foreground/10 p-4 mb-2">
              <div className="flex items-center gap-2">
                {ref.videoId === videoId ? (
                  <Badge>Primary Video</Badge>
                ) : (
                  <Input
                    placeholder="Video ID"
                    value={ref.videoId}
                    onChange={(e) => handleUpdateVideoReference(index, 'videoId', e.target.value)}
                    className="flex-1"
                  />
                )}

                {ref.videoId !== videoId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveVideoReference(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>

              {ref.videoId === videoId && (
                <p className="text-xs text-muted-foreground mt-2">
                  {timeType === 'instant'
                    ? `Frame ${ref.frameNumber}, ${ref.milliseconds}ms`
                    : `Frames ${ref.frameRange?.[0]}-${ref.frameRange?.[1]}, ${ref.millisecondRange?.[0]}-${ref.millisecondRange?.[1]}ms`
                  }
                </p>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddVideoReference}
          >
            <Plus className="size-4 mr-1" />
            Add Video Reference
          </Button>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {/* Save Button */}
        <Button
          size="lg"
          onClick={handleSaveTime}
          className="w-full"
        >
          <Clock className="size-4 mr-2" />
          {existingTime ? 'Update' : 'Create'} Time Object
        </Button>
      </div>
    </div>
  )
}
