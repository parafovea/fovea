/**
 * Beautifully formatted, speaker-coloured transcript view used by the
 * AnnotationWorkspace's Transcribe Audio dialog.
 *
 * Why this lives alongside TranscriptViewer rather than replacing it:
 * TranscriptViewer is consumed by saved-summary playback inside the
 * VideoSummaryCard and expects only a TranscriptJson shape. The
 * Transcribe Audio dialog runs the model on demand and surfaces a
 * richer header (language, model, run time, speaker chips) that the
 * summary card has no need for. Keeping them split lets each evolve
 * without breaking the other.
 */

import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { TranscriptSegment } from '@api/client'

export interface TranscriptPanelProps {
  segments: TranscriptSegment[]
  speakers?: string[]
  language?: string
  modelUsed?: string
  diarizationModelUsed?: string
  processingTime?: number
  diarizationProcessingTime?: number
  duration?: number
  currentTime: number
  onSeek: (time: number) => void
}

/**
 * Tailwind palette tokens kept inside the bundle so the speaker chip
 * colours survive Tailwind's JIT purge — referencing them as literals
 * here means the classes are statically discoverable.
 */
const SPEAKER_PALETTE = [
  { chip: 'bg-blue-100 text-blue-900 border-blue-300', dot: 'bg-blue-500' },
  { chip: 'bg-emerald-100 text-emerald-900 border-emerald-300', dot: 'bg-emerald-500' },
  { chip: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-500' },
  { chip: 'bg-violet-100 text-violet-900 border-violet-300', dot: 'bg-violet-500' },
  { chip: 'bg-rose-100 text-rose-900 border-rose-300', dot: 'bg-rose-500' },
  { chip: 'bg-cyan-100 text-cyan-900 border-cyan-300', dot: 'bg-cyan-500' },
  { chip: 'bg-orange-100 text-orange-900 border-orange-300', dot: 'bg-orange-500' },
  { chip: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300', dot: 'bg-fuchsia-500' },
] as const

const UNKNOWN_SPEAKER = { chip: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/60' }

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function formatProcessingTime(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${(seconds / 60).toFixed(1)}m`
}

/**
 * Friendly display name for a pyannote speaker label such as
 * "SPEAKER_00". Falls back to the raw label for unknown shapes.
 */
function friendlySpeakerName(raw: string): string {
  const m = raw.match(/^SPEAKER[_-]?(\d+)$/i)
  if (m) return `Speaker ${parseInt(m[1], 10) + 1}`
  return raw
}

export function TranscriptPanel(props: TranscriptPanelProps): JSX.Element {
  const {
    segments,
    speakers,
    language,
    modelUsed,
    diarizationModelUsed,
    processingTime,
    diarizationProcessingTime,
    duration,
    currentTime,
    onSeek,
  } = props

  // First-appearance ordered speaker list, sourced from either the
  // backend's `speakers` array (preferred) or harvested from segments.
  const orderedSpeakers = useMemo<string[]>(() => {
    if (speakers && speakers.length > 0) return speakers
    const seen: string[] = []
    for (const seg of segments) {
      if (seg.speaker && !seen.includes(seg.speaker)) seen.push(seg.speaker)
    }
    return seen
  }, [speakers, segments])

  const speakerStyle = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_PALETTE)[number]>()
    orderedSpeakers.forEach((s, i) => {
      map.set(s, SPEAKER_PALETTE[i % SPEAKER_PALETTE.length])
    })
    return map
  }, [orderedSpeakers])

  const styleFor = (speaker?: string | null) =>
    (speaker && speakerStyle.get(speaker)) || UNKNOWN_SPEAKER

  // Index of the segment that contains the current playhead, or -1.
  const activeIndex = useMemo(() => {
    return segments.findIndex(
      (seg) => currentTime >= seg.start && currentTime < seg.end,
    )
  }, [segments, currentTime])

  // Auto-scroll the active segment into view as playback advances,
  // but only when it actually changes — avoid yanking scroll on every
  // tick of currentTime.
  const segmentRefs = useRef<Array<HTMLLIElement | null>>([])
  useEffect(() => {
    if (activeIndex < 0) return
    const el = segmentRefs.current[activeIndex]
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  return (
    <div className="flex flex-col gap-4" data-testid="transcript-panel">
      {/* Header summary */}
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {language && (
            <span>
              <span className="font-medium text-foreground">Language:</span>{' '}
              {language.toUpperCase()}
            </span>
          )}
          {duration !== undefined && (
            <span>
              <span className="font-medium text-foreground">Duration:</span>{' '}
              {formatDuration(duration)}
            </span>
          )}
          {modelUsed && (
            <span>
              <span className="font-medium text-foreground">ASR:</span> {modelUsed}{' '}
              <span className="text-muted-foreground/70">
                ({formatProcessingTime(processingTime)})
              </span>
            </span>
          )}
          {diarizationModelUsed && (
            <span>
              <span className="font-medium text-foreground">Diarization:</span>{' '}
              {diarizationModelUsed}{' '}
              <span className="text-muted-foreground/70">
                ({formatProcessingTime(diarizationProcessingTime)})
              </span>
            </span>
          )}
        </div>
        {orderedSpeakers.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="speaker-legend">
            {orderedSpeakers.map((s) => {
              const style = styleFor(s)
              return (
                <Badge
                  key={s}
                  variant="outline"
                  className={cn('gap-1.5 border', style.chip)}
                >
                  <span className={cn('inline-block size-2 rounded-full', style.dot)} />
                  {friendlySpeakerName(s)}
                </Badge>
              )
            })}
          </div>
        )}
      </div>

      {/* Segment list */}
      <ol className="flex flex-col gap-1.5" data-testid="transcript-segments">
        {segments.map((seg, idx) => {
          const isActive = idx === activeIndex
          const style = styleFor(seg.speaker)
          return (
            <li
              key={`${seg.start}-${idx}`}
              ref={(el) => {
                segmentRefs.current[idx] = el
              }}
            >
              <button
                type="button"
                onClick={() => onSeek(seg.start)}
                className={cn(
                  'group flex w-full gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors',
                  'hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'border-primary/40 bg-primary/5',
                )}
                data-testid="transcript-segment"
                data-active={isActive || undefined}
              >
                <span
                  className={cn(
                    'flex-none rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground group-hover:bg-muted/80',
                  )}
                >
                  {formatTimestamp(seg.start)}
                </span>
                {orderedSpeakers.length > 0 && (
                  <span
                    className={cn(
                      'flex-none rounded border px-1.5 py-0.5 text-[11px] font-medium',
                      style.chip,
                    )}
                  >
                    {friendlySpeakerName(seg.speaker ?? 'Unknown')}
                  </span>
                )}
                <span
                  className={cn(
                    'flex-1 text-sm leading-relaxed',
                    isActive ? 'text-foreground' : 'text-foreground/90',
                  )}
                >
                  {seg.text.trim() || <span className="italic text-muted-foreground">(silence)</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default TranscriptPanel
