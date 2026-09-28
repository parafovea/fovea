/**
 * The "Keyframes and interpolation" tour.
 *
 * A temporal-modeling deep dive. Walks the visitor through what an
 * annotation is over time: a sparse set of keyframes, an interpolation
 * curve between them, and editor surfaces for both. Shows the manual
 * side of the tracking machinery, where a human author produces a
 * tracker-like sequence with the keyframe editor and the timeline
 * scrubber.
 *
 * Anchored on existing workspace surfaces (drawing canvas, the timeline
 * panel, the video scrubber) so the demo never lands on an
 * unimplemented panel. Content-neutral: it reuses the model-in-the-loop
 * video and its seeded multi-keyframe annotations so the running
 * example carries across.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildKeyframesInterpolationTour(c: TourModelInTheLoopContent): Tour {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'keyframes-interpolation',
    title: 'Keyframes and interpolation',
    description:
      'Annotation across time. Set sparse keyframes, pick an interpolation curve, edit the trajectory in place.',
    durationMinutes: 3,
    tags: ['temporal', 'keyframes', 'interpolation'],
    personaName: c.personaName,
    recap:
      'A temporal annotation is keyframes plus a curve. Both are editable. The model and the human use the same machinery.',
    followUpTourId: 'model-in-the-loop',
    startRoute: '/app',
    steps: [
      {
        anchor: 'drawing-canvas',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Three pre-tracked boxes are already on the canvas. Each annotation is a sequence over time. The canvas shows the box AT THE CURRENT FRAME, the timeline shows the keyframes that drive it.',
        expectAction: 'none',
      },
      {
        anchor: 'show-timeline-button',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration:
          'Select the first tracked annotation in the right sidebar, then open the timeline to see its keyframes.',
        expectAction: 'click',
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration:
          'Sparse keyframes are the rule, not the exception. A 30-second clip might have only five keyframes. The intermediate 895 frames are interpolated on demand.',
        expectAction: 'none',
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration:
          'Each interval between keyframes has its own interpolation curve: linear for steady motion, Bézier for shaped trajectories, parametric (gravity) for falling objects. Right-click a segment to pick.',
        expectAction: 'click',
      },
      {
        anchor: 'video-player-scrubber',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Scrub the playhead and the box follows the curve in real time. The same surface a tracker output lands on. The model and the human edit the same data structure. Nothing about an annotation is special because a model wrote it.',
        expectAction: 'scrub',
      },
    ],
  }
}
