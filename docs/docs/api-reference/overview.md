---
title: API Overview
---

# API Overview

The FOVEA backend API provides REST endpoints for managing personas, ontologies, annotations, videos, and import/export operations.

## Base URL

Development: `http://localhost:3001/api`

Production: Configure via environment variables.

## Request/Response Format

All API endpoints accept and return JSON unless otherwise specified. Multipart form data is used for file uploads.

### Standard Response Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 201  | Resource created |
| 204  | Success with no content |
| 400  | Bad request (invalid parameters) |
| 404  | Resource not found |
| 500  | Internal server error |

### Error Response Format

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

## Authentication

Authentication is not currently implemented. All endpoints are accessible without credentials.

## API Sections

### Personas

Manage analyst personas with their roles and information needs.

- [GET /api/personas](./personas.md#list-personas)
- [POST /api/personas](./personas.md#create-persona)
- [GET /api/personas/:id](./personas.md#get-persona)
- [PUT /api/personas/:id](./personas.md#update-persona)
- [DELETE /api/personas/:id](./personas.md#delete-persona)

### Ontology

Retrieve and save persona ontologies and world state data.

- [GET /api/ontology](./ontology.md#get-ontology)
- [PUT /api/ontology](./ontology.md#save-ontology)

### Annotations

Create and manage video annotations with bounding box sequences.

- [GET /api/annotations/:videoId](./annotations.md#list-annotations)
- [POST /api/annotations](./annotations.md#create-annotation)
- [PUT /api/annotations/:id](./annotations.md#update-annotation)
- [DELETE /api/annotations/:videoId/:id](./annotations.md#delete-annotation)

### Videos

List videos, retrieve metadata, and stream video files.

- [GET /api/videos](./videos.md#list-videos)
- [GET /api/videos/:videoId](./videos.md#get-video-metadata)
- [GET /api/videos/:videoId/stream](./videos.md#stream-video)
- [POST /api/videos/:videoId/detect](./videos.md#detect-objects)

### Export

Export annotations in JSON Lines format with keyframes or fully interpolated sequences.

- [GET /api/export](./export-import.md#export-annotations)
- [GET /api/export/stats](./export-import.md#export-statistics)

### Import

Import annotations from JSON Lines files with conflict resolution.

- [POST /api/import](./export-import.md#import-annotations)
- [POST /api/import/preview](./export-import.md#preview-import)
- [GET /api/import/history](./export-import.md#import-history)

## Data Types

### UUID Format

All entity IDs use UUIDs (version 4) except video IDs, which use MD5 hashes of filenames.

```
"550e8400-e29b-41d4-a716-446655440000"
```

### ISO 8601 Timestamps

All timestamps use ISO 8601 format with timezone:

```
"2025-10-06T14:30:00.000Z"
```

### Bounding Box Sequence

Annotations use bounding box sequences with keyframes and interpolation:

```json
{
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
```

## Rate Limiting

Rate limiting is not currently implemented.

## Versioning

The API does not currently use versioning. Breaking changes will be documented in release notes.

## OpenAPI Specification

An OpenAPI specification is not currently available. Endpoints use Fastify schema validation with TypeBox.
