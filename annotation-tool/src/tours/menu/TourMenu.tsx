/**
 * TourMenu — the in-app tour catalog. Renders as a dialog with one
 * shadcn `Card` per available tour. Used both inside Fovea (for
 * self-hosters whose admins enabled the tour-menu setting) and on
 * the demo landing page (which mounts the same component with a
 * different surrounding layout).
 *
 * The component is *display-only*: launching a tour is delegated up to
 * the caller via `onLaunch` so the demo-mode landing can apply its
 * extra fixture-seeding logic without forking this file.
 */

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { defaultBuiltInTours } from '../scripts'
import type { Tour } from '../engine'

interface TourMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tours?: readonly Tour[]
  onLaunch: (tour: Tour) => void
}

export function TourMenu({ open, onOpenChange, tours, onLaunch }: TourMenuProps) {
  const list = tours ?? defaultBuiltInTours
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Guided tours</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((tour) => (
            <Card key={tour.id}>
              <CardHeader>
                <CardTitle className="text-base">{tour.title}</CardTitle>
                <CardDescription>{tour.description}</CardDescription>
              </CardHeader>
              <CardFooter className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">~{tour.durationMinutes} min</Badge>
                  {tour.tags?.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onLaunch(tour)
                    onOpenChange(false)
                  }}
                >
                  Start
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
