# Changelog

All notable changes to the Fovea project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-05-19

Forward-ports the v0.1.11 server-side test additions for the reopened cross-user import bug (#100) to the v0.2.x line and closes a Prisma transaction-timeout the forward-port surfaced. The frontend fixes carried in v0.1.11 (#92 auth race in `App.tsx` / `useSession.ts`, and the #122 vitest dual-React config) are intentionally NOT forward-ported because v0.2.0's CASL framework rewrote the auth surface and `release/0.2.x` runs the annotation-tool under npm with no dual-React layout.

### Fixed

- `ImportHandler.executeImport` now configures the Prisma atomic-mode transaction with `{ maxWait: 10_000, timeout: 300_000 }`. The default 5_000ms interactive-transaction timeout is exceeded by realistic cross-user imports on the v0.2.x line — a payload with ~20 personas / ~100+ summaries / hundreds of claims times out with `Transaction already closed` partway through because every nested write goes through v0.2.0's CASL ability check (added per-query work that is not present on v0.1.x). Without the bump the whole import rolls back and the user sees a 500 from `POST /api/import`; with it, the import completes against realistic payload sizes. The import route is rate-limited upstream so unbounded payloads cannot pile up in a single transaction window. Discovered via the forward-port of the v0.1.11 rich regression fixture.

### Added

- Regression suite in `server/test/integration/cross-user-import-rich-fixture.test.ts` against `server/test/fixtures/cross-user-import-rich-export.jsonl` (the richest of the seven annotator exports uploaded to #121, carrying 20 personas / 20 ontologies / 79 entities / 136 summaries across ~96 distinct videos / 621 claims / 9 object annotations — structurally far richer than the existing single-persona `cross-user-import-real-export.jsonl`). The test imports the fixture into a fresh user and walks four assertions sourced directly from the screenshot on the reopened #100: (a) every imported summary's `personaId` dereferences via `GET /api/personas/:id` with a 200 (a 404 here is the user-visible 'Persona <uuid> not found' banner in the Edit Video Summary dialog), (b) every dereferenced persona is owned by the importer (cross-checked against `GET /api/personas`), (c) no `summary.personaId` equals one of the original exporter-side persona ids (i.e. the remap actually rewrote it, not just preserved it), (d) every imported claim's `summaryId` resolves to a summary owned by the importer (the second 404 surface in the screenshot — claims pointing at the foreign summary id), with round-trip claim and annotation counts matching the fixture exactly. The suite carries a 60_000ms per-test timeout to accommodate CASL's per-call overhead.
- `server/test/integration/cross-user-import-real-fixture.test.ts` now also walks `GET /api/personas/:id` with the summary's `personaId` after import and intersects the returned id against the requester's `GET /api/personas` list. The previous test only asserted the summary row carried *a* personaId without verifying the dereference, leaving the post-import Edit Video Summary path (the exact API the bug screenshot in #100 surfaces) untested.

## [0.2.3] - 2026-05-13

Forward-ports the v0.1.10 generalisation of the cross-user id remap to the v0.2.x line. The bug taxonomy and user-visible behaviour is the same; the integration is unchanged from v0.1.10 since `remapObjectIds` lives outside the CASL surface.

### Changed

- Replace the field-name allowlist inside `remapObjectIds` with a structure-agnostic substitution built from the cross-user `idMap` itself. The v0.2.2 fix added an inline-UUID regex pass as a fallback after the existing `id` / `*Id` / `*Ids` / gloss-`content` branches, but the allowlist still hid two correctness gaps: (1) `entityCollection.members` / `eventCollection.members` / `timeCollection.members` are id-reference arrays that the allowlist never matched (they do not end in `Ids`), so after a cross-user import every collection silently held pre-import ids pointing at entities that no longer existed in the importer's world; (2) any future id-bearing field whose name did not match the allowlist patterns would have the same problem. `remapIds` now lowercases `idMap` keys on insert, builds a single case-insensitive matcher from those keys sorted longest-first and RegExp-escaped, and applies it to every string value in the payload tree. Whole-string id values, ids embedded in surrounding prose, ids in arbitrary array positions (`members`, `entityIds`, ordinary string arrays), GlossItem `content`, and ids inside JSON-encoded substrings are all rewritten by the same pass; substrings whose lowercased form is not in `idMap` pass through unchanged, so the substitution is a strict no-op outside the cross-user path. Reported as a continuation of #121.

### Added

- Unit suite `test/services/import-handler-remap-ids.test.ts` (13 tests, no database) exercises every surface of the new id-shape substitution against a synthetic `idMap`: whole-string ids in arbitrary field names, inline mentions in `claim.text` / `claim.comment`, every free-text surface (persona `informationNeed` / `details`, ontology type descriptions, world object name / description, summary text, claim-relation description), nested structures through arrays and gloss `items`, `*Ids` arrays, collection `members` arrays, multiple ids in one string, ids embedded inside larger tokens (`claim_<id>_v2`, `entity-<id>.png`, `url=…/<id>?q=1`), uppercase / mixed-case ids, JSON-encoded blobs that carry ids, ids not in `idMap` left untouched, non-id strings unchanged, empty-resolutions no-op, and primitives (number / boolean / null) untouched. The integration comparator in `test/integration/import-export-fidelity.test.ts` now treats `members` as id-like so the round-trip diff stops asserting that reference arrays survive byte-for-byte; the round-trip behaviour itself is unchanged.

## [0.2.2] - 2026-05-11

Forward-ports the v0.1.9 cross-user inline-UUID remap fix to the v0.2.x line. The bug taxonomy and user-visible behavior is the same; the integration is unchanged from v0.1.9 since `remapObjectIds` lives outside the CASL surface.

### Fixed

- Remap UUID-shaped substrings inside every string value of an imported payload during a cross-user import, not only inside fields whose NAME signalled an id reference (`*Id`, `*Ids`, gloss `objectRef.content`, gloss `typeRef.content`). Free-form prose that namedrops another imported record by UUID — `claim.text`, `claim.comment`, summary text segments, persona `informationNeed` and `details`, ontology entityType / eventType / roleType `description`, world object `name` and `description`, and any other carrier — now stays consistent with the regenerated row after cross-user remap. UUID-shaped substrings whose lowercased form is not in the cross-user idMap pass through unchanged, so the substitution stays a strict no-op outside the cross-user path.

### Added

- Regression fixture `server/test/fixtures/cross-user-import-foreign-annotator.jsonl` and matching integration test `server/test/integration/cross-user-import-foreign-fixture.test.ts` exercise the generalised remap against a real foreign-annotator export (four personas, thirty-three world entities, forty-eight video summaries, sixty claims, fifty annotations across twenty-six videos) and assert that every imported object-annotation `label` resolves to a named entity in the importer's `/api/world` and that no returned `claim.text` contains any of the five known fixture entity UUIDs the exporter embedded as inline mentions.
- The two prior issue-number-bearing fixture / test pairs are renamed off ticket-shaped filenames (`server/test/integration/cross-user-import-{foreign,real}-fixture.test.ts`, `server/test/fixtures/cross-user-import-{foreign-annotator,real-export}.jsonl`) so future readers find tests by the behavior they encode.

## [0.2.1] - 2026-05-04

Forward-ports the data-fidelity, schema, UX, and DoS fixes from v0.1.8 (see the v0.1.8 section below) to the v0.2.x line. The bug taxonomy and user-visible behavior is the same; this section lists only the deltas specific to integrating those fixes into v0.2.0's CASL-based RBAC framework, plus the items unique to this release.

### Schema

- Adds `Annotation.linkType` column. Same column as v0.1.8; migration re-stamped as `20260505000000_add_annotation_link_type` to land after v0.2.0's `20260415000000_backfill_rbac_ownership`.

### Fixed (RBAC integration deltas)

The fixes below are conceptually the same as v0.1.8 but are wired through v0.2.0's CASL machinery rather than v0.1.8's `lib/ownership.ts` helpers, so there is no parallel ownership system on the v0.2.x line.

- `POST /api/annotations` calls `request.ability.can('read', subject('Persona', persona))` on the supplied `personaId` before attaching. The generic `create Annotation` candidate carries `createdByUserId = caller` and passes CASL's create rule even when the target persona is foreign; the explicit read-on-target gate closes the gap.
- `POST /api/summaries/:summaryId/claims` and `GET /api/summaries/:summaryId/claims` apply the same `read`-on-parent gate via `subject('VideoSummary', summary)`.
- `POST /api/videos/:videoId/detect` runs `ability.can('read', subject('Persona', persona))` when a `personaId` is supplied. The videos plugin now also wires `buildAbilities` so `request.ability` is populated for every video sub-route (it was not, prior to this release).
- `PUT /api/ontology` and `POST /api/ontology/augment` catch blocks re-throw `AppError` so authorization-induced 403/404 are no longer collapsed into 500.
- `POST` / `PUT /api/personas` strip `isSystemGenerated` for non-`system_admin` requests by checking `request.user.systemRole` (v0.1.8 used `request.user.isAdmin`; v0.2.0 split admin into a `systemRole` field).
- `GET /api/import/history` scopes by `importedBy = request.user.id` directly. `ImportHistory` is intentionally not modeled as a CASL subject, so explicit scoping is the right shape.

### Fixed (carried through unchanged from v0.1.8)

- `Claim.audio` / `Claim.video` / `Claim.metadata` round-trip for any JSON value (was wiped to `JsonNull` for non-arrays).
- Object annotations linked to events / times / locations round-trip through export+import via the new `linkType` column.
- `POST /api/import` returns 4xx (typically 413) for `FST_*_LIMIT` codes instead of 500.
- `POST /api/import` populates `importedBy` so the history listing returns the row.
- `app.setErrorHandler` types its `error` parameter as `FastifyError`.

### UX (carried through unchanged from v0.1.8)

- `ImportResultDialog` shows a yellow "Completed with Warnings" title and a prominent banner when annotations were skipped because of missing referenced data.

### Infrastructure

- `model-service/Dockerfile` retries `pip install torch torchvision` and `pip install -e .` up to 3× with a 30s sleep between attempts, matching the existing `apt-get update` retry pattern. v0.2.0's release workflow run failed at the `pip install` step from a transient network error.
- `.github/workflows/ci.yml` triggers on `release/**` PRs in addition to `main` / `develop`, so backport PRs to maintenance branches go through the same lint + test gate.

### Tests

- Forward-ports every v0.1.8 test suite (multi-user-isolation, import-export-cross-user, import-export-edges, import-export-fidelity, issue-121-real-fixture, plus the orphan-banner predicate test and Playwright spec). Seeds adjusted to populate v0.2.x's `createdBy` / `createdByUserId` ownership columns. New shared helper `test/integration/_rbac-baseline.ts` wipes the test-helper's blanket-grant `RolePermission` rows and re-seeds an ownership-aware production-like baseline (every action `ownOnly: true` for content types) so the matrix actually exercises CASL's per-row ownership rules rather than the test-helper's unconditional grants — without this, the matrix would falsely pass against v0.2.0's permission state.

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

[0.2.0]: https://github.com/parafovea/fovea/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/parafovea/fovea/releases/tag/v0.1.7
[0.1.6]: https://github.com/parafovea/fovea/releases/tag/v0.1.6
[0.1.5]: https://github.com/parafovea/fovea/releases/tag/v0.1.5
[0.1.4]: https://github.com/parafovea/fovea/releases/tag/v0.1.4
[0.1.3]: https://github.com/parafovea/fovea/releases/tag/v0.1.3
[0.1.2]: https://github.com/parafovea/fovea/releases/tag/v0.1.2
[0.1.1]: https://github.com/parafovea/fovea/releases/tag/v0.1.1
[0.1.0]: https://github.com/parafovea/fovea/releases/tag/v0.1.0
