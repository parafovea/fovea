/**
 * Composed timeline surface.
 *
 * Responsibilities:
 *  - Hold per-track lock / solo UI state (purely client-side; the
 *    annotation data itself is immutable here).
 *  - Convert the incoming ``Annotation[]`` into :class:`TimelineTrackModel`
 *    rows with deterministic colors.
 *  - Wire the transport bar, ruler, track stack, playhead, shortcut palette,
 *    and viewport hook into a single pointer-aware root.
 *  - Dispatch seeks, keyframe edits, and interpolation-segment edits
 *    through the callbacks provided by the app layer.
 *
 * The surface uses a two-column layout: a fixed-width header column on the
 * left with track labels, and a flexible right column that contains the
 * ruler, playhead, and track lanes. A ResizeObserver on the right column
 * feeds ``useTimelineViewport``.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { InterpolationModeSelector, BezierControlPointSet } from '../InterpolationModeSelector'
import type { Annotation, InterpolationType } from '@models/types'
import { colorForId } from './color'
import { useAllPersonaOntologies } from '@/store/queries/usePersonas'
import { useWorld } from '@/store/queries/useWorld'
import { ShortcutPalette } from './ShortcutPalette'
import { TimelinePlayhead } from './TimelinePlayhead'
import { TimelineRuler } from './TimelineRuler'
import { TimelineTrack } from './TimelineTrack'
import { TimelineTrackHeader } from './TimelineTrackHeader'
import { TransportBar } from './TransportBar'
import { snapToKeyframe, xToFrame } from './viewport'
import { useKeyframeDrag } from './useKeyframeDrag'
import { useTimelineKeyboard } from './useTimelineKeyboard'
import { useTimelineViewport } from './useTimelineViewport'
import type { TimelineTrackModel } from './types'

const TRACK_HEADER_WIDTH_PX = 180

export interface TimelineRootProps {
  annotation: Annotation | null
  annotations: Annotation[]
  currentFrame: number
  totalFrames: number
  videoFps: number
  onSeek: (frameNumber: number) => void
  onAnnotationSelect: (annotation: Annotation) => void
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onMoveKeyframe?: (fromFrame: number, toFrame: number) => void
  onUpdateInterpolationSegment: (
    segmentIndex: number,
    type: InterpolationType,
    controlPoints?: BezierControlPointSet,
  ) => void
  onClose: () => void
}

export function TimelineRoot({
  annotation,
  annotations,
  currentFrame,
  totalFrames,
  videoFps,
  onSeek,
  onAnnotationSelect,
  onAddKeyframe,
  onDeleteKeyframe,
  onCopyPreviousFrame,
  onMoveKeyframe,
  onUpdateInterpolationSegment,
  onClose,
}: TimelineRootProps) {
  const { containerRef, viewport, zoomAt, zoomIn, zoomOut, fitToView } = useTimelineViewport({
    currentFrame,
    totalFrames,
  })

  // Resolve typeId / linkedEntityId / etc. to human-readable names so
  // the timeline track row shows "Spectator" instead of "Type fc2e0f".
  // Loads the ontology for every persona that owns at least one type
  // annotation on screen (so multi-persona videos resolve correctly,
  // not just the first persona's annotations), and the world workspace
  // for object-annotation labels. Falls back to the truncated-uuid form
  // when nothing resolves.
  const annotationPersonaIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of annotations) {
      if (a.annotationType === 'type' && a.personaId) s.add(a.personaId)
    }
    return Array.from(s)
  }, [annotations])
  const { data: personaOntologies = [] } = useAllPersonaOntologies(annotationPersonaIds)
  const { data: world } = useWorld()
  const resolveLabel = useCallback(
    (ann: Annotation): string => {
      if (ann.annotationType === 'type') {
        const a = ann
        // Find the persona's ontology that contains the referenced
        // typeId — fall back to scanning EVERY loaded ontology, not
        // just the one whose personaId matches, because cross-persona
        // imports / forks can move a type's id outside its original
        // persona. Without that wider scan the timeline shows the
        // alphanumeric "Type c16097" fallback whenever an annotation
        // was authored against a persona that wasn't the seed
        // persona of the referenced type.
        const ownOntology = personaOntologies.find((o) => o.personaId === a.personaId)
        const scan = (o: typeof personaOntologies[number]) => {
          const all = [
            ...(o.entities ?? []),
            ...(o.roles ?? []),
            ...(o.events ?? []),
            ...(o.relationTypes ?? []),
          ]
          return all.find((x) => x.id === a.typeId)?.name
        }
        const resolved =
          (ownOntology ? scan(ownOntology) : undefined) ??
          personaOntologies.map(scan).find(Boolean)
        return resolved ?? `Type ${a.typeId.slice(0, 6)}`
      }
      const a = ann
      const linkedId =
        a.linkedEntityId ??
        a.linkedEventId ??
        a.linkedTimeId ??
        a.linkedLocationId ??
        null
      if (!linkedId) return `Object ${a.id.slice(0, 6)}`
      const allObjects = [
        ...(world?.entities ?? []),
        ...(world?.events ?? []),
        ...(world?.times ?? []),
      ]
      const obj = allObjects.find((x) => x.id === linkedId) as { name?: string } | undefined
      return obj?.name ?? `Object ${a.id.slice(0, 6)}`
    },
    [personaOntologies, world],
  )

  const [lockedTrackIds, setLockedTrackIds] = useState<ReadonlySet<string>>(new Set())
  const [soloTrackId, setSoloTrackId] = useState<string | null>(null)
  const [interpolationOpen, setInterpolationOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [selectedKeyframes, setSelectedKeyframes] = useState<ReadonlySet<number>>(new Set())

  const rulerTrackRef = useRef<HTMLDivElement>(null)

  const activeAnnotationId = annotation?.id ?? null

  const tracks: TimelineTrackModel[] = useMemo(() => {
    return annotations.map((ann) => {
      const keyframes = (ann.boundingBoxSequence?.boxes ?? [])
        .filter((box) => box.isKeyframe || box.isKeyframe === undefined)
        .map((box) => ({ frameNumber: box.frameNumber }))
        .sort((a, b) => a.frameNumber - b.frameNumber)
      const segments = ann.boundingBoxSequence?.interpolationSegments ?? []
      const range =
        keyframes.length > 0
          ? {
              start: keyframes[0].frameNumber,
              end: keyframes[keyframes.length - 1].frameNumber,
            }
          : null
      const label = resolveLabel(ann)
      return {
        id: ann.id,
        label,
        color: colorForId(ann.id),
        keyframes,
        segments,
        range,
        isActive: ann.id === activeAnnotationId,
        isLocked: lockedTrackIds.has(ann.id),
        isSolo: soloTrackId === ann.id,
        annotation: ann,
      } satisfies TimelineTrackModel
    })
  }, [annotations, activeAnnotationId, lockedTrackIds, soloTrackId, resolveLabel])

  const visibleTracks = useMemo(
    () => (soloTrackId ? tracks.filter((track) => track.id === soloTrackId) : tracks),
    [tracks, soloTrackId],
  )

  const activeTrack = useMemo(
    () => tracks.find((track) => track.isActive) ?? null,
    [tracks],
  )
  const activeKeyframes = useMemo(
    () => activeTrack?.keyframes.map((kf) => kf.frameNumber) ?? [],
    [activeTrack],
  )
  const isOnKeyframe = activeKeyframes.includes(currentFrame)
  const canDeleteKeyframe =
    !!activeTrack &&
    !activeTrack.isLocked &&
    isOnKeyframe &&
    activeKeyframes.length > 2 &&
    currentFrame !== activeKeyframes[0] &&
    currentFrame !== activeKeyframes[activeKeyframes.length - 1]
  const canInterpolate = !!activeTrack && !activeTrack.isLocked && activeKeyframes.length >= 2

  const toggleLock = useCallback((trackId: string) => {
    setLockedTrackIds((prev) => {
      const next = new Set(prev)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }, [])

  const toggleSolo = useCallback((trackId: string) => {
    setSoloTrackId((prev) => (prev === trackId ? null : trackId))
  }, [])

  const selectTrack = useCallback(
    (trackId: string) => {
      const track = tracks.find((candidate) => candidate.id === trackId)
      if (track) {
        onAnnotationSelect(track.annotation)
      }
    },
    [tracks, onAnnotationSelect],
  )

  const keyframeDrag = useKeyframeDrag({
    viewport,
    containerRef: rulerTrackRef,
    keyframes: activeKeyframes,
    onMove: () => {
      // Optimistic UI could live here once the store supports it; for now
      // the commit pathway below mutates after pointer-up.
    },
    onCommit: (fromFrame, toFrame) => {
      if (onMoveKeyframe) onMoveKeyframe(fromFrame, toFrame)
    },
  })

  const handleKeyframePointerDown = useCallback(
    (
      track: TimelineTrackModel,
      frame: number,
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      if (track.id !== activeAnnotationId) {
        onAnnotationSelect(track.annotation)
      }
      if (event.shiftKey) {
        setSelectedKeyframes((prev) => {
          const next = new Set(prev)
          if (next.has(frame)) next.delete(frame)
          else next.add(frame)
          return next
        })
        return
      }
      setSelectedKeyframes(new Set([frame]))
      if (!track.isLocked) {
        keyframeDrag.start(frame, event)
      }
      onSeek(frame)
    },
    [activeAnnotationId, keyframeDrag, onAnnotationSelect, onSeek],
  )

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement
      // Delegate to keyframe handler if the pointer hit a keyframe button.
      if (target.closest('[data-slot="timeline-keyframe"]')) return
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const raw = xToFrame(x, viewport)
      const snapped = event.altKey
        ? raw
        : snapToKeyframe(raw, activeKeyframes, Math.max(1, Math.round(4 / viewport.pixelsPerFrame)))
      const clamped = Math.max(0, Math.min(totalFrames - 1, snapped))
      setIsScrubbing(true)
      setSelectedKeyframes(new Set())
      onSeek(clamped)

      const handleMove = (move: PointerEvent) => {
        const rx = move.clientX - rect.left
        const rawInside = xToFrame(rx, viewport)
        const snappedInside = move.altKey
          ? rawInside
          : snapToKeyframe(
              rawInside,
              activeKeyframes,
              Math.max(1, Math.round(4 / viewport.pixelsPerFrame)),
            )
        onSeek(Math.max(0, Math.min(totalFrames - 1, snappedInside)))
      }
      const handleUp = () => {
        setIsScrubbing(false)
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [activeKeyframes, onSeek, totalFrames, viewport],
  )

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const anchorFrame = xToFrame(event.clientX - rect.left, viewport)
      zoomAt(event.deltaY, anchorFrame)
    },
    [viewport, zoomAt],
  )

  useTimelineKeyboard({
    enabled: true,
    currentFrame,
    totalFrames,
    keyframes: activeKeyframes,
    onSeek,
    onAddKeyframe,
    onDeleteKeyframe,
    onCopyPreviousFrame,
    onOpenInterpolation: () => {
      if (canInterpolate) setInterpolationOpen(true)
    },
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onFitToView: fitToView,
    onOpenShortcuts: () => {
      setShortcutsOpen(true)
    },
  })

  return (
    <div
      data-slot="timeline-root"
      data-tour-id="timeline"
      aria-label="Video annotation timeline"
      className={cn(
        'relative flex w-full select-none flex-col overflow-hidden',
        'rounded-lg border border-white/5 bg-slate-950 text-slate-100 shadow-xl',
      )}
    >
      <TransportBar
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={videoFps}
        zoom={viewport.zoom}
        minZoom={viewport.minZoom}
        maxZoom={viewport.maxZoom}
        canEditKeyframes={!!activeTrack && !activeTrack.isLocked}
        isOnKeyframe={isOnKeyframe}
        canDeleteKeyframe={canDeleteKeyframe}
        canInterpolate={canInterpolate}
        canCopyPrevious={!!activeTrack && !activeTrack.isLocked && currentFrame > 0}
        onStepBackward={() => {
          onSeek(Math.max(0, currentFrame - 1))
        }}
        onJumpBackward={() => {
          onSeek(Math.max(0, currentFrame - 10))
        }}
        onStepForward={() => {
          onSeek(Math.min(totalFrames - 1, currentFrame + 1))
        }}
        onJumpForward={() => {
          onSeek(Math.min(totalFrames - 1, currentFrame + 10))
        }}
        onAddKeyframe={onAddKeyframe}
        onDeleteKeyframe={onDeleteKeyframe}
        onCopyPreviousFrame={onCopyPreviousFrame}
        onOpenInterpolation={() => {
          if (canInterpolate) setInterpolationOpen(true)
        }}
        onClose={onClose}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onOpenShortcuts={() => {
          setShortcutsOpen(true)
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            'flex shrink-0 flex-col overflow-hidden border-r border-white/5',
            'bg-slate-950/50',
          )}
          style={{ width: TRACK_HEADER_WIDTH_PX }}
        >
          <div className="h-8 border-b border-white/5 bg-slate-950/60 px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] text-slate-500">
            Tracks
          </div>
          {visibleTracks.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-500">
              No annotations on this video yet.
            </div>
          ) : (
            visibleTracks.map((track) => (
              <TimelineTrackHeader
                key={track.id}
                track={track}
                onSelect={selectTrack}
                onToggleLock={toggleLock}
                onToggleSolo={toggleSolo}
              />
            ))
          )}
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          onWheel={handleWheel}
        >
          <TimelineRuler viewport={viewport} fps={videoFps} />
          <div
            ref={rulerTrackRef}
            data-slot="timeline-track-surface"
            className="relative min-h-0"
            onPointerDown={handleSurfacePointerDown}
          >
            {visibleTracks.length === 0 ? (
              <div className="flex h-10 items-center justify-center text-xs text-slate-500">
                Create an annotation to start placing keyframes.
              </div>
            ) : (
              visibleTracks.map((track) => (
                <TimelineTrack
                  key={track.id}
                  track={track}
                  viewport={viewport}
                  currentFrame={currentFrame}
                  selectedKeyframes={selectedKeyframes}
                  onKeyframePointerDown={handleKeyframePointerDown}
                />
              ))
            )}
            <TimelinePlayhead
              frame={currentFrame}
              viewport={viewport}
              isScrubbing={isScrubbing}
            />
          </div>
        </div>
      </div>

      {interpolationOpen && activeTrack && (
        <InterpolationModeSelector
          annotation={activeTrack.annotation}
          currentFrame={currentFrame}
          open={interpolationOpen}
          onClose={() => {
            setInterpolationOpen(false)
          }}
          onApply={(segmentIndex, mode, controlPoints) => {
            onUpdateInterpolationSegment(segmentIndex, mode, controlPoints)
            setInterpolationOpen(false)
          }}
        />
      )}

      <ShortcutPalette
        open={shortcutsOpen}
        onClose={() => {
          setShortcutsOpen(false)
        }}
      />
    </div>
  )
}
