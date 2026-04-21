---
title: Video Assignments API
sidebar_position: 11
---

# Video Assignments API

Assign videos to projects manually or through automated rules. Manage assignment rules for automatic video-to-project mapping based on metadata conditions.

## List Project Videos

List all videos assigned to a project. Requires project membership or system_admin.

### Request

```
GET /api/projects/:projectId/videos
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Response

**Status:** 200 OK

```json
[
  {
    "id": "ff0e8400-e29b-41d4-a716-446655440070",
    "projectId": "990e8400-e29b-41d4-a716-446655440010",
    "videoId": "110e8400-e29b-41d4-a716-446655440080",
    "assignedUserId": null,
    "source": "manual",
    "ruleDefinition": null,
    "assignedBy": "660e8400-e29b-41d4-a716-446655440001",
    "assignedAt": "2026-02-23T10:00:00.000Z"
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Assignment record identifier |
| projectId | UUID | Project the video is assigned to |
| videoId | UUID | Assigned video identifier |
| assignedUserId | UUID or null | User the video is assigned to for annotation (optional) |
| source | string | `manual` or `rule` |
| ruleDefinition | object or null | Rule metadata when source is `rule` |
| assignedBy | string or null | User who created the assignment |
| assignedAt | datetime | When the assignment was created |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Assignments listed |
| 403 | Not a project member or system admin |
| 404 | Project not found |

---

## Assign Video to Project

Assign a single video to a project. Requires project_owner or project_manager role (or system_admin).

### Request

```
POST /api/projects/:projectId/videos
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "videoId": "110e8400-e29b-41d4-a716-446655440080",
  "assignedUserId": "880e8400-e29b-41d4-a716-446655440003"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| videoId | UUID | Yes | ID of the video to assign |
| assignedUserId | UUID | No | User to assign the video to for annotation |

### Response

**Status:** 201 Created

Returns the created assignment object.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Video assigned |
| 403 | Insufficient role |
| 404 | Project, video, or assigned user not found |

### Notes

The project-video pair has a unique constraint. Attempting to assign the same video twice returns an error.

---

## Unassign Video from Project

Remove a video assignment from a project. Requires project_owner or project_manager role (or system_admin).

### Request

```
DELETE /api/projects/:projectId/videos/:videoId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |
| videoId | UUID | Video identifier |

### Response

**Status:** 200 OK

```json
{
  "success": true
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Video unassigned |
| 403 | Insufficient role |
| 404 | Assignment not found |

---

## Bulk Assign Videos

Assign multiple videos to a project in a single operation. Requires system_admin. Videos already assigned to the project are skipped.

### Request

```
POST /api/admin/video-assignments/bulk
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "videoIds": [
    "110e8400-e29b-41d4-a716-446655440080",
    "220e8400-e29b-41d4-a716-446655440081",
    "330e8400-e29b-41d4-a716-446655440082"
  ],
  "projectId": "990e8400-e29b-41d4-a716-446655440010",
  "assignedUserId": "880e8400-e29b-41d4-a716-446655440003"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| videoIds | UUID[] | Yes | Array of video IDs (minimum 1) |
| projectId | UUID | Yes | Target project |
| assignedUserId | UUID | No | User to assign videos to |

### Response

**Status:** 200 OK

```json
{
  "created": 2
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| created | number | Number of new assignments created (excludes already-assigned videos) |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Bulk assignment completed |
| 400 | One or more videos not found |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Project not found |

---

## List Assignment Rules

List all video assignment rules. Requires system_admin.

### Request

```
GET /api/admin/video-assignments/rules
```

**Auth:** requireAdmin

### Response

**Status:** 200 OK

```json
[
  {
    "id": "440e8400-e29b-41d4-a716-446655440090",
    "name": "YouTube videos to research project",
    "description": "Auto-assign YouTube-sourced videos",
    "conditions": [
      {
        "field": "sourcePlatform",
        "operator": "equals",
        "value": "youtube"
      }
    ],
    "targetType": "project",
    "targetId": "990e8400-e29b-41d4-a716-446655440010",
    "isActive": true,
    "createdBy": "660e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z"
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Rules listed |
| 401 | Not authenticated |
| 403 | Not a system admin |

---

## Create Assignment Rule

Create a new video assignment rule. Requires system_admin.

### Request

```
POST /api/admin/video-assignments/rules
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "name": "YouTube videos to research project",
  "description": "Auto-assign YouTube-sourced videos",
  "conditions": [
    {
      "field": "sourcePlatform",
      "operator": "equals",
      "value": "youtube"
    }
  ],
  "targetType": "project",
  "targetId": "990e8400-e29b-41d4-a716-446655440010"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Rule name (minimum 1 character) |
| description | string | No | Rule description |
| conditions | array | Yes | Array of condition objects (minimum 1) |
| targetType | string | Yes | One of: `user`, `project`, `group` |
| targetId | UUID | Yes | ID of the target entity |

### Condition Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field | string | Yes | Metadata field name to match against |
| operator | string | Yes | One of: `equals`, `contains`, `startsWith`, `endsWith`, `regex` |
| value | string | Yes | Value to compare against |

### Response

**Status:** 201 Created

Returns the created rule object.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Rule created |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Not a system admin |

---

## Update Assignment Rule

Update an existing assignment rule. Requires system_admin.

### Request

```
PUT /api/admin/video-assignments/rules/:ruleId
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "name": "Updated rule name",
  "isActive": false
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| ruleId | UUID | Rule identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | New rule name |
| description | string or null | No | New description (null to clear) |
| conditions | array | No | New conditions array |
| targetType | string | No | New target type |
| targetId | UUID | No | New target ID |
| isActive | boolean | No | Active/inactive status |

### Response

**Status:** 200 OK

Returns the updated rule object.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Rule updated |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Rule not found |

---

## Delete Assignment Rule

Delete an assignment rule. Requires system_admin.

### Request

```
DELETE /api/admin/video-assignments/rules/:ruleId
```

**Auth:** requireAdmin

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| ruleId | UUID | Rule identifier |

### Response

**Status:** 200 OK

```json
{
  "success": true
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Rule deleted |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Rule not found |

---

## Evaluate Rule (Dry Run)

Evaluate a single rule against all videos without creating any assignments. Returns the count and IDs of matching videos.

### Request

```
POST /api/admin/video-assignments/rules/:ruleId/evaluate
```

**Auth:** requireAdmin

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| ruleId | UUID | Rule identifier |

### Response

**Status:** 200 OK

```json
{
  "ruleId": "440e8400-e29b-41d4-a716-446655440090",
  "matchingVideoCount": 15,
  "matchingVideoIds": [
    "110e8400-e29b-41d4-a716-446655440080",
    "220e8400-e29b-41d4-a716-446655440081"
  ]
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Evaluation completed |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Rule not found |

---

## Evaluate All Rules

Evaluate all active rules against all videos and create assignments for matches. Only rules with `targetType: "project"` create ProjectVideoAssignment records. Existing assignments are not duplicated.

### Request

```
POST /api/admin/video-assignments/rules/evaluate-all
```

**Auth:** requireAdmin

### Response

**Status:** 200 OK

```json
{
  "rulesEvaluated": 3,
  "assignmentsCreated": 27
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| rulesEvaluated | number | Number of active rules processed |
| assignmentsCreated | number | Number of new assignments created |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Evaluation completed |
| 401 | Not authenticated |
| 403 | Not a system admin |
