# Changelog

All notable changes to the Fovea project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - Unreleased

### Schema

- Adds `linkType` String column to `annotations` (`'entity' | 'event' | 'time' | 'location' | NULL`). Migration `20260429000000_add_annotation_link_type` applies it as a nullable column so legacy rows are unaffected; the frontend treats NULL as entity-linked, matching the historical default.

### Fixed

- Scopes `GET /api/annotations/:videoId` to the requesting user's annotations (type annotations on the user's personas plus object annotations the user owns) so a multi-user instance no longer surfaces another user's imported copies in the All Annotations tab, fixing the duplicate-row symptom in #121
- Scopes `GET /api/videos/:videoId/summaries` to the requesting user's personas so a foreign user's imported summary cannot mask the importing user's own summary in the persona switcher
- Scopes `GET /api/personas/:id/ontology` so a non-system persona's ontology is only readable by its owner; previously any authenticated user could read any persona's ontology by id
- Scopes `GET /api/import/history` to the requesting user's own imports; previously it returned every user's import provenance (filenames, row counts) on the same instance
- Scopes `GET /api/summaries/:summaryId/claims` and `GET /api/summaries/:summaryId/claims/:claimId` so a user who knows another user's summaryId cannot read their claim list or individual claims (defense in depth)
- Scopes the three job-status endpoints (`GET /api/jobs/:jobId`, `GET /api/jobs/claims/:jobId`, `GET /api/jobs/synthesis/:jobId`) to the persona / summary that owns the job's data; previously any authenticated user could poll for another user's job result
- Adds ownership checks to mutation endpoints so user A cannot modify or delete user B's records: `PUT/DELETE /api/annotations/:id`, `POST /api/annotations` (when `personaId` is supplied), `POST/PUT/DELETE /api/summaries`, `PUT /api/personas/:id/ontology`, `POST/PUT/DELETE /api/summaries/:summaryId/claims/...`, `POST /api/summaries/:summaryId/claims/:claimId/relations`, `DELETE /api/summaries/:summaryId/claims/relations/:relationId`, `POST /api/videos/:videoId/personas/:personaId/claims`, `POST /api/videos/summaries/generate`, `POST /api/summaries/:summaryId/claims/generate`, `POST /api/summaries/:summaryId/synthesize`
- Coerces `isSystemGenerated` to `false` on `POST/PUT /api/personas/:id` for non-admin requests; previously a regular user could publish their persona to anonymous visitors by setting the flag in the request body
- `ImportHandler` now sets `userId` on every imported annotation row, matching how `POST /api/annotations` populates the field; without this, imported object annotations had `personaId=null` AND `userId=null` and were filtered out as orphans by the user-scoped listing endpoint
- `POST /api/import` now sets `importedBy = request.user.id` on every `ImportHistory` row; previously it was omitted, so once `GET /api/import/history` became user-scoped no user saw any of their imports listed
- `PUT /api/ontology` now refuses to upsert a persona id whose existing row belongs to another user; previously the upsert would silently overwrite that user's persona name/role/informationNeed (a complete persona-level account takeover), and similarly for ontologies the personaId must belong to the requester
- `POST /api/ontology/augment` now requires the `personaId` body field to belong to the requester and is gated by `requireAuth`; previously it was `optionalAuth` and an unrelated user could trigger model-service calls using another persona's ontology context
- `POST /api/videos/:videoId/detect` now requires the `personaId` body field to belong to the requester before reading that persona's ontology to build the detection query; previously A could feed B's ontology into the detector and consume model-service quota on B's behalf
- `POST /api/summaries/:summaryId/claims/:claimId/relations` now requires the `targetClaimId` body field to belong to the requester; previously A could create a relation from their own claim into B's claim, surfacing B's claim text in A's relations view
- `PUT /api/ontology` and `POST /api/ontology/augment` catch blocks now re-throw `AppError` so authorization-induced 404s don't get collapsed into 500s by the route's local catch handler
- `POST /api/import` now returns the multipart upload-too-large failure with the underlying 4xx status (typically 413) instead of collapsing it into a 500. The route's local catch handler previously wrapped any non-`AppError` into `InternalError`; it now passes `FST_REQ_FILE_TOO_LARGE` and similar `FST_*_LIMIT` codes through with a 4xx response so clients can render a helpful "file too big" message.
- Surface silent-data-loss in the import result UI: when annotations were skipped because of missing referenced data (`missing-dependency` conflicts), `ImportResultDialog` now shows a yellow `Completed with Warnings` title and a prominent banner explaining the skip count, the cause, and how to recover (re-export from source with referenced world objects included). Previously the dialog showed a green "Import Successful" header with no warning, so a user importing a partially-broken export saw zero annotations and assumed the import worked.
- Object annotations linked to events / times / locations now round-trip through export and import without being silently flattened to entity-linked. Previously the backend stored only the linked id under `label` with no record of which `linked*Id` field it came from, so `export-handler.convertPrismaAnnotation` always emitted `linkedEntityId` and `import-handler.importAnnotation` only honoured `linkedEntityId`. The new `Annotation.linkType` column carries the kind through the round-trip, the export emits the correct `linkedEventId` / `linkedTimeId` / `linkedLocationId` field, the import reads any of the four, the route's `POST` and `PUT` accept and return `linkType`, and the frontend's `transformBackendToFrontend` / `transformFrontendToBackend` populate the right linked-id field so `getObjectName` resolves against the correct world list (not just `worldEntities`).

### Added

- Multi-user listing isolation matrix (`test/integration/multi-user-isolation.test.ts`) that seeds parallel data for two users (persona, ontology, world state, summary, claim, type and object annotations, api key, session, import history) and asserts every user-scoped GET endpoint returns only the requester's records; adding a new listing route to the matrix is the documented forward-protection for this class of bug
- End-to-end round-trip test that imports a synthetic JSONL fixture covering persona, ontology, world (entity/event/time), summary, claim, type and object annotations, and asserts the importer's `/api/annotations` response carries no orphan UUID labels (every `linkedEntityId` resolves to an entity in the importer's `/api/world` response) and the imported claim's gloss `objectRef` content remaps to the regenerated entity id
- Multi-user listing isolation tests for `GET /api/annotations/:videoId`, `GET /api/videos/:videoId/summaries`, and the claims-by-summary path that prove user A and user B never see each other's records on the same shared video
- Mutation isolation tests covering every PUT/POST/DELETE endpoint that operates on user-owned resources, asserting a foreign user receives 403/404 and the underlying row is unchanged
- Privilege-escalation tests asserting `isSystemGenerated` is silently coerced to `false` for non-admin requests on both `POST /api/personas` and `PUT /api/personas/:id`
- End-to-end test that `POST /api/import` populates `importedBy` so the row appears in the importer's history listing
- `lib/ownership.ts` helper module exposing `getUserPersonaIds`, `assertPersonaOwned`, `assertAnnotationOwned`, `assertSummaryOwned`, `assertSummaryByKeyOwned`, `assertClaimOwned`, and `assertClaimRelationOwned` so route handlers can enforce resource ownership without copy-pasting the lookup; all helpers throw `NotFoundError` (not `ForbiddenError`) to avoid confirming the existence of records the requester cannot see
- Auth, isolation matrix, and cross-user integration tests now clear `LoginAttempt` rows in `beforeEach` so accumulated lockout state from prior runs cannot turn 401 invalid-credential assertions into 429 lockout responses

### Changed

- `app.setErrorHandler` callback now types `error` as `FastifyError` so `.validation`, `.statusCode`, and `.message` access in the handler typechecks under stricter TypeScript settings

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

[0.1.6]: https://github.com/parafovea/fovea/releases/tag/v0.1.6
[0.1.5]: https://github.com/parafovea/fovea/releases/tag/v0.1.5
[0.1.4]: https://github.com/parafovea/fovea/releases/tag/v0.1.4
[0.1.3]: https://github.com/parafovea/fovea/releases/tag/v0.1.3
[0.1.2]: https://github.com/parafovea/fovea/releases/tag/v0.1.2
[0.1.1]: https://github.com/parafovea/fovea/releases/tag/v0.1.1
[0.1.0]: https://github.com/parafovea/fovea/releases/tag/v0.1.0
