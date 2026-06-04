# Groups

A `UserGroup` collects users into a team. Groups own projects,
receive shares, and seed `RolePermission` matches at the `group`
scope. Group roles compose with project roles: a user can be both
a `group_admin` of `Org A` and an `annotator` of one of Org A's
projects, and CASL takes the union.

## Lifecycle

```text
POST   /api/groups                           create
GET    /api/groups                           list groups the current user is a member of
GET    /api/groups/:groupId                  read one
PUT    /api/groups/:groupId                  update name, description
DELETE /api/groups/:groupId                  delete
```

`POST /api/groups` accepts `{ name, description?, slug }`. The
creator is recorded in `UserGroup.createdBy`, and the route also
adds them as a `group_owner` member in the same transaction.

## Membership

```text
POST   /api/groups/:groupId/members              body { userId, role }
GET    /api/groups/:groupId/members
PUT    /api/groups/:groupId/members/:userId      body { role }
DELETE /api/groups/:groupId/members/:userId
```

Roles:

```text
group_owner    update / delete group, manage members, create projects
group_admin    update group, manage members, create projects
group_member   read group info
```

A user can hold at most one role per group (`@@unique([userId,
groupId])` on `GroupMembership`). Removing a member calls
`invalidateUserAbilities(userId)`.

## Admin endpoints

A `system_admin` can manage every group regardless of group role:

```text
GET    /api/admin/groups
POST   /api/admin/groups
PUT    /api/admin/groups/:groupId
DELETE /api/admin/groups/:groupId
```

The admin variants bypass the group-membership check; they still
go through `requireAdmin`.

## Group-owned projects

Setting `Project.ownerGroupId` makes the project group-owned. The
group's roles do not auto-grant project roles; a user who is a
`group_owner` is not automatically a `project_owner` of the
group's projects. Project memberships are still explicit. Group
ownership matters for:

- The group can be granted access through `ResourceShare`.
- Project deletion is restricted by group role when the project's
  `ownerGroupId` is set.

## See also

- [Guides > Projects](projects.md)
- [Guides > Roles and permissions](roles-permissions.md)
- [Concepts > RBAC](../concepts/rbac.md)
