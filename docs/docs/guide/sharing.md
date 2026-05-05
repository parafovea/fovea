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
                                            permissionLevel, expiresAt? }
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

The resource must exist and be readable to the requester; the
route checks `ability.can('share', subject(...))` on the source
row before creating the share.

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
resource under the requester. The fork carries fresh ids; cross-
references inside the resource (gloss items, claim relations) are
remapped using the same ID-regeneration machinery as
[cross-user imports](cross-user-imports.md).

Forking is one-way: revoking the original share does not delete
the forked copy.

## Expiry

`expiresAt` is optional. When set, the share becomes invisible to
the recipient after that timestamp; the row stays in the database
for audit purposes. A revoked share is hard-deleted.

## See also

- [Guides > Projects](projects.md)
- [Guides > Groups](groups.md)
- [Guides > Cross-user imports](cross-user-imports.md)
- [Concepts > RBAC](../concepts/rbac.md)
