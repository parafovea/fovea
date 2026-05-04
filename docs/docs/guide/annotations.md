# Annotations

Use the annotations API to create and edit bounding-box sequences.
Each annotation belongs to one video and either a persona (for
type annotations) or directly to a user (for object annotations
without a persona).

## Endpoints

```text
GET    /api/annotations/:videoId
POST   /api/annotations
PUT    /api/annotations/:id
DELETE /api/annotations/:videoId/:id
```

## Type vs object

A type annotation has `type: "type"` and a `label` that resolves
to a typeId from the persona's ontology (for example,
`label: "player"`). It must carry a `personaId`.

An object annotation has `type: "object"` and a `label` that
resolves to a world-state object id. The `linkType` column
discriminates the four kinds:

```text
linkType   | label resolves through
-----------+-------------------------------
"entity"   | worldEntities
"event"    | worldEvents
"time"     | worldTimes
"location" | worldLocations
NULL       | treated as entity-linked (legacy)
```

The `linkType` column was added in v0.1.8
(migration `20260429000000_add_annotation_link_type`). Before
v0.1.8 the export emitted only `linkedEntityId`, so any object
annotation linked to an event, time, or location was silently
flattened on export and on import. The v0.1.8 export emits the
correct `linkedEventId` / `linkedTimeId` / `linkedLocationId`
field, the import reads any of the four, and `linkType` is
preserved on the round-trip.

## Frames and keyframes

The `frames` field is an ordered array of keyframes:

```json
{
  "frames": [
    {"frame": 0,  "box": {"x": 120, "y": 80, "width": 60, "height": 140}},
    {"frame": 60, "box": {"x": 150, "y": 85, "width": 60, "height": 140}}
  ]
}
```

Frames between keyframes are interpolated linearly at render
time. The frontend renders this as a smooth box; the backend
stores only the keyframes. See
[Concepts > Annotation model](../concepts/annotation-model.md) for
the algorithm.

## Listing scope

`GET /api/annotations/:videoId` since v0.1.8 returns only the
requester's annotations: type annotations on personas the
requester owns, plus object annotations the requester owns
(matched via `Annotation.userId`). The pre-v0.1.8 unscoped
listing surfaced foreign users' imported copies in the All
Annotations tab as duplicate rows; that symptom is gone.

## Mutation ownership

`PUT /api/annotations/:id`, `DELETE /api/annotations/:videoId/:id`,
and `POST /api/annotations` (when `personaId` is supplied) check
ownership through `lib/ownership.ts` helpers
(`assertAnnotationOwned`, `assertPersonaOwned`). A foreign user's
write attempt returns 404. See
[Concepts > Data isolation](../concepts/data-isolation.md).
