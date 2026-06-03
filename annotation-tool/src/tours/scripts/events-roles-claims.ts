/**
 * Tour 4 — "Beyond boxes: events, roles, and claims" (see plan §4).
 *
 * The CVPR-distinguishing tour: the relational/linguistic angle that
 * separates Fovea from an object-detection toolkit. Walks a visitor
 * from two bounding boxes → an event annotation → role assignments →
 * a derived claim → the claim graph.
 *
 * Running example via TourContentBundle. Default: microvent's
 * LoanDepot Park Guest Services Usher persona walks through a ball-
 * grab incident from one of the Phillies-Karen clips — boxes Phillies
 * fan Karen, then the Phillies fan son, declares a ball-grab event,
 * assigns grabber + prior-holder roles. Admins for other domains
 * supply their own actors + event + roles.
 */

import type { TourScript } from '../engine/types'
import type { TourEventsRolesClaimsContent } from '../content/types'

export function buildEventsRolesClaimsTour(
  c: TourEventsRolesClaimsContent,
): TourScript {
  return {
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
        narration: `Box the ${c.firstActor.name}.`,
        expectAction: 'draw',
      },
      {
        anchor: 'object-picker-popover',
        narration: `Type: ${c.firstActor.name}. Instance: ${c.firstActor.name}-1.`,
        expectAction: 'click',
      },
      {
        anchor: 'drawing-canvas',
        narration: `Now box the ${c.secondActor.name}.`,
        expectAction: 'draw',
      },
      {
        anchor: 'event-annotation-button',
        narration: `Create an Event annotation: '${c.eventType.name}'.`,
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'role-assignment-panel',
        narration: `${c.firstRole.name} → bbox 1. ${c.secondRole.name} → bbox 2.`,
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'claim-editor',
        narration: `Fovea derives a claim: "${c.derivedClaimText}".`,
      },
      {
        anchor: 'claim-relations-viewer',
        narration:
          'Claims compose into a graph. Hover an entity to see all claims involving it.',
        expectAction: 'hover',
      },
    ],
  }
}
