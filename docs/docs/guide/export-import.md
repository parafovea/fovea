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

`GET /api/export/stats` is scoped to the authenticated user.
`GET /api/import/history` is scoped to
`importedBy = request.user.id`, and the corresponding
`POST /api/import` writes `importedBy` on every history row.

## JSONL format

Each line is one record. The first line of every full export is a
`metadata` provenance record. The remaining lines carry `type`
discriminators:

```text
metadata, persona, ontology, entity, entity_collection, event,
event_collection, time, time_collection, relation, summary, claim,
claim_relation, annotation
```

The format is pinned within the export-format maintenance line.
See [Project > Stability](../project/stability.md).

## Preview

`POST /api/import/preview` runs the import without writing,
returning a conflict report. The frontend uses this to render the
import dialog with smart defaults per conflict.

## Upload limits

`POST /api/import` returns the multipart upload-too-large failure
with the underlying 4xx status (typically 413), so clients can
render a "file too big" message.

## linkType round-trip

Object annotations linked to events, times, or locations
round-trip through export and import without flattening. The
`Annotation.linkType` column carries the kind on the round-trip,
the export emits the matching `linkedEventId` /
`linkedTimeId` / `linkedLocationId` line, and the import reads
any of the four. See
[Guide > Annotations](annotations.md) for the column semantics.

## Cross-user

When the exporter and the importer are different users (detected
via the `metadata.exporterUserId` provenance line), the importer
regenerates ids and remaps gloss items. See
[Guide > Cross-user imports](cross-user-imports.md).
