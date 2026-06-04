# Projects

A `Project` groups videos, personas, world states, summaries,
claims, and annotations under a shared owner with a member roster
and optional video assignment rules. Project-scoped data is
visible to project members; the project's role determines what
each member can do.

## Lifecycle

```text
POST   /api/projects                       create
GET    /api/projects                       list projects the requester can read
GET    /api/projects/:projectId            read one
PUT    /api/projects/:projectId            update name, description, settings
DELETE /api/projects/:projectId            delete
```

`POST /api/projects` accepts:

```json
{
  "name": "Field study A",
  "description": "Optional",
  "slug": "field-study-a",
  "ownerGroupId": null
}
```

Ownership is implicit at create time: if `ownerGroupId` is
provided, the project is group-owned and the caller must be a
`group_admin` or `group_owner` of that group; otherwise the
authenticated user becomes the project's `ownerUserId`. Either way
the creator is added as `project_owner` in `ProjectMembership`.
Group-owned projects inherit access through the group's role
assignments. Project `settings` are not accepted on create; edit
them via `PUT /api/projects/:projectId`.

## Members

```text
POST   /api/projects/:projectId/members              body { userId, role }
GET    /api/projects/:projectId/members
PUT    /api/projects/:projectId/members/:userId      body { role }
DELETE /api/projects/:projectId/members/:userId
```

`role` is one of:

```text
project_owner      full project admin + content
project_manager    content + limited project admin (no delete project)
annotator          create / read / update / delete own content; read all
reviewer           read all; review action on annotation/summary/claim
viewer             read-only
```

The role determines which `RolePermission` rows match for project
scope. See [Reference > RBAC permissions](../reference/rbac-permissions.md)
for the full action × subject matrix per role.

Adding, updating, or removing a member calls
`invalidateUserAbilities(userId)` on the affected user so their
ability is rebuilt on the next request.

## Project-scoped resources

```text
GET /api/projects/:projectId/personas
GET /api/projects/:projectId/world
PUT /api/projects/:projectId/world
```

Personas, world states, summaries, claims, and annotations all
carry an optional `projectId` column. When set, the row is
project-scoped and visible to project members per their role; when
NULL, the row is personal to its owner.

`WorldState` has a `(userId, projectId)` unique constraint, so
each user has at most one personal world state and one world state
per project they belong to.

## Ownership

`Project.ownerUserId` is the ownership column for ability
checks. Owners can do anything inside the project regardless of
the `RolePermission` matrix. There is no API for transferring
ownership after creation; `PUT /api/projects/:projectId` only
updates `name`, `description`, `settings`, and `isArchived`.

Deleting a project cascades to `ProjectMembership` and clears
`projectId` on dependent content rows (the FK uses `SetNull` so
data survives).

## See also

- [Guides > Groups](groups.md)
- [Guides > Video assignments](video-assignments.md)
- [Guides > Sharing](sharing.md)
- [Guides > Roles and permissions](roles-permissions.md)
- [Concepts > RBAC](../concepts/rbac.md)
