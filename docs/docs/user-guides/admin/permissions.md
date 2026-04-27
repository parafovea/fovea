---
title: Permissions matrix
sidebar_position: 3
---

# Permissions matrix

Fovea's authorization rules are stored as data in the `RolePermission` table, not hardcoded. System administrators can edit the matrix at runtime through the admin permissions API. CASL reads the matrix to build a per-user ability on every authenticated request.

## Scope, role, resource, action

Each row is a tuple:

| Field | Values |
|-------|--------|
| `scope` | `system`, `group`, `project` |
| `role` | role identifier (`system_admin`, `user`, `group_owner`, `group_admin`, `group_member`, `project_owner`, `project_manager`, `annotator`, `reviewer`, `viewer`) |
| `resourceType` | `Annotation`, `Claim`, `Persona`, `WorldState`, `Video`, `VideoSummary`, `Project`, `UserGroup`, `User` |
| `action` | `create`, `read`, `update`, `delete`, `share`, `fork`, `assign`, `export`, `review`, `manage_members` (CASL's `manage` matches all) |
| `ownOnly` | when true, the rule applies only to resources whose ownership field matches the user |

The unique key is `(scope, role, resourceType, action)`.

## Bypass

`system_admin` bypasses the matrix entirely. The CASL ability builder returns `can('manage', 'all')` for system admins and short-circuits without consulting `RolePermission`. Every other role is governed by the matrix plus the ownership baseline.

## Ownership baseline

Regardless of matrix rows, every user can read, update, and delete resources they own. The CASL builder appends ownership rules using per-model fields:

| Resource | Ownership field |
|----------|-----------------|
| `Persona`, `WorldState` | `userId` |
| `Annotation` | `createdByUserId` |
| `VideoSummary`, `Claim`, `UserGroup` | `createdBy` |
| `Project` | `ownerUserId` |

## API

The `/api/admin/permissions` endpoints expose CRUD on the matrix:

| Endpoint | Action |
|----------|--------|
| `GET /api/admin/permissions` | list all rows |
| `POST /api/admin/permissions` | insert a new rule |
| `PUT /api/admin/permissions/:id` | update an existing rule |
| `DELETE /api/admin/permissions/:id` | remove a rule |

All endpoints require `system_admin`. Every mutation invalidates the global permission cache and clears every per-user ability cache entry, so the new rule takes effect on the next request.

## Caching and invalidation

Two caches participate in authorization:

1. **Global RolePermission cache** with a 5-minute TTL fallback. Edits to any row through `/api/admin/permissions` invalidate it explicitly.
2. **Per-user ability cache** keyed on `userId`. There is no TTL on this cache; the following events invalidate a user's entry:
   - Any add or remove on `GroupMembership` or `ProjectMembership`
   - Any role change on an existing membership
   - A `systemRole` change on the user
   - A `RolePermission` matrix edit (clears all entries)
   - Project deletion (clears entries for every member of the project)

Forgetting to invalidate after a membership change is a security bug; the helpers `invalidateUserAbilities`, `invalidateGroupMembers`, `invalidateProjectMembers`, and `invalidatePermissionCache` exist for this purpose.

## Default seed

A baseline matrix is seeded by `seedBaselinePermissions()` and applied during database setup. The same helper is reused by E2E tests. Custom deployments can adjust the seed file or edit rows through the API after the initial seed.

## Negative tests

The 29-test RBAC negative suite in `server/test/security/` covers cross-tenant IDOR, null-ownership denial, cache invalidation timing, sharing escalation (re-shares cannot exceed the received level), and admin-only endpoint enforcement.

## Related

- [Projects, Groups, and RBAC](../../concepts/projects-groups.md)
- [System configuration](./system-config.md)
- [Data model: RolePermission](../../reference/data-model.md)
