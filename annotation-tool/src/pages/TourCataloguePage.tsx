/**
 * Public tour catalogue.
 *
 * Mounted as the `/` route when the deployment was built with
 * VITE_DEMO_PUBLIC=1 (intended for demo.fovea.video). Lets a QR-code
 * visitor see what FOVEA is by tapping any of the built-in tours
 * without signing in, registering, or hitting any server-side
 * surface. The tour engine intercepts model-service calls via MSW
 * (VITE_TOUR_DEMO=1 ships in the same build), so the whole experience
 * is statically served from nginx with no backend round-trips.
 *
 * Booth visitors who want to try the full app can click "Sign in" in
 * the header. Registration is hidden on this deployment per the
 * admin-only account policy (see ALLOW_REGISTRATION=false on the
 * backend, and the LoginPage conditional). To register a real user,
 * the operator uses the admin console's Create User dialog.
 */

import { Link } from 'react-router-dom'
import foveaLogo from '@/assets/fovea-logo.svg'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTour } from '@/tours'
import { defaultBuiltInTours } from '@/tours/scripts'

export function TourCataloguePage(): JSX.Element {
  const { launch } = useTour()
  const tours = defaultBuiltInTours
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={foveaLogo} alt="FOVEA logo" className="size-8" />
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold tracking-wide">FOVEA</span>
              <span className="text-xs text-muted-foreground">
                Flexible Ontology Visual Event Analyzer
              </span>
            </div>
          </div>
          <Link to="/login">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold mb-2">Guided tours</h1>
          <p className="text-muted-foreground">
            Pick a tour to walk through a piece of FOVEA on your own. Every
            tour runs locally in your browser; nothing is uploaded and no
            account is required.
          </p>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          data-testid="tour-catalogue-grid"
        >
          {tours.map((tour) => (
            <Card
              key={tour.id}
              data-tour-id={`tour-catalogue-tile-${tour.id}`}
              className="flex flex-col"
            >
              <CardHeader>
                <CardTitle className="text-base">{tour.title}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {tour.description}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-col items-stretch gap-2 mt-auto">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">~{tour.durationMinutes} min</Badge>
                  {tour.tags?.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => launch(tour)}
                  data-testid={`launch-${tour.id}`}
                >
                  Start
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>

      <footer className="border-t bg-card mt-12">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-muted-foreground flex items-center justify-between">
          <span>FOVEA &middot; Flexible Ontology Visual Event Analyzer</span>
          <a
            href="https://fovea.video"
            className="hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            fovea.video
          </a>
        </div>
      </footer>
    </div>
  )
}
