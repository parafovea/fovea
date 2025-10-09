---
title: Export & Import API
---

# Export & Import API

Export annotations in JSON Lines format and import them with conflict resolution. Supports keyframes-only or fully interpolated export modes.

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

## Import Annotations

Import annotations from a JSON Lines file with conflict resolution.

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
    "duplicateIds": "skip",
    "overlappingFrames": "merge",
    "missingDependencies": "skip"
  },
  "validation": {
    "strictMode": false,
    "requireKeyframes": true
  },
  "transaction": {
    "atomic": true
  }
}
```

| Field | Type | Values | Default | Description |
|-------|------|--------|---------|-------------|
| conflictResolution.duplicateIds | string | skip, overwrite, merge, fail | skip | How to handle duplicate annotation IDs |
| conflictResolution.overlappingFrames | string | skip, merge, overwrite, fail | merge | How to handle overlapping frame ranges |
| conflictResolution.missingDependencies | string | skip, create, fail | skip | How to handle missing personas/videos |
| validation.strictMode | boolean | - | false | Reject any annotation with warnings |
| validation.requireKeyframes | boolean | - | true | Require at least one keyframe per sequence |
| transaction.atomic | boolean | - | true | All-or-nothing import (rollback on error) |

### Response

**Status:** 200 OK

```json
{
  "success": true,
  "summary": {
    "totalLines": 150,
    "processedLines": 150,
    "importedItems": {
      "annotations": 145,
      "totalKeyframes": 450,
      "singleKeyframeSequences": 30
    },
    "skippedItems": {
      "annotations": 5
    }
  },
  "warnings": [
    {
      "line": 42,
      "type": "single_keyframe",
      "message": "Annotation has only one keyframe"
    }
  ],
  "errors": [],
  "conflicts": []
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
    "annotations": 150,
    "totalKeyframes": 450,
    "singleKeyframeSequences": 30
  },
  "conflicts": [
    {
      "type": "duplicate_id",
      "annotationId": "550e8400-e29b-41d4-a716-446655440000",
      "message": "Annotation ID already exists in database"
    },
    {
      "type": "overlapping_frames",
      "annotationId": "660e8400-e29b-41d4-a716-446655440001",
      "existingAnnotationId": "770e8400-e29b-41d4-a716-446655440002",
      "message": "Frame ranges overlap: 0-100 and 50-150"
    }
  ],
  "warnings": [
    "Line 42: Annotation has only one keyframe",
    "Line 78: Missing persona reference"
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
  -F "file=@annotations.jsonl"
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
