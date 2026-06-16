/**
 * StepCard — the narration card that floats next to the spotlight,
 * rendered with shadcn `Card` so it matches the rest of Fovea.
 *
 * Robustness contract:
 *   - role="dialog" with aria-labelledby + aria-describedby so screen
 *     readers announce each step on entry.
 *   - On step change, focus lands on the primary action button (Next /
 *     Skip / Finish) without scrolling the page — keyboard users can
 *     press Enter immediately without hunting for it. Tab/Shift+Tab
 *     cycle within the card via natural document order; we don't trap
 *     focus, because at a CVPR booth the visitor may want to tab into
 *     the spotlighted control mid-step.
 *   - Position is anchor-aware: prefer below the anchor, flip above if
 *     there's no room, fall back to bottom-center of the viewport if the
 *     anchor is null (resolving / missing). Repositions on window resize
 *     AND when the anchor moves — we observe via requestAnimationFrame
 *     while mounted, the same pattern SpotlightOverlay uses.
 *   - Keyboard hint footer (← → Esc) so the available shortcuts are
 *     discoverable without reading docs.
 */

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Pause, RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { TourScript } from './types'

const CARD_WIDTH = 360
const CARD_OFFSET = 16
// The card's rendered height varies with narration / body / banner /
// fixture-note text — empirically up to ~340 px on a step with all
// optional rows present. Earlier we used 220 which left the bottom of
// the card hanging off the viewport on long steps; the visitor saw
// the buttons clipped or scrolled out of reach. Over-estimate is safe
// (card simply sits a bit higher than strictly necessary); under-
// estimate is the demo-killer.
const CARD_HEIGHT_ESTIMATE = 360

interface StepCardProps {
  tour: TourScript
  stepIndex: number
  anchor: HTMLElement | null
  /** True when the engine is still resolving the anchor. */
  resolving: boolean
  /** Engine exposes both navigation actions and the kill-switch reset. */
  onBack: () => void
  onNext: () => void
  onSkipStep: () => void
  onSkipTour: () => void
  onRestart: () => void
  /** Optional pause affordance — when set, renders a Pause button. */
  onPause?: () => void
}

export function StepCard({
  tour,
  stepIndex,
  anchor,
  resolving,
  onBack,
  onNext,
  onSkipStep,
  onSkipTour,
  onRestart,
  onPause,
}: StepCardProps) {
  const step = tour.steps[stepIndex]
  const total = tour.steps.length
  const titleId = useId()
  const bodyId = useId()
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const position = useStepCardPosition(anchor)

  const cannotResolve = !resolving && !anchor
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1

  // Focus the primary action when the step changes. preventScroll keeps
  // the viewport from jumping — the spotlight does the scroll-into-view.
  useEffect(() => {
    const btn = primaryRef.current
    if (!btn) return
    try {
      btn.focus({ preventScroll: true })
    } catch {
      // Ignore — focus can throw if the button is briefly detached.
    }
  }, [stepIndex])

  return (
    <div
      ref={cardRef}
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
        // Click-through wrapper: only the inner <Card> + buttons take
        // pointer events. Without this, the card's bounding box absorbs
        // clicks meant for whatever UI is visually behind it — at a
        // CVPR booth, when the card's anchor-null fallback drops it on
        // top of the persona/type select combobox the visitor needs to
        // interact with for the highlighted step. Buttons inside the
        // Card explicitly re-enable pointer-events so navigation still
        // works.
        pointerEvents: 'none',
      }}
    >
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle id={titleId} className="text-base">
              {tour.title}
            </CardTitle>
            <span className="text-xs text-muted-foreground" aria-label={`Step ${stepIndex + 1} of ${total}`}>
              {stepIndex + 1} / {total}
            </span>
          </div>
        </CardHeader>
        <CardContent id={bodyId} className="pb-3 text-sm">
          <p>{step.narration}</p>
          {step.body ? (
            <p className="mt-2 text-muted-foreground text-xs">{step.body}</p>
          ) : null}
          {cannotResolve ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="status">
              Couldn't find this UI element; skip to continue.
            </p>
          ) : null}
          {step.requiresFixture ? (
            <p className="mt-2 text-xs text-muted-foreground italic">
              This step uses demo content.
            </p>
          ) : null}
        </CardContent>
        {/*
          The wrapper div carries pointer-events: none so the visitor
          can click controls visually behind the card. Each navigation
          button explicitly opts back in to pointer events via
          `pointer-events-auto` on its className — only the buttons
          themselves catch clicks; the surrounding padding stays
          click-through.
        */}
        <CardFooter className="flex items-center justify-between gap-2 pt-0">
          <div className="flex gap-1 pointer-events-auto">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Restart tour"
              onClick={onRestart}
            >
              <RotateCcw className="size-4" />
            </Button>
            {onPause ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Pause tour"
                data-fovea-tour-pause=""
                onClick={onPause}
              >
                <Pause className="size-4" />
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Exit tour"
              onClick={onSkipTour}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={onBack}
              disabled={isFirst}
            >
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

function computePosition(
  anchor: HTMLElement | null,
  vp: { width: number; height: number },
): Position {
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
    // Anchor is taller than the viewport (rare) — drop card at the
    // bottom-center fallback so it stays readable.
    top = Math.max(CARD_OFFSET, vp.height - CARD_HEIGHT_ESTIMATE - CARD_OFFSET)
  }
  let left = r.left + r.width / 2 - CARD_WIDTH / 2
  left = Math.max(CARD_OFFSET, Math.min(vp.width - CARD_WIDTH - CARD_OFFSET, left))
  // Hard guard: regardless of which branch we took above, never let
  // the card extend below the viewport. The branches use
  // CARD_HEIGHT_ESTIMATE which is conservative but not exact — a long
  // step with a wider-than-estimated body would still clip. Clamp
  // here so the card stays fully inside the viewport even in the
  // pathological case.
  top = Math.max(
    CARD_OFFSET,
    Math.min(top, vp.height - CARD_HEIGHT_ESTIMATE - CARD_OFFSET),
  )
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
