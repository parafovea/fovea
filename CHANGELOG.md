# Changelog

All notable changes to the Fovea project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - Unreleased

### Fixed

- `ImportHandler.executeImport` now configures the Prisma atomic-mode transaction with `{ maxWait: 10_000, timeout: 300_000 }`. The default 5_000ms interactive-transaction timeout is exceeded by realistic cross-user imports — a payload with ~20 personas / ~100+ summaries / hundreds of claims times out with `Transaction already closed` partway through because every nested write goes through v0.2.0's CASL ability check and v0.3.0's Clean Architecture indirection. Without the bump the whole import rolls back and the user sees a 500 from `POST /api/import`; with it, the import completes against realistic payload sizes. Carried from v0.2.4 / v0.3.4 (same fix, same diff). Surfaced by the forward-port of the v0.1.11 rich regression fixture.

### Added

- Regression suite in `server/test/integration/cross-user-import-rich-fixture.test.ts` against `server/test/fixtures/cross-user-import-rich-export.jsonl` (the richest of the seven annotator exports uploaded to #121, carrying 20 personas / 20 ontologies / 79 entities / 136 summaries across ~96 distinct videos / 621 claims / 9 object annotations). The test imports the fixture into a fresh user via `reseedOwnershipBaseline` and walks four assertions sourced directly from the screenshot on the reopened #100: (a) every imported summary's `personaId` dereferences via `GET /api/personas/:id` with a 200 (a 404 here is the user-visible 'Persona <uuid> not found' banner in the Edit Video Summary dialog), (b) every dereferenced persona is owned by the importer (cross-checked against `GET /api/personas`), (c) no `summary.personaId` equals one of the original exporter-side persona ids (i.e. the remap actually rewrote it, not just preserved it), (d) every imported claim's `summaryId` resolves to a summary owned by the importer, with round-trip claim and annotation counts matching the fixture exactly. The suite carries a 90_000ms per-test timeout to accommodate the Clean Architecture indirection on top of CASL's per-call overhead.
- `server/test/integration/cross-user-import-real-fixture.test.ts` now also walks `GET /api/personas/:id` with the summary's `personaId` after import and intersects the returned id against the requester's `GET /api/personas` list. The previous test only asserted the summary row carried *a* personaId without verifying the dereference, leaving the post-import Edit Video Summary path (the exact API the bug screenshot in #100 surfaces) untested.

### Changed

- Replace the field-name allowlist inside `remapObjectIds` with a structure-agnostic substitution built from the cross-user `idMap` itself. The prior fix on this branch (cherry-picked from v0.3.2) added an inline-UUID regex pass as a fallback after the existing `id` / `*Id` / `*Ids` / gloss-`content` branches, but the allowlist still hid two correctness gaps: (1) `entityCollection.members` / `eventCollection.members` / `timeCollection.members` are id-reference arrays that the allowlist never matched (they do not end in `Ids`), so after a cross-user import every collection silently held pre-import ids pointing at entities that no longer existed in the importer's world; (2) any future id-bearing field whose name did not match the allowlist patterns would have the same problem. `remapIds` now lowercases `idMap` keys on insert, builds a single case-insensitive matcher from those keys sorted longest-first and RegExp-escaped, and applies it to every string value in the payload tree. Whole-string id values, ids embedded in surrounding prose, ids in arbitrary array positions (`members`, `entityIds`, ordinary string arrays), GlossItem `content`, and ids inside JSON-encoded substrings are all rewritten by the same pass; substrings whose lowercased form is not in `idMap` pass through unchanged, so the substitution is a strict no-op outside the cross-user path. Reported as a continuation of #121.

### Added

- Unit suite `test/services/import-handler-remap-ids.test.ts` (13 tests, no database) exercises every surface of the new id-shape substitution against a synthetic `idMap`: whole-string ids in arbitrary field names, inline mentions in `claim.text` / `claim.comment`, every free-text surface (persona `informationNeed` / `details`, ontology type descriptions, world object name / description, summary text, claim-relation description), nested structures through arrays and gloss `items`, `*Ids` arrays, collection `members` arrays, multiple ids in one string, ids embedded inside larger tokens (`claim_<id>_v2`, `entity-<id>.png`, `url=…/<id>?q=1`), uppercase / mixed-case ids, JSON-encoded blobs that carry ids, ids not in `idMap` left untouched, non-id strings unchanged, empty-resolutions no-op, and primitives (number / boolean / null) untouched. The integration comparator in `test/integration/import-export-fidelity.test.ts` now treats `members` as id-like so the round-trip diff stops asserting that reference arrays survive byte-for-byte; the round-trip behaviour itself is unchanged.

#### Annotation Timeline Rewrite

- Rewrote the annotation timeline as a composition of small DOM primitives under `src/components/annotation/timeline`
- `TimelineRoot` orchestrates a fixed-width track-header column and a flexible right column containing `TimelineRuler`, `TimelinePlayhead`, and stacked `TimelineTrack` lanes
- `TimelineTrack` lanes render `InterpolationSegment` gradients and `KeyframeMarker` diamonds with selection, current, and locked states
- `TransportBar` carries the SMPTE timecode readout, keyframe-edit cluster, and zoom controls
- `useTimelineViewport` manages `ResizeObserver`-backed container width plus zoom clamped between fit-to-view and `MAX_ZOOM`
- `useKeyframeDrag` installs window-level pointer listeners to reposition keyframes with obstruction nudging
- `useTimelineKeyboard` wires J/K/L playback shortcuts and the `ShortcutPalette` surfaces the binding table via `?`
- `TimelineComponent.tsx` remains as a drop-in shim that threads `useMoveKeyframe` through

#### Bounding-Box Editing Polish

- `BoundingBoxHUD` renders a float W×H and x,y readout with monospace tabular-nums in a `foreignObject` anchored below the box during drag/resize
- `useBoundingBoxKeyboard` hook nudges the active box by 1 px (10 px with shift) on arrow keys and calls `onUpdate` + `onEditComplete` through the existing persistence pipeline
- Shift-hold aspect-ratio lock for corner resize handles honours whichever axis drifted farther and anchors the opposite edge so the box grows from its corner

#### Tooling and Build

- Monorepo switched to a pnpm workspace with ergonomic dev commands
- All Dockerfiles updated for the pnpm workspace layout
- `jsdom` pinned to `^26.1.0` for Node 18 ESM compatibility

#### Backend Reliability

- `services/system-config-propagator.ts` factors model-service propagation out of the admin-config route
- Server startup now auto-replays every persisted `SystemConfig` row so a fresh model-service picks up admin settings without operator intervention

### Changed

#### UI Framework Migration

- Migrated the entire annotation-tool frontend from Material UI to shadcn-ui
- Replaced MUI `Box`, `Typography`, `Button`, `Alert`, `Accordion`, `Dialog`, `Menu`, and form primitives with shadcn equivalents
- Switched from Emotion-based theming to Tailwind CSS v4 with a Fovea-specific design-token layer
- Replaced MUI icons with Lucide React icons via a barrel export
- Rebuilt the Layout around the shadcn sidebar composition pattern with fixed dialog overflow handling
- Fixed sidebar toggle, narrowed the dropdown menu, resolved tab overflow, and reduced the sidebar width
- Renamed **Ontology Builder** to **Persona Builder** with updated icons and keyboard shortcut
- Updated all component tests for the new shadcn DOM structure, ARIA roles, and named exports

#### Schema Hardening

- Replaced vitest-broken `Type.Union` nullable response schemas on `/api/me/preferences` with the `fast-json-stringify`-safe `Type.Unsafe` array-type pattern so null values serialize correctly
- Resolved `SystemConfig` audit `updatedByUserId` through the users table so phantom test-bypass ids and real deleted-user races no longer violate the FK

### Removed

- `@mui/material`, `@mui/icons-material`, `@mui/x-*`, `@emotion/react`, and `@emotion/styled` dependencies
- Unused `DropdownPaper` helper left over from the MUI migration

### Fixed

- `ClaimEditor` Claiming Event / Time / Location dropdowns now populate from world state instead of showing the None-only placeholder menus the shadcn migration left behind (events from `useEvents()`, times from `useTimes()`, locations from `useEntities()` filtered to entities tagged with a `locationType` field).
- `ObjectWorkspace`'s `object.duplicate` command now actually duplicates the selected world object (entity / event / location / time / collection) instead of `alert('Duplicate object not yet implemented')`, via a pure `buildDuplicatePayload` helper that strips server-managed and Wikidata-provenance fields and appends a `(copy)` suffix.
- `OntologyWorkspace`'s `ontology.duplicateType` command now actually duplicates the selected ontology type (entity / role / event / relation) instead of `alert('Duplicate type not yet implemented')`, via a pure `buildDuplicateOntologyType` helper following the same shape as the world-object duplicator.
- `AnnotationWorkspace`'s command-context `drawingMode` flag now reflects the actual `annotationUiStore.drawingMode` value instead of being hardcoded `false`, so when-clauses that gate on `drawingMode` fire correctly while a draw-mode button is active.
- `ImportResultDialog`'s orphan-skipped banner now carries the `data-testid="import-orphan-skipped-banner"` attribute that the corresponding E2E spec (`test/e2e/regression/export-import/orphan-skipped-banner.spec.ts`) was already probing for, and the banner prose now matches the E2E spec's `/missing referenced data/i` assertion. The unit-level rendered-output test stays skipped pending the workspace-wide pnpm + jsdom React-dedup fix.
- `videoStorage.getVideoUrl` now fails fast with an actionable error message when `CDN_ENABLED=true` and `CDN_SIGNED_URLS=true` instead of silently returning an unsigned URL (the placeholder behaviour produced 403 cascades through signed CloudFront distributions); operators must either set `CDN_SIGNED_URLS=false` (public-CDN-in-front-of-public-bucket) or wire up `@aws-sdk/cloudfront-signer`.
- Shimmed `PointerEvent` + `Element` pointer-capture in `test/setup.ts` so Base UI's checkbox/dialog handlers no longer throw `PointerEvent is not defined` under jsdom.
- Updated `TimelineComponent` tests to pass the full `TimelineComponentProps` via a `makeProps` helper and query buttons by `aria-label` instead of the canvas-era emoji placeholders.
- Swapped the workspace integration test's `querySelector('canvas')` probe for `getByLabelText('Video annotation timeline')`.
- Annotation-drawing duplication during keyframe edits.
- Full `annotation-tool` vitest suite now reports 102 files / 1698 tests pass (5 canvas-era tombstones skipped with a pointer to the shadcn rewrite, 0 failed).

## [0.3.3] - 2026-05-13

Forward-ports the v0.1.10 / v0.2.3 generalisation of the cross-user id remap to the v0.3.x line. The bug taxonomy and user-visible behaviour is the same; the integration is unchanged from v0.2.3 since `remapObjectIds` lives outside both the CASL surface introduced in v0.2.0 and the Clean Architecture refactor introduced in v0.3.0.

### Changed

- Replace the field-name allowlist inside `remapObjectIds` with a structure-agnostic substitution built from the cross-user `idMap` itself. The v0.3.2 fix added an inline-UUID regex pass as a fallback after the existing `id` / `*Id` / `*Ids` / gloss-`content` branches, but the allowlist still hid two correctness gaps: (1) `entityCollection.members` / `eventCollection.members` / `timeCollection.members` are id-reference arrays that the allowlist never matched (they do not end in `Ids`), so after a cross-user import every collection silently held pre-import ids pointing at entities that no longer existed in the importer's world; (2) any future id-bearing field whose name did not match the allowlist patterns would have the same problem. `remapIds` now lowercases `idMap` keys on insert, builds a single case-insensitive matcher from those keys sorted longest-first and RegExp-escaped, and applies it to every string value in the payload tree. Whole-string id values, ids embedded in surrounding prose, ids in arbitrary array positions (`members`, `entityIds`, ordinary string arrays), GlossItem `content`, and ids inside JSON-encoded substrings are all rewritten by the same pass; substrings whose lowercased form is not in `idMap` pass through unchanged, so the substitution is a strict no-op outside the cross-user path. Reported as a continuation of #121.

### Added

- Unit suite `test/services/import-handler-remap-ids.test.ts` (13 tests, no database) exercises every surface of the new id-shape substitution against a synthetic `idMap`: whole-string ids in arbitrary field names, inline mentions in `claim.text` / `claim.comment`, every free-text surface (persona `informationNeed` / `details`, ontology type descriptions, world object name / description, summary text, claim-relation description), nested structures through arrays and gloss `items`, `*Ids` arrays, collection `members` arrays, multiple ids in one string, ids embedded inside larger tokens (`claim_<id>_v2`, `entity-<id>.png`, `url=…/<id>?q=1`), uppercase / mixed-case ids, JSON-encoded blobs that carry ids, ids not in `idMap` left untouched, non-id strings unchanged, empty-resolutions no-op, and primitives (number / boolean / null) untouched. The integration comparator in `test/integration/import-export-fidelity.test.ts` now treats `members` as id-like so the round-trip diff stops asserting that reference arrays survive byte-for-byte; the round-trip behaviour itself is unchanged.

## [0.3.2] - 2026-05-11

## [0.3.1] - 2026-05-04

Forward-ports the data-fidelity, schema, UX, and DoS fixes from v0.1.8 (and the v0.2.1 RBAC integration of those fixes) to the v0.3.x line. The bug taxonomy and user-visible behavior is the same as v0.1.8; this section lists only the deltas specific to v0.3.x, plus the items unique to this release. Cross-version exports between v0.2.x and v0.3.x are intentionally not supported.

### Schema

- Adds `Annotation.linkType` column. Same column as v0.1.8 and v0.2.1.

### Fixed (RBAC integration deltas, identical to v0.2.1)

The fixes below are conceptually the same as v0.1.8 but are wired through CASL rather than v0.1.8's `lib/ownership.ts` helpers, so there is no parallel ownership system on the v0.3.x line.

- `POST /api/annotations` calls `request.ability.can('read', subject('Persona', persona))` on the supplied `personaId` before attaching. The generic `create Annotation` candidate carries `createdByUserId = caller` and passes CASL's create rule even when the target persona is foreign; the explicit read-on-target gate closes the gap.
- `POST /api/summaries/:summaryId/claims` and `GET /api/summaries/:summaryId/claims` apply the same `read`-on-parent gate via `subject('VideoSummary', summary)`.
- `POST /api/videos/:videoId/detect` runs `ability.can('read', subject('Persona', persona))` when a `personaId` is supplied. The videos plugin also wires `buildAbilities` so `request.ability` is populated for every video sub-route.
- `PUT /api/ontology` and `POST /api/ontology/augment` catch blocks re-throw `AppError` so authorization-induced 403/404 are no longer collapsed into 500.
- `POST` / `PUT /api/personas` strip `isSystemGenerated` for non-`system_admin` requests by checking `request.user.systemRole`.
- `GET /api/import/history` scopes by `importedBy = request.user.id` directly.

### Fixed (carried through unchanged from v0.1.8)

- `Claim.audio` / `Claim.video` / `Claim.metadata` round-trip for any JSON value (was wiped to `JsonNull` for non-arrays).
- Object annotations linked to events / times / locations round-trip through export+import via the new `linkType` column.
- `POST /api/import` returns 4xx (typically 413) for `FST_*_LIMIT` codes instead of 500.
- `POST /api/import` populates `importedBy` so the history listing returns the row.
- `app.setErrorHandler` types its `error` parameter as `FastifyError`.

### UX (carried through unchanged from v0.1.8)

- `ImportResultDialog` shows a yellow "Completed with Warnings" title and a prominent banner when annotations were skipped because of missing referenced data.

### Infrastructure

- `model-service/Dockerfile` retries `pip install torch torchvision` and `pip install -e .` up to 3× with a 30s sleep between attempts, matching the existing `apt-get update` retry pattern. Closes a release.yml flake first observed on v0.2.0's release run.
- `.github/workflows/ci.yml` triggers on `release/**` PRs in addition to `main` / `develop`, so backport PRs to maintenance branches go through the same lint + test gate.

### Tests

- Forward-ports every v0.1.8 / v0.2.1 test suite (multi-user-isolation, import-export-cross-user, import-export-edges, import-export-fidelity, issue-121-real-fixture, orphan-banner predicate test, Playwright spec). Seeds populate `createdBy` / `createdByUserId`. Shared helper `test/integration/_rbac-baseline.ts` wipes the test-helper's blanket-grant `RolePermission` rows and re-seeds an ownership-aware production-like baseline so the matrix actually exercises CASL's per-row ownership rules.

## [0.3.0] - 2026-04-24

### Added

#### Model Service Clean Architecture

- Domain layer with entities, value objects, and exception hierarchy
- Application layer with service interfaces (ports) and use cases
- Infrastructure layer with adapter pattern for all external dependencies
- Dependency injection container with manual factory wiring
- Pydantic StrictBaseModel with plugin for stricter validation
- NumPy-style docstrings across all model service modules
- Contract tests with fake model manager and VLM loader
- `YamlModelRepository` implementing `IModelRepository` port
- `detect_objects` and `track_objects` use cases with outbound port adapters
- Audio port adapters routing transcription, diarization, and VAD through the port system
- OpenTelemetry spans on every use case and `model_inference` metrics on every outbound adapter
- `ThinkingTrace` and `ReasonedText` DTOs capturing reasoning traces through use cases and FastAPI schemas
- Structural `_LLMLoaderLike` / `_LoaderConfig` protocols replacing `Any` on `LLMLoaderAdapter`
- Shared base modules (`audio/base.py`, `detection/base.py`, `llm/base.py`) breaking runtime cyclic imports

#### CPU Inference Support

- ONNX Runtime detection loaders (YOLO-World, Florence-2, Grounding DINO)
- llama.cpp LLM loader with GGUF quantization for fast CPU text generation
- llama.cpp VLM loader with GGUF multimodal inference
- SmallVLMLoader for Transformers-based CPU vision models (SmolVLM, Moondream)
- Factory function dispatch for all loader types (detection, LLM, VLM)
- CPU model configurations in `models-cpu.yaml` with GGUF entries
- `llama-cpp-python` added to CPU optional dependency group

#### 2026 Model Catalog

- Wave 1: 57 new model entries in `models.yaml` and 11 in `models-cpu.yaml` covering Qwen3-VL, Tarsier2, Moondream3, Qwen3, DeepSeek R1 distills, Kimi K2.6, GLM-4.7, Claude 4.6/4.7, GPT-5.4, Gemini 3.1 Pro, Grok 4, SAM 3.1, YOLOv12, YOLOE-26, RF-DETR, Canary-Qwen, Parakeet TDT, and WhisperX
- Wave 2+3 loaders: SAM3, Canary, Parakeet, WhisperX, YOLOv12, YOLOE-26, and RF-DETR with contract tests

#### Docker CPU Build

- Automatic installation of CPU extras (`onnxruntime`, `llama-cpp-python`) when `DEVICE=cpu`
- `cmake` added to builder stage for compiling native extensions
- Model config auto-selection via symlink (`models-cpu.yaml` for CPU, `models.yaml` for GPU)

#### Frontend CPU Mode

- Backend config endpoint exposes `models_available` and `cpu_models_available` flags
- Three-state UI: GPU mode, CPU mode with models (info), no models available (error)
- All AI features (detection, summarization, ontology, claims) enabled when CPU models exist
- Replaced binary `isCpuOnly` gating with `modelsDisabled` across all components
- Admin model management page with CPU/GPU device toggles, download status, and job status fixes

#### Admin and Persona Configuration Surface

- `UserPreferences`, `PersonaPreferences`, and `SystemConfig` Prisma models with RBAC-gated endpoints (`/api/me/preferences`, `/api/personas/:id/preferences`, `/api/admin/config`)
- Model-service `/api/admin/reconfigure` endpoint (gated by `MODEL_SERVICE_ADMIN_TOKEN`) that applies storage-path changes via `reconfigure_roots` and updates `ModelManager` inference knobs
- `SystemConfigPanel` rendering shadcn tabs for storage paths, runtime, and external APIs behind `isAdmin` on the Settings page
- `PersonaEditor` embeds a collapsible `PersonaPreferencesSection` for per-persona inference pins
- `useInferencePreferences` migrated from localStorage to server-backed TanStack Query with optimistic updates
- `mergeOverrides` helper (user → persona precedence) with unit tests
- `GenerationOverrides` / `AudioOverrides` threaded from `VideoBrowser` through `CreateSummaryRequest`, `SummarizeJobData`, and the video-summarization worker into model-service as `generation_overrides` / `audio_overrides`
- Inference Settings tab with Sampling / Audio / Detection / Advanced subtabs: sliders and inputs bound to backend defaults via `useModelDefaults` / `useModelFrameworks`, per-field Reset controls
- `/api/models/defaults` and `/api/models/frameworks` proxied through the Node server with TanStack Query hooks

#### Tests

- 234 domain and use-case unit tests with typed fakes
- 158 additional model-service tests covering the YAML model repository, task factories, domain exception hierarchy, thumbnails and claims FastAPI routes, `audio_processing` service, base audio client, and all seven vendor audio clients (AssemblyAI, AWS Transcribe, Azure Speech, Deepgram, Gladia, Google Speech, Rev AI)
- `test/loaders/conftest.py` stubs `sam2`/`sam2.build_sam` in `sys.modules` so tracking-loader tests run without the optional SDK
- `test/external_apis/audio/conftest.py` stubs the audio vendor SDKs so the package `__init__` resolves in CI
- `preferences.test.ts` RBAC coverage for the new preferences endpoints

### Changed

- Model service restructured from flat module layout to Clean Architecture layers
- Route handlers decomposed into domain-specific modules with DI
- Use cases updated with corrected imports after architecture relocation
- Use cases now depend only on DTOs and ports; `torch` and model-loader imports moved into infrastructure adapters
- Model manager relocated to `application/services`
- Claims route reads framework from config instead of hardcoding Transformers
- Frontend `ModelConfig` interface extended with `modelsAvailable` and `cpuModelsAvailable`
- `ModelSettingsPanel` shows CPU mode info banner instead of GPU-required error
- `ModelStatusDashboard` uses severity-appropriate alerts for CPU mode
- `ModelManager.__init__` now requires `capability_probe` (was silently lazy-loaded)
- Thumbnail output directory is env-configurable via `THUMBNAIL_OUTPUT_ROOT`
- All Python docstrings converted to NumPy-style for consistency
- README rewritten for v0.1.0-style presentation with centered header, badges, and updated content
- LICENSE year updated
- Release workflow `DEVICE` arg switched from `cuda` to `gpu` to match Dockerfile stages

### Removed

- Backward-compat `TimeSpan` interface and `timeSpan?` annotation field (server types, ontology JSON schema, frontend `transformBackendToFrontend`, and `useAnnotationDrawing` stub)
- Legacy `string` branch of `OntologyTypeItem.gloss`; type narrowed to `GlossItem[]`
- Legacy `string`-baseUrl overload of `extractWikidataInfo` (and its dedicated test case); `WikidataSearch` now passes `{ baseUrl }`
- Stale `userId` (legacy) / `createdByUserId` commentary in `abilities.ts` now that the backfill migration has completed
- `capability_probe=None` backcompat path in `ModelManager`

### Security

- Hardened `video_downloader` and `video_processor` against SSRF and path injection: strict host allow-list with DNS resolution and IP safety check, extension allow-list, and resolve-then-relative-to path validation against configurable roots
- `get_video_path_for_id` now guards against path traversal via `resolve`-then-`relative_to` instead of `exists`-then-`commonpath`
- Replaced custom path/URL validators with inline CodeQL-recognized sanitizers (`re.fullmatch` on URL + `os.path.realpath` / `startswith` guards at each filesystem sink)
- Sanitized logged user-derived values with CRLF replacement to eliminate log-injection alerts
- Rewrote temp-file extension selection as a literal-only `elif` chain so CodeQL sees the extension as constant-sourced on every branch
- Eliminated compound-`or` guards, baked `os.sep` into module-level prefix constants, and collapsed the URL regex to a non-backtracking single alternative to clear residual CodeQL alerts
- Moved type-only LLM loader imports behind `TYPE_CHECKING`

### Fixed

- Broken relative imports in use cases after architecture refactoring
- Video module export mismatches (`download_video` vs. `download_video_if_needed`)
- Claims route hardcoding `LLMFramework.TRANSFORMERS` instead of reading config
- `YamlModelRepository.reload()` previously passed a raw task dict as `TaskConfig.selected`; now parses `selected` and `options` via a dedicated helper
- Audio loaders now guard against `load()` failure; cv2 RGB frames cast to `uint8` for `DetectObjectsFrameInput` and tracking append
- Model-service test patch targets updated from `AutoModelForVision2Seq` to `AutoModelForImageTextToText` to match the current loader import
- Dropped stale `print`-based fallback assertion in `test_create_llm_loader_with_fallback_uses_fallback`
- ESLint warnings: missing hook dependencies, unused variables, and unused imports
- Ruff errors: unsorted `__all__` lists, import ordering, deferred import warnings; `ruff format` applied across the model-service test suite

## [0.2.0] - 2026-04-21

### Added

#### Role-Based Access Control (RBAC)
- CASL authorization engine with permission seed data
- Role-based permission schema (admin, manager, annotator, viewer)
- Row-level authorization on every data route (annotations, summaries, claims, world state, personas, ontology, export, import) using `accessibleBy()` list filters and `subject()`-based instance checks
- Per-model ownership field resolution: `Persona`/`WorldState` use `userId`, `Annotation` uses `createdByUserId`, `VideoSummary`/`Claim`/`UserGroup` use `createdBy`, `Project` uses `ownerUserId`
- Per-user ability cache with explicit invalidation on every membership add, remove, role change, and project deletion
- Admin-editable `/api/admin/permissions` CRUD endpoints for runtime RolePermission management
- Sharing privilege cap: re-shared resources cannot exceed the received permission level
- VideoAccessService wired into all video routes so authenticated users only see videos assigned to their projects; non-existent videos pass through so route validation errors are not masked by 404
- Backfill migration populating `createdByUserId` from legacy `userId` on existing annotations, and `createdBy` on existing summaries and claims from their owning persona's user
- 29 negative RBAC security tests covering cross-tenant IDOR, null-ownership denial, cache invalidation timing, sharing escalation, and admin-only enforcement
- `seedBaselinePermissions()` test helper module for E2E test setup

#### Projects and Groups
- Project entity with membership, ownership, and sharing controls
- Group entity for organizing users into teams
- Backend routes for CRUD operations on projects, groups, and memberships
- Video assignment to projects with access scoping
- Project sharing with configurable permission levels
- User autocomplete for persona and member dialogs

#### Frontend
- Admin panel pages for project and group management
- Frontend stores and TanStack Query hooks for RBAC entities
- Project assignment and sharing dialogs in persona editor
- Member management with role selection

#### Observability
- OTEL tracing spans for RBAC authorization checks
- Prometheus alert rules for permission denied events
- Grafana RBAC monitoring dashboard
- Metrics for group, project, sharing, and video assignment operations

#### Testing
- Unit and integration tests for RBAC, groups, projects, sharing, and video assignments
- Frontend tests for RBAC stores, query hooks, and user management pages

#### Documentation
- User guide for projects and groups workflow
- RBAC architecture and permission model documentation
- API reference for new endpoints

### Changed

- All data-mutating routes now populate `createdByUserId` (annotations) and `createdBy` (summaries, claims, claim relations) from the authenticated session, never from the request body
- All Prisma JSON field handling uses runtime `toJson()` conversion and `Prisma.JsonObject` type guards instead of type assertion casts

## [0.1.7] - 2026-04-15

### Fixed

- Regenerates IDs for cross-user imports whose exports contain no persona lines (for example, users who only create object annotations linked to world entities)
- Remaps array-valued ID reference fields (`entityIds`, `eventIds`) on entity and event collections during cross-user imports
- Remaps `GlossItem.content` for `objectRef`, `annotationRef`, `claimRef`, and instance-level `typeRef` items so claims citing regenerated objects follow their new UUIDs
- Lets cross-user ID regeneration override non-regenerating resolutions (`skip`, `replace`, `merge`) so annotations referencing entities in the same import batch get new IDs

### Added

- Emits a provenance `metadata` line with `exporterUserId` at the start of every full export for reliable cross-user detection
- Emits `userId` on exported object annotations so cross-user detection works for exports that contain no persona lines
- Import dialog now shows a cross-user banner, per-conflict smart defaults, an "apply to all" bulk resolution, and auto-collapses large conflict groups

## [0.1.6] - 2026-03-28

### Fixed

- Generates new UUIDs when importing annotations from a different user even when original IDs are absent from the database

## [0.1.5] - 2026-03-10

### Fixed

- Fixes object annotation dropdown jitter when creating a second bounding box on a video

## [0.1.4] - 2026-03-10

### Fixed

- Scopes export keyframe and interpolated frame statistics to the authenticated user's annotations

## [0.1.3] - 2026-03-06

### Fixed

- Skips invalid annotation sequences during export instead of returning 400

## [0.1.2] - 2026-03-06

### Fixed

- Stabilizes entity dropdown scroll behavior in annotation autocomplete

## [0.1.1] - 2026-03-06

### Fixed

- Scopes annotation export to the authenticated user's personas

## [0.1.0] - 2026-02-27

Initial release of Fovea, the Flexible Ontology Visual Event Analyzer.

### Added

#### Core Platform
- React + TypeScript frontend with Material UI, built with Vite
- Fastify + TypeScript backend with Prisma ORM and PostgreSQL
- FastAPI + Python model service for AI inference
- Docker Compose orchestration for all services
- Docusaurus documentation site

#### Video Management
- Video browser with metadata display, search, and filtering
- S3 and local filesystem storage providers with hybrid support
- Video streaming endpoint with range request support
- Thumbnail generation for video previews
- Video sync endpoint for bulk metadata ingestion

#### Annotation System
- Bounding box annotation with draw, resize, and drag support
- Keyframe-based bounding box sequences with interpolation
- Linear and bezier interpolation modes with visibility ranges
- Canvas-based timeline with playhead scrubbing and zoom (1-10x)
- Keyboard shortcuts for frame navigation and workspace switching
- JSON Lines import/export with conflict resolution and preview
- Automated tracking integration (SAMURAI, SAM2, YOLO11-seg) for bootstrapping annotations

#### Ontology Management
- Persona-scoped ontology types (entity, role, event, relation)
- Multi-persona type creation and shared type tracking
- AI-powered type suggestions via LLM integration
- Wikidata integration with one-click import and ID mapping
- Configurable Wikidata URL with local Wikibase support
- Gloss editor with autocomplete and claim references

#### World State
- World object editors for entities, events, times, locations, and collections
- World state persistence to PostgreSQL
- Auto-save with debounce for all world objects

#### Video Summarization
- VLM-powered video summarization with persona context
- BullMQ job queue for async processing
- Key frame extraction with confidence scoring
- Audio transcription with speaker diarization (AssemblyAI, Deepgram, Azure, AWS, Google, Rev.ai, Gladia)
- Audio-visual fusion strategies
- Summary preview on Claims tab

#### Claims System
- Hierarchical claims and subclaims with manual editing
- Claim extraction from summaries via LLM
- Claim synthesis with BullMQ queue worker
- Typed claim relations with filtering and search
- Claim provenance tracking with comment fields
- Claim span highlighting in summaries

#### Object Detection
- Multi-model detection (YOLO-World, OWLv2, Florence-2, Grounding DINO)
- Configurable query options with ontology-aware prompts
- Detection candidate review with accept/reject controls

#### AI Model Service
- Model configuration system with YAML-based profiles
- Multi-model support for VLM, LLM, detection, and tracking tasks
- SGLang, vLLM, and Transformers inference frameworks
- 4-bit quantization support via bitsandbytes
- Model status dashboard with VRAM monitoring
- Model settings panel with per-task model selection
- External API support (Anthropic Claude, OpenAI GPT, Google Gemini)
- Pre-loading of selected models on service startup
- GPU configuration profiles for various hardware (A10G, etc.)

#### Authentication and Security
- Session-based authentication with progressive lockout
- Single-user mode with auto-authentication
- Admin user management with secure password handling
- User-scoped API keys with AES-256-GCM encryption
- Session management with heartbeat, emergency save, and expiry warnings
- CSRF protection and rate limiting by client IP

#### Data Management
- Full export/import system with Zod validation for all data types
- User-scoped data isolation with cross-user conflict resolution
- Persona auto-save on creation
- Auto-save for annotations, ontology types, and world objects

#### Observability
- OpenTelemetry distributed tracing across all services
- Prometheus metrics with custom counters
- Grafana dashboards for monitoring
- Health check endpoints with Docker HEALTHCHECK
- Structured logging throughout

#### Infrastructure
- GitHub Actions CI/CD with lint, test, and Docker builds
- Release workflow with automatic changelog generation
- Deployment workflow with rsync and health checks
- Security scanning with CodeQL and TruffleHog
- Docker multi-stage builds with BuildKit optimizations
- Redis caching with CacheService integration
- Database indexes for performance

#### Frontend Architecture
- State management migration from Redux to TanStack Query + Zustand
- Feature-based directory structure with barrel exports
- Path aliases for clean imports
- Error boundaries with retry capability
- TypeScript strict mode with proper typing throughout

#### Backend Architecture
- Typed error class hierarchy with global error handler
- Modular video route structure
- VideoRepository pattern for database access
- Standardized storage configuration with STORAGE_PATH

[0.4.0]: https://github.com/parafovea/fovea/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/parafovea/fovea/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/parafovea/fovea/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/parafovea/fovea/releases/tag/v0.1.7
[0.1.6]: https://github.com/parafovea/fovea/releases/tag/v0.1.6
[0.1.5]: https://github.com/parafovea/fovea/releases/tag/v0.1.5
[0.1.4]: https://github.com/parafovea/fovea/releases/tag/v0.1.4
[0.1.3]: https://github.com/parafovea/fovea/releases/tag/v0.1.3
[0.1.2]: https://github.com/parafovea/fovea/releases/tag/v0.1.2
[0.1.1]: https://github.com/parafovea/fovea/releases/tag/v0.1.1
[0.1.0]: https://github.com/parafovea/fovea/releases/tag/v0.1.0
