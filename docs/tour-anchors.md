# `data-tour-id` anchor reference

This is the public selector contract for the tour engine: every
`data-tour-id` attribute that ships in product code is documented
here so self-hosters writing their own tours (see `docs/tours.md`)
have a stable surface to anchor against.

Naming convention (see `notes/CVPR_2026_DEMO_PLAN.md` §8):
`{feature-area}-{component}-{optional-discriminator}`, kebab-case.
No tour numbers in names.

## Application shell

| Anchor | Location | Notes |
|---|---|---|
| `app-shell` | `SidebarProvider` root in `Layout.tsx` | The whole app frame. |
| `app-sidebar` | `Sidebar` in `Layout.tsx` | Left navigation column. |

## Video browser

| Anchor | Location | Notes |
|---|---|---|
| `video-browser-card-first` | First card in `VideoBrowser.tsx` grid | Only the first card carries this, so any tour that needs *a tangible card to spotlight* gets a stable target. |

## Annotation workspace

| Anchor | Location | Notes |
|---|---|---|
| `video-player-scrubber` | `VideoPlayer.tsx` container | Anchors over the player chrome (video.js renders the actual scrubber inside). |
| `drawing-canvas` | `VideoPlayer.tsx` `.annotation-video-container` | Where the user drags to draw a bounding box. |
| `timeline` | `TimelineRoot.tsx` outer div | The full timeline component. |
| `save-indicator` | `SaveStatusIndicator.tsx` | Renders only when there's a status to show (saving / saved / failed). May not be present at tour-step-1 time. |
| `object-picker-popover` | `ObjectPicker.tsx` `DialogContent` | Object/type picker dialog. Mounted on user click — guard with `waitForAnchor`'s 3 s ceiling. |

## Ontology workspace

| Anchor | Location | Notes |
|---|---|---|
| `ontology-workspace-tabs` | `TabsList` in `OntologyWorkspace.tsx` | The four-layer tab strip. |
| `entity-type-editor` | `BaseTypeEditor.tsx` `DialogContent`, `typeCategory='entity'` | Open via the Add button on the entities tab. |
| `event-type-editor` | `BaseTypeEditor.tsx`, `typeCategory='event'` | Open via the Add button on the events tab. |
| `role-editor` | `BaseTypeEditor.tsx`, `typeCategory='role'` | Open via the Add button on the roles tab. |
| `relation-type-editor` | `RelationTypeEditor.tsx` `DialogContent` | Dedicated relation editor — Relations have source/target types so they don't share `BaseTypeEditor`. |
| `gloss-editor` | `GlossEditor.tsx` outer div | Per-type definition; rich text + tagging. |

## Ontology augmenter

| Anchor | Location | Notes |
|---|---|---|
| `augmenter-search` | `OntologyAugmenter.tsx` domain-description block | Free-text concept input (this isn't a Wikidata search field per se; it's the domain description used to drive AI suggestions, but it's the right "type a concept" anchor for Tour 3). |
| `augmenter-import-target` | Category Select trigger in `OntologyAugmenter.tsx` | Entity / event / role / relation toggle. |
| `augmenter-results` | Results section in `OntologyAugmenter.tsx`, conditionally rendered | Mounts only when a suggestion run has completed. |

## Adding new anchors

1. Pick a name following the convention. Check this file first to avoid collisions.
2. Add the attribute to product code via a small, focused PR. Tests + tours reference the public name; don't rename without bumping major.
3. Document it here in the right section.
4. The Playwright smoke at `test/e2e/smoke/tour-anchors.spec.ts` asserts every Tour-1 anchor resolves; extend it as Tours 2+ ship.

## Anchors not yet landed

Tour 4 (events/roles/claims), Tour 5 (world), Tour 6 (model-in-the-loop),
Tours 7-10 reference anchors that ship as those tours land. Currently
documented in `notes/CVPR_2026_DEMO_PLAN.md` §A and listed individually
when each tour's anchors land here.
