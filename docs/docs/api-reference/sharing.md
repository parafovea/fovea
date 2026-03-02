---
title: Sharing API
sidebar_position: 10
---

# Sharing API

Share resources between users and groups. Supports read-only and forkable permission levels with optional expiration.

## Share Resource

Share a resource with a user or group. Exactly one of `sharedWithUserId` or `sharedWithGroupId` must be provided.

### Request

```
POST /api/sharing
```

**Auth:** requireAuth, buildAbilities

**Content-Type:** application/json

```json
{
  "resourceType": "persona",
  "resourceId": "bb0e8400-e29b-41d4-a716-446655440030",
  "sharedWithUserId": "880e8400-e29b-41d4-a716-446655440003",
  "permissionLevel": "forkable"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resourceType | string | Yes | One of: `annotation`, `summary`, `claim`, `persona`, `world_state` |
| resourceId | string | Yes | UUID of the resource to share |
| sharedWithUserId | UUID | Conditional | ID of the recipient user (mutually exclusive with sharedWithGroupId) |
| sharedWithGroupId | UUID | Conditional | ID of the recipient group (mutually exclusive with sharedWithUserId) |
| permissionLevel | string | No | `read_only` (default) or `forkable` |

### Response

**Status:** 201 Created

```json
{
  "id": "dd0e8400-e29b-41d4-a716-446655440050",
  "resourceType": "persona",
  "resourceId": "bb0e8400-e29b-41d4-a716-446655440030",
  "sharedByUserId": "660e8400-e29b-41d4-a716-446655440001",
  "sharedWithUserId": "880e8400-e29b-41d4-a716-446655440003",
  "sharedWithGroupId": null,
  "permissionLevel": "forkable",
  "expiresAt": null,
  "createdAt": "2026-02-23T10:00:00.000Z"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Share created |
| 400 | Invalid body, or both/neither target specified |
| 403 | No permission to share this resource |
| 404 | Resource, user, or group not found |

### Permission Requirements

The caller must own the resource, or hold a forkable share on it (which grants permission to re-share).

---

## List Received Shares

List resources shared with the current user, either directly or through group membership. Expired shares are excluded.

### Request

```
GET /api/sharing/received
```

**Auth:** requireAuth

### Response

**Status:** 200 OK

```json
[
  {
    "id": "dd0e8400-e29b-41d4-a716-446655440050",
    "resourceType": "persona",
    "resourceId": "bb0e8400-e29b-41d4-a716-446655440030",
    "sharedByUserId": "660e8400-e29b-41d4-a716-446655440001",
    "sharedByUser": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "username": "jdoe",
      "displayName": "Jane Doe"
    },
    "sharedWithUserId": "880e8400-e29b-41d4-a716-446655440003",
    "sharedWithGroupId": null,
    "permissionLevel": "forkable",
    "expiresAt": null,
    "createdAt": "2026-02-23T10:00:00.000Z"
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Shares listed |
| 401 | Not authenticated |

---

## List Sent Shares

List resources shared by the current user.

### Request

```
GET /api/sharing/sent
```

**Auth:** requireAuth

### Response

**Status:** 200 OK

```json
[
  {
    "id": "dd0e8400-e29b-41d4-a716-446655440050",
    "resourceType": "persona",
    "resourceId": "bb0e8400-e29b-41d4-a716-446655440030",
    "sharedByUserId": "660e8400-e29b-41d4-a716-446655440001",
    "sharedWithUserId": "880e8400-e29b-41d4-a716-446655440003",
    "sharedWithUser": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "username": "asmith",
      "displayName": "Alice Smith"
    },
    "sharedWithGroupId": null,
    "sharedWithGroup": null,
    "permissionLevel": "forkable",
    "expiresAt": null,
    "createdAt": "2026-02-23T10:00:00.000Z"
  }
]
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Shares listed |
| 401 | Not authenticated |

---

## Revoke Share

Delete a share, removing the recipient's access. Only the original sharer or a system_admin can revoke a share.

### Request

```
DELETE /api/sharing/:shareId
```

**Auth:** requireAuth

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| shareId | UUID | Share identifier |

### Response

**Status:** 200 OK

```json
{
  "message": "Share revoked successfully"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Share revoked |
| 403 | Not the original sharer or system admin |
| 404 | Share not found |

---

## Fork Shared Resource

Create an independent copy of a shared resource in the current user's workspace. The share must have `permissionLevel: "forkable"` and must not be expired.

### Request

```
POST /api/sharing/:shareId/fork
```

**Auth:** requireAuth, buildAbilities

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| shareId | UUID | Share identifier |

### Response

**Status:** 201 Created

```json
{
  "resourceType": "persona",
  "resourceId": "ee0e8400-e29b-41d4-a716-446655440060",
  "resource": {
    "id": "ee0e8400-e29b-41d4-a716-446655440060",
    "name": "Sports Scout",
    "role": "Analyst",
    "informationNeed": "Player performance evaluation"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| resourceType | string | Type of the forked resource |
| resourceId | string | UUID of the newly created copy |
| resource | object | The full forked resource object |

### Forking Behavior by Resource Type

| Resource Type | What Gets Copied |
|---------------|------------------|
| annotation | Full annotation including bounding box sequence data |
| summary | Full summary including visual analysis, transcript, and key frames |
| claim | Full claim including gloss, text spans, claimer, and modality metadata |
| persona | Persona and its associated ontology (entity types, event types, role types, relation types) |
| world_state | Full world state including entities, events, times, collections, and relations |

### Status Codes

| Code | Description |
|------|-------------|
| 201 | Resource forked |
| 400 | Resource type cannot be forked |
| 403 | Share is not forkable, has expired, or user is not a recipient |
| 404 | Share or source resource not found |
