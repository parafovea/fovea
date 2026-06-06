# Sharing

A `ResourceShare` row records a per-resource share between a
user and either another user or a group. Shares apply to
annotations, summaries, claims, personas, and world states. A
recipient gains either read-only access or the additional ability
to fork the resource into their own ownership.

## Endpoints

```text
POST   /api/sharing                  body { resourceType, resourceId,
                                            sharedWithUserId?, sharedWithGroupId?,
                                            permissionLevel? }
GET    /api/sharing/received         shares pointed at the requester
GET    /api/sharing/sent             shares the requester created
DELETE /api/sharing/:shareId         revoke a share
POST   /api/sharing/:shareId/fork    fork a forkable share into an owned copy
```

Exactly one of `sharedWithUserId` / `sharedWithGroupId` is set per
row.

## Resource types

```text
annotation | summary | claim | persona | world_state
```

The resource must exist, and the requester must either own it
(via `createdByUserId` for annotations, `createdBy` for summaries
and claims, or `userId` for personas and world states) or hold a
non-expired `ResourceShare` with `permissionLevel = 'forkable'`
targeting them directly through `sharedWithUserId` or via group
membership through `sharedWithGroupId`. A `read_only` recipient
cannot re-share at all; only `forkable` recipients may re-share,
and never above the level they received.

## Permission levels

```text
read_only   recipient can read the resource only
forkable    recipient can additionally call POST /api/sharing/:shareId/fork
            to copy the resource into their own ownership
```

A share cannot escalate. If the requester only has `read_only`
access (because the resource was shared to them at that level),
they cannot re-share at `forkable`. The route refuses; this is the
sharing privilege cap.

## Forking

`POST /api/sharing/:shareId/fork` writes a new owned copy of the
resource under the requester. The new row receives a fresh
top-level id and the owner column is rewritten to the requester
(`createdByUserId` for annotations, `createdBy` for summaries and
claims, or `userId` for personas and world states). All
JSON-shaped fields (for example `annotation.frames`;
`summary.summary`, `keyFrames`, and `transcriptJson`;
`claim.gloss`, `textSpans`, `claimerGloss`, `claimRelation`,
`audio`, `video`, and `metadata`; `persona.ontology.entityTypes`
through `relationTypes`; `worldState.entities`, `events`, `times`,
the `*Collections`, and `relations`) and foreign-key columns
(`videoId`, `personaId`, `summaryId`, `claimEventId`,
`claimTimeId`, `claimLocationId`) are copied verbatim from the
source row. The fork does not rewrite internal cross-references
the way [cross-user imports](cross-user-imports.md) do.

Forking is one-way: revoking the original share does not delete
the forked copy.

## Expiry

The `ResourceShare` row carries a nullable `expiresAt` column,
and the re-share permission check honors it (an expired share no
longer authorizes re-sharing). The `POST /api/sharing` body does
not currently accept `expiresAt`, so shares created through the
API are open-ended unless the column is set by another path. A
revoked share is hard-deleted.

## See also

- [Guides > Projects](projects.md)
- [Guides > Groups](groups.md)
- [Guides > Cross-user imports](cross-user-imports.md)
- [Concepts > RBAC](../concepts/rbac.md)
