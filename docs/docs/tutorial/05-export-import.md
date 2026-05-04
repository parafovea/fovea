# Export and import

Fovea's exchange format is JSONL. Each line is a single record with
a `type` discriminator (`persona`, `ontology`, `worldEntity`,
`worldEvent`, `worldTime`, `worldLocation`, `videoSummary`,
`claim`, `annotation`, `metadata`). The first line of every full
export is a `metadata` record carrying `exporterUserId`, used by
the importer to detect cross-user imports and regenerate ids.

This chapter exports the persona created in the tutorial, then
imports the same file into the seeded `test` user.

## Export

`GET /api/export` streams a complete export of the requester's
data:

```bash
curl -s http://localhost:3001/api/export \
  --cookie cookies.txt \
  -o tutorial-export.jsonl

wc -l tutorial-export.jsonl
# 1 metadata + 1 persona + 1 ontology + N world objects + 1 summary + M claims + K annotations
```

Inspect the first few records:

```bash
head -3 tutorial-export.jsonl
# {"type":"metadata","exporterUserId":"<admin-uuid>","version":"0.1.8"}
# {"type":"persona","id":"<persona-uuid>","name":"Soccer Match Analyst",...}
# {"type":"ontology","personaId":"<persona-uuid>","entityTypes":[...],...}
```

Narrower exports are available:

- `GET /api/export/personas` - personas and ontologies only.
- `GET /api/export/world` - world state only.
- `GET /api/export/summaries` - summaries and their claims only.
- `GET /api/export/stats` - keyframe and interpolated frame
  counts (scoped to the authenticated user since v0.1.4).

## Import as a different user

Sign in as `test` (a separate cookie jar) and POST the export to
`/api/import`:

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  --cookie-jar test-cookies.txt \
  -d '{"username":"test","password":"test123"}'

curl -s -X POST http://localhost:3001/api/import \
  --cookie test-cookies.txt \
  -F "file=@tutorial-export.jsonl"
# {"success":true,"itemsImported":N,"itemsSkipped":0,"importHistoryId":"..."}
```

Because the exporter (`admin`) and the importer (`test`) are
different users, the importer regenerates ids for every persona,
ontology, world object, annotation, summary, and claim. Gloss
items pointing at world objects (`objectRef`, `entityRef`,
`typeRef`) are remapped to the new ids in the same pass, so the
imported claims still resolve through `GET /api/world`.

## Verify the round-trip

`GET /api/import/history` lists the requester's imports (since
v0.1.8 the route is user-scoped):

```bash
curl -s http://localhost:3001/api/import/history \
  --cookie test-cookies.txt
# [{"id":"...","filename":"tutorial-export.jsonl","importedBy":"<test-uuid>",
#   "itemsImported":N,"itemsSkipped":0,"createdAt":"..."}]
```

The imported persona shows up under `test`'s `GET /api/personas`
with a fresh id, the ontology under `GET /api/ontology?personaId=...`,
and the annotations under `GET /api/annotations/:videoId`. None of
these are visible to `admin`. Cross-user data isolation is
documented in [Concepts > Data isolation](../concepts/data-isolation.md).

## What ImportResultDialog warns about

If the export references world objects that the importer cannot
recreate (for example, a partial export missing referenced
entities), the affected annotations are skipped with
`missing-dependency` conflicts. v0.1.8 surfaces this as a yellow
"Completed with Warnings" header in `ImportResultDialog`, with a
banner explaining the skip count and the remediation (re-export
from source with the referenced world objects included). See
[Guide > Cross-user imports](../guide/cross-user-imports.md) for
the conflict resolution flow.

## Done

The tutorial is complete. The [Guides](../guide/index.md) section
documents each feature in isolation; the
[Concepts](../concepts/index.md) section explains the architecture
and the data isolation model; the [Reference](../reference/index.md)
section is the per-endpoint, per-table lookup.
