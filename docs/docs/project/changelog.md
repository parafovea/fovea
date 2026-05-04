# Changelog

The v0.2.x line is the active development line; v0.1.x is the
maintenance line for the 0.1.0 export format. The full content of
the workspace `CHANGELOG.md` follows.


All notable changes to the Fovea project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- `model-service/Dockerfile` retries `pip install torch torchvision` and `pip install -e .` up to 3x with a 30s sleep between attempts, matching the existing `apt-get update` retry pattern. v0.2.0's release workflow run failed at the `pip install` step from a transient network error.
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

## [0.1.8] - 2026-05-04

### Schema

- Adds `linkType` String column to `annotations` (`'entity' | 'event' | 'time' | 'location' | NULL`). Migration `20260429000000_add_annotation_link_type` applies it as a nullable column so legacy rows are unaffected; the frontend treats NULL as entity-linked, matching the historical default.

### Fixed

- Scopes every user-scoped GET endpoint and every mutation endpoint through `lib/ownership.ts` helpers to close a multi-user data isolation bug class (annotations, summaries, claims, claim relations, personas, ontology, world state, import history, the three job-status endpoints).
- `PUT /api/ontology` no longer accepts a foreign `personaId` or ontology id; the pre-fix upsert silently overwrote the foreign user's persona name, role, informationNeed, and entire ontology.
- `POST /api/ontology/augment` is now `requireAuth` and ownership-checked.
- `POST /api/videos/:videoId/detect` checks ownership of `personaId` before reading the persona's ontology.
- `POST /api/summaries/:summaryId/claims/:claimId/relations` checks ownership of both source and target claims.
- `POST` / `PUT /api/personas` silently coerce `isSystemGenerated` to `false` for non-admin requests.
- `ImportHandler` writes `userId` on every imported annotation row.
- `POST /api/import` writes `importedBy = request.user.id` on every `ImportHistory` row.
- `Claim.audio` / `Claim.video` / `Claim.metadata` round-trip for any JSON value (was wiped to `JsonNull` for non-arrays).
- Object annotations linked to events / times / locations round-trip through export+import via the new `linkType` column.
- `POST /api/import` returns 4xx (typically 413) for `FST_*_LIMIT` codes instead of 500.
- `app.setErrorHandler` types its `error` parameter as `FastifyError`.

### UX

- `ImportResultDialog` shows a yellow "Completed with Warnings" title and a prominent banner when annotations were skipped because of missing referenced data.

### Added

- `lib/ownership.ts` helper module exposing `getUserPersonaIds`, `assertPersonaOwned`, `assertAnnotationOwned`, `assertSummaryOwned`, `assertSummaryByKeyOwned`, `assertClaimOwned`, `assertClaimRelationOwned`. All helpers throw `NotFoundError` to avoid confirming the existence of records the requester cannot see.
- Multi-user listing isolation matrix (`test/integration/multi-user-isolation.test.ts`).
- End-to-end round-trip test against a synthetic JSONL fixture; cross-user real-fixture test (`issue-121-real-fixture.test.ts`).

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

The 0.1.0 release shipped the core platform: video management,
the keyframe + interpolation annotation system, persona-scoped
ontologies and world state, VLM-powered video summarization with
audio transcription and audio-visual fusion, hierarchical claims
with typed relations, object detection across multiple model
families, the model service with external API fallback, session
authentication with progressive lockout, full export / import
with Zod validation, and the OpenTelemetry / Prometheus
observability stack. See the workspace `CHANGELOG.md` for the
full per-feature breakdown.
