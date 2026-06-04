# Annotation model

An annotation is a sequence of keyframe boxes plus a label. The
frontend renders the box at every frame between keyframes by
linear interpolation; the backend stores only the keyframes. This
keeps storage proportional to user effort, not to video length.

## Keyframes and interpolation

```text
frame 0    box A
frame 60   box B
                ->  rendered: box at frame f for 0 <= f <= 60
                    is the linear interpolation of A and B
                    weighted by f / 60.
```

The keyframe array is ordered by frame number. Frames before the
first keyframe and after the last are not rendered (the
annotation is "absent" outside its keyframe range). To make an
annotation truly disappear within its range, drop a keyframe with
the `visible: false` flag at that frame.

## Type vs object

Two annotation types share the same row shape:

```text
type    label              persona
------  -----------------  --------
"type"  ontology typeId    required
"object" worldObject id    optional (linked via linkType)
```

The `linkType` column on object annotations discriminates which
world list the `label` resolves through:

```text
linkType   resolves through
---------  ------------------
"entity"   worldEntities
"event"    worldEvents
"time"     worldTimes
"location" worldLocations
NULL       treated as entity-linked (legacy)
```

The `linkType` column was introduced by the migration
`20260429000000_add_annotation_link_type` (nullable). The
frontend, the export handler, and the import handler write and
read whichever linked-id field matches the column, so object
annotations linked to events, times, or locations round-trip
without flattening to entity-linked.

## Ownership columns

Annotations carry two ownership columns. `Annotation.userId`
was introduced by `20260310000000_add_annotation_userid` to
support user-scoped object annotations (object annotations have
an optional `personaId`, so the persona-side ownership check
does not apply). `Annotation.createdByUserId` is the RBAC
ownership column, populated for historical rows by the backfill
migration `20260415000000_backfill_rbac_ownership`. CASL's
ability builder matches against `createdByUserId`; the legacy
`userId` is still populated by write paths so legacy clients
see consistent data.

`GET /api/annotations/:videoId` is filtered by
`accessibleBy(request.ability, 'read').Annotation`, which compiles
to `createdByUserId = request.user.id` for own-only readers and to
the union with project-scoped reads for project members. The
listing was previously unscoped, which is what let cross-user
imports show up as duplicate rows. See
[Concepts > RBAC](rbac.md).

## Confidence and source

```text
confidence   Float?    model confidence (NULL for hand-drawn)
source       String    "manual" | "tracking" | "detection"
```

A `tracking` annotation came from the tracker filling between
keyframes. A `detection` annotation came from
`POST /api/videos/:videoId/detect`. A `manual` annotation came
from a user drawing it.
