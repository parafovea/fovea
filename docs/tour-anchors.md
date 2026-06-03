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

## Claims

| Anchor | Location | Notes |
|---|---|---|
| `claim-editor` | `ClaimEditor.tsx` `DialogContent` | Open via "Add Manual Claim" on the Claims tab of the Video Summary dialog. |
| `claim-relations-viewer` | `ClaimRelationsViewer.tsx` outer div | Graph view of claim relations. |
| `claims-viewer` | `ClaimsViewer.tsx` outer div | The flat-list claims view inside the summary dialog. |
| `claims-extraction-dialog` | `ClaimsExtractionDialog.tsx` `DialogContent` | "Extract claims from transcript/summary" dialog. |
| `claim-span-highlighter` | `ClaimSpanHighlighter.tsx` outer div | Shows source spans for an extracted claim. |

## World layer

| Anchor | Location | Notes |
|---|---|---|
| `world-panel-tabs` | `TabsList` in `ObjectWorkspace.tsx` | Entities / events / locations / times tab strip. |
| `entity-editor` | `EntityEditor.tsx` `DialogContent` | Specific-entity instance editor (e.g. "Glastonbury 2025"). |
| `event-editor` | `EventEditor.tsx` `DialogContent` | Specific-event instance editor. |
| `location-map-picker` | `LocationEditor.tsx` `DialogContent` | Location editor with map picker. |
| `time-editor` | `TimeEditor.tsx` `DialogContent` | Time-point / time-interval editor. |
| `collection-builder` | First two `DialogContent`s in `CollectionBuilder.tsx` (entity + event variants) | Entity collection editor. |
| `time-collection-builder` | Third `DialogContent` in `CollectionBuilder.tsx` (time variant) | Time collection editor. |

## Summaries and transcripts

| Anchor | Location | Notes |
|---|---|---|
| `audio-config-panel` | `AudioConfigPanel.tsx` outer div | Per-clip audio config (language, model). |
| `transcript-viewer` | `TranscriptViewer.tsx` outer `ul` | Synced transcript viewer. |
| `video-summary-editor` | `VideoSummaryEditor.tsx` outer div | Generated structured summary surface. |
| `video-summary-card` | `VideoSummaryCard.tsx` outer `Card` | First-class summary object surfaced in the browser. |

## Collaboration

| Anchor | Location | Notes |
|---|---|---|
| `projects-page` | Outer div in `ProjectsPage.tsx` | Projects index. |
| `groups-page` | Outer div in `GroupsPage.tsx` | Groups index. |
| `shared-annotations-page` | Outer div in `SharedAnnotationsPage.tsx` | Cross-member annotations view. |

## Admin

| Anchor | Location | Notes |
|---|---|---|
| `admin-panel` | Outer div in `AdminPanel.tsx` | Admin dashboard surface. |
| `user-management-page` | Outer div in `UserManagementPage.tsx` | User CRUD. |
| `model-management-page` | Outer div in `ModelManagementPage.tsx` | Active model selection. |
| `session-management-page` | Outer div in `SessionManagementPage.tsx` | Live session audit. |
| `system-config-panel` | Outer div in `SystemConfigPanel.tsx` | System-wide propagation toggles. |

## Import / export

| Anchor | Location | Notes |
|---|---|---|
| `import-dialog` | `ImportDialog.tsx` `DialogContent` | The initial import-source dialog. |
| `import-result-dialog` | `ImportResultDialog.tsx` `DialogContent` | Post-import conflict / orphan-skipped summary. |
| `export-dialog` | `ExportDialog.tsx` `DialogContent` | Persona / time-range filtered export. |

## Adding new anchors

1. Pick a name following the convention. Check this file first to avoid collisions.
2. Add the attribute to product code via a small, focused PR. Tests + tours reference the public name; don't rename without bumping major.
3. Document it here in the right section.
4. The Playwright smoke at `test/e2e/smoke/tour-anchors.spec.ts` asserts every Tour-1 anchor resolves; extend it as Tours 2+ ship.

## Anchors not yet landed

A handful of Tour 4-9 step targets reference product surfaces that
haven't been built yet. Those steps are tagged `requiresFixture: true`
in the tour scripts and surface a graceful "this step uses demo
content" note in anchored mode rather than hanging. Specifically:

- `event-annotation-button`, `role-assignment-panel` (Tour 4) — event-
  mode bbox draw flow inside AnnotationWorkspace doesn't yet expose a
  dedicated event-annotation button or role-assignment panel.
- `annotation-world-reference` (Tour 5) — the world-instance reference
  picker inside the annotation context isn't a dedicated surface yet.
- `quick-actions-track`, `tracking-results-panel`, `motion-path-overlay`,
  `interpolation-mode-selector`, `bezier-curve-editor`, `temporal-
  annotator`, `annotation-candidates-list` (Tour 6) — the model-in-the-
  loop UI surface lands when those features ship.
- `permissions-page`, `model-memory-validation`, `project-video-
  assignment`, `persona-preferences-section`, `api-keys-page` (Tours
  8 + 9) — adjacent admin / persona pages exist but the named anchor
  points are subcomponents that haven't been carved out.

When these land, add the attribute, update the table above, and remove
the `requiresFixture` flag from the corresponding step.
