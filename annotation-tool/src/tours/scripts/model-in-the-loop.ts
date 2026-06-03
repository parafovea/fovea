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
 */

import type { TourScript } from '../engine/types'
import type { TourModelInTheLoopContent } from '../content/types'

export function buildModelInTheLoopTour(
  c: TourModelInTheLoopContent,
): TourScript {
  void c
  return {
    id: 'model-in-the-loop',
    title: 'Model in the loop: tracking, interpolation, detection',
    description:
      'Models propose; humans dispose. Track a bbox across the clip, edit the trajectory, accept detection candidates.',
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
        narration:
          "Detection on a fresh frame surfaces candidate boxes for one-click acceptance. The model returned four; accept the two high-confidence containers and reject the two spurious boxes (a water splash and a piece of the gantry crane).",
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'annotation-candidates-list',
        narration:
          "Snap each accepted box to a general type from your ontology: 'container' (Wikidata Q987767). The Wikidata link travels with the annotation.",
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'tracking-results-panel',
        narration:
          "The tracker drifted at frame 214: it latched onto the receding splash to the right. Scrub to the flagged keyframe and drag the box back onto the pile of containers. The interpolation re-anchors the remaining frames.",
        expectAction: 'click',
        requiresFixture: false,
      },
    ],
  }
}
