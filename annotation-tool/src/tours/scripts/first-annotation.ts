/**
 * The "First annotation in 90 seconds" on-ramp tour.
 *
 * The shortest path to a saved annotation: pick a clip, pause anywhere,
 * draw a box, assign a type. Everything else in the menu assumes this
 * much familiarity, so the steps stay short (a phrase of narration each)
 * and land on always-mounted workspace surfaces.
 *
 * The narration's example type-name and persona-name come from the
 * deployment's content bundle (default: microvent, see
 * ../content/microvent.ts). An admin tailoring tours for a different
 * domain supplies a different bundle. The `videoId` the workspace steps
 * route to is resolved from the bundle's configured video filename, so
 * pointing the bundle at a clip in another corpus retargets the tour.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourFirstAnnotationContent } from '../content/types'

export function buildFirstAnnotationTour(content: TourFirstAnnotationContent): Tour {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: content.videoId }
  return {
    id: 'first-annotation',
    title: 'First annotation in 90 seconds',
    description:
      'The on-ramp: pick a clip, pause anywhere, draw a box, assign a type. Annotations save as you go.',
    durationMinutes: 2,
    tags: ['annotation', 'video', 'getting-started'],
    startRoute: '/app',
    personaName: content.personaName,
    recap: "You annotated a frame. The type list came from the active persona's ontology.",
    followUpTourId: 'ontology-authoring',
    steps: [
      {
        anchor: 'app-shell',
        route: '/app',
        narration: 'Fovea organizes annotation around personas. Perspectives on the same video.',
        expectAction: 'none',
      },
      {
        anchor: 'video-browser-root',
        route: '/app',
        narration: `As the ${content.personaName}, pick a clip from your shelf to start.`,
        expectAction: 'click',
      },
      {
        anchor: 'video-player-scrubber',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Standard player. Pause anywhere to annotate that frame.',
        expectAction: 'scrub',
      },
      {
        anchor: 'drawing-canvas',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Drag to draw a bounding box on the subject.',
        expectAction: 'draw',
      },
      {
        anchor: 'type-assignment-picker',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `Assign type "${content.entityType.name}". The list comes from this persona's ontology.`,
        expectAction: 'click',
      },
      {
        anchor: 'timeline',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Your annotation lives on the timeline alongside others on this clip.',
        expectAction: 'none',
      },
      {
        anchor: 'save-indicator',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Saved. No submit button; Fovea persists as you go.',
        expectAction: 'none',
      },
    ],
  }
}
