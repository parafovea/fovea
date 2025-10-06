---
title: Data Model
sidebar_position: 4
keywords: [data model, schema, Prisma, database, bounding box sequence]
---

# Data Model

FOVEA uses PostgreSQL with Prisma ORM for data persistence. This page documents the database schema and JSON structures.

## Introduction

The data model separates concerns into distinct tables:
- **Persona**: Analyst profiles with separate ontologies
- **Ontology**: Type definitions stored as JSON per persona
- **WorldState**: Shared instances (entities, events, times, locations)
- **Video**: Video metadata and file references
- **Annotation**: Bounding box sequences with keyframes and interpolation
- **ImportHistory**: Tracking of import operations

## Prisma Models

### Persona Model

Represents an analyst with a distinct analytical perspective.

```prisma
model Persona {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  ontologies  Ontology[]
  annotations Annotation[]

  @@map("personas")
}
```

**Fields**:
- `id`: UUID primary key
- `name`: Display name (e.g., "Sports Scout")
- `description`: Optional description of analytical perspective
- `createdAt`/`updatedAt`: Timestamp tracking
- `ontologies`: One-to-many relationship with Ontology
- `annotations`: One-to-many relationship with Annotation

**Example**:
```json
{
  "id": "persona-1",
  "name": "Baseball Scout",
  "description": "Player performance analysis",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

### Ontology Model

Stores type definitions as JSON for each persona.

```prisma
model Ontology {
  id         String   @id @default(uuid())
  personaId  String
  persona    Persona  @relation(fields: [personaId], references: [id])
  data       Json
  version    Int      @default(1)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("ontologies")
}
```

**Fields**:
- `id`: UUID primary key
- `personaId`: Foreign key to Persona
- `data`: JSON containing EntityType[], EventType[], RoleType[], RelationType[]
- `version`: Version number for evolution tracking
- `createdAt`/`updatedAt`: Timestamp tracking

**Example data field**:
```json
{
  "entityTypes": [
    {
      "id": "et-1",
      "name": "Pitcher",
      "description": "Baseball pitcher",
      "attributes": [
        {"name": "velocity", "type": "number"},
        {"name": "pitchCount", "type": "number"}
      ]
    }
  ],
  "eventTypes": [
    {
      "id": "evt-1",
      "name": "At-Bat",
      "description": "Batter's plate appearance",
      "attributes": [
        {"name": "result", "type": "string"},
        {"name": "pitchCount", "type": "number"}
      ]
    }
  ]
}
```

### WorldState Model

Stores shared instances accessible to all personas.

```prisma
model WorldState {
  id         String   @id @default(uuid())
  data       Json
  version    Int      @default(1)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("world_state")
}
```

**Fields**:
- `id`: UUID primary key
- `data`: JSON containing Entity[], Event[], Time[], Location[], Collections[], Relations[]
- `version`: Version number for world state evolution
- `createdAt`/`updatedAt`: Timestamp tracking

**Example data field**:
```json
{
  "entities": [
    {
      "id": "ent-1",
      "name": "Mike Trout",
      "typeAssignments": [
        {
          "personaId": "persona-1",
          "entityTypeId": "et-1",
          "confidence": 1.0,
          "justification": "Player #27"
        }
      ]
    }
  ],
  "events": [
    {
      "id": "evt-1",
      "name": "Game Action",
      "startTime": "2025-01-15T14:32:15Z",
      "personaInterpretations": [
        {
          "personaId": "persona-1",
          "eventTypeId": "evt-1"
        }
      ]
    }
  ]
}
```

### Video Model

Stores video metadata and file references.

```prisma
model Video {
  id          String   @id @default(uuid())
  filename    String   @unique
  title       String?
  duration    Float?
  width       Int?
  height      Int?
  fps         Float?
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  annotations Annotation[]
  summaries   VideoSummary[]

  @@map("videos")
}
```

**Fields**:
- `id`: UUID primary key
- `filename`: Unique filename (e.g., "game1.mp4")
- `title`: Optional display title
- `duration`: Video duration in seconds
- `width`/`height`: Resolution in pixels
- `fps`: Frames per second
- `metadata`: Optional JSON with additional video properties
- `annotations`: One-to-many relationship with Annotation
- `summaries`: One-to-many relationship with VideoSummary

**Example**:
```json
{
  "id": "vid-1",
  "filename": "game1.mp4",
  "title": "Baseball Game - 2025-01-15",
  "duration": 3600.0,
  "width": 1920,
  "height": 1080,
  "fps": 30.0
}
```

### Annotation Model

Stores bounding box sequences with keyframes and interpolation.

```prisma
model Annotation {
  id                   String   @id @default(uuid())
  videoId              String
  video                Video    @relation(fields: [videoId], references: [id])
  personaId            String?
  persona              Persona? @relation(fields: [personaId], references: [id])
  annotationType       String
  boundingBoxSequence  Json
  linkedTypeId         String?
  linkedObjectId       String?
  metadata             Json?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@map("annotations")
}
```

**Fields**:
- `id`: UUID primary key
- `videoId`: Foreign key to Video
- `personaId`: Optional foreign key to Persona
- `annotationType`: Either "type" or "object"
- `boundingBoxSequence`: JSON containing BoundingBoxSequence (see below)
- `linkedTypeId`: ID of linked EntityType/EventType (for type annotations)
- `linkedObjectId`: ID of linked Entity/Event (for object annotations)
- `metadata`: Optional additional metadata
- `createdAt`/`updatedAt`: Timestamp tracking

**Important**: ALL annotations use `boundingBoxSequence`. There is no single-frame mode.

### ImportHistory Model

Tracks import operations for auditing.

```prisma
model ImportHistory {
  id            String   @id @default(uuid())
  filename      String
  importedBy    String?
  importOptions Json
  result        Json
  success       Boolean
  itemsImported Int
  itemsSkipped  Int
  createdAt     DateTime @default(now())

  @@map("import_history")
}
```

**Fields**:
- `id`: UUID primary key
- `filename`: Original filename of imported file
- `importedBy`: Optional user identifier
- `importOptions`: JSON containing ImportOptions used
- `result`: JSON containing full ImportResult
- `success`: Boolean indicating import success
- `itemsImported`: Count of successfully imported items
- `itemsSkipped`: Count of skipped items due to conflicts
- `createdAt`: Timestamp of import

## JSON Schemas

### EntityType Schema

Defines a category of entities for a persona.

```typescript
interface EntityType {
  id: string
  name: string
  description?: string
  attributes: Attribute[]
  wikidataId?: string
  color?: string
}

interface Attribute {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date'
  required: boolean
  defaultValue?: any
}
```

**Example**:
```json
{
  "id": "et-1",
  "name": "Pitcher",
  "description": "Baseball pitcher with performance stats",
  "attributes": [
    {
      "name": "pitchVelocity",
      "type": "number",
      "required": true
    },
    {
      "name": "accuracy",
      "type": "number",
      "required": false,
      "defaultValue": 0.0
    }
  ],
  "wikidataId": "Q1050571",
  "color": "#FF5733"
}
```

### EventType Schema

Defines a category of temporal events for a persona.

```typescript
interface EventType {
  id: string
  name: string
  description?: string
  attributes: Attribute[]
  wikidataId?: string
  color?: string
}
```

**Example**:
```json
{
  "id": "evt-1",
  "name": "At-Bat",
  "description": "Batter's plate appearance",
  "attributes": [
    {
      "name": "result",
      "type": "string",
      "required": true
    },
    {
      "name": "pitchCount",
      "type": "number",
      "required": true
    }
  ],
  "color": "#3357FF"
}
```

### BoundingBoxSequence Schema

Complete schema for bounding box sequences with keyframes and interpolation.

```typescript
interface BoundingBoxSequence {
  boxes: BoundingBox[]
  interpolationSegments: InterpolationSegment[]
  visibilityRanges: VisibilityRange[]
  trackId?: string
  trackingSource?: 'samurai' | 'sam2' | 'sam2long' | 'bytetrack' | 'botsort'
  trackingConfidence?: number
  totalFrames: number
  keyframeCount: number
  interpolatedFrameCount: number
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  isKeyframe?: boolean
  confidence?: number
}

interface InterpolationSegment {
  startFrame: number
  endFrame: number
  type: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold'
  controlPoints?: BezierControlPoint[]
}

interface VisibilityRange {
  startFrame: number
  endFrame: number
  visible: boolean
}

interface BezierControlPoint {
  x: number
  y: number
}
```

## Example BoundingBoxSequence

A complete example showing a sequence with 3 keyframes, linear and ease-in-out interpolation, and tracking metadata.

```json
{
  "boxes": [
    {
      "x": 100,
      "y": 100,
      "width": 50,
      "height": 80,
      "frameNumber": 0,
      "isKeyframe": true,
      "confidence": 0.98
    },
    {
      "x": 150,
      "y": 105,
      "width": 52,
      "height": 82,
      "frameNumber": 50,
      "isKeyframe": true,
      "confidence": 0.96
    },
    {
      "x": 200,
      "y": 110,
      "width": 54,
      "height": 84,
      "frameNumber": 100,
      "isKeyframe": true,
      "confidence": 0.94
    }
  ],
  "interpolationSegments": [
    {
      "startFrame": 0,
      "endFrame": 50,
      "type": "linear"
    },
    {
      "startFrame": 50,
      "endFrame": 100,
      "type": "ease-in-out"
    }
  ],
  "visibilityRanges": [
    {
      "startFrame": 0,
      "endFrame": 100,
      "visible": true
    }
  ],
  "trackId": "track-42",
  "trackingSource": "samurai",
  "trackingConfidence": 0.95,
  "totalFrames": 101,
  "keyframeCount": 3,
  "interpolatedFrameCount": 98
}
```

**Explanation**:
- **boxes**: 3 keyframes at frames 0, 50, and 100
- **interpolationSegments**: Linear interpolation for frames 0-50, ease-in-out for frames 50-100
- **visibilityRanges**: Object visible throughout entire sequence (frames 0-100)
- **trackId**: Linked to tracking model output (track #42)
- **trackingSource**: Generated by SAMURAI tracking model
- **trackingConfidence**: 95% average confidence
- **totalFrames**: 101 frames total (0-100 inclusive)
- **keyframeCount**: 3 keyframes
- **interpolatedFrameCount**: 98 frames interpolated between keyframes

## Single-Keyframe Sequences

Static objects use sequences with one keyframe and no interpolation.

```json
{
  "boxes": [
    {
      "x": 100,
      "y": 100,
      "width": 50,
      "height": 80,
      "frameNumber": 42,
      "isKeyframe": true
    }
  ],
  "interpolationSegments": [],
  "visibilityRanges": [
    {
      "startFrame": 42,
      "endFrame": 42,
      "visible": true
    }
  ],
  "totalFrames": 1,
  "keyframeCount": 1,
  "interpolatedFrameCount": 0
}
```

## Next Steps

- Learn about [Exporting Data](../user-guides/data-management/exporting-data.md)
- Learn about [Importing Data](../user-guides/data-management/importing-data.md)
- Explore [Architecture](../concepts/architecture.md)
