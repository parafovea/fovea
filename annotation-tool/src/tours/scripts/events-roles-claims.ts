/**
 * "Beyond boxes: events, roles, and claims" — the relational and linguistic
 * angle that separates Fovea from an object-detection toolkit.
 *
 * Walks a visitor from spatial tracking on the drawing canvas, through the
 * Type/Object toolbar toggle, an event annotation, role assignments, and a
 * derived claim, to a hands-on of the rich-text gloss reference system inside
 * the claim editor (typing `#TypeName` / `@ObjectName` / `^claim-id` so the
 * autocomplete popup fires and the visitor picks a real ontology, world, or
 * claim entry).
 *
 * Content comes from `TourEventsRolesClaimsContent`, so a deployment retheme
 * the running example (actors, event, roles) without touching anchors.
 */

import type { TourEventsRolesClaimsContent } from '../content/types'
import type { Tour } from '../engine/tourSchema'

export function buildEventsRolesClaimsTour(c: TourEventsRolesClaimsContent): Tour {
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  const firstActorPrefix = c.firstActor.name.slice(0, 3)
  const eventTypePrefix = c.eventType.name.slice(0, 3)
  return {
    id: 'events-roles-claims',
    title: 'Beyond boxes: events, roles, and claims',
    description:
      'Box two people, declare an event between them, assign roles, watch Fovea derive a structured claim and graph it.',
    durationMinutes: 5,
    tags: ['events', 'roles', 'claims', 'graph', 'gloss'],
    personaName: c.personaName,
    startRoute: '/app',
    recap: 'Fovea annotations are not labels on pixels. They are structured assertions about the world.',
    followUpTourId: 'world-layer',
    steps: [
      {
        anchor: 'drawing-canvas',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `The drawing canvas is the spatial layer: actors like '${c.firstActor.name}' and '${c.secondActor.name}' are bounding boxes anchored here and carried forward across frames.`,
        expectAction: 'none',
      },
      {
        anchor: 'event-annotation-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `Toggle between Type mode (assign a persona ontology type to a box) and Object mode (link the box to a world instance). '${c.firstActor.name}' is the type. The role each actor plays in an event is a separate layer.`,
        expectAction: 'none',
      },
      {
        anchor: 'event-annotation-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `Switch the toolbar from Type mode to Object mode and add an Event annotation: '${c.eventType.name}'. The event sits ON the timeline as a temporal interval, not on the canvas.`,
        expectAction: 'click',
      },
      {
        anchor: 'role-assignment-panel',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration: `Bind the event's roles to specific entity annotations: ${c.firstRole.name} → ${c.firstActor.name}, ${c.secondRole.name} → ${c.secondActor.name}. Roles are the relational glue between events and the actors that play them.`,
        expectAction: 'click',
      },
      {
        anchor: 'show-timeline-button',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration:
          'Open the timeline to see the event interval alongside the spatial annotations. Same canvas, one extra row for the event.',
        expectAction: 'click',
      },
      {
        anchor: 'edit-summary-button',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'ensure-annotation-exists' },
        narration: `From this typed event + role structure Fovea derives a structured claim: "${c.derivedClaimText}". Open the summary editor to view, edit, or extract more claims.`,
        expectAction: 'click',
      },
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-summary-editor' },
        narration:
          'Each derived claim links back to the event annotation that produced it and the role bindings that fill its argument slots.',
        expectAction: 'none',
      },
      {
        anchor: 'summary-tab-claims',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-summary-editor' },
        narration:
          'Switch to the Claims tab. Each derived claim links back to its source event annotation and role bindings. The analyst can edit, accept, or reject from here.',
        expectAction: 'click',
      },
      {
        anchor: 'add-manual-claim-button',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-summary-editor' },
        narration:
          'Add a manual claim by hand to compose a new structured assertion. The claim editor that opens is where the rich-text reference system shines: type # for a type, @ for a world object, ^ for another claim.',
        expectAction: 'click',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-claim-editor-with-gloss' },
        typeText: `#${firstActorPrefix}`,
        narration:
          "Type # in any gloss field to reference an entity TYPE from the persona's ontology. The autocomplete popup mounts as you type. A filtered list of matching types ranked by what you typed.",
        expectAction: 'type',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-claim-editor-with-gloss' },
        narration: `Pick '${c.firstActor.name}' from the popup. The reference renders as a styled Badge inline, italic and primary-coloured. The structured link travels with the gloss across exports and persona forks.`,
        expectAction: 'none',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-claim-editor-with-gloss' },
        typeText: ` took the ball during the @${eventTypePrefix}`,
        narration:
          "Type @ to reference a world OBJECT. A specific entity instance, location, or event instance. Object references resolve against the persona's world workspace, not the ontology.",
        expectAction: 'type',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-claim-editor-with-gloss' },
        typeText: ' as established in ^',
        narration:
          "Type ^ to reference another CLAIM. Chains of beliefs become queryable: 'show me every claim X believes that Y disputes'. The claim graph the analyst is composing right now.",
        expectAction: 'type',
      },
      {
        anchor: 'gloss-preview',
        route: annotateRoute,
        routeParams: annotateParams,
        driver: { capability: 'open-claim-editor-with-gloss' },
        narration:
          "References render as colour-coded badges. Types in primary, objects in secondary, claims in blue. The preview reflects the structured gloss exactly as it'll show up everywhere the claim is cited.",
        expectAction: 'none',
      },
    ],
  }
}
