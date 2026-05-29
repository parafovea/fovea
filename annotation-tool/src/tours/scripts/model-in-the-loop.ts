/**
 * Tour 6 — "Model in the loop: detection, tracking, interpolation" (plan §4).
 *
 * The CV-credibility tour. Required at CVPR. Shows that Fovea has
 * actual model integration — tracker, interpolation, detection
 * candidates — and that every prediction is an editable annotation
 * rather than a black-box output.
 *
 * This is the only tour in the headline set that requires live
 * model-service inference. If model-service connectivity is flaky at
 * the booth, the menu hides this tile per the safe-mode strategy in
 * plan §9 risk 1.
 */

import type { TourScript } from '../engine/types'

export const modelInTheLoopTour: TourScript = {
  id: 'model-in-the-loop',
  title: 'Model in the loop: tracking, interpolation, detection',
  description:
    "Models propose; humans dispose. Track a bbox across the clip, edit the trajectory, accept detection candidates.",
  durationMinutes: 4,
  tags: ['model-service', 'tracking', 'interpolation', 'detection'],
  fixtureBundle: 'model-in-the-loop',
  recap:
    'Every prediction is an editable annotation, not a black-box output.',
  followUpTourId: 'summaries-and-claims',
  steps: [
    {
      anchor: 'quick-actions-track',
      narration: 'Fovea can extend this box across the clip with a tracker.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'tracking-results-panel',
      narration: 'Per-frame predictions, confidence scored.',
      requiresFixture: false,
    },
    {
      anchor: 'motion-path-overlay',
      narration: 'Trajectory visualized on the video.',
      expectAction: 'scrub',
      requiresFixture: false,
    },
    {
      anchor: 'interpolation-mode-selector',
      narration: 'Switch between linear and Bézier interpolation.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'bezier-curve-editor',
      narration: 'Drag handles to refine the path between keyframes.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'temporal-annotator',
      narration: 'Same machinery for events: mark start and end of an action.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'annotation-candidates-list',
      narration: 'Detection on a fresh frame surfaces candidate boxes for one-click acceptance.',
      expectAction: 'click',
      requiresFixture: false,
    },
  ],
}
