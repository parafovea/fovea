# Changelog

This is a live copy of the workspace `CHANGELOG.md`. Releases are tracked in the format documented at [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

# Changelog

All notable changes to the Fovea project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-17

The 0.5.0 cycle delivers the architecture-modularization roadmap (`notes/architecture-review.md`): single sources of truth for configuration, containerization, the build/test surface, and cross-service contracts. Changes land incrementally on `release/0.5.x`; this section accumulates them.

### Changed

#### Backend Configuration Single-Source-of-Truth

- All backend environment access is centralized in one typed, validated module, `server/src/config.ts`. It is the only file in `server/src` permitted to read `process.env` (enforced by a new ESLint `no-restricted-syntax` rule with a `config.ts`/`prisma`/`test` exemption), loads an optional local `.env` via `dotenv`, exposes a deep-frozen `config` object grouped by concern (`server`, `redis`, `auth`, `storage`, `modelService`, `rateLimit`, `cors`, `otel`, `mode`, `demo`, `tours`, `wikidata`, `externalLinks`, `defaultUser`), and centralizes every default and coercion. All 31 previously-scattered `process.env` reads across routes, services, queues, middleware, and libs now go through it. The two dynamic read patterns are exposed as typed helpers: `config.modelService.timeoutMs(endpoint)` and `config.getProviderApiKey(provider)`.
- Configuration is now validated once at startup and fails fast: `config.ts` is imported first in `server/src/index.ts` (before tracing), validates numeric env vars through a TypeBox schema, requires `API_KEY_ENCRYPTION_KEY` to hex-decode to 32 bytes at boot (previously validated lazily at first key use), and refuses an unset or dev-default `SESSION_SECRET` in production.
- Four environment defaults that previously disagreed across read sites are unified to one value each: `STORAGE_PATH` (the repo-relative `videos` path), `FOVEA_MODE` (`multi-user`), `MODEL_SERVICE_URL` (`http://localhost:8000`), and `OTEL_EXPORTER_OTLP_ENDPOINT` (`http://localhost:4318`). These defaults only apply when the variable is unset; every docker/production deployment sets them explicitly, so deployed behavior is unchanged. Single-user and demo-mode branching now route through the single `isSingleUserMode()` / `isDemoModeEnabled()` predicates (reading from `config`) instead of inline per-handler `process.env` comparisons.

#### Frontend Configuration Single-Source-of-Truth

- All frontend environment access is centralized in one typed module, `annotation-tool/src/config.ts`, the only file permitted to read `import.meta.env` (enforced by an ESLint `no-restricted-syntax` rule). It exposes a deep-frozen `config` grouped by concern (`env`, `api`, `wikidata`, `deploymentMode`, `testData`, `demo`) with all defaults and coercions centralized, removes the two `import.meta as unknown` cast hacks in `demo/config.ts` and `demo/api.ts`, drops the dead `VITE_MODEL_SERVICE_URL` declaration, and normalizes the previously-inconsistent `VITE_E2E` checks to `=== '1'`.
- The mode/demo build flags resolve into one derived `config.deploymentMode` with a typed `kind` (`normal` / `public-demo` / `tour-demo` / `legacy-demo-shell`) and documented precedence (legacy DemoShell short-circuits; `VITE_DEMO_PUBLIC` suppresses the runtime MSW worker even when the tour-demo mocks are built). The three tree-shaking-critical guards (the `VITE_TOUR_DEMO` MSW dynamic-import gates and the `VITE_E2E` fixture gate) deliberately keep their inline literal comparison so Rollup still drops the `mocks/tourDemo` subtree from normal production builds, verified by a build check.

### Fixed

#### Release Workflow Now Publishes GitHub Releases

- `release.yml` gains a `create-release` job that, on every `v*.*.*` tag push, extracts the matching `CHANGELOG.md` section and creates or updates the GitHub Release. Previously the workflow only built and pushed Docker images, so a tag published no GitHub Release unless one was made by hand (which is how v0.4.3's Release came to be missing). The job is deliberately independent of the image build, so a Release is published even when the heavy `model-service-gpu` image hits the 90-minute job timeout.

## [0.4.4] - 2026-06-17

The first installment of the architecture-modularization roadmap (`notes/architecture-review.md`, Phase 0): reversible cleanups with no user-facing behavior change — dead dependencies removed, a configuration template de-duplicated, and one latent model-loader gap closed with a regression guard.

### Removed

#### Unused Backend Dependencies

- Dropped `cors`, `express`, and `multer` (and their `@types/cors`, `@types/express`, `@types/multer` type packages) from `server/package.json`. The backend is entirely Fastify and imports `@fastify/cors`; these three packages had zero import sites in `server/src`. `pnpm-lock.yaml` was regenerated, removing them and their now-orphaned transitive dependencies.

### Fixed

#### SAM 3.1 Object Detection Had No Loader Path

- `_object_detection_factory` (`model-service/src/infrastructure/config/task_factories.py`) was missing the `framework == "sam3"` pre-dispatch that `_object_tracking_factory` already had, so an `object_detection` model selecting SAM 3.1 (`config/models.yaml`, `selected: "sam-3-1"`) routed to the architecture-keyed detection registry — which registers no SAM3 loader — and would raise `UnknownArchitectureError` at load time. The factory now pre-dispatches `framework == "sam3"` to the existing, contract-tested `SAM3DetectionAdapter` via `SAM3Loader`, matching the tracking path. The `SAM3Detection`/`SAM3Tracking` architecture classes are deliberately registry-less (SAM3 loads through framework pre-dispatch, and the classes exist so SAM3 YAML entries carry a schema-valid `architecture:` block), so nothing was removed.
- Added `model-service/test/config/test_catalog_dispatch_invariant.py`, a bidirectional architecture-to-loader invariant test: every `architecture.kind` across `models.yaml` and `models-cpu.yaml` must resolve to a registered loader, a documented framework pre-dispatch (`sam3`, `external_api`), or a dedicated task factory (speaker diarization, voice-activity detection), and every registered loader must target a valid architecture-family union member. Reverting the SAM3 detection fix makes this suite fail, so a future un-wired architecture is caught in CI rather than at model load.

### Changed

#### Configuration Template De-duplication

- Removed the duplicate `REDIS_PORT` declaration from `.env.example` (it appeared in both the Redis-configuration and host-ports sections; duplicate dotenv keys are silently last-wins). The key is now defined once, in the Redis-configuration section, with a pointer comment where the host-ports list previously repeated it.
- Synchronized the two package manifests that had drifted behind the release version (`model-service/package.json` and `wikibase/pyproject.toml` were still at `0.4.0`); all seven package manifests now report `0.4.4`.

## [0.4.3] - 2026-06-17

This release works through the open issue backlog: it closes three issues that were already resolved on `main` (verified by running their tests) and fixes four that were still outstanding.

### Added

#### Claim Timestamps (#134)

- Claims can now record the video segment(s) they are grounded in. A new `Claim.timeSpans` JSON column (`server/prisma/schema.prisma`, migration `20260616000000_add_claim_time_spans`) stores a list of `{ start, end, source, annotationIds? }` objects, supporting **discontiguous** spans, and is threaded through the claim create/update routes and their TypeBox schemas (`server/src/routes/claims.ts`), import (`server/src/services/import-handler.ts`), and export (`server/src/services/export-handler.ts`). The matching frontend type is `ClaimTimeSpan` in `annotation-tool/src/models/claims.ts`.
- The `ClaimEditor` lets annotators set spans two ways: by **scrubbing** the video — the dialog hides, a workspace capture banner reads the playhead for the span start then end, and the dialog returns with the span appended (state machine in `annotation-tool/src/store/zustand/claimsUiStore.ts`, banner + hide/reopen wiring in `AnnotationWorkspace.tsx` / `VideoSummaryEditor.tsx`) — or by **deriving** spans from the time bounds of selected object/bounding-box annotations (reusing `getAnnotationTimeBounds`). Spans render as removable chips in the editor and read-only badges in `ClaimsViewer`.

#### Recursive Video Discovery + Corpus Manifest (#108)

- `LocalStorageProvider.listVideos` (`server/src/services/videoStorage.ts`) now discovers videos recursively, so videos organized into subdirectories sync without flattening; keys are stored subdirectory-relative and resolve through the existing streaming and metadata-sidecar paths.
- A new optional `fovea.manifest.json` at the root of the videos storage declares projects and user groups. During sync (`server/src/services/videoManifest.ts`, applied from `server/src/services/videoSync.ts`), projects and groups are upserted by slug, group memberships are reconciled additively (members are added and roles updated, never removed), and each video is assigned to the project whose path glob is the most specific match ("nearest wins"). Assignments carry `source: "folder"` and re-syncing is idempotent. A missing manifest is a no-op; a malformed one is logged and skipped. Documented in `docs/docs/guide/deployment.md`.

#### Batch Lookup Endpoints (#136)

- `POST /api/personas/ontologies` and `POST /api/videos/summaries/lookup` return sparse arrays in a single round-trip, replacing the per-persona and per-video request fan-out on the VideoBrowser's initial load.

### Fixed

#### Auth Race Lets Logged-Out Users Briefly See the Video Browser (#92)

- `ProtectedRoute` (`annotation-tool/src/App.tsx`) now holds the loading screen until `appConfig !== null`, and `useSession` (`annotation-tool/src/hooks/auth/useSession.ts`) wraps the `/api/config` fetch in a bounded exponential-backoff retry (`[500, 1000, 2000, 4000, 8000]` ms). Previously a transient 5xx on `/api/config` under load left the deployment mode unknown (defaulting to single-user) while a `/api/auth/me` 401 cleared the loading flag, so a logged-out visitor briefly fell through to the protected Layout. The jsdom test setup also gains a Web Storage polyfill so the persisted auth store can write during tests.

#### Initial-Load Fan-Out Trips the Rate Limit (#136)

- The frontend no longer fans a hard refresh out into one request per persona and one per video. `useAllPersonaOntologies` and the VideoBrowser per-card summary fetch now use the new batch endpoints and seed the per-id caches; the per-card `useVideoSummary` is gated on the batch settling and falls back to individual fetches if the batch route is unavailable. The Fastify rate-limit cap and window are now env-configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` (`server/src/app.ts`) so operators can size the limit to their corpus.

### Verified Already Resolved (closed without code change)

- **#100 — Import yields annotation conflicts for new users.** Cross-user import already regenerates all UUIDs on `main`; confirmed by `server/test/services/import-cross-user.test.ts`, `import-handler-remap-ids.test.ts`, and the `cross-user-import-{foreign,rich,real}-fixture` + `import-export-cross-user` integration tests.
- **#121 — Display issues for imported annotations.** Entity deduplication and structure-agnostic inline-UUID remapping already ship on `main`; the foreign/rich fixtures assert no duplicate annotations, claims display, and no stale exporter UUIDs in claim text.
- **#122 — Vitest dual-React Dialog tests.** The dual-React `useContext` failure no longer reproduces on `main`; the exact files named in the issue (`persona-deletion.test.tsx`, `PersonaBrowser.test.tsx`) and the Dialog-rendering tests all pass.

## [0.4.2] - 2026-06-06

### Fixed

#### Annotation Save Duplication on Add Keyframe (cachedIdsRef Regression)

- `annotation-tool/src/store/queries/useAnnotations.ts` converts the `useSaveAnnotations` hook's `cachedIdsRef` from a plain `{ current: new Set<string>() }` literal to `useRef<Set<string>>()`. The literal was reconstructed on every render; `onMutate`'s call to `queryClient.setQueryData(...)` triggers a synchronous re-render that ran the hook again and produced a fresh empty ref before `mutationFn` read it. With the ref now an empty Set, every annotation in the list was treated as new and routed through `api.saveAnnotation` (POST = create). The observable symptom: clicking Add Keyframe on any existing annotation triggered a wave of N new annotation rows on the canvas (one per existing annotation), and the new keyframe never attached to the selected annotation because the original annotation row was unchanged on the server while the optimistically-mutated cache row was orphaned by the round-trip. The bug was present in v0.1.11's `useSaveAnnotations.ts` too (identical literal-ref pattern), but v0.1.11 sat behind the separate `useAutoSaveAnnotations` hook which short-circuited saves via a JSON.stringify no-op comparison; v0.4.x replaced that custom path with the generic `useAutoSave` which fires far more aggressively and exposed the latent ref bug.
- `annotation-tool/src/store/queries/useAnnotations.test.tsx` adds two regression tests pinning the fix:
  - "routes an annotation already in cache through PUT, not POST": seeds the QueryClient cache with one annotation, calls `mutateAsync` with the same id, asserts zero POSTs and exactly one PUT to `/api/annotations/existing-1`, and asserts the result counts (`created: 0, updated: 1`).
  - "does not duplicate every annotation when many existing rows are saved together (Add Keyframe simulation)": seeds the cache with four annotations, calls `mutateAsync` with the same four, asserts zero POSTs and exactly four PUTs (one per id), and asserts the result counts (`created: 0, updated: 4`).

#### Timeline Track List Clipping

- `annotation-tool/src/components/annotation/timeline/TimelineRoot.tsx` wraps the track-header column and the keyframe-surface column in their own `flex-1 min-h-0 overflow-y-auto` scrollers, with a synchronised-scroll handler pair (`handleLeftScroll` / `handleRightScroll` guarded by a `suppressScrollSyncRef` flag) that mirrors `scrollTop` between the two halves so the header column and the lane column stay row-aligned no matter which side the user drives. The prior `overflow-hidden` columns clipped the bottom of the track stack the moment the annotation count exceeded the visible area, hiding lock / solo / mute controls and the playhead for every track beyond row N.

## [0.4.1] - 2026-06-06

### Fixed

#### CASL Baseline Create Permissions (Production-Demo 403 Storm)

- Every signed-in user now receives a baseline `create` grant on resources they will own (`Annotation`, `VideoSummary`, `Claim`, `Persona`, `WorldState`), conditional on the candidate row's `createdBy` / `createdByUserId` / `userId` field matching the caller. The prior `server/src/lib/abilities.ts` baseline covered only `read`, `update`, and `delete` on owned resources, which forced any user without an explicit `project_memberships` row to obtain a project role (annotator / project_manager / project_owner) before they could create anything. On demo.fovea.video this produced an authoring-deadlock: the autosave loop in `VideoSummaryEditor` fired `POST /api/summaries` within seconds of the Edit Video Summary dialog opening, and the route's CASL gate (`ability.can('create', subject('VideoSummary', { projectId: persona.projectId, createdBy: userId }))`) denied every attempt, so the dialog rendered the error text "Cannot create this VideoSummary" as the actual summary body and re-fired the same `POST` every few seconds in a 403 storm. The same wall blocked `POST /api/annotations` (every keyframe save) and `POST /api/summaries/:summaryId/claims` (every manual claim) and contributed to the keyframe-snaps-back behaviour where one keyframe edit landed under the baseline `update` while the next round-tripped through a `create` that 403'd. With the baseline `create` rules in place, a personal-project user can create their own resources without needing a project_memberships row; cross-user creates (a candidate naming a different `createdBy`) still fail because the CASL condition still scopes to the caller.
- `server/test/lib/abilities.test.ts` adds a positive baseline-create suite that asserts `can('create', subject(model, { ownerField: 'user-1' }))` is true for all five models (own VideoSummary, own Annotation, own Claim, own Persona, own WorldState) and that the cross-user variants (`ownerField: 'other-user'`) are denied. The prior `viewer can only read annotations` and `handles empty permissions array gracefully` assertions are now subject-aware so the bare `can('create', 'Annotation')` check no longer fires a false-positive against the new conditional rule. 20/20 abilities tests green.

#### Bounding Box Visibility

- Bumped the `InteractiveBoundingBox` stroke width from 2px / 4px to 3px / 6px (type vs object annotation) so the boxes are visible against busy video frames at lower viewport zooms; the prior 2px stroke was lost in high-saturation regions of the underlying clip.
- Bumped the always-on annotation type badge from `text-[clamp(10px,0.75rem,14px)]` with `h-6` to `text-[clamp(13px,1rem,18px)] font-semibold` with `h-8`, widened the `foreignObject` from 200×30 to 240×38 (y offset shifted from -30 to -38), and bumped `max-w` from 180 to 220 px so longer Wikidata-grounded labels (e.g., "Spectator → spectator at LoanDepot Park") don't truncate prematurely.

#### Demo Deploy Hygiene

- `.github/workflows/deploy.yml` no longer builds or starts the `model-service` container on demo.fovea.video. The demo server cannot withstand CVPR-scale concurrent inference traffic; the frontend's `modelsDisabled` gate already greys every model-service-hitting button (Detect Objects, Transcribe Audio, per-card Summarize, Summarize All Videos, Extract Claims, Suggest Types) when `/api/models/config` 503s, which is the steady-state with no model-service container. Both DEMO_MODE branches now restrict `docker compose up` to `backend frontend` instead of bringing up every service in the base compose file, and `docker compose build` excludes model-service so the ~5 GB CPU image rebuild no longer happens on every deploy. The minimal-CPU image continues to publish from `docker.yml` for any downstream stack that wants it; the live local-backup the CVPR demo runs on the booth laptop builds its full-CPU variant via `docker-compose.local-full.yml`.
- `.github/workflows/release.yml` repointed the frontend and backend Build Release Images jobs from `context: ./annotation-tool` / `context: ./server` to `context: .` with explicit `file: <package>/Dockerfile`, matching `docker.yml`. The prior `context: ./<package>` config made buildx fail with `failed to compute cache key: "/annotation-tool": not found` because the Dockerfiles `COPY annotation-tool/...` / `COPY server/...` from the pnpm-workspace lockfile at the repo root, not from inside the package directory. The two model-service entries keep `context: ./model-service` (their Dockerfile is package-local) with `file` left unset so the action defaults to `./model-service/Dockerfile`. v0.4.0 GHCR image publication was broken by the prior config; v0.4.1 re-tag triggers a green release run.
- `docs/scripts/generate-api-docs.sh`-generated `docs/docs/api-reference/model-service/` subtree is now `.gitignore`d alongside the already-ignored `frontend/` and `backend/` mirrors so the auto-generated MD files do not show up as untracked after a docs rebuild.
- `annotation-tool/probe-*.mjs` and root `probe-*.mjs` are now `.gitignore`d so ad-hoc Playwright probes don't pollute `git status`; the four pre-existing committed probes (probe-gloss / probe-one / probe-state-isolation / probe-tours) stay tracked.

#### Docusaurus MDX Build

- `annotation-tool/src/tours/engine/simulateAction.ts` `humanType` TSDoc wraps `KeyboardEvent('keydown')` / `InputEvent('beforeinput')` / `InputEvent('input', { data, inputType: 'insertText' })` / `KeyboardEvent('keyup')` in inline-code backticks so MDX 3 stops trying to parse the `{ data, inputType: 'insertText' }` literal as a JSX expression. The prior un-quoted form blew up Docusaurus' acorn parse with `Could not parse expression with acorn` at the generated `humanType.md` line 20 col 43, breaking the Documentation CI workflow on every commit since the TSDoc landed.
## [0.4.0] - 2026-06-04

### Added

#### Audio Transcription and Speaker Diarization

- New end-to-end audio path: a Transcribe Audio button on the AnnotationWorkspace toolbar (`data-testid="transcribe-audio-button"`) calls the new backend route `POST /api/videos/:videoId/transcribe` which forwards to the model-service's new `/api/transcribe` (faster-whisper) endpoint and, when `enableDiarization: true`, also to `/api/diarize` (pyannote). The backend merges per-second overlap so every transcript segment carries the speaker who talked the longest within its interval; the resulting payload renders in a new `TranscriptPanel` component with colour-coded speaker chips (8-colour palette + an Unknown fallback), MM:SS click-to-seek timestamps, an active-segment highlight that follows the video playhead, and auto-scroll-into-view so the booth visitor can leave the dialog open while the clip plays. Diarization failure degrades gracefully to the plain transcript so the visitor always sees text.
- New model-service routes:
  - `POST /api/transcribe` (body: `{audio_path, language?}`) returns `{text, segments, language, duration, processing_time, model_used}`; the loader is typed as `AudioTranscriptionLoader` and the result as `TranscriptionResult` (no `Any`). Empty-string `language` is normalised to `None` so the visitor's auto-detect path is not rejected by the faster-whisper hard-lookup table.
  - `POST /api/diarize` (body: `{audio_path, num_speakers?, min_speakers?, max_speakers?}`) returns `{segments, speakers (first-appearance ordered, deduped), processing_time, model_used}`; the loader is typed via a local `_DiarizationModel` Protocol so the route does not couple to PyannoteLoader as a concrete class. Per-request speaker-count hints are logged as a warning since the current loader binds them at config-load time.
- New backend route `POST /api/videos/:videoId/transcribe` in `server/src/routes/videos/transcribe.ts`: resolves the video via `videoRepository.findByIdWithSelect`, translates `/data/` to `/videos/` on the path, and forwards through the typed `fetchModelService` helper with a new `MODEL_SERVICE_TIMEOUT_TRANSCRIBE_MS` env var (default 300_000 ms). Diarization failure returns a plain transcript with a `log.warn` and a 200; transcription failure preserves the upstream status with a typed `{error: 'MODEL_SERVICE_ERROR', message}` body that survives the fast-json-stringify response schema.
- New frontend types: `TranscribeRequest`, `TranscribeResponse`, `TranscriptSegment` in `@api/client`; new `useTranscribeVideo` mutation hook in `@store/queries/useTranscribe`; new `Mic` icon import on AnnotationWorkspace; new dialog state machinery (`transcriptDialogOpen`, `transcriptResult`, `transcriptError`, `diarizationRequested`).
- HuggingFace token (`HF_TOKEN` + `HUGGING_FACE_HUB_TOKEN`) plumbed through `docker-compose.e2e.real-models.yml` so the model-service can authenticate against the gated pyannote model and avoid the unauthenticated rate-limit that stalled first-call faster-whisper downloads.
- New `MODEL_SERVICE_TIMEOUT_<KIND>_MS` env var family on `server/src/lib/fetchModelService.ts` makes every per-endpoint ceiling overridable; `docker-compose.e2e.real-models.yml` bumps the six values to CPU-friendly ranges (600000 ms detection/thumbnails/ontology-augment, 1800000 ms summarize/extractClaims/synthesize). Production defaults are unchanged.
- Model-service `[cpu]` optional-dependencies extra in `model-service/pyproject.toml` ships `llama-cpp-python>=0.3.0` + `onnxruntime>=1.20.0` so the CPU image actually carries the runtimes its bundled `models-cpu.yaml` config selects (the prior CPU image had no llama_cpp module and every GGUF or ONNX load died at import).
- New `model-service/test/infrastructure/adapters/inbound/fastapi/routes/test_diarize.py` covers the route end-to-end against a fake PyannoteLoader-shaped diarizer (happy path, 404 missing audio, 500 missing task, 500 load failure, 500 diarize failure, warning when hints supplied, no warning when hints omitted): 7/7 passing.
- New `server/test/routes/videos/transcribe.test.ts` covers the backend forwarder: 404 missing video, plain transcription forwards to /transcribe only, enableDiarization forwards to both and assigns max-overlap speaker per segment, diarization 500 falls back to plain transcript with a warn, transcription 500 returns `MODEL_SERVICE_ERROR` with the upstream text, timeout returns 504 with `MODEL_SERVICE_TIMEOUT`, unreachable returns 502 with `MODEL_SERVICE_UNREACHABLE`, the typed error classes are distinguishable: 8/8 passing.
- New `annotation-tool/src/components/video/TranscriptPanel.test.tsx` covers the new UI component (header summary surfaces language / duration / ASR / processing time, speaker legend friendly-name mapping `SPEAKER_00` to `Speaker 1`, MM:SS timestamp formatting, onSeek wiring, active-segment data attribute moves on rerender, per-segment speaker chip uses friendly name, empty-speakers omits chips entirely, whitespace renders italic `(silence)` placeholder, diarization metadata surfaces): 9/9 passing.
- Tier 2 integration spec `annotation-tool/test/e2e/integration/model-service/real-model-inference.spec.ts` gains a Transcribe Audio user journey that drives the toolbar button against the real CPU model-service stack.

#### Tour-Demo Mode (MSW Model-Service Interception)

- New build flag `VITE_TOUR_DEMO=1` ships an MSW browser worker that intercepts every model-service-bound route the tours touch (`/api/ontology/augment`, `/api/videos/:videoId/detect`, `/api/videos/:videoId/track`, `/api/videos/:videoId/transcribe`, `/api/videos/:videoId/summarize`, `/api/claims/extract`), so the CVPR booth machine no longer needs a live model service to demonstrate detection / tracking / ontology augmentation / transcription / diarization / VLM summarization / claim extraction. The dynamic import sits behind a statically-analysable env-var guard, so the entire `src/mocks/tourDemo` subtree tree-shakes out of production builds where the flag is off.
- Every fixture is sourced from the deployment's `TourContentBundle` (the same `/tour-content.json` an admin already edits to retheme tours), so swapping the domain re-themes the mocked model outputs in the same edit pass. Three new sub-slot interfaces extend `TourContentBundle`: `TourMockOntologySuggestion` for Tour 3's AI augmenter, `TourMockDetectionProposal` + `TourMockTrackingKeyframe` for Tour 6's detection + tracker, `TourMockTranscriptSegment` + `TourMockClaimAtom` for Tour 7's transcribe + summarize + claim-split flow.
- Every fixture is intentionally "almost-there": the analyst polishes the model output to its final microvent form, not the other way around. Five ontology suggestions where the visitor accepts one and rejects four; four detection proposals (two genuine high-confidence containers, two spurious low-confidence boxes the analyst rejects) hand-grounded against an extracted frame at t=8s of the ABC7 Port of Long Beach cargo-fall clip; a 30-frame tracker trajectory with a clean first-22 prefix and a flagged last-8 drift the analyst re-anchors; a four-segment two-speaker transcript with one low-confidence segment carrying a deliberate single-word recognition error AND a wrong speaker assignment; a VLM summary synthesised from the eventual atomic claims with one believable factual error ("above the right-field line" vs the final "behind home plate"); a non-atomic compound claim with a `needsSplit` flag + three `splitTargets` the analyst splits into atomic rows via the claim editor.
- `TourMockDetectionProposal` carries `acceptAsLabel` + `acceptAsWikidataId` so each suggested type is grounded in Wikidata (e.g. `container` Q987767, water Q283, crane Q178692). The `Detection` interface in `api/client.ts` gains two optional tour-demo-only fields; the candidates list renders a "Snap to type" chip (`data-testid="suggested-type-chip"`) gated on `acceptAsLabel` being truthy.
- Simulated latency 800-1800 ms in `handlers.ts` matches a warm CPU-mode model-service so the visitor sees a real-feeling "computing" beat without the booth needing a GPU stack.
- New `docker-compose.tour-demo.yml` override flips `VITE_TOUR_DEMO=1` at frontend build time so the booth operator engages tour-demo mocking via `docker compose -f docker-compose.yml -f docker-compose.tour-demo.yml up -d --build` without touching the base compose file or the Dockerfile.
- New smoke specs:
  - `test/e2e/smoke/tour-demo-msw.spec.ts` (2 tests, 17.6s) asserts every one of the six routes is intercepted, validates each fixture against the bundle defaults, and checks simulated latency lands in the 600-2400 ms window
  - `test/e2e/smoke/tour-demo-launch-all.spec.ts` (12 tests including 10 tour launches) walks every built-in tour through `window.__foveaTour.launch()` and asserts each one resolves true + becomes the active tour + abandons cleanly
  - `test/e2e/smoke/tour-demo-spotlight-pause-resume.spec.ts` (4 tests, 5.4s) re-asserts the engine wiring against the MSW-mocked demo build: spotlight overlay paints (4 backdrop + 1 outline + 4 corner = 9 rects), Pause unmounts and surfaces the resume pill, Resume re-mounts at the same step, paused state survives a hard reload

#### Public Tour Catalogue and New Tours for demo.fovea.video

- New `src/pages/TourCataloguePage.tsx` is a public 4-column tour catalogue that mounts as the `/` route when the bundle is built with `VITE_DEMO_PUBLIC=1`. The page surfaces the FOVEA wordmark + the "Flexible Ontology Visual Event Analyzer" tagline + a Sign in link top-right, and renders 12 tour cards in a responsive grid (sm: 2, lg: 4 columns) so the catalogue lays out as a 4×3 grid on a landscape booth screen and stacks cleanly down on mobile QR scans. `App.tsx` wires the flag so the authenticated app moves under `/app/*` and the public catalogue claims `/`.
- Two new tours land in the catalogue:
  - **Tour 0 (welcome.ts)** "Welcome to FOVEA": three-step orientation that opens the catalogue (FOVEA backronym reading + the four-layer model + the analyst-polishes-model-output editing-loop framing all in two minutes). Content-neutral; no bundle slot.
  - **Tour 11 (keyframes-interpolation.ts)** "Working with longer videos: keyframes and interpolation": five-step temporal-modeling deep-dive that closes the grid (sparse keyframes, linear/Bezier interpolation curve, motion-path overlay, same data structure model and human edit).
- `scripts/index.ts` orders Welcome first followed by the four-layer arc, the model-assisted flows, the collaboration / admin / import-export operator surfaces, and keyframes-interpolation last.

#### Auth-Pages Branding and Admin-Only Account Policy

- LoginPage and RegisterPage gain the official `fovea-logo.svg` (size-12 above the wordmark), the uppercase `FOVEA` h1 with `tracking-wide` matching the sidebar wordmark, and the "Flexible Ontology Visual Event Analyzer" tagline. The generic Lucide `LogIn` / `UserPlus` icons are dropped.
- LoginPage surfaces a clear Alert with a mailto when `authStore.allowRegistration` is false: "Self-registration is disabled on this deployment. To request an account, email admin@fovea.video." Replaces the silent dead-end where the Register link just vanished. The admin console's `CreateUserDialog` is independent of the registration toggle, so the operator can still mint accounts trivially after the demo deploy.
- LoginPage post-login redirect respects `VITE_DEMO_PUBLIC=1` and lands on `/app` instead of looping back to the catalogue at `/`.

#### Demo Deployment Plumbing (deploy.yml demo_mode + nginx.demo.conf)

- New `workflow_dispatch` input `demo_mode` (default false) on `.github/workflows/deploy.yml`. When set true the on-server env patch flips `ALLOW_REGISTRATION=false`, sets `VITE_TOUR_DEMO=1` + `VITE_DEMO_PUBLIC=1`, copies `annotation-tool/nginx.demo.conf` over `annotation-tool/nginx.conf`, skips `docker compose up model-service` entirely (the frontend MSW worker intercepts the six model-service routes so there is nothing to start), and explicitly limits the recreate to `backend` + `frontend` so the missing model-service does not block.
- New `annotation-tool/nginx.demo.conf` ships two `limit_req_zone` scopes (login_zone 30r/m burst 10, register_zone 5r/m burst 3 as defence-in-depth even though registration is disabled), `Cache-Control: no-store` on `/tour-content.json` so admin edits land immediately, `Cache-Control: public, immutable` on `/assets/*`, and 60 s cache on `/mockServiceWorker.js` so a worker-version bump propagates fast without re-downloading on every scan.
- `docker-compose.yml` frontend service threads `VITE_TOUR_DEMO` + `VITE_DEMO_PUBLIC` build args with empty defaults so production builds without the demo flag tree-shake the entire `src/mocks/tourDemo` subtree out of the bundle.
- New runbook at `docs/development/demo-fovea-deployment.md` documents the workflow input, the env-var deltas, the post-deploy curl smoke (including a login rate-limit burst check), the admin-console account-mint flow, and how the booth-laptop `docker-compose.tour-demo.yml` stack relates to the production demo deploy.

#### Tour Content (Twelve Tours, All New in 0.4.0)

- Tour 3 "Grow your ontology from Wikidata" covers BOTH manual type creation AND Wikidata import in a single walkthrough so the visitor sees the contrast directly: steps 1-2 take the manual-entry path (`type-editor-mode-manual` then `type-editor-mode-wikidata`); steps 3-8 continue the Wikidata flow. New `data-tour-id` anchors on `shared/ModeSelector.tsx` (manual / copy / wikidata) make the modes addressable.
- Tour 5 "The world layer" walks all four world-object editors (entity / location / event / time) with narration that calls out what is distinctive about each (entity binds a TYPE to a thing, location adds coordinates and a map pin, event has start/end + role bindings the entity editor does not, time has the start/end/fuzzy controls), including an event-instance step.
- Tour 2 "Building a persona's ontology" relation-type-editor narration contrasts the source-types and target-types pickers against the entity / event / role type editors.
- Tours 3, 6, 7 narrate the accept-some / reject-some / inline-edit / split-compound-claim editing loop the demo is built around. Tour 3 augmenter-results includes accept-and-rename steps (accept the close-but-not-quite "Ball grab" suggestion and rename it to lowercase `ball-grab`, reject the four distractors). Tour 6 candidates-list + tracking-results-panel includes accept-two / reject-two / snap-to-general-type-with-Wikidata-Q987767 / re-anchor-tracker-at-frame-214 steps. Tour 7 transcript-viewer + video-summary-editor + claims-extraction-dialog includes inline-edit `snatched` to `grabbed`, flip the speaker chip, correct `above the right-field line` to `behind home plate`, split the non-atomic compound claim into three atomic rows.
- Tour 7 carries a two-step prelude visiting the on-demand Transcribe Audio button + TranscriptPanel dialog before the saved-summary `audio-config-panel` + `transcript-viewer` flow.

#### Type Strictness on the New Model-Service Inbound Routes

- `model-service/src/infrastructure/adapters/inbound/fastapi/routes/transcribe.py` (new in 0.4.0 for the audio-transcription path): `result: TranscriptionResult` (no `Any`); model is typed `AudioTranscriptionLoader` via `cast`. Empty-string language is normalised to `None` so the auto-detect path is not rejected by faster-whisper.
- `model-service/src/infrastructure/adapters/inbound/fastapi/routes/diarize.py` (new in 0.4.0 for the speaker-diarization path): model is typed via a local `Protocol` (`_DiarizationModel`) with the single `diarize(audio_path) -> DiarizationResult` contract, so the route does not couple to `PyannoteLoader` as a concrete class. `result: DiarizationResult` (typed dataclass with `SpeakerSegment` members).

#### Operations Section Expanded From One Runbook to Six Pages

- `docs/docs/operations/` grows from the single `demo-fovea-deployment.md` runbook to six pages: `production-deployment.md` (six-container docker-compose stack first-time setup, port/data-volume topology, what-to-expose checklist), `monitoring.md` (OTel trace export, the Prometheus counters and histograms `server/src/metrics.ts` emits, `/api/health` readiness probe, model-service `/health`, a minimal alert set, what is intentionally not instrumented), `backup-restore.md` (`pg_dump` cadence + storage-volume rsync, quarterly DR drill), `upgrades.md` (patch / minor / major paths, Prisma migrate deploy, permission-catalogue re-seed), `troubleshooting.md` (failure modes organized by user-visible symptom), plus the existing `demo-fovea-deployment.md`. Each page is rooted in what the live code actually carries (env vars from `fetchModelService.ts`, metrics from `metrics.ts`, etc.).

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

#### Backend Reliability

- `services/system-config-propagator.ts` factors model-service propagation out of the admin-config route
- Server startup now auto-replays every persisted `SystemConfig` row so a fresh model-service picks up admin settings without operator intervention

#### Cross-User Import Regression Coverage

- Regression suite in `server/test/integration/cross-user-import-rich-fixture.test.ts` against `server/test/fixtures/cross-user-import-rich-export.jsonl` (the richest of the seven annotator exports uploaded to #121, carrying 20 personas / 20 ontologies / 79 entities / 136 summaries across ~96 distinct videos / 621 claims / 9 object annotations). The test imports the fixture into a fresh user via `reseedOwnershipBaseline` and walks four assertions sourced directly from the screenshot on the reopened #100: (a) every imported summary's `personaId` dereferences via `GET /api/personas/:id` with a 200 (a 404 here is the user-visible 'Persona &lt;uuid&gt; not found' banner in the Edit Video Summary dialog), (b) every dereferenced persona is owned by the importer (cross-checked against `GET /api/personas`), (c) no `summary.personaId` equals one of the original exporter-side persona ids (i.e. the remap actually rewrote it, not just preserved it), (d) every imported claim's `summaryId` resolves to a summary owned by the importer, with round-trip claim and annotation counts matching the fixture exactly. The suite carries a 90_000ms per-test timeout to accommodate the Clean Architecture indirection on top of CASL's per-call overhead.
- `server/test/integration/cross-user-import-real-fixture.test.ts` now also walks `GET /api/personas/:id` with the summary's `personaId` after import and intersects the returned id against the requester's `GET /api/personas` list. The previous test only asserted the summary row carried *a* personaId without verifying the dereference, leaving the post-import Edit Video Summary path (the exact API the bug screenshot in #100 surfaces) untested.
- Unit suite `test/services/import-handler-remap-ids.test.ts` (13 tests, no database) exercises every surface of the new id-shape substitution against a synthetic `idMap`: whole-string ids in arbitrary field names, inline mentions in `claim.text` / `claim.comment`, every free-text surface (persona `informationNeed` / `details`, ontology type descriptions, world object name / description, summary text, claim-relation description), nested structures through arrays and gloss `items`, `*Ids` arrays, collection `members` arrays, multiple ids in one string, ids embedded inside larger tokens (`claim_<id>_v2`, `entity-<id>.png`, `url=…/<id>?q=1`), uppercase / mixed-case ids, JSON-encoded blobs that carry ids, ids not in `idMap` left untouched, non-id strings unchanged, empty-resolutions no-op, and primitives (number / boolean / null) untouched. The integration comparator in `test/integration/import-export-fidelity.test.ts` now treats `members` as id-like so the round-trip diff stops asserting that reference arrays survive byte-for-byte; the round-trip behaviour itself is unchanged.

### Changed

#### UI Framework Migration (MUI to shadcn-ui)

- Migrated the entire annotation-tool frontend from Material UI to shadcn-ui
- Replaced MUI `Box`, `Typography`, `Button`, `Alert`, `Accordion`, `Dialog`, `Menu`, and form primitives with shadcn equivalents
- Switched from Emotion-based theming to Tailwind CSS v4 with a Fovea-specific design-token layer
- Replaced MUI icons with Lucide React icons via a barrel export
- Rebuilt the Layout around the shadcn sidebar composition pattern with fixed dialog overflow handling
- Fixed sidebar toggle, narrowed the dropdown menu, resolved tab overflow, and reduced the sidebar width
- Renamed **Ontology Builder** to **Persona Builder** with updated icons and keyboard shortcut
- Updated all component tests for the new shadcn DOM structure, ARIA roles, and named exports

#### Docusaurus Reorganization

- Comprehensive Docusaurus reorganization at `docs/docs/`: industry-standard split into Tutorial / Guide / Concepts / Reference / Operations / Project; orphan markdown at the doc root deleted or moved into the published tree. The Docusaurus site continues to serve at `fovea.video` (landing renders at `/`, docs tree at `/docs/*`).
- Version-neutral docs sweep: every `v0.X.Y` / `since v0.X.Z` / `carried from v0.X` reference in the published docs is scrubbed (the workspace `CHANGELOG.md` is the only place version numbers appear). Stability and contributing pages describe the maintenance-line policy without enumerating which version is which.
- House style sweep: em-dashes (`—` / `–`) removed from every doc and replaced with semicolons / commas / hyphens; all docs use American spelling (`organize`, `behavior`, `color`, `catalog`, `license`, `flavor`, `whilst -> while`, ...). The `guide/tour-catalogue.md` file is renamed to `guide/tour-catalog.md` (with the sidebar and cross-page links updated).

#### Tooling and Build

- Monorepo switched to a pnpm workspace with ergonomic dev commands
- All Dockerfiles updated for the pnpm workspace layout
- `jsdom` pinned to `^26.1.0` for Node 18 ESM compatibility

#### Cross-User Import Remap Made Structure-Agnostic

- Replace the field-name allowlist inside `remapObjectIds` with a structure-agnostic substitution built from the cross-user `idMap` itself. The prior fix on this branch (cherry-picked from v0.3.2) added an inline-UUID regex pass as a fallback after the existing `id` / `*Id` / `*Ids` / gloss-`content` branches, but the allowlist still hid two correctness gaps: (1) `entityCollection.members` / `eventCollection.members` / `timeCollection.members` are id-reference arrays that the allowlist never matched (they do not end in `Ids`), so after a cross-user import every collection silently held pre-import ids pointing at entities that no longer existed in the importer's world; (2) any future id-bearing field whose name did not match the allowlist patterns would have the same problem. `remapIds` now lowercases `idMap` keys on insert, builds a single case-insensitive matcher from those keys sorted longest-first and RegExp-escaped, and applies it to every string value in the payload tree. Whole-string id values, ids embedded in surrounding prose, ids in arbitrary array positions (`members`, `entityIds`, ordinary string arrays), GlossItem `content`, and ids inside JSON-encoded substrings are all rewritten by the same pass; substrings whose lowercased form is not in `idMap` pass through unchanged, so the substitution is a strict no-op outside the cross-user path. Reported as a continuation of #121.

### Removed

- `@mui/material`, `@mui/icons-material`, `@mui/x-*`, `@emotion/react`, and `@emotion/styled` dependencies
- Unused `DropdownPaper` helper left over from the MUI migration

### Fixed

#### LlamaCpp VLM Sync-Path Fix

- `LlamaCppVLMLoader.load` / `.generate` / `.unload` are no longer declared `async def`. The underlying llama_cpp.Llama API is blocking, the only caller chain (VLMLoaderAdapter to use_case.summarize to route) is sync top-to-bottom, and the prior async signatures silently discarded their bodies: `VLMLoaderAdapter.load` flipped `_loaded` to True without actually loading, `.generate` returned `str(coroutine)` which produced "&lt;coroutine object LlamaCppVLMLoader.generate at 0x…&gt;" as the summary text the user observed, and `.unload` never released memory. Dropping the async keyword from all three methods is the minimal fix.

#### House Style on User-Facing Strings

- Em-dashes scrubbed out of every user-facing `narration` / `recap` / `description` / `title` string across the twelve tour scripts; replaced with semicolons or hyphens contextually. Same sweep over `src/tours/content/types.ts` + `src/tours/content/microvent.ts` + `src/mocks/tourDemo/handlers.ts` + `src/mocks/tourDemo/browser.ts` comments and console.info.

#### Documentation Drift Audit (155 Confirmed Findings Against the Live Codebase)

- Two-round audit/fix workflow grounds the docs against the live codebase: 67 Opus auditors checked every doc claim against `server/src/`, `model-service/src/`, `annotation-tool/src/`, `docker-compose*.yml`, and `model-service/config/models*.yaml`; an adversarial Opus verifier defaulted to rejection per finding and confirmed 155 of 162 candidate findings; 50+ Opus fixers + per-file verifiers applied the fixes across two rounds + a surgical manual pass for the residual five files. The 13 cross-cutting patterns landed: Grafana host port corrected (3010 -> 3002 across 4 files), fabricated `assertX-Owned` ownership-helper names replaced with the actual CASL `request.ability.can()` pattern (4 files), fusion-strategy enum corrected from invented `parallel/audio-first` to the real `sequential/timestamp_aligned/native_multimodal/hybrid` (3 files), fabricated export-type discriminators (`worldEntity`, `worldEvent`, `videoSummary`) replaced with the real `persona/ontology/entity/event/time/*_collection/relation/summary/claim/claim_relation/annotation/metadata` set (2 files), `PUT /api/ontology` body shape corrected to the bulk envelope plus per-persona `PUT /api/personas/:id/ontology` (3 files), OTel metric names corrected from the invented `*_ms` suffix to the real dotted form (4 files), nonexistent env vars and CLI scripts in the operations docs replaced with the real ones (`JWT_SECRET` -> `SESSION_SECRET`, `MODEL_CACHE_DIR` -> `HF_HOME`, `npm run seed:permissions` + `npm run admin:create` -> `npm run seed` + `ADMIN_PASSWORD`; the OIDC/JWT story dropped entirely since auth is cookie-session), "Ontology Builder" UI references renamed to the now-shipped "Persona Builder" and the documented keyboard shortcut rebound from `o` to `p` (2 files), `MODEL_SERVICE_TIMEOUT_*` env var keys aligned with `fetchModelService.ts` (`THUMBNAILS_MS`, `EXTRACT_CLAIMS_MS`; nonexistent `TRACKING_MS` removed), `annotation linkType` migration timestamp corrected (3 files), WorldState described as `@@unique([userId, projectId])` rather than `@unique(userId)`, model-service API reference prefixed with `/api/` on every endpoint to match `routes/__init__.py`, and the `reference/model-loaders.md` framework column rebuilt from `models.yaml` so the ~25 mislabeled `transformers` rows now show their real `ultralytics/pytorch/sam3/whisper/whisperx/nemo_canary/nemo_parakeet/pyannote` labels. Florence-2 added to `object_detection`, the nonexistent `Fallback chain` section deleted, and the stale "Anchors not yet landed" block in `reference/tour-anchors.md` replaced with the 15 already-shipped anchors. Final docs build is clean (0 errors, 0 broken links).

#### Real Model-Service Stack Bugs from Tier 2 Verification

- `docker-compose.e2e.yml` model-service service gains the `./test-videos:/test-videos:ro` mount that the base compose file was missing. Without it the path sanitiser in `model-service/src/infrastructure/adapters/outbound/video/processor.py` defaulted `VIDEO_DATA_ROOT` to `/videos` and rejected every `/test-videos/*` path the backend forwarded with "Video file not found" even when the file existed on every other container.
- `docker-compose.e2e.real-models.yml` now pins `MODEL_CONFIG_PATH=/config/models-cpu.yaml` because the base `docker-compose.e2e.yml` hardcodes `/config/models.yaml` (the GPU defaults) regardless of the `DEVICE` arg. The CPU stack was being pointed at a GPU-required selection (qwen-3-vl-8b at 9GB VRAM via sglang) and crashed on first model load.
- `docker-compose.e2e.real-models.yml` adds `CUDA_VISIBLE_DEVICES=""` to keep CPU-only hosts off `libcudart.so.13`. Without it pyannote.audio and the Silero VAD weights transitively pull torch with CUDA runtime bindings, and the warmup of `speaker_diarization` + `voice_activity_detection` failed with "libcudart.so.13: cannot open shared object file" on CPU-only runners.

#### Models Catalogue Tightening

- `model-service/config/models-cpu.yaml` selects `faster-whisper-tiny` (Systran/faster-whisper-tiny, 39 MB) as the default audio-transcription model so the CPU image carries a model that actually loads on a developer laptop without HuggingFace rate-limiting.
- The same file sets `warmup_on_startup: true` and bumps `max_video_frames` to 3 for the CPU profile so the booth visitor's first inference is responsive.
- Architecture catalogue gains the missing markers (`ClaudeVisionAPI`, `OpenAIVisionAPI`, `GeminiVisionAPI`, `GrokVisionAPI`, `SAM3Detection`, `PyannoteDiarization`, `SileroVAD`) the five per-family registry-migration subagents legitimately did not cover; every YAML option that referenced them now declares its architecture block, and the registry exhaustiveness tests are tightened to recognise the new unregistered-by-design markers.
- `ModelConfig.architecture` is tightened from `Architecture | None` to required `Architecture` across both ModelConfig surfaces, with the field declared between `framework` and `vram_gb` so the discriminated-union TypeAdapter raises at config load on a missing or malformed architecture block.

#### Claim Text No Longer Carries UUIDs From Reference-Kind Gloss Items

- `ClaimEditor.handleSave` (`annotation-tool/src/components/claims/ClaimEditor.tsx`) now resolves gloss items to human-readable labels when synthesizing `claim.text`, via the existing `glossToText` helper from `annotation-tool/src/utils/glossUtils.ts`. The previous handler did `const text = gloss.map(item => item.content).join('')` which works for `text`-kind items (where `content` is the user-typed string) but writes the raw UUID into `text` for every `typeRef` / `objectRef` / `annotationRef` / `claimRef` item, because `GlossItem.content` stores the referenced thing's id. The symptom showed up in the JSONL export, where `claim.text` read like "The &lt;player-uuid&gt; hit the &lt;ball-uuid&gt;" instead of "The Player 9 hit the ball". `glossToText` resolves `typeRef` ids against the active persona ontology (entities / events / roles / relationTypes) and `objectRef` ids against world state (entities / events / times), with a fall-back to the raw id only when a lookup misses. The same naive concatenation is replaced with `glossToText` in three preview surfaces that had the same bug at display time: `ClaimRelationsViewer.getClaimText` (source / target claim previews in the relations panel), `ClaimRelationEditor` (relation-type-dropdown preview plus source / target previews; gains an optional `personaId` prop threaded from `ClaimsViewer`), and `ImportDialog` (entity-row preview during persona import; resolves `typeRef` ids against the source persona's ontology).
- The unused name-less `convertTypeRefsToText` helper in `server/src/lib/reference-cleanup.ts` is deleted along with its five test cases. The production type-deletion path (`server/src/routes/personas.ts` `DELETE /api/personas/:personaId/ontology/{entities,events,roles,relation-types}/:typeId`) routes through `updateGlossesInTypes` -> `convertTypeRefsToTextWithName`, which uses the type name. The name-less variant had zero production callers; its replacement-text content of `item.content` (the raw UUID) would have reintroduced the same UUID-in-text bug if anyone had reached for it next.

#### Cross-User Import Transaction Timeout

- `ImportHandler.executeImport` now configures the Prisma atomic-mode transaction with `{ maxWait: 10_000, timeout: 300_000 }`. The default 5_000ms interactive-transaction timeout is exceeded by realistic cross-user imports; a payload with ~20 personas / ~100+ summaries / hundreds of claims times out with `Transaction already closed` partway through because every nested write goes through the CASL ability check and the Clean Architecture indirection. Without the bump the whole import rolls back and the user sees a 500 from `POST /api/import`; with it, the import completes against realistic payload sizes. Surfaced by the forward-port of the rich regression fixture.

#### Schema Hardening

- Replaced vitest-broken `Type.Union` nullable response schemas on `/api/me/preferences` with the `fast-json-stringify`-safe `Type.Unsafe` array-type pattern so null values serialize correctly.
- Resolved `SystemConfig` audit `updatedByUserId` through the users table so phantom test-bypass ids and real deleted-user races no longer violate the FK.

#### Shadcn Migration Followups

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
