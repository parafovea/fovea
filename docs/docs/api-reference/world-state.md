---
title: World State API
sidebar_position: 8
keywords: [world state, entities, events, times, collections, relations, api]
---

# World State API

The World State API provides endpoints for managing shared world objects (entities, events, times, collections, and relations) that are scoped to individual users but shared across all of their personas.

## Overview

World State represents the analyst's mental model of real-world objects and their relationships. Unlike ontology types (which are persona-specific interpretations), world state contains the actual instances of entities, events, and temporal objects that exist independently of how different personas choose to categorize them.

### Key Concepts

- **User-Scoped**: Each user has their own world state, isolated from other users
- **Persona-Shared**: All personas belonging to a user share the same world state
- **Persistent**: World state is stored in PostgreSQL and survives across sessions
- **JSON Storage**: Objects stored as JSONB for flexibility and query performance

### Data Structure

```typescript
interface WorldState {
  id: string                     // UUID
  userId: string                 // Owner UUID
  entities: Entity[]             // Real-world objects
  events: Event[]                // Real-world occurrences
  times: Time[]                  // Temporal objects
  entityCollections: EntityCollection[]  // Grouped entities
  eventCollections: EventCollection[]    // Grouped events
  timeCollections: TimeCollection[]      // Temporal patterns
  relations: Relation[]          // Inter-object relationships
  createdAt: string             // ISO 8601 timestamp
  updatedAt: string             // ISO 8601 timestamp
}
```

## Base URL

```
http://localhost:3001/api/world
```

## Authentication

All endpoints use optional authentication in single-user mode and require authentication in multi-user mode.

**Headers:**
```
Cookie: session_token=<session-token>
```

**Single-User Mode:**
- No authentication required
- Uses default user automatically

**Multi-User Mode:**
- Session cookie required
- Returns 401 if not authenticated

## Endpoints

### Get World State

Retrieve the current user's world state. Creates an empty world state if one doesn't exist.

**Endpoint:**
```http
GET /api/world
```

**Response 200 (Success):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "987fcdeb-51a2-43c7-9876-543210fedcba",
  "entities": [
    {
      "id": "ent-001",
      "name": "John Doe",
      "description": "Individual observed in video",
      "wikidataId": "Q5",
      "attributes": {},
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "events": [
    {
      "id": "evt-001",
      "name": "Meeting",
      "description": "Conference room discussion",
      "startTime": "time-001",
      "endTime": "time-002",
      "location": "loc-001",
      "participants": ["ent-001", "ent-002"],
      "createdAt": "2025-01-15T10:35:00Z"
    }
  ],
  "times": [
    {
      "id": "time-001",
      "type": "instant",
      "value": "2025-01-15T14:00:00Z",
      "frame": 4200,
      "vagueness": "precise"
    }
  ],
  "entityCollections": [
    {
      "id": "col-001",
      "name": "Conference Attendees",
      "entityIds": ["ent-001", "ent-002", "ent-003"],
      "semanticRelation": "group"
    }
  ],
  "eventCollections": [],
  "timeCollections": [],
  "relations": [
    {
      "id": "rel-001",
      "sourceId": "ent-001",
      "targetId": "ent-002",
      "relationType": "knows",
      "confidence": 0.8
    }
  ],
  "createdAt": "2025-01-10T08:00:00Z",
  "updatedAt": "2025-01-15T10:35:00Z"
}
```

**Response 401 (Unauthorized):**
```json
{
  "error": "Authentication required"
}
```

**Response 500 (Server Error):**
```json
{
  "error": "Default user not found in single-user mode"
}
```

### Update World State

Update the current user's world state with new or modified objects. All fields are optional - only provided fields will be updated.

**Endpoint:**
```http
PUT /api/world
```

**Request Body:**
```json
{
  "entities": [
    {
      "id": "ent-002",
      "name": "Jane Smith",
      "description": "Second participant",
      "attributes": {
        "role": "presenter"
      }
    }
  ],
  "events": [
    {
      "id": "evt-002",
      "name": "Q&A Session",
      "startTime": "time-003",
      "participants": ["ent-001", "ent-002"]
    }
  ]
}
```

**Response 200 (Success):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "987fcdeb-51a2-43c7-9876-543210fedcba",
  "entities": [
    {
      "id": "ent-001",
      "name": "John Doe",
      "description": "Individual observed in video"
    },
    {
      "id": "ent-002",
      "name": "Jane Smith",
      "description": "Second participant",
      "attributes": {
        "role": "presenter"
      }
    }
  ],
  "events": [
    {
      "id": "evt-001",
      "name": "Meeting",
      "description": "Conference room discussion"
    },
    {
      "id": "evt-002",
      "name": "Q&A Session",
      "startTime": "time-003",
      "participants": ["ent-001", "ent-002"]
    }
  ],
  "times": [],
  "entityCollections": [],
  "eventCollections": [],
  "timeCollections": [],
  "relations": [],
  "createdAt": "2025-01-10T08:00:00Z",
  "updatedAt": "2025-01-15T11:20:00Z"
}
```

**Update Behavior:**
- **Upsert**: Creates world state if it doesn't exist, updates if it does
- **Partial Update**: Only provided fields are modified, others remain unchanged
- **Array Replacement**: Entire arrays are replaced, not merged

**Example: Add single entity without affecting events:**
```json
{
  "entities": [
    {"id": "ent-003", "name": "New Person"}
  ]
}
```

### Clear World State (Admin Only)

Clear all world state data for a specific user. Useful for user support, demo accounts, or troubleshooting.

**Endpoint:**
```http
DELETE /api/admin/world/:userId
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | UUID | ID of user whose world state should be cleared |

**Response 200 (Success):**
```json
{
  "message": "World state cleared successfully",
  "userId": "987fcdeb-51a2-43c7-9876-543210fedcba"
}
```

**Response 404 (Not Found):**
```json
{
  "error": "User not found"
}
```

**Response 500 (Server Error):**
```json
{
  "error": "Database error message"
}
```

**Use Cases:**
- Reset corrupted or problematic world state
- User requests fresh start without account deletion
- Periodic cleanup of training/demo accounts
- Privacy compliance (clear annotation data while preserving account)
- Admin troubleshooting

## Object Schemas

### Entity

Real-world objects observed in videos (people, vehicles, animals, objects).

```typescript
interface Entity {
  id: string                // Unique identifier
  name: string              // Human-readable name
  description?: string      // Optional description
  wikidataId?: string       // Wikidata entity ID (e.g., "Q5" for human)
  attributes?: Record<string, any>  // Custom attributes
  createdAt?: string        // Creation timestamp
  updatedAt?: string        // Last update timestamp
}
```

**Example:**
```json
{
  "id": "ent-vehicle-001",
  "name": "Blue Sedan",
  "description": "Toyota Camry observed at intersection",
  "wikidataId": "Q1420",
  "attributes": {
    "color": "blue",
    "make": "Toyota",
    "model": "Camry",
    "licensePlate": "ABC-1234"
  }
}
```

### Event

Real-world occurrences with temporal and spatial dimensions.

```typescript
interface Event {
  id: string                // Unique identifier
  name: string              // Human-readable name
  description?: string      // Optional description
  startTime?: string        // Time object ID
  endTime?: string          // Time object ID
  location?: string         // Location object ID
  participants?: string[]   // Entity IDs
  attributes?: Record<string, any>  // Custom attributes
  wikidataId?: string       // Wikidata event type
  createdAt?: string        // Creation timestamp
  updatedAt?: string        // Last update timestamp
}
```

**Example:**
```json
{
  "id": "evt-handshake-001",
  "name": "Handshake",
  "description": "Two individuals greeting each other",
  "startTime": "time-instant-001",
  "endTime": "time-instant-002",
  "location": "loc-parking-lot",
  "participants": ["ent-person-001", "ent-person-002"],
  "wikidataId": "Q862086"
}
```

### Time

Temporal objects representing instants, intervals, or vague time periods.

```typescript
interface Time {
  id: string                // Unique identifier
  type: 'instant' | 'interval' | 'vague'  // Time type
  value?: string            // ISO 8601 timestamp (for instants)
  start?: string            // ISO 8601 timestamp (for intervals)
  end?: string              // ISO 8601 timestamp (for intervals)
  frame?: number            // Video frame number
  vagueness?: 'precise' | 'approximate' | 'before' | 'after' | 'between'
  description?: string      // Human description ("early morning", "around noon")
}
```

**Examples:**
```json
{
  "id": "time-001",
  "type": "instant",
  "value": "2025-01-15T14:30:00Z",
  "frame": 5400,
  "vagueness": "precise"
}
```

```json
{
  "id": "time-002",
  "type": "interval",
  "start": "2025-01-15T14:00:00Z",
  "end": "2025-01-15T15:30:00Z",
  "vagueness": "approximate",
  "description": "Afternoon meeting"
}
```

### EntityCollection

Grouped entities with semantic relationships.

```typescript
interface EntityCollection {
  id: string                // Unique identifier
  name: string              // Collection name
  description?: string      // Optional description
  entityIds: string[]       // Array of entity IDs
  semanticRelation?: string // Relationship type ("group", "set", "sequence")
  attributes?: Record<string, any>
}
```

**Example:**
```json
{
  "id": "col-suspects",
  "name": "Suspects",
  "description": "Individuals present at scene",
  "entityIds": ["ent-001", "ent-002", "ent-003"],
  "semanticRelation": "group",
  "attributes": {
    "confidence": 0.7
  }
}
```

### EventCollection

Grouped events (event sequences, processes, campaigns).

```typescript
interface EventCollection {
  id: string                // Unique identifier
  name: string              // Collection name
  description?: string      // Optional description
  eventIds: string[]        // Array of event IDs
  semanticRelation?: string // Relationship type ("sequence", "set", "process")
  attributes?: Record<string, any>
}
```

### TimeCollection

Temporal patterns (recurring times, schedules, temporal sequences).

```typescript
interface TimeCollection {
  id: string                // Unique identifier
  name: string              // Collection name
  description?: string      // Optional description
  timeIds: string[]         // Array of time object IDs
  pattern?: string          // Pattern description
  attributes?: Record<string, any>
}
```

### Relation

Relationships between entities or events.

```typescript
interface Relation {
  id: string                // Unique identifier
  sourceId: string          // Source object ID
  targetId: string          // Target object ID
  relationType: string      // Relationship type
  confidence?: number       // Confidence score (0-1)
  attributes?: Record<string, any>
  bidirectional?: boolean   // Whether relation applies both ways
}
```

**Example:**
```json
{
  "id": "rel-001",
  "sourceId": "ent-person-001",
  "targetId": "ent-vehicle-001",
  "relationType": "drives",
  "confidence": 0.9,
  "attributes": {
    "observedAt": "frame-1200"
  },
  "bidirectional": false
}
```

## Usage Examples

### Initialize World State

Create initial entities and events:

```javascript
const response = await fetch('/api/world', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    entities: [
      { id: 'ent-001', name: 'Person A' },
      { id: 'ent-002', name: 'Person B' }
    ],
    events: [
      {
        id: 'evt-001',
        name: 'Meeting',
        participants: ['ent-001', 'ent-002']
      }
    ]
  })
})

const worldState = await response.json()
console.log(`Created world state with ${worldState.entities.length} entities`)
```

### Add New Entity

Add entity without affecting existing data:

```javascript
// First, get current state
const current = await fetch('/api/world').then(r => r.json())

// Add new entity to existing array
const updatedEntities = [
  ...current.entities,
  { id: 'ent-003', name: 'Person C' }
]

// Update state
await fetch('/api/world', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ entities: updatedEntities })
})
```

### Create Entity Collection

Group related entities:

```javascript
const worldState = await fetch('/api/world').then(r => r.json())

const collection = {
  id: 'col-001',
  name: 'Surveillance Subjects',
  entityIds: ['ent-001', 'ent-002', 'ent-003'],
  semanticRelation: 'group'
}

await fetch('/api/world', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    entityCollections: [...worldState.entityCollections, collection]
  })
})
```

### Add Relation

Create relationship between entities:

```javascript
const worldState = await fetch('/api/world').then(r => r.json())

const relation = {
  id: 'rel-001',
  sourceId: 'ent-001',
  targetId: 'ent-002',
  relationType: 'knows',
  confidence: 0.8
}

await fetch('/api/world', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    relations: [...worldState.relations, relation]
  })
})
```

## Frontend Integration

### Redux Store

World state is managed by `worldSlice` in the Redux store:

```typescript
// annotation-tool/src/store/worldSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

export const fetchWorldState = createAsyncThunk(
  'world/fetch',
  async () => {
    const response = await fetch('/api/world')
    return response.json()
  }
)

export const updateWorldState = createAsyncThunk(
  'world/update',
  async (worldState: Partial<WorldState>) => {
    const response = await fetch('/api/world', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(worldState)
    })
    return response.json()
  }
)
```

### React Components

World state UI components:

- `EntityEditor.tsx` - Create/edit entities
- `EventEditor.tsx` - Create/edit events
- `TimeEditor.tsx` - Create/edit temporal objects
- `CollectionBuilder.tsx` - Group entities/events
- `ObjectWorkspace.tsx` - Main world objects workspace

## Best Practices

### ID Generation

Use consistent ID prefixes:
- Entities: `ent-{uuid}` or `ent-{descriptor}-{counter}`
- Events: `evt-{uuid}` or `evt-{descriptor}-{counter}`
- Times: `time-{uuid}` or `time-instant-{counter}`
- Collections: `col-{uuid}` or `col-{descriptor}-{counter}`
- Relations: `rel-{uuid}`

### Partial Updates

Always fetch current state before updating to avoid overwriting data:

```javascript
const current = await fetch('/api/world').then(r => r.json())
const updated = { ...current, entities: [...current.entities, newEntity] }
await fetch('/api/world', { method: 'PUT', body: JSON.stringify(updated) })
```

### Validation

Validate object structure before sending:
- Ensure required fields are present
- Check ID uniqueness
- Verify referenced IDs exist (e.g., event participants should be valid entity IDs)

### Performance

- Minimize update frequency (batch changes when possible)
- Use selective updates (only send changed arrays)
- Consider pagination for large datasets (implement client-side)

## See Also

- [Data Model Reference](../reference/data-model.md) - Detailed object schemas
- [Annotation Model](../concepts/annotation-model.md) - Types vs instances
- [Personas](../concepts/personas.md) - Persona-specific interpretations
- [Export/Import API](./export-import.md) - Backup and restore
- [Frontend Store](./frontend/store/worldSlice) - Redux integration
