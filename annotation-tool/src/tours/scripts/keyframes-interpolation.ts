/**
 * Tour 11 - "Working with longer videos: keyframes and interpolation".
 *
 * Temporal-modeling deep dive. Walks the visitor through what an
 * annotation actually IS over time: a sparse set of keyframes, an
 * interpolation curve between them, and editor surfaces for both.
 * Complements Tour 6 (model-in-the-loop) by showing the manual side
 * of the same machinery: a human author can ALSO produce a tracker-
 * like sequence with the keyframe + curve editor.
 *
 * Content-neutral. Uses the same modelInTheLoop video as Tour 6 so
 * the running example carries across.
 */

import type { TourScript } from '../engine/types'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildKeyframesInterpolationTour(
  c: TourModelInTheLoopContent,
): TourScript {
  void c
  return {
    id: 'keyframes-interpolation',
    title: 'Keyframes and interpolation',
    description:
      'Annotation across time. Set sparse keyframes, pick an interpolation curve, edit the trajectory in place.',
    durationMinutes: 3,
    tags: ['temporal', 'keyframes', 'interpolation'],
    fixtureBundle: 'keyframes-interpolation',
    recap:
      'A temporal annotation is keyframes plus a curve. Both are editable; the model and the human use the same machinery.',
    followUpTourId: 'model-in-the-loop',
    steps: [
      {
        anchor: 'timeline-panel',
        narration:
          'The timeline shows every keyframe on the active annotation. Sparse keyframes are the rule, not the exception.',
      },
      {
        anchor: 'interpolation-mode-selector',
        narration:
          'Pick an interpolation curve between keyframes: linear for steady motion, Bezier for shaped trajectories.',
        expectAction: 'click',
      },
      {
        anchor: 'bezier-curve-editor',
        narration:
          'Drag the curve handles to shape the path between keyframes. The bounding box on every intermediate frame follows the curve in real time.',
        expectAction: 'click',
      },
      {
        anchor: 'motion-path-overlay',
        narration:
          'The motion path overlay visualises the curve on the video. Scrub to confirm the trajectory tracks the subject.',
        expectAction: 'scrub',
        requiresFixture: false,
      },
      {
        anchor: 'timeline-panel',
        narration:
          'Same surface a tracker output lands on. The model and the human edit the same data structure; nothing about an annotation is special because a model wrote it.',
      },
    ],
  }
}
