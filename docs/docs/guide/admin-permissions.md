# Admin permissions

The `RolePermission` table is editable at runtime. Only a
`system_admin` can mutate it; mutations invalidate the global
permission cache so changes take effect on the next request.

## Endpoints

```text
GET    /api/admin/permissions
POST   /api/admin/permissions       body { scope, role, resourceType, action, ownOnly? }
PATCH  /api/admin/permissions/:id   body { ownOnly }
DELETE /api/admin/permissions/:id
```

All four require `requireAdmin` (i.e., `systemRole = 'system_admin'`).
The non-admin response is 403 from `requireAdmin`, not 404.

## List

```bash
curl --cookie cookies.txt http://localhost:3001/api/admin/permissions
# [
#   {"id":"...","scope":"system","role":"user","resourceType":"video","action":"read","ownOnly":false,...},
#   {"id":"...","scope":"project","role":"annotator","resourceType":"annotation","action":"create","ownOnly":true,...},
#   ...
# ]
```

Sorted by `(scope, role, resourceType, action)`. The default
production seed has on the order of 100 rows.

## Create

```bash
curl -X POST --cookie cookies.txt http://localhost:3001/api/admin/permissions \
  -H 'Content-Type: application/json' \
  -d '{"scope":"project","role":"curator","resourceType":"claim","action":"update","ownOnly":false}'
# 201 Created
```

The unique key is `(scope, role, resourceType, action)`. A
duplicate returns 409.

## Patch

```bash
curl -X PATCH --cookie cookies.txt http://localhost:3001/api/admin/permissions/<id> \
  -H 'Content-Type: application/json' \
  -d '{"ownOnly":true}'
```

Only `ownOnly` is mutable. The route refuses to change scope,
role, resourceType, or action because those columns are the
unique key; changing them would silently re-identify the row. To
move a permission, delete it and create a new row.

## Delete

```bash
curl -X DELETE --cookie cookies.txt http://localhost:3001/api/admin/permissions/<id>
# 204 No Content
```

## Cache invalidation

Every mutation calls `invalidatePermissionCache()`, which clears
the global matrix cache and every per-user ability cache.
Subsequent requests rebuild from the updated matrix. Do not rely
on the 5-minute TTL fallback for revocation; the explicit
invalidation is the contract.

## See also

- [Guides > Roles and permissions](roles-permissions.md)
- [Reference > RBAC permissions](../reference/rbac-permissions.md)
- [Concepts > RBAC](../concepts/rbac.md)
