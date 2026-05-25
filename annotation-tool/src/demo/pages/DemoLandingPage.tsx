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

export function DemoLandingPage() {
  const { launch } = useTour()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero strip */}
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
          <Badge variant="secondary">CVPR 2026 demo</Badge>
        </div>
      </header>

      {/* Tour grid */}
      <main className="flex-1 mx-auto max-w-6xl px-6 py-8 w-full">
        <h2 className="text-lg font-medium mb-4">Pick a tour to get started</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInTours.map((tour) => (
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
        <p className="text-xs text-muted-foreground mt-6">
          Demo data resets every 10 minutes. Take a card on your way out for
          the link to your own workspace.
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>fovea.video</span>
          <span>Made for CVPR 2026.</span>
        </div>
      </footer>
    </div>
  )
}
