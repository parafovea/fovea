/**
 * Tour 1 — "First annotation in 90 seconds" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * The on-ramp tour: everything else in the menu assumes this much
 * familiarity. ≤ 7 steps, ≤ 15 words of narration per step.
 *
 * Anchored mode runs against the user's actual persona/video. Steps
 * that require demo-seeded content are tagged requiresFixture so a
 * self-hoster running this against their own data sees a graceful
 * "demo content" inline note instead of a broken step.
 *
 * The narration's example type-name + persona-name come from the
 * deployment's TourContentBundle (default: microvent — see
 * src/tours/content/microvent.ts). An admin tailoring tours for a
 * different domain supplies a different bundle.
 */

import type { TourScript } from '../engine/types'
import type { TourFirstAnnotationContent } from '../content/types'

export function buildFirstAnnotationTour(
  content: TourFirstAnnotationContent,
): TourScript {
  // The annotation workspace anchors (player, drawing canvas, timeline,
  // save indicator, object picker) live on `/app/annotate/:videoId`. The
  // videoId comes from the deployment's TourContentBundle —
  // `loadTourContentBundle()` resolves the configured videoFilename
  // into Fovea's md5(filename)[0:16] id at boot so admins running
  // their own installation just point public/tour-content.json at a
  // file in their own corpus and every annotation-workspace tour
  // (this one, model-in-the-loop, keyframes-interpolation, etc.)
  // automatically targets the right video.
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: content.videoId }
  return {
    id: 'first-annotation',
    title: 'First annotation in 90 seconds',
    description:
      'The on-ramp: pick a clip, pause anywhere, draw a box, assign a type. Annotations save as you go.',
    durationMinutes: 2,
    tags: ['annotation', 'video', 'getting-started'],
    startRoute: '/app',
    fixtureBundle: 'first-annotation',
    personaName: content.personaName,
    recap:
      "You annotated a frame. The type list came from the active persona's ontology.",
    followUpTourId: 'ontology-authoring',
    steps: [
      {
        anchor: 'app-shell',
        route: '/app',
        narration:
          'Fovea organizes annotation around personas. Perspectives on the same video.',
        expectAction: 'none',
      },
      {
        // The shelf container (#video-browser-root + data-tour-id) is
        // always mounted on /app — independent of the fixture's
        // video-list fetch round-trip. We point the spotlight at the
        // shelf and narrate the picking action so the step never
        // races the fixture data-load. The deeper anchor
        // `video-browser-card-first` is still emitted on the first
        // card for tours that want to spotlight a tangible tile, but
        // the on-ramp tour stays at the shelf level so the engine
        // never hits the 8 s waitForAnchor ceiling on a slow
        // /api/videos round-trip.
        anchor: 'video-browser-root',
        route: '/app',
        narration: `As the ${content.personaName}, pick a clip from your shelf to start.`,
        expectAction: 'click',
        requiresFixture: true,
      },
      {
        anchor: 'video-player-scrubber',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Standard player. Pause anywhere to annotate that frame.',
        expectAction: 'scrub',
      },
      {
        anchor: 'drawing-canvas',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Drag to draw a bounding box on the subject.',
        expectAction: 'draw',
      },
      {
        // The persona-rooted type picker sits in the workspace
        // toolbar (AnnotationAutocomplete inside the always-mounted
        // type-assignment-picker wrapper). It renders the moment the
        // annotate route paints — no drawing, dialog, or sidebar
        // selection prerequisite — so the spotlight lands on the
        // exact UI the narration describes. The previous anchor
        // (`object-picker-popover`) targeted the WORLD OBJECT linker
        // inside the AnnotationEditor dialog, which only mounted
        // after a double-click on an existing annotation. That mismatch
        // with the narration produced the 8 s missing-anchor banner.
        anchor: 'type-assignment-picker',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: `Assign type "${content.entityType.name}". The list comes from this persona's ontology.`,
        expectAction: 'click',
      },
      {
        anchor: 'timeline',
        route: annotateRoute,
        routeParams: annotateParams,
        // TimelineRoot lives inside the AnnotationWorkspace's
        // collapsed timeline panel, only mounted when the visitor
        // expands it. The engine clicks Show Timeline first so the
        // anchor exists.
        revealBy: 'show-timeline-button',
        narration: 'Your annotation lives on the timeline alongside others on this clip.',
        expectAction: 'none',
      },
      {
        anchor: 'save-indicator',
        route: annotateRoute,
        routeParams: annotateParams,
        narration: 'Saved. No submit button; Fovea persists as you go.',
        expectAction: 'none',
      },
    ],
  }
}
