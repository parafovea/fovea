/**
 * Tour 11 — "Working with longer videos: keyframes and interpolation".
 *
 * Temporal-modeling deep dive. Walks the visitor through what an
 * annotation actually IS over time: a sparse set of keyframes, an
 * interpolation curve between them, and editor surfaces for both.
 * Complements Tour 6 (model-in-the-loop) by showing the manual side
 * of the same machinery: a human author can ALSO produce a tracker-
 * like sequence with the keyframe editor + the timeline scrubber.
 *
 * Anchored on existing workspace surfaces (drawing-canvas, the
 * annotation-list-first sidebar item used to select a tracked box,
 * the timeline panel reachable via show-timeline-button, video-
 * player-scrubber, save-indicator) so the demo never lands on an
 * unimplemented panel. Content-neutral; reuses the same modelInTheLoop
 * video and its three seeded multi-keyframe annotations so the
 * running example carries across.
 */

import type { TourScript } from '../engine/types'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildKeyframesInterpolationTour(
  c: TourModelInTheLoopContent,
): TourScript {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'keyframes-interpolation',
    title: 'Keyframes and interpolation',
    description:
      'Annotation across time. Set sparse keyframes, pick an interpolation curve, edit the trajectory in place.',
    durationMinutes: 3,
    tags: ['temporal', 'keyframes', 'interpolation'],
    fixtureBundle: 'keyframes-interpolation',
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
        requiresFixture: true,
      },
      {
        anchor: 'show-timeline-button',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: 'annotation-list-first',
        narration:
          'Select the first tracked annotation in the right sidebar, then open the timeline to see its keyframes.',
        expectAction: 'click',
        requiresFixture: true,
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: ['annotation-list-first', 'show-timeline-button'],
        narration:
          'Sparse keyframes are the rule, not the exception. A 30-second clip might have only five keyframes. The intermediate 895 frames are interpolated on demand.',
        expectAction: 'none',
        requiresFixture: true,
      },
      {
        anchor: 'timeline-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: ['annotation-list-first', 'show-timeline-button'],
        narration:
          'Each interval between keyframes has its own interpolation curve: linear for steady motion, Bézier for shaped trajectories, parametric (gravity) for falling objects. Right-click a segment to pick.',
        expectAction: 'click',
        requiresFixture: true,
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
