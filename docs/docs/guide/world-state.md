# World state

Use the world API to read and replace the per-user collections of
entities, events, times, locations, and the relations among them.
World state is the named-instance layer that sits above the
persona ontology: an ontology has a `Player` type; world state
has a specific `Player 9` whose type is `Player`.

## Endpoints

```text
GET    /api/world
PUT    /api/world
DELETE /api/admin/world/:userId   # admin only
```

`GET /api/world` returns the requester's world document. In
single-user mode every authenticated request gets the single
shared world. In multi-user mode each user can hold multiple
world states, keyed by the composite `@@unique([userId, projectId])`:
one row per project the user participates in, plus a personal
row where `projectId` is null.

## Document shape

```json
{
  "entities":          [{"id":"player-9","typeId":"player","name":"Player 9"}],
  "events":            [{"id":"goal-1","typeId":"shot","timeId":"t-1"}],
  "times":             [{"id":"t-1","start":"2024-06-15T18:00:00Z"}],
  "entityCollections": [...],
  "eventCollections":  [...],
  "timeCollections":   [...],
  "relations":         [{"id":"r-1","typeId":"causes",
                         "sourceId":"goal-1","targetId":"goal-2"}]
}
```

The collection shapes (`entityCollections`, `eventCollections`,
`timeCollections`) hold ordered groupings whose
`entityIds` / `eventIds` arrays are remapped by the cross-user
import path when ids change.

Location instances live inside the `entities` array and are
distinguished by a `locationType` discriminator field. Object
annotations with `linkType = "location"` resolve to those entries
via their entity id; there is no separate top-level locations key.

## Replacing the document

`PUT /api/world` accepts the full document. The route is
write-through, not patching; the client must send the merged
document. The frontend's world editor handles the merge
locally.

## Admin reset

`DELETE /api/admin/world/:userId` clears a user's world state.
This is a hard delete; there is no undo. Use it only as a
remediation step when an import has corrupted a user's world
beyond manual repair.
