# Demo fixture bundles

This directory holds the per-tour fixture bundles the CVPR demo seeder
uses to stage a known workspace state before launching a tour. Bundles
are shipped only in demo builds (the directory is referenced solely
from `server/src/demo/seed.ts`); a stock build never reads from here.

## Layout

One JSON file per tour, named `tour-{id}.json`:

```
annotation-tool/demo/fixtures/
├── README.md             # this file
├── tour-first-annotation.json
├── tour-ontology-authoring.json
├── tour-wikidata-augmentation.json
└── ...                   # one per tour-id
```

Each bundle is a single JSON document. We deliberately favor "one file
per tour, everything inside" over a directory-per-tour layout — the
seeder loads the file in one read, validates against the schema in
`server/src/demo/seed-schema.ts`, and runs one Prisma transaction.
That makes the failure modes obvious: if the file's malformed, the
seed fails before touching the database; if the database write fails,
the transaction rolls back and the visitor's workspace stays unchanged.

## Bundle schema (shape)

```jsonc
{
  "tourId": "first-annotation",        // matches the script id
  "personas": [
    {
      "name": "Test Analyst",
      "role": "researcher",            // free-form persona role label
      "isDefault": true                // mark as the active persona
    }
  ],
  "ontology": {
    "personaIndex": 0,                 // attach to personas[0]
    "entityTypes": [
      { "name": "Person", "gloss": "An individual human." }
    ],
    "eventTypes": [],
    "roles": [],
    "relationTypes": []
  },
  "world": {
    "personaIndex": 0,
    "entities": [],
    "events": [],
    "times": [],
    "locations": []
  },
  "videos": [
    // Videos are referenced by id (not uploaded) — the bundle expects
    // the demo deployment's storage already contains them. Use the
    // VideoBrowser test fixtures for a working set.
    { "videoId": "demo-clip-01" }
  ],
  "annotations": [
    // Optional: seed pre-existing annotations to set the scene.
  ],
  "summaries": [
    // Tour 7 ships transcript + summary state here.
  ]
}
```

## Authoring rules

- **Keep clips tiny.** Every referenced video should be ≤ 30 seconds
  and ≤ 5 MB after transcode. The demo deployment ships these in CDN
  storage; we don't want a fixture seed pulling tens of MB.
- **Real content, not lorem ipsum.** CVPR attendees notice synthetic
  data. Use rights-cleared clips or faces-blurred footage.
- **No PII.** No real attendee names, no internal user IDs.
- **Validate before committing.** Run `npm run check-fixtures` (TODO,
  once that script lands) to catch malformed JSON.

When you add a new tour script under
`annotation-tool/src/tours/scripts/`, drop a matching bundle here and
set the script's `fixtureBundle` to the basename without the `.json`
extension.
