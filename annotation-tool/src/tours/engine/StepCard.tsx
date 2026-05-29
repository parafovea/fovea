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
import { RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { TourScript } from './types'

const CARD_WIDTH = 360
const CARD_OFFSET = 16
const CARD_HEIGHT_ESTIMATE = 220

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
              Couldn't find this UI element — skip to continue.
            </p>
          ) : null}
          {step.requiresFixture ? (
            <p className="mt-2 text-xs text-muted-foreground italic">
              This step uses demo content.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2 pt-0">
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Restart tour"
              onClick={onRestart}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Exit tour"
              onClick={onSkipTour}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
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
