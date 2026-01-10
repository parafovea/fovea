---
title: Export & Import API
---

# Export & Import API

Export and import all user-created data in JSON Lines format with conflict resolution. Supports annotations, personas, ontologies, world state objects, summaries, and claims.

## Supported Data Types

The export/import system supports all user-created data types:

| Data Type | Export Endpoint | Description |
|-----------|----------------|-------------|
| Personas | `/api/export/personas` | User personas with roles and information needs |
| Ontologies | `/api/export/personas` | Type definitions (entity, event, role, relation types) |
| World State | `/api/export/world` | Entities, events, times, locations, collections, relations |
| Summaries | `/api/export/summaries` | Video summaries with claims |
| Claims | `/api/export/summaries` | Extracted claims from summaries |
| Claim Relations | `/api/export/summaries` | Relationships between claims |
| Annotations | `/api/export` | Bounding box annotations |
| All Data | `/api/export/all` | Complete data export |

## Export Annotations

Export annotations with bounding box sequences in JSON Lines format.

### Request

```
GET /api/export
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| format | string | No | Export format: "jsonl" or "json" (default: "jsonl") |
| includeInterpolated | boolean | No | Include all interpolated frames (default: false) |
| personaIds | string | No | Comma-separated persona UUIDs to filter |
| videoIds | string | No | Comma-separated video IDs to filter |
| annotationTypes | string | No | Comma-separated types: "type", "object" |

### Response

**Status:** 200 OK

**Content-Type:** application/x-ndjson (for jsonl) or application/json (for json)

**Content-Disposition:** attachment; filename="annotations.jsonl"

**Custom Headers:**
- `X-Export-Size`: Export size in MB
- `X-Export-Annotations`: Number of annotations
- `X-Export-Sequences`: Number of sequences
- `X-Export-Keyframes`: Number of keyframes
- `X-Export-Interpolated-Frames`: Number of interpolated frames
- `X-Export-Warning`: Warning message (if export is large)

JSON Lines format (one annotation per line):

```jsonl
{"id":"550e8400-e29b-41d4-a716-446655440000","videoId":"abc123def456","personaId":"660e8400-e29b-41d4-a716-446655440001","annotationType":"type","typeAssignment":{"typeId":"entity-001","typeName":"Pitcher"},"boundingBoxSequence":{"interpolationMode":"linear","boxes":[{"frameNumber":0,"x":100,"y":100,"width":200,"height":150,"isKeyframe":true,"visible":true}]},"createdAt":"2025-10-06T14:30:00.000Z","updatedAt":"2025-10-06T14:30:00.000Z"}
```

**Status:** 400 Bad Request

```json
{
  "error": "Validation failed",
  "message": "Some annotations have invalid sequences",
  "validationErrors": [
    {
      "annotationId": "550e8400-e29b-41d4-a716-446655440000",
      "errors": [
        "Sequence must have at least one keyframe",
        "Frame numbers must be in ascending order"
      ]
    }
  ]
}
```

### Export Modes

#### Keyframes-Only Mode (default)

Exports only keyframes. Interpolated frames are not included.

```bash
curl "http://localhost:3001/api/export?includeInterpolated=false"
```

Advantages:
- Smaller file size
- Preserves annotation intent
- Faster to export and import

Use when:
- Sharing annotations with other analysts
- Backing up annotation work
- Transferring between systems

#### Fully Interpolated Mode

Exports all frames including interpolated ones.

```bash
curl "http://localhost:3001/api/export?includeInterpolated=true"
```

Advantages:
- Frame-precise bounding boxes
- No interpolation needed on import
- Useful for training ML models

Use when:
- Exporting for ML training
- Need exact bounding boxes for every frame
- Target system does not support interpolation

### Example: Export All Annotations

```bash
curl "http://localhost:3001/api/export" --output annotations.jsonl
```

### Example: Export for Specific Persona

```bash
curl "http://localhost:3001/api/export?personaIds=660e8400-e29b-41d4-a716-446655440001" \
  --output persona-annotations.jsonl
```

### Example: Export for Specific Video

```bash
curl "http://localhost:3001/api/export?videoIds=abc123def456" \
  --output video-annotations.jsonl
```

### Example: Export with Full Interpolation

```bash
curl "http://localhost:3001/api/export?includeInterpolated=true" \
  --output annotations-full.jsonl
```

### Example: Export as JSON Array

```bash
curl "http://localhost:3001/api/export?format=json" \
  --output annotations.json
```

## Export Statistics

Get export statistics without performing the export. Useful for estimating size before downloading.

### Request

```
GET /api/export/stats
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| includeInterpolated | boolean | No | Include interpolated frames in stats (default: false) |
| personaIds | string | No | Comma-separated persona UUIDs to filter |
| videoIds | string | No | Comma-separated video IDs to filter |
| annotationTypes | string | No | Comma-separated types to filter |

### Response

**Status:** 200 OK

```json
{
  "totalSize": 104857600,
  "totalSizeMB": "100.00MB",
  "annotationCount": 150,
  "sequenceCount": 150,
  "keyframeCount": 450,
  "interpolatedFrameCount": 3600,
  "warning": "Large export. Consider filtering by persona or video."
}
```

### Example

```bash
curl "http://localhost:3001/api/export/stats?includeInterpolated=true"
```

## Export Personas

Export personas with their associated ontologies (type definitions).

### Request

```
GET /api/export/personas
```

### Response

**Status:** 200 OK

**Content-Type:** application/x-ndjson

JSON Lines format with personas followed by their ontologies:

```jsonl
{"type":"persona","data":{"id":"660e8400-e29b-41d4-a716-446655440001","name":"Analyst","role":"Video Analyst","informationNeed":"Track objects across frames","createdAt":"2025-10-06T14:30:00.000Z","updatedAt":"2025-10-06T14:30:00.000Z"}}
{"type":"ontology","data":{"personaId":"660e8400-e29b-41d4-a716-446655440001","entityTypes":[{"id":"entity-001","name":"Person","gloss":[{"type":"text","content":"A human being"}]}],"eventTypes":[],"roleTypes":[],"relationTypes":[]}}
```

### Example

```bash
curl "http://localhost:3001/api/export/personas" --output personas.jsonl
```

## Export World State

Export world state objects including entities, events, times, locations, collections, and relations.

### Request

```
GET /api/export/world
```

### Response

**Status:** 200 OK

**Content-Type:** application/x-ndjson

JSON Lines format with world state objects:

```jsonl
{"type":"entity","data":{"id":"entity-123","name":"John Smith","description":[{"type":"text","content":"A person in the video"}],"typeAssignments":[{"personaId":"660e8400","entityTypeId":"entity-001"}]}}
{"type":"event","data":{"id":"event-456","name":"Meeting","description":[{"type":"text","content":"A meeting event"}],"personaInterpretations":[]}}
{"type":"entity_collection","data":{"id":"coll-789","name":"Team Members","entityIds":["entity-123","entity-456"],"collectionType":"group"}}
```

### Example

```bash
curl "http://localhost:3001/api/export/world" --output world-state.jsonl
```

## Export Summaries

Export video summaries with their associated claims and claim relations.

### Request

```
GET /api/export/summaries
```

### Response

**Status:** 200 OK

**Content-Type:** application/x-ndjson

JSON Lines format with summaries followed by claims and claim relations:

```jsonl
{"type":"summary","data":{"id":"sum-123","videoId":"vid-456","personaId":"660e8400","summary":[{"type":"text","content":"Video summary content"}],"createdAt":"2025-10-06T14:30:00.000Z","updatedAt":"2025-10-06T14:30:00.000Z"}}
{"type":"claim","data":{"id":"claim-789","summaryId":"sum-123","summaryType":"video","text":"The person entered the room","gloss":[{"type":"text","content":"The person entered the room"}]}}
{"type":"claim_relation","data":{"id":"rel-012","sourceClaimId":"claim-789","targetClaimId":"claim-abc","relationTypeId":"supports"}}
```

### Example

```bash
curl "http://localhost:3001/api/export/summaries" --output summaries.jsonl
```

## Export All Data

Export all user-created data in dependency order: personas, ontologies, world state, summaries, claims, and annotations.

### Request

```
GET /api/export/all
```

### Response

**Status:** 200 OK

**Content-Type:** application/x-ndjson

JSON Lines format with all data types in dependency order:

```jsonl
{"type":"persona","data":{...}}
{"type":"ontology","data":{...}}
{"type":"entity","data":{...}}
{"type":"event","data":{...}}
{"type":"summary","data":{...}}
{"type":"claim","data":{...}}
{"type":"claim_relation","data":{...}}
{"type":"annotation","data":{...}}
```

### Export Order

Data is exported in dependency order to ensure imports can be processed correctly:

1. **Personas** - Must exist before ontologies
2. **Ontologies** - Type definitions linked to personas
3. **World State** - Entities, events, times, collections
4. **Summaries** - Linked to videos and personas
5. **Claims** - Linked to summaries
6. **Claim Relations** - Linked to claims
7. **Annotations** - Linked to videos and personas

### Example

```bash
curl "http://localhost:3001/api/export/all" --output backup.jsonl
```

## Import Data

Import all data types from a JSON Lines file with conflict resolution. The import system automatically processes data in dependency order.

### Supported Import Types

- `persona` - Personas with roles and information needs
- `ontology` - Type definitions (entity, event, role, relation types)
- `entity` - Entity world objects
- `event` - Event world objects
- `time` - Time references
- `entity_collection` - Collections of entities
- `event_collection` - Collections of events
- `time_collection` - Collections of times
- `relation` - Relations between world objects
- `summary` - Video summaries
- `claim` - Claims extracted from summaries
- `claim_relation` - Relationships between claims
- `annotation` - Bounding box annotations

### Request

```
POST /api/import
```

**Content-Type:** multipart/form-data

**Form Fields:**
- `file`: JSON Lines file (required)
- `options`: Import options as JSON string (optional)

### Import Options Schema

```json
{
  "conflictResolution": {
    "personas": "skip",
    "worldObjects": "skip",
    "missingDependencies": "skip-item",
    "duplicateIds": "preserve-id",
    "sequences": {
      "duplicateSequenceIds": "skip",
      "overlappingFrameRanges": "fail-import",
      "interpolationConflicts": "use-existing"
    }
  },
  "scope": {
    "includePersonas": true,
    "includeWorldState": true,
    "includeAnnotations": true
  },
  "validation": {
    "strictMode": false,
    "validateReferences": true,
    "validateSequenceIntegrity": true
  },
  "transaction": {
    "atomic": true
  }
}
```

| Field | Type | Values | Default | Description |
|-------|------|--------|---------|-------------|
| conflictResolution.personas | string | skip, replace, merge, rename | skip | How to handle existing personas |
| conflictResolution.worldObjects | string | skip, replace, merge-assignments | skip | How to handle existing world objects |
| conflictResolution.missingDependencies | string | skip-item, create-placeholder, fail-import | skip-item | How to handle missing dependencies |
| conflictResolution.duplicateIds | string | preserve-id, regenerate-id | preserve-id | How to handle duplicate IDs |
| scope.includePersonas | boolean | - | true | Import personas and ontologies |
| scope.includeWorldState | boolean | - | true | Import world state objects |
| scope.includeAnnotations | boolean | - | true | Import annotations |
| validation.strictMode | boolean | - | false | Reject items with warnings |
| validation.validateReferences | boolean | - | true | Validate all references exist |
| transaction.atomic | boolean | - | true | All-or-nothing import (rollback on error) |

### Response

**Status:** 200 OK

```json
{
  "success": true,
  "summary": {
    "totalLines": 250,
    "processedLines": 250,
    "importedItems": {
      "personas": 5,
      "ontologies": 5,
      "entities": 20,
      "events": 15,
      "times": 10,
      "entityCollections": 3,
      "eventCollections": 2,
      "timeCollections": 1,
      "relations": 8,
      "summaries": 12,
      "claims": 45,
      "claimRelations": 20,
      "annotations": 100,
      "totalKeyframes": 450,
      "totalInterpolatedFrames": 3600,
      "singleKeyframeSequences": 30
    },
    "skippedItems": {
      "personas": 1,
      "worldObjects": 3,
      "summaries": 0,
      "claims": 2,
      "annotations": 5,
      "sequenceAnnotations": 0
    }
  },
  "warnings": [
    {
      "line": 42,
      "type": "single_keyframe",
      "message": "Annotation has only one keyframe"
    },
    {
      "line": 78,
      "type": "missing_reference",
      "message": "Video xyz-123 not found, skipping annotation"
    }
  ],
  "errors": [],
  "conflicts": [
    {
      "type": "duplicate-persona",
      "line": 12,
      "originalId": "persona-123",
      "existingId": "persona-123",
      "details": "Persona with same ID already exists",
      "resolution": "skip"
    }
  ]
}
```

**Status:** 400 Bad Request

```json
{
  "error": "Bad Request",
  "message": "No file provided"
}
```

or

```json
{
  "error": "Parse Error",
  "message": "Invalid JSON on line 42: Unexpected token"
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "Database transaction failed"
}
```

### Example: Import with Default Options

```bash
curl -X POST http://localhost:3001/api/import \
  -F "file=@annotations.jsonl"
```

### Example: Import with Custom Options

```bash
curl -X POST http://localhost:3001/api/import \
  -F "file=@annotations.jsonl" \
  -F 'options={"conflictResolution":{"duplicateIds":"overwrite"}}'
```

### Example: Import with Strict Validation

```bash
curl -X POST http://localhost:3001/api/import \
  -F "file=@annotations.jsonl" \
  -F 'options={"validation":{"strictMode":true}}'
```

## Preview Import

Preview import without committing to database. Performs parsing, validation, and conflict detection.

### Request

```
POST /api/import/preview
```

**Content-Type:** multipart/form-data

**Form Fields:**
- `file`: JSON Lines file (required)

### Response

**Status:** 200 OK

```json
{
  "counts": {
    "personas": 5,
    "ontologies": 5,
    "entities": 20,
    "events": 15,
    "times": 10,
    "entityCollections": 3,
    "eventCollections": 2,
    "timeCollections": 1,
    "relations": 8,
    "summaries": 12,
    "claims": 45,
    "claimRelations": 20,
    "annotations": 100,
    "totalKeyframes": 450,
    "singleKeyframeSequences": 30
  },
  "conflicts": [
    {
      "type": "duplicate-persona",
      "line": 5,
      "originalId": "persona-123",
      "existingId": "persona-123",
      "details": "Persona with same ID already exists"
    },
    {
      "type": "duplicate-object",
      "line": 42,
      "originalId": "entity-456",
      "existingId": "entity-456",
      "details": "Entity with same ID already exists"
    }
  ],
  "warnings": [
    "Line 42: Annotation has only one keyframe",
    "Line 78: Missing persona reference for ontology"
  ]
}
```

**Status:** 400 Bad Request

```json
{
  "error": "Bad Request",
  "message": "No file provided"
}
```

or

```json
{
  "error": "Parse Error",
  "message": "Invalid JSON on line 42: Unexpected token"
}
```

### Example

```bash
curl -X POST http://localhost:3001/api/import/preview \
  -F "file=@backup.jsonl"
```

## Import History

Retrieve history of import operations.

### Request

```
GET /api/import/history
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | number | No | Maximum records to return (1-100, default: 50) |
| offset | number | No | Number of records to skip (default: 0) |

### Response

**Status:** 200 OK

```json
{
  "imports": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "filename": "annotations.jsonl",
      "success": true,
      "itemsImported": 145,
      "itemsSkipped": 5,
      "createdAt": "2025-10-06T14:30:00.000Z"
    },
    {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "filename": "external-annotations.jsonl",
      "success": false,
      "itemsImported": 0,
      "itemsSkipped": 0,
      "createdAt": "2025-10-05T10:15:00.000Z"
    }
  ],
  "total": 2
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "Failed to retrieve import history"
}
```

### Example

```bash
curl "http://localhost:3001/api/import/history?limit=10"
```

## Notes

### JSON Lines Format

Each line in a `.jsonl` file must be a valid JSON object representing a single annotation:

```jsonl
{"id":"...","videoId":"...","personaId":"...","annotationType":"type","typeAssignment":{"typeId":"...","typeName":"..."},"boundingBoxSequence":{...}}
{"id":"...","videoId":"...","personaId":"...","annotationType":"object","objectLink":{"objectId":"...","objectType":"entity"},"boundingBoxSequence":{...}}
```

### File Size Limits

- Maximum file size for import: 100 MB
- Larger files should be split into multiple imports

### Export Warning Threshold

Exports larger than 100 MB trigger a warning header suggesting filtering by persona or video.

### Conflict Resolution Strategies

#### Duplicate IDs

- **skip**: Do not import annotations with existing IDs
- **overwrite**: Replace existing annotations with imported ones
- **merge**: Attempt to merge sequences (add new keyframes)
- **fail**: Abort import if duplicates found

#### Overlapping Frames

- **skip**: Do not import annotations with overlapping frame ranges
- **merge**: Combine sequences (may create complex merged sequences)
- **overwrite**: Replace existing frames with imported ones
- **fail**: Abort import if overlaps found

#### Missing Dependencies

- **skip**: Do not import annotations with missing personas/videos
- **create**: Create placeholder personas/videos (not recommended)
- **fail**: Abort import if dependencies missing

### Import Transaction Modes

#### Atomic Mode (default)

All annotations are imported in a single database transaction. If any annotation fails, the entire import is rolled back.

Advantages:
- Database consistency
- All-or-nothing guarantee

Use when:
- Data integrity is critical
- Small to medium imports

#### Non-Atomic Mode

Each annotation is imported individually. Failed annotations are logged but do not affect others.

```json
{
  "transaction": {
    "atomic": false
  }
}
```

Advantages:
- Partial imports succeed
- Better for large files with errors

Use when:
- Importing from external sources with quality issues
- Large imports where some failures are acceptable
