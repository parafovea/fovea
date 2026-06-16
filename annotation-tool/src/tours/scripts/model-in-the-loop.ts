/**
 * Tour 6 — "Model in the loop: detection, tracking, interpolation" (plan §4).
 *
 * The CV-credibility tour. Required at CVPR. Shows that Fovea has
 * actual model integration — tracker, interpolation, detection
 * candidates — and that every prediction is an editable annotation
 * rather than a black-box output.
 *
 * The tour's narration is content-neutral (it's about model machinery,
 * not specific subject matter). The TourContentBundle still carries
 * a persona slot so admins can attribute the prerequisite annotation
 * to the right perspective for their domain.
 *
 * Anchored on existing workspace surfaces: drawing-canvas (always
 * present), video-player-scrubber, detect-objects-button +
 * annotation-candidates-list (on-demand detection), show-timeline-
 * button + timeline-panel (keyframe + interpolation surface), and
 * event-annotation-button. Visitors with workspace fixtures see the
 * pre-seeded annotations Fovea's tracker produced for the demo
 * video.
 */

import type { TourScript } from '../engine/types'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildModelInTheLoopTour(
  c: TourModelInTheLoopContent,
): TourScript {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'model-in-the-loop',
    title: 'Model in the loop: tracking, interpolation, detection',
    description:
      'Models propose. Humans dispose. Track a bbox across the clip, edit the trajectory, accept detection candidates.',
    durationMinutes: 4,
    tags: ['model-service', 'tracking', 'interpolation', 'detection'],
    fixtureBundle: 'model-in-the-loop',
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
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: 'show-timeline-button',
        narration:
          'Sparse keyframes are the rule. Intermediate frames are interpolated. Linear by default. Switch to Bézier or parametric (e.g. gravity) per segment.',
        expectAction: 'none',
      },
      {
        anchor: 'detect-objects-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Detection is on-demand: click to ask the model for fresh candidates on the current frame. The query is built from the active persona ontology.',
        expectAction: 'click',
      },
      {
        anchor: 'annotation-candidates-list',
        route: annotateRoute,
        routeParams: annotateParams,
        // The candidates list only mounts AFTER the detection API
        // call resolves. Step 5's expectAction='click' on
        // detect-objects-button merely OPENS the DetectionDialog;
        // the visitor (or the engine, in demo mode) still has to
        // click 'Run Detection' inside the dialog to fire the
        // mutation. Without that second click the candidates list
        // never mounts and the missing-anchor banner paints. So the
        // revealBy chain ensures both clicks happen: open the
        // dialog, then run the detection. The engine short-circuits
        // the chain when the anchor is already mounted, so a
        // forward step from step 6 → 7 is a no-op (dialog stays
        // open, candidates list stays rendered).
        revealBy: ['detect-objects-button', 'detect-dialog-run-button'],
        narration:
          'The detector returned four candidates. Accept the two high-confidence containers, reject the two spurious boxes (a water splash and a piece of the gantry crane).',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'annotation-candidates-list',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: ['detect-objects-button', 'detect-dialog-run-button'],
        narration:
          "Snap each accepted box to a general type from your ontology: 'Shipping Container' (Wikidata Q987767). The QID travels with the annotation.",
        expectAction: 'click',
        requiresFixture: false,
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
        revealBy: 'show-timeline-button',
        narration:
          'The gantry crane tracker drifted at frame 214; it briefly latched onto a water splash to the right. Click that keyframe in the timeline, drag the box back onto the crane, and the interpolation re-anchors the remaining frames automatically.',
        expectAction: 'click',
        requiresFixture: false,
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
