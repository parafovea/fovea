/**
 * CVPR 2026 demo landing page — the tile grid that visitors land on at
 * demo.fovea.video. Reuses the in-app `TourMenu` tile layout but in a
 * landing-page chrome (hero strip, footer) instead of a dialog.
 *
 * Launching a tile here delegates to a demo-mode-specific launcher that
 * seeds the appropriate fixture bundle via POST /api/demo/seed before
 * mounting the runner. Stock builds never render this page.
 *
 * See CVPR_2026_DEMO_PLAN.md §5 for the IA and layout rationale.
 */

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTour, builtInTours } from '@/tours'
import logo from '@/assets/fovea-logo.svg'
import { isPresenterMode, isSafeMode } from '../mode-flags'

export function DemoLandingPage() {
  const { launch } = useTour()
  const presenter = isPresenterMode()
  const safe = isSafeMode()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero strip — hidden in presenter mode for clean recordings. */}
      {!presenter && (
        <header className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Fovea Logo" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">FOVEA</h1>
                <p className="text-sm text-muted-foreground">
                  Persona-scoped, relational annotation for video.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {safe ? <Badge variant="outline">safe-mode</Badge> : null}
              <Badge variant="secondary">CVPR 2026 demo</Badge>
            </div>
          </div>
        </header>
      )}

      {/* Tour grid */}
      <main className="flex-1 mx-auto max-w-6xl px-6 py-8 w-full">
        {!presenter && (
          <h2 className="text-lg font-medium mb-4">Pick a tour to get started</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInTours
            // Safe mode hides the model-in-the-loop tile because that
            // tour requires live inference; the rest can run from
            // pre-recorded fixture data. Plan §9 risk 1.
            .filter((tour) => !safe || tour.id !== 'model-in-the-loop')
            .map((tour) => (
            <Card key={tour.id} data-tour-id={`demo-landing-tile-${tour.id}`}>
              <CardHeader>
                <CardTitle className="text-base">{tour.title}</CardTitle>
                <CardDescription>{tour.description}</CardDescription>
              </CardHeader>
              <CardFooter className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">~{tour.durationMinutes} min</Badge>
                  {tour.tags?.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
                <Button size="sm" onClick={() => launch(tour)}>
                  Start
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        {!presenter && (
          <p className="text-xs text-muted-foreground mt-6">
            Demo data resets every 10 minutes. Take a card on your way out for
            the link to your own workspace.
          </p>
        )}
      </main>

      {/* Footer — hidden in presenter mode. The attribution link is the
          CC-BY-NC-SA-required visible credit for the KEXP source clips
          (see docs/demo-attribution.md). Don't remove without re-sourcing. */}
      {!presenter && (
        <footer className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>fovea.video</span>
            <a
              href="/docs/demo-attribution"
              className="underline"
            >
              Video sources &amp; attribution
            </a>
            <span>Made for CVPR 2026.</span>
          </div>
        </footer>
      )}
    </div>
  )
}
