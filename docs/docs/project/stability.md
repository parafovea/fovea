# Stability

Fovea is pre-1.0. Versions are semver-shaped but the pre-1.0
contract is narrower than post-1.0 semver. This page documents
what is stable within v0.3.x (the active line) and what is not.
v0.2.x continues as a maintenance line for the 0.2.0 RBAC
framework; v0.1.x continues as a maintenance line for the
0.1.0 export format. The policy below applies to all three.

## What is stable within v0.3.x

- The JSONL export format. A file written by any v0.3.x release
  imports into any other v0.3.x release on the same instance.
  The first line is always a `metadata` provenance record; every
  subsequent line is one record with a `type` discriminator.
  Cross-version exports between v0.2.x and v0.3.x are
  intentionally not supported; the v0.3.0 removal of the
  `TimeSpan` and gloss-string back-compat shims (see below)
  changes the in-memory shape that an importer reconstructs.
- Database migrations under `server/prisma/migrations/`. A landed
  migration is never rewritten. Schema evolution is forward-only;
  see "Schema evolution" below.
- The REST surface documented in [Reference > API](../reference/api.md).
  Endpoints are not removed within a minor; payload shapes can
  gain optional fields but never lose required ones.
- The `models.yaml` schema documented in
  [Reference > Model config](../reference/model-config.md).

## What may break across minor versions

- The internal directory layout under `server/src/`,
  `annotation-tool/src/`, and `model-service/src/` is implementation
  detail.
- The wire shape between the backend and the model service. The
  backend always ships compatible with its bundled model service;
  pinning them to different versions is unsupported.
- The OpenTelemetry attribute set on emitted spans and metrics.
- The frontend's command id space. The keybindings remain stable
  but the command ids are not contract.

## What may break across patch versions

- Bug fixes change behavior. v0.1.8's data isolation work changed
  the shape of `GET /api/import/history` to return only the
  requester's rows; consumers that depended on seeing every user's
  imports broke. This is by design.
- Default values for environment variables.

## v0.3.0 backcompat shim removals

v0.3.0 removed several backcompat shims that v0.2.x and v0.1.x
carried for forward compatibility. These are clean breaking
changes; pre-1.0 minor bumps are allowed to do this.

- The `TimeSpan` interface and `timeSpan?` annotation field are
  gone. Server types, the ontology JSON schema, the frontend
  `transformBackendToFrontend` helper, and the
  `useAnnotationDrawing` stub no longer reference them.
- The legacy `string` branch of `OntologyTypeItem.gloss` is
  gone; the type is now `GlossItem[]` only.
- The legacy `string`-baseUrl overload of
  `extractWikidataInfo` is gone; `WikidataSearch` now passes
  `{ baseUrl }`.
- The `capability_probe=None` lazy default in
  `ModelManager.__init__` is gone; the probe is now required.

A v0.2.x or v0.1.x export that depends on any of these shapes
will not import on v0.3.x. Stay on v0.2.x or v0.1.x to keep
the older shape, or migrate the export through a one-time
conversion before importing on v0.3.x.

## Model service Clean Architecture (v0.3.x)

The Clean Architecture layout introduced in v0.3.0 is the
stable surface within v0.3.x. The dependency rule (domain ←
application ← infrastructure, never reversed) is contract; the
specific module names under `model-service/src/` are
implementation detail. The outbound port set (`ILanguageModel`,
`IVisionLanguageModel`, `IDetectionModel`, `ITrackingModel`,
`IAudioTranscriber`, `ISpeakerDiarizer`,
`IVoiceActivityDetector`, `IFrameSampler`,
`IModelRepository`, `IModelCapabilityProbe`,
`IExternalAPIRouter`) is contract within v0.3.x; new ports may
be added as a minor bump. Removing or narrowing an existing
port is breaking and requires a major bump (post-1.0) or a
breaking pre-1.0 minor.

## RBAC stability (v0.2.x and v0.3.x)

- The set of `Actions` and the set of `Subjects` (Prisma
  `ModelName` values used as CASL subjects) is stable within
  the active line. Adding a new action or subject is a
  minor-version change that adds capability without removing
  any. Removing one is a breaking change.
- The seeded `RolePermission` matrix is stable within the
  active line.
  Adding new rows (new roles, new resource types, new actions)
  is non-breaking; removing or narrowing an existing row is
  breaking and requires a major bump. Existing instances may
  also have edited the matrix at runtime via
  `/api/admin/permissions`; the seed is run with `upsert` so a
  re-seed never overwrites local edits to existing rows.
- The system roles `system_admin` and `user`, the project roles
  `project_owner / project_manager / annotator / reviewer / viewer`,
  and the group roles `group_owner / group_admin / group_member`
  are the stable role identifiers. New roles can be added through
  `/api/admin/permissions`; renaming a built-in role is breaking.
- The ownership column for each model
  (`Persona.userId`, `WorldState.userId`,
  `Annotation.createdByUserId`, `VideoSummary.createdBy`,
  `Claim.createdBy`, `UserGroup.createdBy`,
  `Project.ownerUserId`) is the stable ownership contract. Read
  paths (CASL conditions, integration test seeds) depend on it.

## Schema evolution

A new column is added through a new migration. The column is
nullable on first introduction (the `Annotation.linkType` column
in v0.1.8 followed this path). A later release may make it
non-nullable after enough time has passed for backfills.

A column is never renamed; the new name is a new column and the
old name is dropped in a later migration after a release that
populates both. Existing rows are never lost; a row is hidden
through a `hidden` flag, not deleted, when forward compatibility
is in question.

## Forward compatibility for the JSONL format

The export and import handlers carry a per-record version
discriminator on `metadata.version`. Importers honor older
versions; importing a future version on an older release is
undefined and may fail.

## Release process

The active line lives on the `release/0.3.x` branch; v0.2.x
continues on `release/0.2.x` and v0.1.x continues on
`release/0.1.x` for maintenance. Tags are cut from the
appropriate branch; maintenance tags use `--latest=false` so the
GitHub release UI does not promote them above the active line.
CI workflows run on PRs to `main`, `develop`, and `release/**`,
so backport PRs to maintenance branches go through the same lint
+ test gate.
