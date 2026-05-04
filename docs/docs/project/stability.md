# Stability

Fovea is pre-1.0. Versions are semver-shaped but the pre-1.0
contract is narrower than post-1.0 semver. This page documents
what is stable within v0.1.x and what is not.

## What is stable within v0.1.x

- The JSONL export format. A file written by any v0.1.x release
  imports into any other v0.1.x release on the same instance.
  The first line is always a `metadata` provenance record; every
  subsequent line is one record with a `type` discriminator.
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

The v0.1.x maintenance line lives on the `release/0.1.x` branch.
Tags are cut from that branch with `--latest=false` so the GitHub
release UI does not promote them above the active line. CI
workflows currently only run on PRs to `main` and `develop`;
manual verification covers the maintenance line.
