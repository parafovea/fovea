---
title: Videos API
---

# Videos API

List videos, retrieve metadata, stream video files, and perform object detection. Videos are served from the `/data` directory.

## Route Organization

The videos API is organized into modular route files for maintainability:

- **`list.ts`** - [List videos](#list-videos) and [get metadata](#get-video-metadata) (`GET /api/videos`, `GET /api/videos/:videoId`)
- **`stream.ts`** - [Video streaming](#stream-video) with range support (`GET /api/videos/:videoId/stream`)
- **`thumbnail.ts`** - Thumbnail generation and serving (`GET /api/videos/:videoId/thumbnail`)
- **`detect.ts`** - [Object detection](#detect-objects) with optional tracking (`POST /api/videos/:videoId/detect`)
- **`sync.ts`** - Video synchronization from storage (`POST /api/videos/sync`)
- **`url.ts`** - Get video URLs (`GET /api/videos/:videoId/url`)
- **`schemas.ts`** - Shared TypeBox schema definitions

All routes are registered through `server/src/routes/videos/index.ts`.

## List Videos

Retrieve all available videos with metadata.

### Request

```
GET /api/videos
```

### Response

**Status:** 200 OK

```json
[
  {
    "id": "abc123def456",
    "filename": "sample-video.mp4",
    "path": "/api/videos/abc123def456/stream",
    "size": 104857600,
    "createdAt": "2025-10-06T14:30:00.000Z",
    "title": "Baseball Game Footage",
    "description": "Spring training game footage",
    "duration": 120.5,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "format": "mp4"
  }
]
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Failed to list videos"
}
```

### Response Schema

Base fields (always present):

| Field | Type | Description |
|-------|------|-------------|
| id | string | MD5 hash of filename (first 16 chars) |
| filename | string | Original filename |
| path | string | Streaming endpoint path |
| size | number | File size in bytes |
| createdAt | string | ISO 8601 timestamp of file creation |

Metadata fields (from `.info.json` file, if present):

| Field | Type | Description |
|-------|------|-------------|
| title | string | Display title |
| description | string | Video description |
| duration | number | Duration in seconds |
| width | number | Video width in pixels |
| height | number | Video height in pixels |
| fps | number | Frames per second |
| format | string | Video format |
| uploader | string | Optional uploader name |
| uploadDate | string | Optional upload date |
| tags | array | Optional array of tags |
| thumbnail | string | Optional thumbnail path |

### Example

```bash
curl http://localhost:3001/api/videos
```

## Get Video Metadata

Retrieve metadata for a specific video.

### Request

```
GET /api/videos/:videoId
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| videoId | string | Video identifier (MD5 hash of filename) |

### Response

**Status:** 200 OK

```json
{
  "id": "abc123def456",
  "filename": "sample-video.mp4",
  "path": "/api/videos/abc123def456/stream",
  "size": 104857600,
  "createdAt": "2025-10-06T14:30:00.000Z",
  "title": "Baseball Game Footage",
  "description": "Spring training game footage",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4"
}
```

**Status:** 404 Not Found

```json
{
  "error": "Video not found"
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Failed to get video"
}
```

### Example

```bash
curl http://localhost:3001/api/videos/abc123def456
```

## Stream Video

Stream video file content for playback.

### Request

```
GET /api/videos/:videoId/stream
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| videoId | string | Video identifier (MD5 hash of filename) |

### Response

**Status:** 200 OK

**Content-Type:** video/mp4

**Headers:**
- `Content-Length`: File size in bytes
- `Accept-Ranges`: bytes

Binary video stream.

**Status:** 404 Not Found

```json
{
  "error": "Video not found"
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Failed to stream video"
}
```

### Example

```bash
curl http://localhost:3001/api/videos/abc123def456/stream --output video.mp4
```

### Notes

- Supports HTTP range requests for seeking.
- Used by video.js player in frontend for playback.
- Returns entire file if no range header is provided.

## Detect Objects

Detect objects in video frames using persona-based or manual queries.

### Request

```
POST /api/videos/:videoId/detect
```

**Content-Type:** application/json

```json
{
  "personaId": "660e8400-e29b-41d4-a716-446655440001",
  "confidenceThreshold": 0.3,
  "frameNumbers": [0, 30, 60, 90],
  "enableTracking": false
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| videoId | string | Video identifier (MD5 hash of filename) |

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| personaId | UUID | No* | Persona UUID for building query from ontology |
| manualQuery | string | No* | Manual query string (overrides personaId) |
| queryOptions | object | No | Options for building query from persona |
| confidenceThreshold | number | No | Minimum confidence (default: 0.3, range: 0-1) |
| frameNumbers | array | No | Specific frames to process (omit for all) |
| enableTracking | boolean | No | Enable object tracking (default: false) |

*Either `personaId` or `manualQuery` must be provided.

### Query Options Schema

Used when `personaId` is provided to control which parts of the ontology are included in the detection query:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| includeEntityTypes | boolean | true | Include entity type names |
| includeEntityGlosses | boolean | false | Include entity type definitions |
| includeEventTypes | boolean | false | Include event type names |
| includeEventGlosses | boolean | false | Include event type definitions |
| includeRoleTypes | boolean | false | Include role type names |
| includeRoleGlosses | boolean | false | Include role type definitions |
| includeRelationTypes | boolean | false | Include relation type names |
| includeRelationGlosses | boolean | false | Include relation type definitions |
| includeEntityInstances | boolean | false | Include world entity names |
| includeEntityInstanceGlosses | boolean | false | Include world entity descriptions |
| includeEventInstances | boolean | false | Include world event names |
| includeEventInstanceGlosses | boolean | false | Include world event descriptions |
| includeLocationInstances | boolean | false | Include world location names |
| includeLocationInstanceGlosses | boolean | false | Include world location descriptions |
| includeTimeInstances | boolean | false | Include world time names |
| includeTimeInstanceGlosses | boolean | false | Include world time descriptions |

### Response

**Status:** 200 OK

```json
{
  "videoId": "abc123def456",
  "query": "pitcher, batter, baseball, glove",
  "frameResults": [
    {
      "frameNumber": 0,
      "detections": [
        {
          "x": 100,
          "y": 100,
          "width": 200,
          "height": 150,
          "confidence": 0.95,
          "label": "pitcher"
        },
        {
          "x": 500,
          "y": 200,
          "width": 180,
          "height": 160,
          "confidence": 0.92,
          "label": "batter"
        }
      ]
    },
    {
      "frameNumber": 30,
      "detections": [
        {
          "x": 110,
          "y": 105,
          "width": 200,
          "height": 150,
          "confidence": 0.93,
          "label": "pitcher"
        }
      ]
    }
  ]
}
```

**Status:** 400 Bad Request

```json
{
  "error": "Either personaId or manualQuery must be provided"
}
```

or

```json
{
  "error": "Generated query is empty. Persona may have no entity types defined."
}
```

**Status:** 404 Not Found

```json
{
  "error": "Video not found"
}
```

**Status:** 500 Internal Server Error

```json
{
  "error": "Failed to detect objects"
}
```

or

```json
{
  "error": "Model service error: <error details>"
}
```

### Example with Persona

```bash
curl -X POST http://localhost:3001/api/videos/abc123def456/detect \
  -H "Content-Type: application/json" \
  -d '{
    "personaId": "660e8400-e29b-41d4-a716-446655440001",
    "confidenceThreshold": 0.5,
    "frameNumbers": [0, 30, 60, 90]
  }'
```

### Example with Manual Query

```bash
curl -X POST http://localhost:3001/api/videos/abc123def456/detect \
  -H "Content-Type: application/json" \
  -d '{
    "manualQuery": "person, ball, bat, glove",
    "confidenceThreshold": 0.7
  }'
```

### Example with Tracking Enabled

```bash
curl -X POST http://localhost:3001/api/videos/abc123def456/detect \
  -H "Content-Type: application/json" \
  -d '{
    "personaId": "660e8400-e29b-41d4-a716-446655440001",
    "enableTracking": true,
    "confidenceThreshold": 0.6
  }'
```

### Notes

#### Video ID Format

Video IDs are created by taking the first 16 characters of the MD5 hash of the filename:

```javascript
const id = crypto.createHash('md5').update(filename).digest('hex').slice(0, 16)
```

#### Metadata Files

Each video file (`video.mp4`) can have an associated metadata file (`video.info.json`) in the same directory. If present, metadata fields are merged with the base response.

Example `.info.json` file:

```json
{
  "title": "Baseball Game Footage",
  "description": "Spring training game footage",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4",
  "uploader": "John Doe",
  "uploadDate": "2025-10-01",
  "tags": ["baseball", "sports", "training"]
}
```

#### Detection Query Building

When `personaId` is provided, the system builds a query string by concatenating terms from the persona's ontology based on `queryOptions`. The default includes only entity type names.

Example query for a sports scout persona:
```
"pitcher, batter, catcher, umpire, baseball, glove, bat"
```

#### Object Detection Model

Detection requests are forwarded to the model service at `MODEL_SERVICE_URL` (default: `http://localhost:8000`). The model service uses GroundingDINO or similar models for open-vocabulary object detection.

#### Tracking

When `enableTracking: true`, the model service tracks detected objects across frames and assigns consistent IDs. This is useful for following specific objects through the video.
