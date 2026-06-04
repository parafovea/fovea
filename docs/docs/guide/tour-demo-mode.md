---
sidebar_label: Tour demo mode
---

# Tour demo mode

Tour demo mode is a build-time flag that lets the annotation tool run
a complete guided-tour experience **without a model service**. When
the flag is set, a Mock Service Worker (MSW) browser worker installs
at boot and intercepts the six routes that would otherwise forward to
the model service, resolving each from a JSON content bundle. The
event-booth demo laptop uses this mode; the public deployment at
`demo.fovea.video` uses it too.

## When to enable it

| Goal | Flag |
| --- | --- |
| Running tours on a laptop with no GPU | `VITE_TOUR_DEMO=1` |
| Public demo landing at `/` with a 4x3 tour grid | `VITE_DEMO_PUBLIC=1` |
| Production app where the model service is live | neither |

Builds without either flag tree-shake the entire `src/mocks/tourDemo/`
subtree out of the bundle, so there is zero runtime cost to leaving
the code in place.

## Routes intercepted

Six routes are mocked. The MSW handlers add a randomised 800-1800 ms
delay so each call feels like a warm model-service response without
needing one:

```text
POST /api/ontology/augment
POST /api/videos/:videoId/detect
POST /api/videos/:videoId/track
POST /api/videos/:videoId/transcribe
POST /api/videos/:videoId/summarize
POST /api/claims/extract
```

Every other backend route (auth, personas, world, annotations, ...)
hits the real backend as normal. Operators can sign in and use the
app normally while the model-driven routes remain mocked.

## Where the fixture data lives

All fixtures live in the deployment's `TourContentBundle`, served at
`/tour-content.json` and editable through the admin console. Three
sub-slot interfaces drive the mocked outputs:

- `TourMockOntologySuggestion` for the ontology-augmentation tour.
- `TourMockDetectionProposal` and `TourMockTrackingKeyframe` for the
  model-in-the-loop tour. Each detection proposal carries
  `acceptAsLabel` and `acceptAsWikidataId` so the candidates list can
  render a "Snap to type" chip that maps the detector's loose label
  onto a Wikidata-grounded type the persona's ontology already
  contains (for example `Q987767` for "container",
  `Q283` for "water", `Q178692` for "crane").
- `TourMockTranscriptSegment` and `TourMockClaimAtom` for the
  summaries / transcripts / claims tour.

Editing `tour-content.json` retheme tours for a different domain or
audience without touching application code. The file is served with
`Cache-Control: no-store` on the demo deployment so admin edits land
on the next page load. The bundle schema lives in the repo at
`annotation-tool/public/tour-content.schema.json`.

## Confirming the worker is active

Open browser DevTools. Before React mounts you should see:

```text
[tour-demo] MSW worker active; model-service calls are mocked.
```

If you see model-service errors in the console instead, the flag was
not set at build time. Rebuild with `VITE_TOUR_DEMO=1` and reload.

## Local docker-compose

`docker-compose.tour-demo.yml` is the demo deployment-laptop stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.tour-demo.yml up
```

The override sets `VITE_TOUR_DEMO=1` at build time and leaves auth
and the rest of the backend untouched, so the operator can still log
in and exercise the same flow QR-code visitors get from their phones.

## E2E coverage

Three smoke specs lock the tour-demo path in CI:

```text
test/e2e/smoke/tour-demo-msw.spec.ts
    Asserts that all six routes are intercepted and that response
    latency falls inside the 800-1800 ms window.

test/e2e/smoke/tour-demo-launch-all.spec.ts
    Launches and abandons every one of the twelve built-in tours.

test/e2e/smoke/tour-demo-spotlight-pause-resume.spec.ts
    Spotlight overlays, pause unmount, resume re-mount, and survival
    across a hard reload.
```

Run them locally with `pnpm --filter @fovea/annotation-tool exec
playwright test --project=smoke test/e2e/smoke/tour-demo-*.spec.ts`.
