# Tailoring tours for your domain

Fovea ships ten built-in guided tours covering its full annotation
surface. The narration of each tour, the suggested type names the
visitor builds, the example venue / time / claim text — every
user-visible string and example value — is sourced from a single
**`TourContentBundle`**. Admins running Fovea for a specific domain
(forensics, sports analytics, marine safety, etc.) can swap in their
own bundle and the entire tour catalogue reframes to that domain
without touching the engine or the per-step UI anchors.

## What the default bundle looks like

The default — `microventContent` in
`annotation-tool/src/tours/content/microvent.ts` — is sourced from a
real annotation project (the "microvent" news-incident set). Each
tour gets a coherent slice of that running example:

| Tour | What the visitor builds |
|---|---|
| 1: First annotation | A Tech-Curious Spectator picks a Person on a clip |
| 2: Ontology authoring | The Automated/Analyst persona builds gunshot + wildfire + perpetrator + occurred-at |
| 3: Wikidata augmentation | The Automated persona searches Wikidata for "dust cloud" |
| 4: Events / roles / claims | The LoanDepot Park Usher boxes Phillies fan Karen + her son's father, declares a ball-grab event with grabber + prior-holder roles |
| 5: World layer | The Usher creates LoanDepot Park as a Stadium, drops a pin at Miami's coordinates, groups September 2025 home games |
| 7: Summaries & claims | The Usher types one of microvent's actual summary contents about the Phillies-Karen incident |
| 8: Collaboration | A Phillies-Marlins incident review project + Stadium operations team group |
| 10: Import / export | Uploads the microvent\_v2 JSONL through the import dialog |

## How to supply your own bundle

1. **Fork the default.** Copy `microvent.ts` to your own bundle
   file. Keep the shape identical (every tour's content slot has to
   be filled). The `TourContentBundle` type in `./types.ts` is the
   structural contract.

2. **Override what matters for your domain.** For each tour, supply
   personas + types + example text drawn from your own annotation
   project. The richer the example, the more your booth visitor
   takes away.

3. **Pass the bundle to `TourProvider`.** Either in stock builds:

   ```tsx
   // main.tsx (or wherever you mount the provider)
   import { TourProvider } from '@/tours'
   import { myDomainContent } from '@/tours/content/my-domain'

   <TourProvider contentBundle={myDomainContent}>
     <App />
   </TourProvider>
   ```

   or in demo deployments where `DemoShell` mounts the provider:

   ```tsx
   <TourProvider
     contentBundle={myDomainContent}
     onBeforeLaunch={...}
     onTelemetry={...}
   >
     <DemoRouter />
   </TourProvider>
   ```

   The catalogue rebuilds from the bundle on every render — you can
   even swap bundles live (e.g. a per-persona content choice).

4. **Verify it via the test pattern.** The bundle isn't just text
   substitution — Tour 4's `firstActor.name` is what the visitor
   actually types into the type editor; Tour 5's `locationLatitude`
   is what gets dropped on the map. So your bundle's values should
   make sense as concrete user actions, not just narrative flavour.
   See `annotation-tool/src/tours/content/microvent.test.ts` for the
   shape of the assertion (the third test there reframes microvent
   to a marine-safety domain and confirms the narration updates).

## What a bundle CANNOT change

These are tour-engine contracts, not content:

- **Step anchors** (`data-tour-id` values) — wired into the product
  UI components. Changing them would require moving the anchor
  declarations and updating the static-anchor smoke. Renaming the
  type the visitor creates is a content change; pointing a step at
  a different UI surface is an engine change.
- **Step ordering and `expectAction`** — the engine's auto-advance
  on `expectAction='click'` depends on the script's order matching
  the natural visitor click path. Reordering is an engine change.
- **`fixtureBundle` slugs** — these are demo-deployment seed bundle
  IDs that map to `annotation-tool/demo/fixtures/tour-{id}.json`.
  Decoupled from the content bundle on purpose.

## Why this is decoupled from the demo-mode fixture seeder

The fixture seeder (`server/src/demo/seed.ts`) is for **booth
deployments only** — it wipes and rebuilds an anonymous user's
workspace per tour launch so a CVPR attendee gets a fresh state.
The content bundle is for **all deployments** — it's how the
narration looks the same to every visitor whether they're at a
booth, on a self-hosted instance, or running locally. The two are
orthogonal: you can ship a custom content bundle without touching
fixture bundles, and vice versa.

## See also

- `annotation-tool/src/tours/content/types.ts` — the full
  `TourContentBundle` shape with per-slot documentation.
- `annotation-tool/src/tours/content/microvent.ts` — the default
  values, ready to fork.
- `annotation-tool/src/tours/scripts/index.ts` — `getBuiltInTours
  (bundle)` returns the per-deployment tour list; `defaultBuiltIn
  Tours` is the microvent-baked static catalogue importers use when
  no admin override is in scope.
