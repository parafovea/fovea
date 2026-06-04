# Tailoring Fovea's guided tours for your deployment

Fovea ships ten built-in guided tours that walk a new user through the
full annotation surface. The narration of each tour, the suggested
type names the visitor builds, the example venue and claim text, and
**the actual video each tour walks the visitor through** are all
sourced from a single JSON file: `annotation-tool/public/tour-content.json`.

> **Admin tailoring is two files: a JSON config and your videos. No
> code edits, no rebuild, no TypeScript.**

## What the running example needs to be coherent

A guided tour is a concrete walkthrough. The visitor watches a real
clip while the narration tells them what to do with it. For Tour 4
("Box the person grabbing the ball, then box the person who had it
first") to make sense, the visitor must be looking at a clip where a
ball-grab is actually happening. So **the video, the persona, the
type names, the event, and the example claim all have to describe
ONE example.**

The default bundle that ships with Fovea is the **microvent**
running example. It's a real annotation project covering two news
incidents (a Phillies-Marlins ball-grab at LoanDepot Park and a
Long Beach cargo-container spill at the Port of Long Beach). To
retheme the tours for your own domain, supply a different bundle.

## The two-file setup

### File 1: drop your videos into `videos/`

Put your video files in the directory `STORAGE_PATH` points at (the
annotation-tool's `videos/` directory in stock dev, your deployment's
mounted volume in production). Filenames are arbitrary but case- and
character-sensitive; they're hashed (`md5(filename)[0:16]`) to
derive the videoId Fovea uses everywhere.

Trigger a sync so the backend registers Video rows for each file:

```bash
curl -X POST http://localhost:3001/api/videos/sync \
  -H "Cookie: session_token=$SESSION_TOKEN"
```

This is the same scan that runs on backend boot in production; the
manual sync is just for after you've added or removed files at
runtime.

Sidecar `.info.json` files next to each video (same basename) are
picked up by the sync and surface as the video's metadata.

### File 2: edit `tour-content.json`

`annotation-tool/public/tour-content.json` is the entire admin
tailoring surface. It's plain JSON with a JSON Schema
(`/tour-content.schema.json`) for autocomplete and validation in any
editor that supports `$schema`. The shipped file is the microvent
example; replace its values with your own:

```jsonc
{
  "$schema": "/tour-content.schema.json",

  "firstAnnotation": {
    "personaName": "Coast Guard Inspector",
    "personaRole": "Vessel inspection officer",
    "entityType": { "name": "Container", "gloss": "a standardized shipping container" },
    "videoFilename": "long-beach-cargo-spill-overview.mp4"
  },

  "ontologyAuthoring": {
    "personaName": "Coast Guard Inspector",
    "personaRole": "Vessel inspection officer",
    "entityType":   { "name": "container",      "gloss": "standardized shipping container" },
    "eventType":    { "name": "cargo-spill",    "gloss": "cargo loss during transit"       },
    "roleType":     { "name": "affected-party", "gloss": "who suffered the loss"            },
    "relationType": { "name": "loaded-on",      "gloss": "cargo placement on vessel"        }
  },

  "eventsRolesClaims": {
    "personaName": "Coast Guard Inspector",
    "personaRole": "Vessel inspection officer",
    "firstActor":  { "name": "Cargo vessel",  "gloss": "the ship losing cargo" },
    "secondActor": { "name": "Port facility", "gloss": "the receiving dock"    },
    "eventType":   { "name": "cargo-spill",   "gloss": "overboard container loss" },
    "firstRole":   { "name": "losing-party",    "gloss": "the vessel that lost cargo" },
    "secondRole":  { "name": "receiving-party", "gloss": "the destination port"        },
    "derivedClaimText": "The MV Pacific lost 67 containers en route to Pier 400",
    "videoFilename": "pacific-loses-67-boxes.mp4"
  },

  "worldLayer": {
    "personaName": "Coast Guard Inspector",
    "personaRole": "Vessel inspection officer",
    "entityName": "Port of Long Beach Pier 400",
    "entityType": { "name": "Port", "gloss": "a deepwater shipping port" },
    "locationLatitude":  33.7367,
    "locationLongitude": -118.2517,
    "locationName": "Port of Long Beach, CA",
    "timeCollectionName":   "September 2025 cargo incidents",
    "entityCollectionName": "the affected vessels",
    "videoFilename": "pier-400-wide-shot.mp4"
  }

  // ... wikidataAugmentation, modelInTheLoop, summariesAndClaims,
  //     collaboration, importExport. See /tour-content.schema.json
  //     for the full shape.
}
```

Save the file and redeploy (or just refresh in dev; the JSON loads
at boot). The tour catalog rebuilds from the new content.

## What happens at runtime

1. On boot, the frontend fetches `/tour-content.json`.
2. The loader resolves each `videoFilename` to its `videoId` via the
   same `md5(filename)[0:16]` formula the backend uses, so the tour
   spotlight navigates straight to `/annotate/{videoId}`.
3. The resolved bundle is handed to `TourProvider`. Every tour
   narration, suggested type name, example coordinate, etc. is
   interpolated from the bundle, not hardcoded.

## What happens when the JSON is missing or malformed

The loader **does not silently fall back to a default**. The shipped
microvent bundle references microvent's specific videoIds; those
videos won't exist in your deployment, so a silent fall-back would
silently break every tour. Instead:

- `/tour-content.json` missing or returns 4xx/5xx: red banner at
  the top of the app ("Tours disabled: content config error") with
  a pointer to this doc. The rest of the app mounts normally.
- JSON parse error: same banner, with the message "not valid JSON".
- Required fields missing or shape wrong: same banner, with a
  pointer to `/tour-content.schema.json`.

The visible banner is intentional. An attendee clicking a broken
tour tile is worse than a tour menu that's clearly disabled with an
error a presenter can read.

## What a bundle CANNOT change

These are tour-engine contracts, not content:

- **Step anchors** (`data-tour-id` values) are wired into the
  product UI components. Renaming a type the visitor creates is a
  content change; pointing a step at a different UI surface is an
  engine change.
- **Step ordering and `expectAction`**. The engine's auto-advance on
  `expectAction='click'` depends on the script's order matching the
  natural visitor click path.
- **`fixtureBundle` slugs**. These are demo-deployment seed bundle
  IDs that map to `annotation-tool/demo/fixtures/tour-{id}.json`.
  Decoupled from the content bundle on purpose.

## See also

- `annotation-tool/public/tour-content.json`: the live config you
  edit.
- `annotation-tool/public/tour-content.schema.json`: JSON Schema for
  the bundle shape, gives IDE autocomplete and validation.
- `annotation-tool/src/tours/content/types.ts`: TypeScript contract
  (`TourContentBundle`) the loader resolves to.
- `annotation-tool/src/tours/content/loader.ts`: boot-time fetch and
  `videoFilename` to `videoId` resolution.
- `annotation-tool/src/tours/content/microvent.ts`: TS-form of the
  microvent bundle for tests and the in-code dev fallback (the
  loader itself never uses this).
