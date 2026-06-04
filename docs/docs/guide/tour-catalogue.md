---
sidebar_label: Tour catalogue
---

# Tour catalogue

FOVEA ships twelve built-in guided tours under
`annotation-tool/src/tours/scripts/`. Each tour is a typed script
that drives the spotlight engine through a sequence of anchors, with
narration written in plain English. The tours are rendered as a 4x3
grid by the public catalogue page (`VITE_DEMO_PUBLIC=1`) and as a
menu inside the authenticated app.

## The twelve tours

| # | Title | Script file |
| --- | --- | --- |
| 0 | Welcome to FOVEA | `welcome.ts` |
| 1 | First annotation in 90 seconds | `first-annotation.ts` |
| 2 | Building a persona's ontology | `ontology-authoring.ts` |
| 3 | Grow your ontology from Wikidata | `wikidata-augmentation.ts` |
| 4 | Beyond boxes: events, roles, and claims | `events-roles-claims.ts` |
| 5 | The world layer: instances, places, times | `world-layer.ts` |
| 6 | Model in the loop: tracking, interpolation, detection | `model-in-the-loop.ts` |
| 7 | Summaries, transcripts, and claim extraction | `summaries-and-claims.ts` |
| 8 | Collaboration: projects, groups, sharing | `collaboration.ts` |
| 9 | Admin: users, models, and system config | `admin.ts` |
| 10 | Import and export | `import-export.ts` |
| 11 | Keyframes and interpolation | `keyframes-interpolation.ts` |

Tour 0 is the orientation entry. Tour 11 is the temporal deep dive.
Both bracket the 4x3 grid; reorder by editing `getBuiltInTours` in
`annotation-tool/src/tours/scripts/index.ts`.

## Notes on the catalogue

- **Tour 0 (Welcome)** is a four-minute orientation that lands a
  first-time visitor on the workspace and names the panels they
  will use. **Tour 11 (Keyframes and interpolation)** walks the
  keyframe-and-interpolation contract end to end.
- **Tour 3** covers both manual type creation and Wikidata import
  in a single walkthrough.
- **Tour 5** walks all four world-object editors (entity, location,
  event, time) in contrast so the narration covers the differences
  between them explicitly.
- **Tour 6** detection proposals carry `acceptAsLabel` and
  `acceptAsWikidataId` so the candidates list renders a "Snap to
  type" chip that maps the detector's loose label onto the persona's
  Wikidata-grounded type.
- **Tours 3, 6, 7** narrate the
  accept-some / reject-some / inline-edit / split-compound-claim
  editing loop the model-driven proposals are designed for.
- **Tour 7** prelude visits the `Transcribe Audio` button (see
  [Transcribe and diarize](transcribe-and-diarize.md)).

## Anchors and authoring

Anchor names that tours reference live in the
[`data-tour-id` anchor reference](../reference/tour-anchors.md).
See the [Tour customization](tour-customization.md) guide for the
authoring contract (anchor naming, fallback timeout, fixture vs
anchored mode).

## Tour demo mode

When `VITE_TOUR_DEMO=1` is set, the MSW worker resolves every
model-driven step from the deployment's `TourContentBundle` instead
of forwarding to a model service. See
[Tour demo mode](tour-demo-mode.md).
