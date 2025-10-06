---
title: Personas API
---

# Personas API

Manage analyst personas with their roles and information needs. Each persona represents a different analytical perspective and has an associated ontology.

## List Personas

Retrieve all personas in the system.

### Request

```
GET /api/personas
```

### Response

**Status:** 200 OK

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Sports Scout",
    "role": "Professional Baseball Scout",
    "informationNeed": "Evaluate player performance and technique",
    "details": "Focus on batting mechanics and pitch recognition",
    "isSystemGenerated": false,
    "hidden": false,
    "createdAt": "2025-10-06T14:30:00.000Z",
    "updatedAt": "2025-10-06T14:30:00.000Z"
  }
]
```

### Example

```bash
curl http://localhost:3001/api/personas
```

## Create Persona

Create a new persona with an empty ontology.

### Request

```
POST /api/personas
```

**Content-Type:** application/json

```json
{
  "name": "Sports Scout",
  "role": "Professional Baseball Scout",
  "informationNeed": "Evaluate player performance and technique",
  "details": "Focus on batting mechanics and pitch recognition",
  "isSystemGenerated": false,
  "hidden": false
}
```

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name for the persona (min length: 1) |
| role | string | Yes | Professional role or perspective (min length: 1) |
| informationNeed | string | Yes | What the persona wants to learn (min length: 1) |
| details | string | No | Additional context or focus areas |
| isSystemGenerated | boolean | No | Whether created by system (default: false) |
| hidden | boolean | No | Whether hidden from UI (default: false) |

### Response

**Status:** 201 Created

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Sports Scout",
  "role": "Professional Baseball Scout",
  "informationNeed": "Evaluate player performance and technique",
  "details": "Focus on batting mechanics and pitch recognition",
  "isSystemGenerated": false,
  "hidden": false,
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T14:30:00.000Z"
}
```

### Example

```bash
curl -X POST http://localhost:3001/api/personas \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sports Scout",
    "role": "Professional Baseball Scout",
    "informationNeed": "Evaluate player performance and technique"
  }'
```

## Get Persona

Retrieve a specific persona by ID.

### Request

```
GET /api/personas/:id
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Persona identifier |

### Response

**Status:** 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Sports Scout",
  "role": "Professional Baseball Scout",
  "informationNeed": "Evaluate player performance and technique",
  "details": "Focus on batting mechanics and pitch recognition",
  "isSystemGenerated": false,
  "hidden": false,
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T14:30:00.000Z"
}
```

**Status:** 404 Not Found

```json
{
  "error": "Persona not found"
}
```

### Example

```bash
curl http://localhost:3001/api/personas/550e8400-e29b-41d4-a716-446655440000
```

## Update Persona

Update fields of an existing persona. All fields are optional for partial updates.

### Request

```
PUT /api/personas/:id
```

**Content-Type:** application/json

```json
{
  "name": "Senior Sports Scout",
  "details": "Added focus on defensive positioning"
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Persona identifier |

### Request Body Schema

All fields are optional. Only provided fields will be updated.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Display name (min length: 1) |
| role | string | Professional role (min length: 1) |
| informationNeed | string | Information need (min length: 1) |
| details | string | Additional context |
| isSystemGenerated | boolean | System-generated flag |
| hidden | boolean | Hidden from UI flag |

### Response

**Status:** 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Senior Sports Scout",
  "role": "Professional Baseball Scout",
  "informationNeed": "Evaluate player performance and technique",
  "details": "Added focus on defensive positioning",
  "isSystemGenerated": false,
  "hidden": false,
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T16:45:00.000Z"
}
```

**Status:** 404 Not Found

```json
{
  "error": "Persona not found"
}
```

### Example

```bash
curl -X PUT http://localhost:3001/api/personas/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Senior Sports Scout"
  }'
```

## Delete Persona

Delete a persona and its associated ontology. This operation cascades to remove the ontology but does not affect world state data.

### Request

```
DELETE /api/personas/:id
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Persona identifier |

### Response

**Status:** 200 OK

```json
{
  "message": "Persona deleted successfully"
}
```

**Status:** 404 Not Found

```json
{
  "error": "Persona not found"
}
```

### Example

```bash
curl -X DELETE http://localhost:3001/api/personas/550e8400-e29b-41d4-a716-446655440000
```

## Notes

- Creating a persona automatically creates an empty ontology with empty arrays for entity types, event types, role types, and relation types.
- Deleting a persona cascades to delete the ontology via database foreign key constraint.
- Personas are returned sorted by creation date (most recent first).
- The `isSystemGenerated` field is intended for personas created automatically by AI processes.
- The `hidden` field allows personas to be hidden from the UI without deletion.
