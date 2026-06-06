/**
 * Keyboard-shortcut overlay triggered by ``?``.
 *
 * Opens over the timeline and shows every hotkey the component and its
 * siblings accept. The list is the source of truth used by
 * :class:`useTimelineKeyboard`, exported here so the overlay never drifts
 * out of sync with the actual bindings.
 */

import { memo } from 'react'
import { Keyboard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ShortcutGroup {
  heading: string
  bindings: ReadonlyArray<{ keys: string; description: string }>
}

export const TIMELINE_SHORTCUTS: ReadonlyArray<ShortcutGroup> = Object.freeze([
  {
    heading: 'Navigation',
    bindings: [
      { keys: '←  →', description: 'Step 1 frame back / forward' },
      { keys: 'Shift + ← →', description: 'Jump 10 frames' },
      { keys: 'Home  End', description: 'Jump to start / end' },
      { keys: ',  .', description: 'Previous / next keyframe' },
      { keys: 'J / K / L', description: 'Reverse / pause / forward playback' },
    ],
  },
  {
    heading: 'Editing',
    bindings: [
      { keys: 'K', description: 'Add keyframe at current frame' },
      { keys: 'Delete', description: 'Delete current keyframe' },
      { keys: 'C', description: 'Copy previous frame' },
      { keys: 'I', description: 'Open interpolation mode' },
    ],
  },
  {
    heading: 'View',
    bindings: [
      { keys: '+  −', description: 'Zoom in / out' },
      { keys: '0', description: 'Fit entire video in view' },
      { keys: 'Wheel', description: 'Zoom in / out at cursor' },
      { keys: '?', description: 'Show this shortcut list' },
    ],
  },
])

interface Props {
  open: boolean
  onClose: () => void
}

export const ShortcutPalette = memo(function ShortcutPalette({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timeline keyboard shortcuts"
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center p-6',
        'bg-slate-950/80 backdrop-blur-sm',
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        className={cn(
          'w-full max-w-xl rounded-xl border border-white/10',
          'bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl',
        )}
        data-slot="timeline-shortcut-palette"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <Keyboard className="size-4 text-amber-300" />
            Timeline keyboard shortcuts
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close shortcut palette"
            onClick={onClose}
            className="size-7 text-slate-300 hover:text-slate-100"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-5 px-4 py-4 sm:grid-cols-3">
          {TIMELINE_SHORTCUTS.map((group) => (
            <section key={group.heading} className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {group.heading}
              </h3>
              <dl className="space-y-1.5">
                {group.bindings.map((binding) => (
                  <div
                    key={binding.keys}
                    className="flex items-start justify-between gap-3 text-xs"
                  >
                    <dd className="flex-1 text-slate-300">{binding.description}</dd>
                    <dt
                      className={cn(
                        'shrink-0 rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5',
                        'font-mono text-[10px] text-slate-200 shadow-inner',
                      )}
                    >
                      {binding.keys}
                    </dt>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
})
