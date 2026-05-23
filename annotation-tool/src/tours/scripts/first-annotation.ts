/**
 * Tour 1 — "First annotation in 90 seconds" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * The on-ramp tour: everything else in the menu assumes this much
 * familiarity. ≤ 7 steps, ≤ 15 words of narration per step.
 *
 * Anchored mode runs against the user's actual persona/video; steps
 * that require demo-seeded content are tagged requiresFixture so a
 * self-hoster running this against their own data sees a graceful
 * "demo content" inline note instead of a broken step.
 */

import type { TourScript } from '../engine/types'

export const firstAnnotationTour: TourScript = {
  id: 'first-annotation',
  title: 'First annotation in 90 seconds',
  description:
    'The on-ramp: pick a clip, pause anywhere, draw a box, assign a type. Annotations save as you go.',
  durationMinutes: 2,
  tags: ['annotation', 'video', 'getting-started'],
  fixtureBundle: 'tour-first-annotation',
  recap: 'You annotated a frame. The type list came from the active persona\'s ontology.',
  followUpTourId: 'ontology-authoring',
  steps: [
    {
      anchor: 'app-shell',
      narration:
        'Fovea organizes annotation around personas — perspectives on the same video.',
      expectAction: 'none',
    },
    {
      anchor: 'video-browser-card-first',
      narration: 'Each persona has its own video shelf. Pick one to start.',
      expectAction: 'click',
      requiresFixture: true,
    },
    {
      anchor: 'video-player-scrubber',
      narration: 'Standard player. Pause anywhere to annotate that frame.',
      expectAction: 'scrub',
    },
    {
      anchor: 'drawing-canvas',
      narration: 'Drag to draw a bounding box on the subject.',
      expectAction: 'draw',
    },
    {
      anchor: 'object-picker-popover',
      narration:
        'Tell Fovea what kind of thing it is. The list comes from this persona\'s ontology.',
      expectAction: 'click',
    },
    {
      anchor: 'timeline',
      narration: 'Your annotation lives on the timeline alongside others on this clip.',
      expectAction: 'none',
    },
    {
      anchor: 'save-indicator',
      narration: 'Saved. No submit button — Fovea persists as you go.',
      expectAction: 'none',
    },
  ],
}
