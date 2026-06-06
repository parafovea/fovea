# RBAC permissions

The full action × subject matrix as seeded by
`server/prisma/seed-permissions.ts`. The seed is the source of
truth; this page is a transcription. Run
`tsx prisma/seed-permissions.ts` to apply it.

## Project scope

| role            | resource    | actions                                                  | ownOnly             |
|-----------------|-------------|----------------------------------------------------------|---------------------|
| project_owner   | annotation  | create / read / update / delete / share / export        | no                  |
| project_owner   | summary     | create / read / update / delete / share / export        | no                  |
| project_owner   | claim       | create / read / update / delete / share / export        | no                  |
| project_owner   | persona     | create / read / update / delete / share / export        | no                  |
| project_owner   | world_state | create / read / update / delete / share / export        | no                  |
| project_owner   | project     | update / delete / manage_members                         | no                  |
| project_manager | annotation  | create / read / update / delete / share / export        | no                  |
| project_manager | summary     | create / read / update / delete / share / export        | no                  |
| project_manager | claim       | create / read / update / delete / share / export        | no                  |
| project_manager | persona     | create / read / update / delete / share / export        | no                  |
| project_manager | world_state | create / read / update / delete / share / export        | no                  |
| project_manager | project     | read / update / manage_members                           | no                  |
| annotator       | annotation  | create / read / update / delete / share / export        | yes (read excluded) |
| annotator       | summary     | create / read / update / delete / share / export        | yes (read excluded) |
| annotator       | claim       | create / read / update / delete / share / export        | yes (read excluded) |
| annotator       | persona     | create / read / update / delete / share / export        | yes (read excluded) |
| annotator       | world_state | create / read / update / delete / share / export        | yes (read excluded) |
| annotator       | video       | read                                                     | no                  |
| annotator       | project     | read                                                     | no                  |
| reviewer        | annotation  | read / review                                            | no                  |
| reviewer        | summary     | read / review / export                                   | no                  |
| reviewer        | claim       | read / review                                            | no                  |
| reviewer        | persona     | read                                                     | no                  |
| reviewer        | world_state | read                                                     | no                  |
| reviewer        | video       | read                                                     | no                  |
| reviewer        | project     | read                                                     | no                  |
| viewer          | annotation  | read                                                     | no                  |
| viewer          | summary     | read                                                     | no                  |
| viewer          | claim       | read                                                     | no                  |
| viewer          | persona     | read                                                     | no                  |
| viewer          | world_state | read                                                     | no                  |
| viewer          | video       | read                                                     | no                  |
| viewer          | project     | read                                                     | no                  |

`annotator` writes are own-only: CASL adds the row's ownership
column as a condition. Reads are unconditional within the project,
so an `annotator` sees every annotation in their project but can
only update their own.

## Group scope

| role         | resource | actions                                  | ownOnly |
|--------------|----------|------------------------------------------|---------|
| group_owner  | group    | update / delete / manage_members         | no      |
| group_owner  | project  | create                                   | no      |
| group_admin  | group    | update / manage_members                  | no      |
| group_admin  | project  | create                                   | no      |
| group_member | group    | read                                     | no      |

## System scope

The seed leaves the system scope empty under the `user` role.
Every authenticated user gets the baseline ownership rules
unconditionally; project / group memberships add to the matrix
above. `system_admin` does not need RolePermission rows; the
ability builder short-circuits with `can('manage', 'all')`.

The integration test helper at
`server/test/integration/_rbac-baseline.ts` populates the system
scope under the `user` role with `ownOnly: true` rows for every
content action; this is what tests against multi-user isolation
exercise. Production does not seed those rows.

## Editing

The matrix is editable at runtime via
[`/api/admin/permissions`](../guide/admin-permissions.md). Edits
flush the per-user ability cache so they take effect on the next
request.
