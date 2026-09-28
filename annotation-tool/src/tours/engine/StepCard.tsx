/**
 * The narration card that floats next to the spotlight, rendered with the
 * shared Card primitive so it matches the rest of the app.
 *
 * Behavior:
 *   - role="dialog" with aria-labelledby and aria-describedby so screen readers
 *     announce each step on entry.
 *   - On step change, focus lands on the primary action button (Next / Finish /
 *     Skip) without scrolling, so a keyboard user can press Enter immediately.
 *     Focus is not trapped, so the visitor can tab into the spotlighted control.
 *   - Position is anchor-aware: below the anchor by default, flipped above when
 *     there is no room, falling back to the bottom-center of the viewport when
 *     the anchor is null. Repositions on resize and as the anchor moves, via the
 *     same requestAnimationFrame loop the spotlight uses.
 *   - When the anchor cannot be resolved, the card shows a "Couldn't find this
 *     UI element" note and a Skip button in place of Next.
 *   - A keyboard-hint footer lists the available shortcuts.
 */

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Pause, RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { Tour } from './tourSchema'

const CARD_WIDTH = 360
const CARD_OFFSET = 16
/**
 * The card's rendered height varies with the narration, body, and missing-anchor
 * note. Over-estimating sits the card slightly higher than strictly necessary;
 * under-estimating clips the buttons off-screen, so this is deliberately
 * generous.
 */
const CARD_HEIGHT_ESTIMATE = 360

interface StepCardProps {
  tour: Tour
  index: number
  anchor: HTMLElement | null
  /** True while the engine is still resolving the anchor. */
  resolving: boolean
  onBack: () => void
  onNext: () => void
  onSkipStep: () => void
  onExit: () => void
  onRestart: () => void
  /** Pause the tour, when the host supports resuming it later. */
  onPause?: () => void
}

export function StepCard({
  tour,
  index,
  anchor,
  resolving,
  onBack,
  onNext,
  onSkipStep,
  onExit,
  onRestart,
  onPause,
}: StepCardProps) {
  const step = tour.steps[index]
  const total = tour.steps.length
  const titleId = useId()
  const bodyId = useId()
  const primaryRef = useRef<HTMLButtonElement | null>(null)

  const position = useStepCardPosition(anchor)

  const cannotResolve = !resolving && !anchor
  const isFirst = index === 0
  const isLast = index === total - 1

  // Focus the primary action when the step changes. preventScroll keeps the
  // viewport from jumping; the spotlight handles scroll-into-view.
  useEffect(() => {
    const btn = primaryRef.current
    if (!btn) return
    try {
      btn.focus({ preventScroll: true })
    } catch {
      // Focus can throw if the button is briefly detached; ignore.
    }
  }, [index, cannotResolve])

  return (
    <div
      data-fovea-tour-step-card=""
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: CARD_WIDTH,
        zIndex: 1001,
        // Only the inner Card and its buttons take pointer events, so clicks
        // meant for UI visually behind the card pass through. The buttons
        // re-enable pointer events so navigation still works.
        pointerEvents: 'none',
      }}
    >
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle id={titleId} className="text-base">
              {tour.title}
            </CardTitle>
            <span className="text-xs text-muted-foreground" aria-label={`Step ${index + 1} of ${total}`}>
              {index + 1} / {total}
            </span>
          </div>
        </CardHeader>
        <CardContent id={bodyId} className="pb-3 text-sm">
          <p>{step.narration}</p>
          {step.body ? <p className="mt-2 text-muted-foreground text-xs">{step.body}</p> : null}
          {cannotResolve ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="status">
              Couldn't find this UI element; skip to continue.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2 pt-0">
          <div className="flex gap-1 pointer-events-auto">
            <Button size="icon" variant="ghost" aria-label="Restart tour" onClick={onRestart}>
              <RotateCcw className="size-4" />
            </Button>
            {onPause ? (
              <Button size="icon" variant="ghost" aria-label="Pause tour" onClick={onPause}>
                <Pause className="size-4" />
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" aria-label="Exit tour" onClick={onExit}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <Button size="sm" variant="outline" onClick={onBack} disabled={isFirst}>
              Back
            </Button>
            {cannotResolve ? (
              <Button ref={primaryRef} size="sm" variant="secondary" onClick={onSkipStep}>
                Skip
              </Button>
            ) : (
              <Button ref={primaryRef} size="sm" onClick={onNext}>
                {isLast ? 'Finish' : 'Next'}
              </Button>
            )}
          </div>
        </CardFooter>
        <div
          className="px-6 pb-2 text-[10px] text-muted-foreground/80 flex items-center justify-between"
          aria-hidden="true"
        >
          <span>← → to navigate</span>
          <span>Esc to exit</span>
        </div>
      </Card>
    </div>
  )
}

interface Position {
  top: number
  left: number
}

function computePosition(anchor: HTMLElement | null, vp: { width: number; height: number }): Position {
  if (!anchor) {
    return {
      top: Math.max(CARD_OFFSET, vp.height - CARD_HEIGHT_ESTIMATE - CARD_OFFSET),
      left: Math.max(CARD_OFFSET, (vp.width - CARD_WIDTH) / 2),
    }
  }
  const r = anchor.getBoundingClientRect()
  const wantsBelow = r.bottom + CARD_HEIGHT_ESTIMATE + CARD_OFFSET < vp.height
  const wantsAbove = r.top - CARD_HEIGHT_ESTIMATE - CARD_OFFSET > 0
  let top: number
  if (wantsBelow) {
    top = r.bottom + CARD_OFFSET
  } else if (wantsAbove) {
    top = r.top - CARD_HEIGHT_ESTIMATE - CARD_OFFSET
  } else {
    // The anchor is taller than the viewport; drop the card at the
    // bottom-center fallback so it stays readable.
    top = Math.max(CARD_OFFSET, vp.height - CARD_HEIGHT_ESTIMATE - CARD_OFFSET)
  }
  let left = r.left + r.width / 2 - CARD_WIDTH / 2
  left = Math.max(CARD_OFFSET, Math.min(vp.width - CARD_WIDTH - CARD_OFFSET, left))
  // Never let the card extend below the viewport, whichever branch ran: the
  // height estimate is conservative but not exact, so clamp the bottom edge.
  top = Math.max(CARD_OFFSET, Math.min(top, vp.height - CARD_HEIGHT_ESTIMATE - CARD_OFFSET))
  return { top, left }
}

function useStepCardPosition(anchor: HTMLElement | null): Position {
  const [vp, setVp] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))
  const [position, setPosition] = useState<Position>(() =>
    computePosition(anchor, {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    }),
  )

  useEffect(() => {
    function onResize() {
      setVp({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    function tick() {
      if (cancelled) return
      setPosition((prev) => {
        const next = computePosition(anchor, vp)
        if (prev.top === next.top && prev.left === next.left) return prev
        return next
      })
      raf = window.requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
  }, [anchor, vp])

  return position
}
