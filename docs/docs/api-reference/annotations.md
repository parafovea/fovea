---
title: Annotations API
---

# Annotations API

Create and manage video annotations with bounding box sequences. Annotations link video regions to persona-specific types or world objects using keyframe-based sequences with interpolation.

## List Annotations

Retrieve all annotations for a specific video.

### Request

```
GET /api/annotations/:videoId
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| videoId | string | Video identifier (MD5 hash of filename) |

### Response

**Status:** 200 OK

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "videoId": "abc123def456",
    "personaId": "660e8400-e29b-41d4-a716-446655440001",
    "type": "entity",
    "label": "Pitcher",
    "frames": {
      "interpolationMode": "linear",
      "boxes": [
        {
          "frameNumber": 0,
          "x": 100,
          "y": 100,
          "width": 200,
          "height": 150,
          "isKeyframe": true,
          "visible": true
        },
        {
          "frameNumber": 30,
          "x": 120,
          "y": 110,
          "width": 200,
          "height": 150,
          "isKeyframe": true,
          "visible": true
        }
      ]
    },
    "confidence": 0.95,
    "source": "manual",
    "createdAt": "2025-10-06T14:30:00.000Z",
    "updatedAt": "2025-10-06T14:30:00.000Z"
  }
]
```

### Example

```bash
curl http://localhost:3001/api/annotations/abc123def456
```

## Create Annotation

Create a new annotation with a bounding box sequence.

### Request

```
POST /api/annotations
```

**Content-Type:** application/json

```json
{
  "videoId": "abc123def456",
  "personaId": "660e8400-e29b-41d4-a716-446655440001",
  "type": "entity",
  "label": "Pitcher",
  "frames": {
    "interpolationMode": "linear",
    "boxes": [
      {
        "frameNumber": 0,
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      }
    ]
  },
  "confidence": 0.95,
  "source": "manual"
}
```

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| videoId | string | Yes | Video identifier |
| personaId | string | Yes | Persona UUID |
| type | string | Yes | Annotation type (entity, event, etc.) |
| label | string | Yes | Display label for the annotation |
| frames | object | Yes | Bounding box sequence (see below) |
| confidence | number | No | Confidence score 0-1 (default: 1.0) |
| source | string | No | Source of annotation (default: "manual") |

### Bounding Box Sequence Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| interpolationMode | string | Yes | Interpolation mode: "linear", "ease-in-out", "bezier", "step" |
| boxes | array | Yes | Array of bounding boxes |

### Bounding Box Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| frameNumber | number | Yes | Frame number (0-indexed) |
| x | number | Yes | X coordinate (pixels) |
| y | number | Yes | Y coordinate (pixels) |
| width | number | Yes | Width (pixels) |
| height | number | Yes | Height (pixels) |
| isKeyframe | boolean | Yes | Whether this is a keyframe |
| visible | boolean | Yes | Whether object is visible at this frame |

### Response

**Status:** 201 Created

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "videoId": "abc123def456",
  "personaId": "660e8400-e29b-41d4-a716-446655440001",
  "type": "entity",
  "label": "Pitcher",
  "frames": {
    "interpolationMode": "linear",
    "boxes": [
      {
        "frameNumber": 0,
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      }
    ]
  },
  "confidence": 0.95,
  "source": "manual",
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T14:30:00.000Z"
}
```

### Example

```bash
curl -X POST http://localhost:3001/api/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "abc123def456",
    "personaId": "660e8400-e29b-41d4-a716-446655440001",
    "type": "entity",
    "label": "Pitcher",
    "frames": {
      "interpolationMode": "linear",
      "boxes": [
        {
          "frameNumber": 0,
          "x": 100,
          "y": 100,
          "width": 200,
          "height": 150,
          "isKeyframe": true,
          "visible": true
        }
      ]
    }
  }'
```

## Update Annotation

Update an existing annotation. All fields except ID and videoId are optional.

### Request

```
PUT /api/annotations/:id
```

**Content-Type:** application/json

```json
{
  "label": "Starting Pitcher",
  "frames": {
    "interpolationMode": "linear",
    "boxes": [
      {
        "frameNumber": 0,
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      },
      {
        "frameNumber": 30,
        "x": 120,
        "y": 110,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      }
    ]
  }
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Annotation identifier |

### Request Body Schema

All fields are optional. Only provided fields will be updated.

| Field | Type | Description |
|-------|------|-------------|
| type | string | Annotation type |
| label | string | Display label |
| frames | object | Bounding box sequence |
| confidence | number | Confidence score 0-1 |
| source | string | Source of annotation |

### Response

**Status:** 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "videoId": "abc123def456",
  "personaId": "660e8400-e29b-41d4-a716-446655440001",
  "type": "entity",
  "label": "Starting Pitcher",
  "frames": {
    "interpolationMode": "linear",
    "boxes": [
      {
        "frameNumber": 0,
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      },
      {
        "frameNumber": 30,
        "x": 120,
        "y": 110,
        "width": 200,
        "height": 150,
        "isKeyframe": true,
        "visible": true
      }
    ]
  },
  "confidence": 0.95,
  "source": "manual",
  "createdAt": "2025-10-06T14:30:00.000Z",
  "updatedAt": "2025-10-06T16:45:00.000Z"
}
```

### Example

```bash
curl -X PUT http://localhost:3001/api/annotations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Starting Pitcher"
  }'
```

## Delete Annotation

Delete an annotation from a video.

### Request

```
DELETE /api/annotations/:videoId/:id
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| videoId | string | Video identifier |
| id | UUID | Annotation identifier |

### Response

**Status:** 204 No Content

(Empty response body)

### Example

```bash
curl -X DELETE http://localhost:3001/api/annotations/abc123def456/550e8400-e29b-41d4-a716-446655440000
```

## Notes

### Interpolation Modes

- **linear**: Linear interpolation between keyframes
- **ease-in-out**: Smooth acceleration and deceleration
- **bezier**: Custom bezier curve (requires additional control points)
- **step**: No interpolation (step function)

### Keyframes

- At least one keyframe is required per sequence.
- Keyframes define control points for interpolation.
- Non-keyframe boxes are automatically interpolated based on the interpolation mode.
- Keyframes must be sorted by frame number.

### Visibility

- Setting `visible: false` creates discontiguous sequences where objects disappear and reappear.
- Invisible frames are not exported unless explicitly requested.

### Source Field

Common values:
- `manual`: Created by user
- `tracking`: Generated by automated tracking
- `interpolation`: Auto-interpolated frames
- `import`: Imported from external file

### Confidence Score

- Range: 0.0 to 1.0
- Default: 1.0 for manual annotations
- Lower values indicate less certainty (common for automated tracking)
