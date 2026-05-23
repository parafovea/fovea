/**
 * StepCard — the narration card that floats next to the spotlight,
 * rendered with shadcn `Card` so it matches the rest of Fovea.
 *
 * Positioning is intentionally simple: prefer below the anchor, flip
 * above if there's no room, fall back to the bottom-center of the
 * viewport if the anchor is null (e.g. the engine is waiting on a
 * lazily-mounted element). The complex part of guided-tour UI is
 * usually anchor-tracking, which `SpotlightOverlay` already handles.
 */

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TourScript } from './types'

const CARD_WIDTH = 360
const CARD_OFFSET = 16

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

  const position = useStepCardPosition(anchor)

  const cannotResolve = !resolving && !anchor
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1

  return (
    <div
      data-fovea-tour-step-card=""
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
            <CardTitle className="text-base">{tour.title}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {stepIndex + 1} / {total}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pb-3 text-sm">
          <p>{step.narration}</p>
          {step.body ? (
            <p className="mt-2 text-muted-foreground text-xs">{step.body}</p>
          ) : null}
          {cannotResolve ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
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
              <Button size="sm" variant="secondary" onClick={onSkipStep}>
                Skip
              </Button>
            ) : (
              <Button size="sm" onClick={onNext}>
                {isLast ? 'Finish' : 'Next'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

function useStepCardPosition(anchor: HTMLElement | null) {
  const [vp, setVp] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    function onResize() {
      setVp({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return useMemo(() => {
    if (!anchor) {
      // Bottom-center fallback while resolving / on missing anchor.
      return {
        top: vp.height - 220,
        left: (vp.width - CARD_WIDTH) / 2,
      }
    }
    const r = anchor.getBoundingClientRect()
    const cardHeight = 200 // approximate; positioning is forgiving
    const wantsBelow = r.bottom + cardHeight + CARD_OFFSET < vp.height
    const top = wantsBelow
      ? r.bottom + CARD_OFFSET
      : Math.max(CARD_OFFSET, r.top - cardHeight - CARD_OFFSET)
    let left = r.left + r.width / 2 - CARD_WIDTH / 2
    left = Math.max(CARD_OFFSET, Math.min(vp.width - CARD_WIDTH - CARD_OFFSET, left))
    return { top, left }
  }, [anchor, vp])
}
