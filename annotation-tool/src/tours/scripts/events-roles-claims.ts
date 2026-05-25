/**
 * Tour 4 — "Beyond boxes: events, roles, and claims" (see plan §4).
 *
 * The CVPR-distinguishing tour: the relational/linguistic angle that
 * separates Fovea from an object-detection toolkit. Walks a visitor
 * from two bounding boxes → an event annotation → role assignments →
 * a derived claim → the claim graph.
 */

import type { TourScript } from '../engine/types'

export const eventsRolesClaimsTour: TourScript = {
  id: 'events-roles-claims',
  title: 'Beyond boxes: events, roles, and claims',
  description:
    'Box two people, declare an event between them, assign roles, watch Fovea derive a structured claim and graph it.',
  durationMinutes: 4,
  tags: ['events', 'roles', 'claims', 'graph'],
  fixtureBundle: 'tour-events-roles-claims',
  recap:
    'Fovea annotations are not labels on pixels — they are structured assertions about the world.',
  followUpTourId: 'world-layer',
  steps: [
    {
      anchor: 'drawing-canvas',
      narration: 'Box the performer.',
      expectAction: 'draw',
    },
    {
      anchor: 'object-picker-popover',
      narration: "Type: Person. Instance: 'Performer-1'.",
      expectAction: 'click',
    },
    {
      anchor: 'drawing-canvas',
      narration: 'Now box the audience member.',
      expectAction: 'draw',
    },
    {
      anchor: 'event-annotation-button',
      narration: "Create an Event annotation: 'Performance'.",
      expectAction: 'click',
      requiresFixture: true,
    },
    {
      anchor: 'role-assignment-panel',
      narration: 'Performer → bbox 1. Audience → bbox 2.',
      expectAction: 'click',
      requiresFixture: true,
    },
    {
      anchor: 'claim-editor',
      narration: "Fovea derives a claim: 'Performer-1 performs for Audience-1'.",
    },
    {
      anchor: 'claim-relations-viewer',
      narration:
        'Claims compose into a graph. Hover an entity to see all claims involving it.',
      expectAction: 'hover',
    },
  ],
}
