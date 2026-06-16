/**
 * Tour 4 — "Beyond boxes: events, roles, and claims" (see plan §4).
 *
 * The CVPR-distinguishing tour: the relational/linguistic angle that
 * separates Fovea from an object-detection toolkit. Walks a visitor
 * from spatial tracking (drawing-canvas) → the type/object toolbar
 * mode toggle → an event annotation → role assignments → a derived
 * claim → and finally a full hands-on of the rich-text GLOSS
 * reference system inside the ClaimEditor (typing '#TypeName' /
 * '@ObjectName' / '^claim-id' with the autocomplete popup firing
 * and the user picking a real ontology / world / claim entry).
 *
 * Running example via TourContentBundle. Default: microvent's
 * LoanDepot Park Guest Services Usher persona walks through a ball-
 * grab incident from one of the Phillies-Karen clips. Admins for
 * other domains supply their own actors + event + roles in
 * TourEventsRolesClaimsContent.
 *
 * Anchored on existing workspace surfaces so the demo never lands
 * on an unimplemented panel. drawing-canvas (where actors are
 * tracked). Event-annotation-button (the Type/Object toolbar
 * toggle, always mounted on the workspace toolbar). Role-
 * assignment-panel. Show-timeline-button. Edit-summary-button +
 * video-summary-editor (in a Dialog). Summary-tab-claims +
 * add-manual-claim-button (in the same Dialog). Claim-editor (in
 * a child Dialog). Gloss-editor (the rich-text input where the
 * '#', '@', and '^' trigger characters fire the autocomplete
 * popup the visitor sees in action).
 */

import type { TourScript } from '../engine/types'
import type { TourEventsRolesClaimsContent } from '../content/types'

export function buildEventsRolesClaimsTour(
  c: TourEventsRolesClaimsContent,
): TourScript {
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
    fixtureBundle: 'events-roles-claims',
    personaName: c.personaName,
    startRoute: '/app',
    recap:
      'Fovea annotations are not labels on pixels. They are structured assertions about the world.',
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
        // Rewrite of the original `object-picker-popover` step.
        // The popover only mounts when an annotation is selected
        // with the type-assignment popover open, which is fragile
        // in a fixture-free demo. The Type/Object toolbar toggle
        // is the always-mounted entry point to typing — it lives
        // on the workspace toolbar, gates the type-assignment
        // popover, and is the same control a real analyst uses
        // before they pick from the persona's ontology.
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
        narration: `Bind the event's roles to specific entity annotations: ${c.firstRole.name} → ${c.firstActor.name}, ${c.secondRole.name} → ${c.secondActor.name}. Roles are the relational glue between events and the actors that play them.`,
        expectAction: 'click',
      },
      {
        anchor: 'show-timeline-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Open the timeline to see the event interval alongside the spatial annotations. Same canvas, one extra row for the event.',
        expectAction: 'click',
      },
      {
        anchor: 'edit-summary-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `From this typed event + role structure Fovea derives a structured claim: "${c.derivedClaimText}". Open the summary editor to view, edit, or extract more claims.`,
        expectAction: 'click',
      },
      {
        anchor: 'video-summary-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        // The summary editor lives inside a Dialog that
        // edit-summary-button opens. revealBy is idempotent, so
        // re-clicking the button on re-entry is harmless.
        revealBy: 'edit-summary-button',
        narration:
          'Each derived claim links back to the event annotation that produced it and the role bindings that fill its argument slots.',
        expectAction: 'none',
      },
      // Gloss-reference showcase lives in Tour 2 (ontology-authoring)
      // where humanType fires the autocomplete popup inside an
      // EntityTypeEditor dialog. Duplicating that walk-through here
      // chains two Radix dialogs deep (VideoSummaryEditor →
      // ClaimEditor) and the engine's revealBy chain raced the
      // second dialog's mount window. The gloss-editor anchor inside
      // the inner ClaimEditor did not consistently appear inside
      // waitForAnchor's ceiling. The Tour 2 path is the canonical
      // demonstration; this tour keeps its focus on
      // event/role/claim derivation and ends at the summary editor.
      {
        anchor: 'summary-tab-claims',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: 'edit-summary-button',
        narration:
          'Switch to the Claims tab. Each derived claim links back to its source event annotation and role bindings. The analyst can edit, accept, or reject from here.',
        expectAction: 'click',
      },
      {
        anchor: 'add-manual-claim-button',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: ['edit-summary-button', 'summary-tab-claims'],
        narration:
          'Add a manual claim by hand to compose a new structured assertion. The claim editor that opens is where the rich-text reference system shines: type # for a type, @ for a world object, ^ for another claim.',
        expectAction: 'click',
      },
      {
        // Outer Dialog (VideoSummaryEditor) stays open under demo-mode
        // modal=false; the inner Dialog (ClaimEditor) opens onto its
        // own portal sibling. The revealBy chain clicks the manual-
        // claim FAB inside the open summary editor; the engine waits
        // for the gloss-editor anchor inside the freshly-mounted
        // claim editor. The 200 ms PER_LINK_SETTLE between clicks is
        // enough for base-ui's Dialog enter animation to commit and
        // the GlossEditor child to mount.
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        revealBy: ['edit-summary-button', 'summary-tab-claims', 'add-manual-claim-button'],
        typeText: `#${firstActorPrefix}`,
        narration:
          "Type # in any gloss field to reference an entity TYPE from the persona's ontology. The autocomplete popup mounts as you type. A filtered list of matching types ranked by what you typed.",
        expectAction: 'type',
      },
      {
        // Anchor on gloss-editor (same as step 10) rather than the
        // popup itself. The autocomplete popup mounts during step 10's
        // humanType, but the engine's step-transition + the visitor's
        // Next press race the popup's mount commit by a few hundred
        // milliseconds; over a slow Wi-Fi link the popup can briefly
        // disappear before the step-11 anchor poll fires, which would
        // surface a missing-anchor banner on a step whose only job is
        // to narrate "pick from the popup". The narration still
        // describes the popup beat; the anchor stays on the gloss
        // editor itself, which is reliably mounted because the dialog
        // remains open.
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `Pick '${c.firstActor.name}' from the popup. The reference renders as a styled Badge inline, italic and primary-coloured. The structured link travels with the gloss across exports and persona forks.`,
        expectAction: 'none',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        typeText: ` took the ball during the @${eventTypePrefix}`,
        narration:
          "Type @ to reference a world OBJECT. A specific entity instance, location, or event instance. Object references resolve against the persona's world workspace, not the ontology.",
        expectAction: 'type',
      },
      {
        anchor: 'gloss-editor',
        route: annotateRoute,
        routeParams: annotateParams,
        typeText: ' as established in ^',
        narration:
          "Type ^ to reference another CLAIM. Chains of beliefs become queryable: 'show me every claim X believes that Y disputes'. The claim graph the analyst is composing right now.",
        expectAction: 'type',
      },
      {
        anchor: 'gloss-preview',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          "References render as colour-coded badges. Types in primary, objects in secondary, claims in blue. The preview reflects the structured gloss exactly as it'll show up everywhere the claim is cited.",
        expectAction: 'none',
      },
    ],
  }
}
