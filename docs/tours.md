# Guided tours

Fovea ships with a guided-tour system originally built for the CVPR 2026
demo (see `notes/CVPR_2026_DEMO_PLAN.md`) and exposed as a first-class
product feature: self-hosting teams can run the built-in onboarding tours
and author their own to walk new annotators through team-specific
conventions.

## Enabling the tour menu

The in-app tour menu is hidden by default. Enable it for your deployment
by mounting `<TourProvider>` from `@/tours` near the application root and
wiring up an "Open tours" action in your toolbar:

```tsx
import { TourProvider, useTour } from '@/tours'

function App() {
  return (
    <TourProvider onTelemetry={emitToYourAnalytics}>
      <YourApp />
    </TourProvider>
  )
}

function OpenToursButton() {
  const { openMenu } = useTour()
  return <button onClick={openMenu}>Tours</button>
}
```

Tours are off-by-default in the toolbar to keep stock builds quiet.

## Built-in tours

The current catalog ships under `annotation-tool/src/tours/scripts/`.
At present:

- **First annotation in 90 seconds** — the on-ramp tour, points a new
  annotator at the video shelf, the player, the drawing canvas, the
  object picker, the timeline, and the save indicator.

Tours 2–10 (ontology authoring, Wikidata, events/roles/claims, world
layer, model-in-the-loop, summaries, collaboration, admin, import/export)
land over the next few weeks per the plan in `notes/CVPR_2026_DEMO_PLAN.md`.

## Authoring custom tours

Self-hosted deployments can drop additional tour scripts into the
directory referenced by `$FOVEA_TOURS_DIR` (planned for T-9 of the
plan timeline; not yet wired). Each tour is a JSON or YAML file
matching `engine/types.ts`. Example:

```yaml
id: medical-imaging-onboarding
title: How we annotate CT scans
description: Walks a new annotator through our radiology workflow.
durationMinutes: 3
steps:
  - anchor: video-browser-card-first
    narration: Pick a study from your queue.
  - anchor: object-picker-popover
    narration: Use the 'Lesion' type — we don't use 'Anomaly'.
```

`data-tour-id` anchors are listed in `docs/tour-anchors.md`.

## Tour engine modes

Two modes are supported:

- **Anchored** (default) — the tour runs against the user's actual
  workspace state. Steps tagged `requiresFixture` show a graceful "this
  step uses demo content" note and let the user skip.
- **Fixture** — the tour seeds a known workspace via the demo
  fixture-seeder endpoint (under `FOVEA_DEMO_MODE`) before running.
  Used by the CVPR demo; available to any deployment that opts into the
  demo layer.

## Disabling tours entirely

Don't mount `<TourProvider>`. The engine is opt-in.
