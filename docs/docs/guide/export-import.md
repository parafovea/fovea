# Export and import

Use the export endpoints to pull a user's data out as JSONL and
the import endpoint to replay JSONL back into an account (the
same account or a different one).

## Endpoints

```text
GET  /api/export                  # full export
GET  /api/export/personas         # personas + ontologies
GET  /api/export/world            # world state
GET  /api/export/summaries        # summaries + claims
GET  /api/export/stats            # keyframe / interpolated counts
POST /api/import                  # multipart upload
POST /api/import/preview          # dry-run, returns conflict report
GET  /api/import/history          # requester's prior imports
```

`GET /api/export/stats` was scoped to the authenticated user in
v0.1.4. `GET /api/import/history` was scoped to
`importedBy = request.user.id` in v0.1.8, and the corresponding
`POST /api/import` writes `importedBy` on every history row.

## JSONL format

Each line is one record. The first line of every full export is a
`metadata` provenance record. The remaining lines carry `type`
discriminators:

```text
metadata, persona, ontology, worldEntity, worldEvent, worldTime,
worldLocation, videoSummary, claim, annotation
```

The format is pinned within the v0.1.x line. See
[Project > Stability](../project/stability.md).

## Preview

`POST /api/import/preview` runs the import without writing,
returning a conflict report. The frontend uses this to render the
import dialog with smart defaults per conflict.

## Upload limits

`POST /api/import` since v0.1.8 returns the multipart
upload-too-large failure with the underlying 4xx status (typically
413). The previous local `catch` collapsed `FST_REQ_FILE_TOO_LARGE`
and similar `FST_*_LIMIT` codes into 500; the route now passes
them through so clients can render a "file too big" message.

## linkType round-trip

Object annotations linked to events, times, or locations
round-trip through export and import without flattening. The
`Annotation.linkType` column added in v0.1.8 carries the kind on
the round-trip, the export emits the matching `linkedEventId` /
`linkedTimeId` / `linkedLocationId` line, and the import reads
any of the four. See
[Guide > Annotations](annotations.md) for the column semantics.

## Cross-user

When the exporter and the importer are different users (detected
via the `metadata.exporterUserId` provenance line), the importer
regenerates ids and remaps gloss items. See
[Guide > Cross-user imports](cross-user-imports.md).
