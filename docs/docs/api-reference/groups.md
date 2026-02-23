---
title: Groups API
sidebar_position: 8
---

# Groups API

Create and manage user groups and group memberships. Groups organize users into teams that can own projects and receive shared resources.

## Create Group

Create a new group. The authenticated user becomes the group_owner automatically.

### Request

```
POST /api/groups
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "name": "Research Team",
  "description": "Video analysis research group",
  "slug": "research-team"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Group display name (minimum 1 character) |
| description | string | No | Group description |
| slug | string | Yes | URL-friendly identifier (lowercase alphanumeric and hyphens, pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`) |

### Response

**Status:** 201 Created

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Research Team",
  "description": "Video analysis research group",
  "slug": "research-team",
  "createdBy": "660e8400-e29b-41d4-a716-446655440001",
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z",
  "members": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "userId": "660e8400-e29b-41d4-a716-446655440001",
      "groupId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "group_owner",
      "joinedAt": "2026-02-23T10:00:00.000Z",
      "user": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "username": "jdoe",
        "displayName": "Jane Doe",
        "email": "jdoe@example.com"
      }
    }
  ]
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Group created |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 409 | Slug already exists |

---

## List Groups

List all groups the authenticated user belongs to.

### Request

```
GET /api/groups
```

**Auth:** requireAuth

### Response

**Status:** 200 OK

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Team",
    "description": "Video analysis research group",
    "slug": "research-team",
    "createdBy": "660e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z",
    "memberCount": 5,
    "userRole": "group_owner"
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| memberCount | number | Total number of members in the group |
| userRole | string | The authenticated user's role in the group |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Groups listed |
| 401 | Not authenticated |

---

## Get Group

Get details for a single group, including the full member list.

### Request

```
GET /api/groups/:groupId
```

**Auth:** requireAuth

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Response

**Status:** 200 OK

Returns the group object with a `members` array. Each member includes the associated user's id, username, displayName, and email.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Group returned |
| 401 | Not authenticated |
| 403 | Not a member of the group |
| 404 | Group not found |

---

## Update Group

Update a group's name or description. Requires group_admin or group_owner role.

### Request

```
PUT /api/groups/:groupId
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "name": "Updated Team Name",
  "description": "Updated description"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | New group name (minimum 1 character) |
| description | string | No | New description |

### Response

**Status:** 200 OK

Returns the updated group object with members.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Group updated |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Insufficient role (requires group_admin or group_owner) |
| 404 | Group not found |

---

## Delete Group

Delete a group and cascade-delete all memberships. Requires group_owner role or system_admin.

### Request

```
DELETE /api/groups/:groupId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

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
| 200 | Group deleted |
| 401 | Not authenticated |
| 403 | Not the group owner or system admin |
| 404 | Group not found |

---

## Add Member

Add a user to a group. Requires group_admin or group_owner role.

### Request

```
POST /api/groups/:groupId/members
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "userId": "880e8400-e29b-41d4-a716-446655440003",
  "role": "group_member"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | UUID | Yes | ID of the user to add |
| role | string | Yes | One of: `group_admin`, `group_member` |

### Response

**Status:** 201 Created

Returns the created membership object with user details.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Member added |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Insufficient role |
| 404 | Group or user not found |
| 409 | User is already a member |

---

## List Members

List all members of a group. Requires group membership.

### Request

```
GET /api/groups/:groupId/members
```

**Auth:** requireAuth

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Response

**Status:** 200 OK

```json
[
  {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "userId": "660e8400-e29b-41d4-a716-446655440001",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "role": "group_owner",
    "joinedAt": "2026-02-23T10:00:00.000Z",
    "user": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "username": "jdoe",
      "displayName": "Jane Doe",
      "email": "jdoe@example.com"
    }
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Members listed |
| 401 | Not authenticated |
| 403 | Not a member of the group |
| 404 | Group not found |

---

## Change Member Role

Change a member's role within a group. Requires group_admin or group_owner role. Cannot change the role of a group_owner.

### Request

```
PUT /api/groups/:groupId/members/:userId
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "role": "group_admin"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |
| userId | UUID | ID of the member to update |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | One of: `group_admin`, `group_member` |

### Response

**Status:** 200 OK

Returns the updated membership object with user details.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Role updated |
| 400 | Invalid role |
| 401 | Not authenticated |
| 403 | Insufficient role, or target is a group_owner |
| 404 | Membership not found |

---

## Remove Member

Remove a member from a group. Requires group_admin or group_owner role, unless the member is removing themselves. Cannot remove the last group_owner.

### Request

```
DELETE /api/groups/:groupId/members/:userId
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |
| userId | UUID | ID of the member to remove |

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
| 200 | Member removed |
| 400 | Cannot remove last group_owner |
| 401 | Not authenticated |
| 403 | Insufficient role |
| 404 | Membership not found |

---

## Admin: List All Groups

List all groups in the system. Requires system_admin role.

### Request

```
GET /api/admin/groups
```

**Auth:** requireAdmin

### Response

**Status:** 200 OK

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Team",
    "description": "Video analysis research group",
    "slug": "research-team",
    "createdBy": "660e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2026-02-23T10:00:00.000Z",
    "updatedAt": "2026-02-23T10:00:00.000Z",
    "_count": {
      "members": 5
    }
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Groups listed |
| 401 | Not authenticated |
| 403 | Not a system admin |

---

## Admin: Create Group

Create a group on behalf of any user. The specified user becomes the group_owner. Requires system_admin role.

### Request

```
POST /api/admin/groups
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "name": "New Team",
  "description": "Created by admin",
  "slug": "new-team",
  "createdBy": "660e8400-e29b-41d4-a716-446655440001"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Group name |
| description | string | No | Group description |
| slug | string | Yes | URL-friendly identifier |
| createdBy | UUID | Yes | User ID who becomes the group_owner |

### Response

**Status:** 201 Created

Returns the created group with members.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Group created |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Creator user not found |
| 409 | Slug already exists |

---

## Admin: Update Group

Update any group. Requires system_admin role.

### Request

```
PUT /api/admin/groups/:groupId
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "name": "Updated Name"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | New group name |
| description | string | No | New description |

### Response

**Status:** 200 OK

Returns the updated group with members.

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Group updated |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Group not found |

---

## Admin: Delete Group

Delete any group. Requires system_admin role.

### Request

```
DELETE /api/admin/groups/:groupId
```

**Auth:** requireAdmin

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

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
| 200 | Group deleted |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Group not found |

---

## Admin: Add Member to Group

Add any user to any group with any role, including group_owner. Requires system_admin role.

### Request

```
POST /api/admin/groups/:groupId/members
```

**Auth:** requireAdmin

**Content-Type:** application/json

```json
{
  "userId": "880e8400-e29b-41d4-a716-446655440003",
  "role": "group_owner"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| groupId | UUID | Group identifier |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | UUID | Yes | ID of the user to add |
| role | string | Yes | One of: `group_owner`, `group_admin`, `group_member` |

### Response

**Status:** 201 Created

Returns the created membership object with user details.

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Member added |
| 400 | Invalid request body |
| 401 | Not authenticated |
| 403 | Not a system admin |
| 404 | Group or user not found |
| 409 | User is already a member |
