# Roles and permissions

Fovea's RBAC is a three-scope role system on top of a single
`RolePermission` matrix. Users hold roles at one or more scopes;
the matrix says what each role can do; CASL composes the union.

## Scopes

```text
system    every authenticated user has a system role
group     users in a group hold a group role
project   users in a project hold a project role
```

`User.systemRole` is the system role. `GroupMembership.role` is
the group role; one row per (user, group) pair. `ProjectMembership.role`
is the project role; one row per (user, project) pair.

## System roles

```text
system_admin    can('manage', 'all'); full access to every resource
user            default; permissions come from group + project roles
                plus baseline ownership rules
```

`User.systemRole` defaults to `'user'`. `system_admin` is set
explicitly during seed or via an admin endpoint. The legacy
boolean `User.isAdmin` column is still populated for backward
compatibility, but `systemRole` is the source of truth.

## Group roles

```text
group_owner     update / delete group, manage members, create projects
group_admin     update group, manage members, create projects
group_member    read group info
```

## Project roles

```text
project_owner     full content access + project admin (update / delete /
                  manage members)
project_manager   full content access + project admin minus delete project
annotator         create / read / update / delete own content; read all
                  content within the project
reviewer          read all content; review action on
                  annotation / summary / claim
viewer            read-only on every project content type
```

`annotator` write actions are `ownOnly: true` in the seed, so
CASL adds a `createdByUserId = userId` (or equivalent) condition;
read is unconditional within the project.

## Baseline ownership

Independent of the role matrix, every authenticated user can
always read / update / delete resources they own:

```text
own Annotation  by createdByUserId
own VideoSummary by createdBy
own Claim       by createdBy
own Persona     by userId
own WorldState  by userId
```

These rules are added unconditionally in `defineAbilitiesFor`. A
user without any project or group role still owns their personal
content.

## Seeding a custom role

`server/prisma/seed-permissions.ts` inserts the production matrix.
Adding a new role is a pair of writes plus a cache flush:

```ts
await prisma.rolePermission.create({
  data: { scope: 'project', role: 'curator', resourceType: 'claim',
          action: 'update', ownOnly: false }
})
invalidatePermissionCache()
```

`invalidatePermissionCache()` flushes the global matrix cache and
every per-user ability cache. Without it, the new rule does not
take effect until the matrix TTL elapses (5 minutes).

## See also

- [Guides > Admin permissions](admin-permissions.md)
- [Reference > RBAC permissions](../reference/rbac-permissions.md)
- [Concepts > RBAC](../concepts/rbac.md)
