/**
 * Floating readout shown above a bounding box during drag / resize.
 *
 * Displays ``W × H`` and ``x, y`` in tabular-nums monospace so the values
 * never jitter as the dimensions update. Positioned inside a ``foreignObject``
 * by :class:`InteractiveBoundingBox` so it scrolls with the SVG viewport
 * rather than floating above it in screen space.
 */

import type { FC } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  width: number
  height: number
  x: number
  y: number
  /** When true, pin the HUD to the bottom edge of the bounding box. */
  anchor?: 'top' | 'bottom'
  /** Accent color matching the bounding box stroke. */
  accent?: string
}

export const BoundingBoxHUD: FC<Props> = ({
  width,
  height,
  x,
  y,
  anchor = 'top',
  accent = '#e2e8f0',
}) => {
  return (
    <div
      data-slot="bounding-box-hud"
      className={cn(
        'pointer-events-none inline-flex items-center gap-1.5 px-2 py-1',
        'rounded-md border border-white/10 bg-slate-950/90 shadow-lg backdrop-blur',
        'font-mono text-[11px] tabular-nums text-slate-100',
        anchor === 'top' ? 'mb-1' : 'mt-1',
      )}
      style={{ borderColor: `${accent}66` }}
    >
      <span>
        {Math.round(width)}
        <span className="mx-0.5 text-slate-500">×</span>
        {Math.round(height)}
      </span>
      <span className="size-1 rounded-full bg-slate-600" aria-hidden />
      <span className="text-slate-300">
        {Math.round(x)}
        <span className="mx-0.5 text-slate-500">,</span>
        {Math.round(y)}
      </span>
    </div>
  )
}
