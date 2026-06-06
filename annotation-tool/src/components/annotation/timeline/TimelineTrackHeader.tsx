/**
 * Per-track row header rendered in a fixed-width column on the left side
 * of the timeline.
 *
 * Shows the track's color swatch, label, and three affordances:
 *  - Lock: prevents keyframe drag / delete / interpolation edits.
 *  - Solo: temporarily hides every other track.
 *  - Select: clicking anywhere else in the row focuses the track.
 *
 * All three are icon buttons with aria-labels and keyboard activation.
 */

import { memo } from 'react'
import { Headphones, Lock, LockOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TimelineTrackModel } from './types'

interface Props {
  track: TimelineTrackModel
  onSelect: (trackId: string) => void
  onToggleLock: (trackId: string) => void
  onToggleSolo: (trackId: string) => void
}

export const TimelineTrackHeader = memo(function TimelineTrackHeader({
  track,
  onSelect,
  onToggleLock,
  onToggleSolo,
}: Props) {
  const LockIcon = track.isLocked ? Lock : LockOpen
  return (
    <div
      data-slot="timeline-track-header"
      data-active={track.isActive || undefined}
      className={cn(
        'flex h-10 items-center gap-2 border-b border-white/5 px-2',
        'bg-slate-950/40 hover:bg-slate-900/60 transition-colors',
        track.isActive && 'bg-slate-900/80',
      )}
      onClick={() => {
        onSelect(track.id)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(track.id)
        }
      }}
    >
      <span
        aria-hidden
        className="shrink-0 size-2.5 rounded-full ring-1 ring-white/20"
        style={{ backgroundColor: track.color }}
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          track.isActive ? 'text-slate-100 font-medium' : 'text-slate-300',
        )}
        title={track.label}
      >
        {track.label}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={track.isSolo ? 'Unsolo track' : 'Solo track'}
        aria-pressed={track.isSolo}
        onClick={(event) => {
          event.stopPropagation()
          onToggleSolo(track.id)
        }}
        className={cn(
          'size-6 text-slate-400 hover:text-slate-100',
          track.isSolo && 'text-amber-300 hover:text-amber-200',
        )}
      >
        <Headphones className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={track.isLocked ? 'Unlock track' : 'Lock track'}
        aria-pressed={track.isLocked}
        onClick={(event) => {
          event.stopPropagation()
          onToggleLock(track.id)
        }}
        className={cn(
          'size-6 text-slate-400 hover:text-slate-100',
          track.isLocked && 'text-rose-300 hover:text-rose-200',
        )}
      >
        <LockIcon className="size-3.5" />
      </Button>
    </div>
  )
})
