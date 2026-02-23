---
title: Projects API
sidebar_position: 9
---

# Projects API

Create and manage projects, project memberships, project-scoped personas, and project-scoped world state.

## Create Project

Create a new project. The authenticated user becomes the project_owner automatically.

### Request

```
POST /api/projects
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "name": "Baseball Analysis",
  "description": "Spring training video annotation project",
  "slug": "baseball-analysis",
  "ownerGroupId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Project name (minimum 1 character) |
| description | string | No | Project description |
| slug | string | Yes | URL-friendly identifier (pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`) |
| ownerGroupId | UUID | No | Group to own this project. Omit for a personal project. Requires group_admin or group_owner role in the group. |

### Response

**Status:** 201 Created

```json
{
  "id": "990e8400-e29b-41d4-a716-446655440010",
  "name": "Baseball Analysis",
  "description": "Spring training video annotation project",
  "slug": "baseball-analysis",
  "ownerUserId": null,
  "ownerGroupId": "550e8400-e29b-41d4-a716-446655440000",
  "settings": {},
  "isArchived": false,
  "createdBy": "660e8400-e29b-41d4-a716-446655440001",
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Project created |
| 400 | Invalid request body |
| 403 | Not authorized to create project for the specified group |
| 409 | Slug already exists |

---

## List Projects

List projects accessible to the authenticated user. Includes personal projects, group-owned projects (where the user belongs to the owning group), and projects with direct membership.

### Request

```
GET /api/projects?scope=all
```

**Auth:** requireAuth

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| scope | string | `all` | Filter: `personal` (user-owned), `group` (group-owned), or `all` |

### Response

**Status:** 200 OK

```json
[
  {
    "id": "990e8400-e29b-41d4-a716-446655440010",
    "name": "Baseball Analysis",
    "description": "Spring training video annotation project",
    "slug": "baseball-analysis",
    "ownerUserId": null,
    "ownerGroupId": "550e8400-e29b-41d4-a716-446655440000",
    "settings": {},
    "isArchived": false,
    "createdBy": "660e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z",
    "_count": {
      "members": 3
    },
    "myRole": "project_owner"
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| _count.members | number | Total member count |
| myRole | string or null | The authenticated user's role in the project, or null if no direct membership |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Projects listed |
| 401 | Not authenticated |

---

## Get Project

Get project details including member list and video assignment count.

### Request

```
GET /api/projects/:projectId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Response

**Status:** 200 OK

```json
{
  "id": "990e8400-e29b-41d4-a716-446655440010",
  "name": "Baseball Analysis",
  "description": "Spring training video annotation project",
  "slug": "baseball-analysis",
  "ownerUserId": null,
  "ownerGroupId": "550e8400-e29b-41d4-a716-446655440000",
  "settings": {},
  "isArchived": false,
  "createdBy": "660e8400-e29b-41d4-a716-446655440001",
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z",
  "members": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440020",
      "userId": "660e8400-e29b-41d4-a716-446655440001",
      "projectId": "990e8400-e29b-41d4-a716-446655440010",
      "role": "project_owner",
      "joinedAt": "2026-02-23T10:00:00.000Z",
      "user": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "username": "jdoe",
        "displayName": "Jane Doe",
        "email": "jdoe@example.com"
      }
    }
  ],
  "videoAssignmentCount": 12
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Project returned |
| 403 | Not a project member or system admin |
| 404 | Project not found |

---

## Update Project

Update project details. Requires project_owner or project_manager role.

### Request

```
PUT /api/projects/:projectId
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "name": "Updated Project Name",
  "description": "Updated description",
  "settings": { "theme": "dark" },
  "isArchived": false
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | New project name |
| description | string | No | New description |
| settings | object | No | JSON settings object |
| isArchived | boolean | No | Archive flag |

### Response

**Status:** 200 OK

Returns the updated project object.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Project updated |
| 403 | Insufficient role (requires project_owner or project_manager) |
| 404 | Project not found |

---

## Delete Project

Delete a project. Cascade-deletes memberships and video assignments. Requires project_owner role or system_admin.

### Request

```
DELETE /api/projects/:projectId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Response

**Status:** 200 OK

```json
{
  "message": "Project deleted successfully"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Project deleted |
| 403 | Not the project owner or system admin |
| 404 | Project not found |

---

## Add Project Member

Add a user to the project. Requires project_owner or project_manager role.

### Request

```
POST /api/projects/:projectId/members
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "userId": "880e8400-e29b-41d4-a716-446655440003",
  "role": "annotator"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | UUID | Yes | ID of the user to add |
| role | string | Yes | One of: `project_manager`, `annotator`, `reviewer`, `viewer` |

### Response

**Status:** 201 Created

Returns the created membership object with user details.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Member added |
| 400 | Invalid role |
| 403 | Insufficient role |
| 404 | Project or user not found |
| 409 | User is already a member |

---

## List Project Members

List all members of a project. Requires project membership or system_admin.

### Request

```
GET /api/projects/:projectId/members
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Response

**Status:** 200 OK

Returns an array of membership objects, each including the associated user's id, username, displayName, and email.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Members listed |
| 403 | Not a project member or system admin |
| 404 | Project not found |

---

## Change Member Role

Change a project member's role. Requires project_owner or project_manager role. You cannot change your own role.

### Request

```
PUT /api/projects/:projectId/members/:userId
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "role": "reviewer"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |
| userId | UUID | ID of the member to update |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | One of: `project_manager`, `annotator`, `reviewer`, `viewer` |

### Response

**Status:** 200 OK

Returns the updated membership object.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Role updated |
| 400 | Invalid role, or attempting to change own role |
| 403 | Insufficient role |
| 404 | Membership not found |

---

## Remove Member

Remove a member from the project, or leave the project if removing yourself. Requires project_owner or project_manager role (unless removing self). Cannot remove the last project_owner.

### Request

```
DELETE /api/projects/:projectId/members/:userId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |
| userId | UUID | ID of the member to remove |

### Response

**Status:** 200 OK

```json
{
  "message": "Member removed successfully"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Member removed |
| 400 | Cannot remove last project_owner |
| 403 | Insufficient role |
| 404 | Membership not found |

---

## List Project Personas

List personas scoped to a project. Requires project membership or system_admin.

### Request

```
GET /api/projects/:projectId/personas
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
    "id": "bb0e8400-e29b-41d4-a716-446655440030",
    "name": "Sports Scout",
    "role": "Analyst",
    "informationNeed": "Player performance evaluation",
    "details": null,
    "isSystemGenerated": false,
    "hidden": false,
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z"
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Personas listed |
| 403 | Not a project member or system admin |
| 404 | Project not found |

---

## Get Project World State

Get the world state for the current user within a project. Creates an empty world state if one does not exist.

### Request

```
GET /api/projects/:projectId/world
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Response

**Status:** 200 OK

```json
{
  "id": "cc0e8400-e29b-41d4-a716-446655440040",
  "userId": "660e8400-e29b-41d4-a716-446655440001",
  "projectId": "990e8400-e29b-41d4-a716-446655440010",
  "entities": [],
  "events": [],
  "times": [],
  "entityCollections": [],
  "eventCollections": [],
  "timeCollections": [],
  "relations": [],
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | World state returned |
| 403 | Not a project member or system admin |
| 404 | Project not found |

---

## Update Project World State

Update the world state for the current user within a project. Creates the world state if it does not exist. Only provided fields are updated.

### Request

```
PUT /api/projects/:projectId/world
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "entities": [{ "id": "ent-1", "name": "Player A" }],
  "events": []
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| projectId | UUID | Project identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| entities | array | No | Entity instances |
| events | array | No | Event instances |
| times | array | No | Time instances |
| entityCollections | array | No | Entity collections |
| eventCollections | array | No | Event collections |
| timeCollections | array | No | Time collections |
| relations | array | No | Relation instances |

### Response

**Status:** 200 OK

Returns the updated world state object.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | World state updated |
| 403 | Not a project member or system admin |
| 404 | Project not found |
