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

The `linkType` column lives on the `Annotation` table
(migration `20260505000000_add_annotation_link_type`). The export
emits the correct `linkedEntityId` / `linkedEventId` /
`linkedTimeId` / `linkedLocationId` field for each annotation,
the import reads any of the four, and `linkType` is preserved on
the round-trip.

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

`GET /api/annotations/:videoId` is filtered by
`accessibleBy(request.ability, 'read').Annotation`. The compiled
clause matches `createdByUserId = request.user.id` for own-only
readers and additionally pulls in project-scoped reads for project
members.

## Mutation ownership

`PUT /api/annotations/:id`, `DELETE /api/annotations/:videoId/:id`,
and `POST /api/annotations` go through CASL: the route fetches the
target annotation (or, for create, the supplied `personaId` row)
and calls `request.ability.can(action, subject(...))`. A
foreign-owned target returns 404. `POST /api/annotations` also
runs an explicit `can('read', subject('Persona', persona))`
precheck when `personaId` is supplied, because the generic
`create Annotation` rule does not look at the `personaId` body
field. See
[Concepts > RBAC](../concepts/rbac.md).

## Ownership columns

Write paths populate `Annotation.createdByUserId` (the RBAC
ownership column) and `Annotation.userId` (the legacy ownership
column, kept for back-compat) from the authenticated session.
Both columns are indexed; CASL uses `createdByUserId`.
