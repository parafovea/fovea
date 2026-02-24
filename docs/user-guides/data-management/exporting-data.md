---
title: Exporting Data
sidebar_position: 1
---

# Exporting Data

Fovea provides export endpoints that produce JSON Lines (JSONL) or JSON files containing your annotations, personas, ontologies, summaries, claims, and world state.

## User-scoped exports

All export endpoints return data belonging to the authenticated user only. When you export personas, ontologies, summaries, claims, or world state, the results are filtered to include only records you own. Data created by other users is not included in your exports.

This scoping applies to every export endpoint:

- **GET /api/export** returns all of your data (personas, ontologies, world state, summaries, claims, annotations).
- **GET /api/export/stats** counts only your data.
- **GET /api/export/personas** returns your personas and their ontologies.
- **GET /api/export/world** returns your world state objects.
- **GET /api/export/summaries** returns summaries tied to your personas, along with their claims and claim relations.

If you pass a `personaIds` filter, the export intersects the requested persona IDs with your own personas. Requesting another user's persona ID returns no results.

## Export formats

Set the `format` query parameter to control output:

| Value    | Content-Type             | Description                                  |
|----------|--------------------------|----------------------------------------------|
| `jsonl`  | `application/x-ndjson`   | One JSON object per line (default)           |
| `json`   | `application/json`       | A single JSON array containing all objects   |

## Filtering annotations

The main export endpoint (`GET /api/export`) accepts these optional filters:

- `personaIds` (comma-separated): restrict annotations to specific personas.
- `videoIds` (comma-separated): restrict annotations to specific videos.
- `annotationTypes` (comma-separated): restrict annotations by type (`type`, `object`).
- `includeInterpolated` (boolean): include all interpolated frames in bounding box sequences.

## Export headers

Response headers provide summary counts for the exported data:

- `X-Export-Personas`
- `X-Export-Ontologies`
- `X-Export-Summaries`
- `X-Export-Claims`
- `X-Export-ClaimRelations`
- `X-Export-Annotations`
- `X-Export-Entities`, `X-Export-Events`, `X-Export-Times`
