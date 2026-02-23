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

## RBAC Models

### UserGroup Model

Represents a collection of users who share access to projects and resources.

```prisma
model UserGroup {
  id          String   @id @default(uuid())
  name        String
  description String?
  slug        String   @unique
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members        GroupMembership[]
  projects       Project[]
  resourceShares ResourceShare[]

  @@map("user_groups")
}
```

**Fields**:
- `id`: UUID primary key
- `name`: Display name for the group
- `description`: Optional description
- `slug`: Unique URL-friendly identifier (lowercase alphanumeric and hyphens)
- `createdBy`: User ID of the creator
- `members`: One-to-many relationship with GroupMembership
- `projects`: One-to-many relationship with Project (group-owned projects)
- `resourceShares`: One-to-many relationship with ResourceShare (shares targeting this group)

### GroupMembership Model

Tracks user membership and role within a group.

```prisma
model GroupMembership {
  id       String    @id @default(uuid())
  userId   String
  user     User      @relation(...)
  groupId  String
  group    UserGroup @relation(...)
  role     String
  joinedAt DateTime  @default(now())

  @@unique([userId, groupId])
  @@map("group_memberships")
}
```

**Fields**:
- `id`: UUID primary key
- `userId`: Foreign key to User
- `groupId`: Foreign key to UserGroup
- `role`: One of `group_owner`, `group_admin`, `group_member`
- `joinedAt`: Timestamp when the user joined the group
- Unique constraint on (userId, groupId) prevents duplicate memberships

### Project Model

Organizes videos, annotations, and team members around a shared goal.

```prisma
model Project {
  id           String    @id @default(uuid())
  name         String
  description  String?
  slug         String    @unique
  ownerUserId  String?
  ownerUser    User?     @relation(...)
  ownerGroupId String?
  ownerGroup   UserGroup? @relation(...)
  settings     Json      @default("{}")
  isArchived   Boolean   @default(false)
  createdBy    String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  members          ProjectMembership[]
  videoAssignments ProjectVideoAssignment[]
  personas         Persona[]
  worldStates      WorldState[]
  annotations      Annotation[]
  videoSummaries   VideoSummary[]
  claims           Claim[]

  @@map("projects")
}
```

**Fields**:
- `id`: UUID primary key
- `name`: Display name
- `description`: Optional description
- `slug`: Unique URL-friendly identifier
- `ownerUserId`: Foreign key to User (for personal projects, null for group-owned)
- `ownerGroupId`: Foreign key to UserGroup (for group-owned projects, null for personal)
- `settings`: JSON configuration object
- `isArchived`: Whether the project is archived
- `createdBy`: User ID who created the project
- `members`: One-to-many relationship with ProjectMembership
- `videoAssignments`: One-to-many relationship with ProjectVideoAssignment
- `personas`, `worldStates`, `annotations`, `videoSummaries`, `claims`: project-scoped resources

### ProjectMembership Model

Tracks user membership and role within a project.

```prisma
model ProjectMembership {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(...)
  projectId String
  project   Project  @relation(...)
  role      String
  joinedAt  DateTime @default(now())

  @@unique([userId, projectId])
  @@map("project_memberships")
}
```

**Fields**:
- `id`: UUID primary key
- `userId`: Foreign key to User
- `projectId`: Foreign key to Project
- `role`: One of `project_owner`, `project_manager`, `annotator`, `reviewer`, `viewer`
- `joinedAt`: Timestamp when the user joined the project
- Unique constraint on (userId, projectId) prevents duplicate memberships

### ProjectVideoAssignment Model

Links videos to projects with optional user assignment.

```prisma
model ProjectVideoAssignment {
  id             String   @id @default(uuid())
  projectId      String
  project        Project  @relation(...)
  videoId        String
  video          Video    @relation(...)
  assignedUserId String?
  assignedUser   User?    @relation(...)
  source         String   @default("manual")
  ruleDefinition Json?
  assignedBy     String?
  assignedAt     DateTime @default(now())

  @@unique([projectId, videoId])
  @@map("project_video_assignments")
}
```

**Fields**:
- `id`: UUID primary key
- `projectId`: Foreign key to Project
- `videoId`: Foreign key to Video
- `assignedUserId`: Optional foreign key to User (for task assignment)
- `source`: How the assignment was created: `manual` or `rule`
- `ruleDefinition`: JSON storing rule metadata when source is `rule`
- `assignedBy`: User ID who created the assignment
- `assignedAt`: Timestamp of assignment
- Unique constraint on (projectId, videoId) prevents duplicate assignments

### VideoAssignmentRule Model

Defines automatic video-to-project assignment logic based on metadata conditions.

```prisma
model VideoAssignmentRule {
  id          String   @id @default(uuid())
  name        String
  description String?
  conditions  Json
  targetType  String
  targetId    String
  isActive    Boolean  @default(true)
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("video_assignment_rules")
}
```

**Fields**:
- `id`: UUID primary key
- `name`: Display name for the rule
- `description`: Optional description
- `conditions`: JSON array of `{field, operator, value}` condition objects
- `targetType`: One of `user`, `project`, `group`
- `targetId`: UUID of the target entity
- `isActive`: Whether the rule is evaluated during batch runs
- `createdBy`: User ID who created the rule

### ResourceShare Model

Tracks sharing of resources between users and groups.

```prisma
model ResourceShare {
  id                String    @id @default(uuid())
  resourceType      String
  resourceId        String
  sharedByUserId    String
  sharedByUser      User      @relation(...)
  sharedWithUserId  String?
  sharedWithUser    User?     @relation(...)
  sharedWithGroupId String?
  sharedWithGroup   UserGroup? @relation(...)
  permissionLevel   String    @default("read_only")
  expiresAt         DateTime?
  createdAt         DateTime  @default(now())

  @@map("resource_shares")
}
```

**Fields**:
- `id`: UUID primary key
- `resourceType`: One of `annotation`, `summary`, `claim`, `persona`, `world_state`
- `resourceId`: UUID of the shared resource
- `sharedByUserId`: Foreign key to User (the sharer)
- `sharedWithUserId`: Optional foreign key to User (direct share target)
- `sharedWithGroupId`: Optional foreign key to UserGroup (group share target)
- `permissionLevel`: `read_only` or `forkable`
- `expiresAt`: Optional expiration timestamp
- Exactly one of sharedWithUserId or sharedWithGroupId is non-null per record

### RolePermission Model

Defines the permission matrix: what actions each role can perform on each resource type.

```prisma
model RolePermission {
  id           String   @id @default(uuid())
  scope        String
  role         String
  resourceType String
  action       String
  ownOnly      Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([scope, role, resourceType, action])
  @@map("role_permissions")
}
```

**Fields**:
- `id`: UUID primary key
- `scope`: One of `system`, `group`, `project`
- `role`: Role identifier (e.g., `system_admin`, `group_owner`, `annotator`)
- `resourceType`: Resource the permission applies to (e.g., `annotation`, `video`, `project`, `group`)
- `action`: Permitted action (e.g., `create`, `read`, `update`, `delete`, `share`, `export`, `assign`, `manage_members`, `fork`, `review`)
- `ownOnly`: When true, the permission applies only to resources created by the user
- Unique constraint on (scope, role, resourceType, action) prevents duplicate entries

## Next Steps

- Learn about [Exporting Data](../user-guides/data-management/exporting-data.md)
- Learn about [Importing Data](../user-guides/data-management/importing-data.md)
- Explore [Architecture](../concepts/architecture.md)
- Learn about [Projects, Groups, and RBAC](../concepts/projects-groups.md)
