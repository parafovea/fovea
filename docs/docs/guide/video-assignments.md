# Video assignments

A `ProjectVideoAssignment` row links a `Video` to a `Project`,
optionally pinning a specific `User` for review. Assignments drive
the per-user video list (`VideoAccessService`): an authenticated
user only sees videos that are assigned to a project they can
access.

## Project-scoped endpoints

```text
GET    /api/projects/:projectId/videos                   list assignments
POST   /api/projects/:projectId/videos                   body { videoId, assignedUserId? }
DELETE /api/projects/:projectId/videos/:videoId          unassign
```

`POST` creates one assignment per call. The unique constraint
`(projectId, videoId)` makes it idempotent on retry.
`assignedUserId` is optional; setting it pins the video to a
specific reviewer within the project.

## Bulk and rule-based assignment

```text
POST   /api/admin/video-assignments/bulk
GET    /api/admin/video-assignments/rules
POST   /api/admin/video-assignments/rules
PUT    /api/admin/video-assignments/rules/:ruleId
DELETE /api/admin/video-assignments/rules/:ruleId
POST   /api/admin/video-assignments/rules/:ruleId/evaluate
POST   /api/admin/video-assignments/rules/evaluate-all
```

`VideoAssignmentRule` rows store conditions that match against
video metadata (filename glob, source platform, etc.) and a target
(`user`, `project`, or `group`). `POST .../rules/:ruleId/evaluate`
applies the rule to the existing video corpus and creates the
matching `ProjectVideoAssignment` rows;
`.../rules/evaluate-all` re-runs every active rule.

The rule body shape:

```json
{
  "name": "Twitter videos to triage project",
  "conditions": [
    {"field": "sourcePlatform", "operator": "equals", "value": "twitter"}
  ],
  "targetType": "project",
  "targetId": "...",
  "isActive": true
}
```

Bulk and rule endpoints require `system_admin`. The per-project
endpoints require either `project_owner`, `project_manager`, or
the system admin role.

## Video visibility

`VideoAccessService` filters `GET /api/videos` and the per-video
`/api/videos/:videoId` family by:

- The user's project memberships (videos assigned to those
  projects are visible).
- Direct `assignedUserId` pins (videos assigned to the user
  individually).
- The system admin role (sees everything).

A video that exists but is not assigned to a project the user can
read responds 404, not 403, matching the rest of the RBAC model.

## See also

- [Guides > Projects](projects.md)
- [Guides > Sharing](sharing.md)
- [Concepts > RBAC](../concepts/rbac.md)
