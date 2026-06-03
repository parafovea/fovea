# Tour Coverage Audit — 2026-06-03

Pre-0.4.0 audit of what each of the ten built-in tours covers against
the full interface surface, so a reviewer can tell at a glance where
the catalog is comprehensive and where the booth visitor would have
to wander outside any tour to find a feature.

## What each tour covers

| Tour | ID                    | Anchors hit                                                                                                                                 |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | first-annotation      | VideoPlayer, AnnotationOverlay, AnnotationEditor, ObjectPicker, Annotation list, save indicator, timeline                                   |
| 2    | ontology-authoring    | OntologyWorkspace tabs, entity / event / role / relation type editors, gloss editor, type hierarchy tree                                    |
| 3    | wikidata-augmentation | Manual Entry + Import from Wikidata mode toggles on type editor, OntologyAugmenter search / results / import target, augmenter suggestions  |
| 4    | events-roles-claims   | Two-actor bbox draws, event-type assignment, role bindings, claim derivation                                                                |
| 5    | world-layer           | World panel tabs, entity / location / event / time instance editors, time-collection + entity-collection builders, world-instance ref      |
| 6    | model-in-the-loop     | Quick-actions track, tracking results panel, motion path overlay, interpolation mode, Bézier editor, temporal annotator, candidates list   |
| 7    | summaries-and-claims  | Audio config, transcript viewer (with inline edit + speaker flip), VLM summary editor (with edit), summary card, claims extraction + split |
| 8    | collaboration         | Projects shelf, groups shelf, sharing dialog                                                                                                |
| 9    | admin                 | User management, model config, system config                                                                                                |
| 10   | import-export         | Import data dialog, JSONL upload                                                                                                            |

## Surfaces well covered

- Annotation workspace (Tours 1, 4, 6)
- Persona ontology authoring (Tours 2, 3)
- World layer (Tour 5)
- Model-assisted flows (Tours 3, 6, 7)
- Collaboration (Tour 8)
- Admin (Tour 9)

## Gaps the audit found

| Gap                                                                       | Priority | Notes                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AnnotationWorkspace's new "Transcribe Audio" button + TranscriptPanel     | medium   | Tour 7 visits the saved-summary TranscriptViewer (anchor `transcript-viewer`); the on-demand Transcribe button + TranscriptPanel I shipped in commit 995db6d are not anchored. Add a step at the start of Tour 7 hitting `transcribe-audio-button` for parity.   |
| Tour 10 covers import; export is uncovered                                | medium   | The Export button (sidebar) + the Export options dialog have no anchored tour step. Either extend Tour 10 to a round-trip "import then export" or add a single step at the end.                                                                                  |
| Tour 7 audio-config-panel step mentions diarization toggle but never hits it | low      | The step narration name-checks "diarization, transcription model" without actually clicking the diarization toggle on AudioConfig. Acceptable shortcut for booth pacing.                                                                                          |
| Comment threads on claims                                                  | low      | The ClaimEditor's comment surface is uncovered. Niche enough that any tour add would feel forced; defer.                                                                                                                                                          |
| Video Browser search / filter                                              | low      | Tour 1 uses the Video Browser implicitly but does not exercise the search box or the project filter. Demo-pacing acceptable.                                                                                                                                     |
| API key management / Settings panel                                        | low      | Tour 9 (admin) covers operator surfaces. The per-user Settings panel and API key dialog are not separately walked. Could fold into Tour 9.                                                                                                                       |
| Annotation timeline (scrub / mode switch)                                  | low      | Tour 1 ends on a "timeline visible" beat; the actual scrub-to-keyframe loop is not narrated. Tour 6's interpolation step exercises it indirectly.                                                                                                                |

## Recommendations for tomorrow's 0.4.0 ship

1. Add a `transcribe-audio-button` + `transcript-dialog` two-step prelude to Tour 7 so the new on-demand transcription surface lands inside a tour. Tracked under task #129 (will create).
2. Add an export step (anchor: `export-button` + `export-dialog`) to Tour 10. Tracked under task #130.
3. Defer everything in the "low" priority column.

## How to verify after the recommendations land

- Boot the demo build with `VITE_TOUR_DEMO=1` and walk each tour through to the closing recap.
- The per-tour E2E specs under `test/e2e/regression/tours/` exercise the anchors against a live React tree; running the suite passes when every step's anchor resolves.
