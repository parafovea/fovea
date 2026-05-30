/**
 * Tour 4 — "Beyond boxes: events, roles, and claims" (see plan §4).
 *
 * The CVPR-distinguishing tour: the relational/linguistic angle that
 * separates Fovea from an object-detection toolkit. Walks a visitor
 * from two bounding boxes → an event annotation → role assignments →
 * a derived claim → the claim graph.
 *
 * Running example: a contested-ball incident at a baseball game (one
 * of the videos in the microvent demo set). The visitor boxes two
 * people, declares a "ball-grab" event between them, assigns
 * "grabber" + "prior-holder" roles, and Fovea derives the claim.
 */

import type { TourScript } from '../engine/types'

export const eventsRolesClaimsTour: TourScript = {
  id: 'events-roles-claims',
  title: 'Beyond boxes: events, roles, and claims',
  description:
    'Box two people, declare an event between them, assign roles, watch Fovea derive a structured claim and graph it.',
  durationMinutes: 4,
  tags: ['events', 'roles', 'claims', 'graph'],
  fixtureBundle: 'events-roles-claims',
  recap:
    'Fovea annotations are not labels on pixels — they are structured assertions about the world.',
  followUpTourId: 'world-layer',
  steps: [
    {
      anchor: 'drawing-canvas',
      narration: 'Box the person grabbing the ball.',
      expectAction: 'draw',
    },
    {
      anchor: 'object-picker-popover',
      narration: "Type: Person. Instance: 'fan-1'.",
      expectAction: 'click',
    },
    {
      anchor: 'drawing-canvas',
      narration: 'Now box the person who had the ball first.',
      expectAction: 'draw',
    },
    {
      anchor: 'event-annotation-button',
      narration: "Create an Event annotation: 'ball-grab'.",
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'role-assignment-panel',
      narration: 'grabber → bbox 1. prior-holder → bbox 2.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'claim-editor',
      narration: "Fovea derives a claim: 'fan-1 grabbed the ball from fan-2'.",
    },
    {
      anchor: 'claim-relations-viewer',
      narration:
        'Claims compose into a graph. Hover an entity to see all claims involving it.',
      expectAction: 'hover',
    },
  ],
}
