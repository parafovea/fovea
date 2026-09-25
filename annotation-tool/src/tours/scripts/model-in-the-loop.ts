/**
 * The model-in-the-loop tour: tracking, interpolation, and on-demand
 * detection.
 *
 * Shows that every model prediction is an editable annotation rather than a
 * black-box output. The tracker propagates a single bounding box across the
 * clip, the timeline exposes the sparse keyframes and per-segment
 * interpolation curve, and the detector proposes fresh candidates the visitor
 * accepts or rejects.
 *
 * The narration is content-neutral (it describes model machinery, not subject
 * matter). The content bundle still carries a persona slot so a deployment can
 * attribute the running example to the right perspective for its domain.
 *
 * Steps targeting conditional workspace surfaces declare a `driver`: a
 * capability that seeds an annotation so the timeline and detection toolbars
 * mount, or runs detection so the candidates list populates. The engine
 * derives the click chain that opens each surface from the anchor catalog.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildModelInTheLoopTour(
  c: TourModelInTheLoopContent,
): Tour {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'model-in-the-loop',
    title: 'Model in the loop: tracking, interpolation, detection',
    description:
      'Models propose. Humans dispose. Track a bbox across the clip, edit the trajectory, accept detection candidates.',
    durationMinutes: 4,
    tags: ['model-service', 'tracking', 'interpolation', 'detection'],
    personaName: c.personaName,
    recap:
      'Every prediction is an editable annotation, not a black-box output.',
    followUpTourId: 'summaries-and-claims',
    startRoute: '/app',
    steps: [
      {
        anchor: 'drawing-canvas',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Three pre-tracked containers are already on the canvas from the SAMURAI tracker. Each was seeded by one initial bounding box. The tracker propagated across every frame.',
        expectAction: 'none',
      },
      {
        anchor: 'video-player-scrubber',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Scrub the playhead to watch each tracked bounding box stay locked to its container across the fall. Per-frame predictions interpolate between sparse keyframes.',
        expectAction: 'scrub',
      },
      {
        anchor: 'show-timeline-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "Open the timeline panel to see every annotation's keyframes laid out in time.",
        expectAction: 'click',
        driver: { capability: 'ensure-annotation-exists' },
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Sparse keyframes are the rule. Intermediate frames are interpolated. Linear by default. Switch to Bézier or parametric (e.g. gravity) per segment.',
        expectAction: 'none',
        driver: { capability: 'ensure-annotation-exists' },
      },
      {
        anchor: 'detect-objects-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Detection is on-demand: click to ask the model for fresh candidates on the current frame. The query is built from the active persona ontology.',
        expectAction: 'click',
        driver: { capability: 'ensure-annotation-exists' },
      },
      {
        anchor: 'annotation-candidates-list',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'The detector returned four candidates. Accept the two high-confidence containers, reject the two spurious boxes (a water splash and a piece of the gantry crane).',
        expectAction: 'click',
        driver: { capability: 'run-detection' },
      },
      {
        anchor: 'annotation-candidates-list',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "Snap each accepted box to a general type from your ontology: 'Shipping Container' (Wikidata Q987767). The QID travels with the annotation.",
        expectAction: 'click',
        driver: { capability: 'run-detection' },
      },
      {
        anchor: 'event-annotation-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'The same machinery extends to events. Mark the start and end of a Container Fall and the workspace tracks it as a temporal interval rather than a spatial region.',
        expectAction: 'click',
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'The gantry crane tracker drifted at frame 214; it briefly latched onto a water splash to the right. Click that keyframe in the timeline, drag the box back onto the crane, and the interpolation re-anchors the remaining frames automatically.',
        expectAction: 'click',
        driver: { capability: 'ensure-annotation-exists' },
      },
      {
        anchor: 'save-indicator',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Every correction persists as a normal annotation row. No special status for "human-corrected vs. model-produced"; the data model treats them identically.',
        expectAction: 'none',
      },
    ],
  }
}
