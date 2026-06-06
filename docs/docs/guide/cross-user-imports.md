# Cross-user imports

Use the cross-user import flow to load another user's exported
JSONL into the requester's account on the same instance. The
import path detects cross-user imports and regenerates ids so the
two users' data does not collide.

## Detection

Every full export carries a `metadata` provenance line with
`exporterUserId`:

```json
{"type":"metadata","exporterUserId":"<exporter-uuid>","version":"<format-version>"}
```

If `exporterUserId` differs from the importer's user id, the
import path enters cross-user mode. Exported object annotations
also carry an explicit `userId` field so cross-user detection
works for exports that contain no persona lines.

## Id regeneration

In cross-user mode the importer assigns a fresh UUID to every
imported persona, ontology, world object, annotation, summary,
and claim. The pre-existing rows from the same import batch carry
forward the regenerated ids, so for example a claim's
`gloss[].content` of type `objectRef` is rewritten to point at
the regenerated worldEntity id.

The remap covers:

- Direct id columns (`personaId`, `videoId` references stay; `id`
  fields are regenerated).
- Array-valued id reference fields on entity and event collections
  (`entityIds`, `eventIds`).
- `GlossItem.content` for `objectRef`, `annotationRef`,
  `claimRef`, and instance-level `typeRef`.

Cross-user id regeneration overrides the `skip`, `replace`, and
`merge` resolutions for entries in the same batch (the regenerated
id is always applied so within-batch references stay live).

## Conflict resolution

`POST /api/import/preview` returns a conflict report. The frontend
renders it as the import dialog with:

- A cross-user banner when the export came from a different user.
- Per-conflict smart defaults driven by the conflict kind
  (existing-row, missing-dependency, etc.).
- An "apply to all" bulk resolution.
- Auto-collapsed conflict groups when the count is large.

## Completed with Warnings

When annotations are skipped because referenced world objects are
absent (`missing-dependency` conflicts), `ImportResultDialog`
shows a yellow `Completed with Warnings` title and a banner
explaining the skip count and the remediation (re-export from the
source with the referenced world objects included).

## importedBy

`POST /api/import` sets `importedBy = request.user.id` on every
`ImportHistory` row so the user-scoped
`GET /api/import/history` filter returns the requester's imports.
