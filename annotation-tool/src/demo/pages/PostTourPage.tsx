/**
 * /done/:id — recap page shown after a tour completes. Per the plan
 * (§5.4 visitor flow), this is the conversion surface: recap, suggested
 * follow-up tour, email-capture, GitHub / paper link, and a nudge to
 * grab a printed business card.
 *
 * Email capture is intentionally minimal — a single input that posts
 * a hashed address to the telemetry endpoint. We never store the
 * plaintext address on the demo backend.
 */

import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { findTour, useTour } from '@/tours'

export function PostTourPage() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { launch } = useTour()

  const completed = params.id ? findTour(params.id) : undefined
  const followUp = completed?.followUpTourId ? findTour(completed.followUpTourId) : undefined

  if (!completed) {
    // Unknown tour id — bounce back to the menu rather than rendering a
    // broken recap card.
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>You finished: {completed.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {completed.recap ? (
            <p className="text-sm">{completed.recap}</p>
          ) : null}
          {followUp ? (
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground mb-1">Try next</p>
              <p className="font-medium">{followUp.title}</p>
              <p className="text-sm text-muted-foreground">{followUp.description}</p>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to menu
          </Button>
          {followUp ? (
            <Button onClick={() => launch(followUp)}>Start the next tour</Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  )
}
