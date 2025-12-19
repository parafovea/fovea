# Claims API Reference

This document describes the REST API endpoints for managing claims and subclaims in FOVEA.

## Base URL

All endpoints are relative to: `/api/summaries/:summaryId/claims`

## Authentication

All endpoints require authentication via session cookie.

---

## Endpoints

### Get All Claims

Retrieve all claims for a summary, including subclaims.

```http
GET /api/summaries/:summaryId/claims
```

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| summaryId | UUID | Path | Yes | ID of the video/collection summary |
| summaryType | string | Query | No | Type of summary (`video` or `collection`) |
| includeSubclaims | boolean | Query | No | Include nested subclaims (default: `true`) |
| minConfidence | number | Query | No | Minimum confidence threshold (0-1) |

#### Response

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "summaryId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "summaryType": "video",
    "text": "The JWST was launched on December 25, 2021",
    "gloss": [
      { "type": "text", "content": "The " },
      { "type": "objectRef", "content": "JWST", "refPersonaId": "...", "refType": "entity-object" },
      { "type": "text", "content": " was launched on December 25, 2021" }
    ],
    "sourceSpans": [
      { "charStart": 0, "charEnd": 47 }
    ],
    "confidence": 0.95,
    "extractionStrategy": "sentence-based",
    "modelUsed": "gpt-4",
    "parentClaimId": null,
    "subclaims": [
      {
        "id": "...",
        "text": "JWST was launched",
        "confidence": 0.98,
        "subclaims": []
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

### Get Single Claim

Retrieve a specific claim by ID.

```http
GET /api/summaries/:summaryId/claims/:claimId
```

#### Response

Returns a single claim object (same format as above).

---

### Create Claim

Create a new claim.

```http
POST /api/summaries/:summaryId/claims
```

#### Request Body

```json
{
  "text": "The telescope has a 6.5-meter primary mirror",
  "gloss": [
    { "type": "text", "content": "The telescope has a 6.5-meter primary mirror" }
  ],
  "sourceSpans": [
    { "charStart": 100, "charEnd": 145 }
  ],
  "confidence": 0.9,
  "parentClaimId": null,
  "extractionStrategy": "manual",
  "notes": "Manually added claim"
}
```

#### Response

```json
{
  "claims": [
    // Full claim tree including newly created claim
  ]
}
```

---

### Update Claim

Update an existing claim.

```http
PUT /api/summaries/:summaryId/claims/:claimId
```

#### Request Body

```json
{
  "text": "Updated claim text",
  "gloss": [...],
  "confidence": 0.85,
  "notes": "Corrected based on additional review"
}
```

#### Response

```json
{
  "claims": [
    // Updated claim tree
  ]
}
```

---

### Delete Claim

Delete a claim (cascades to subclaims).

```http
DELETE /api/summaries/:summaryId/claims/:claimId
```

#### Response

```http
204 No Content
```

---

## Claim Extraction

### Extract Claims

Queue a job to extract claims from a summary using LLM.

```http
POST /api/summaries/:summaryId/claims/generate
```

#### Request Body

```json
{
  "inputSources": {
    "includeSummaryText": true,
    "includeAnnotations": true,
    "includeOntology": true,
    "ontologyDepth": "names-and-glosses"
  },
  "extractionStrategy": "hierarchical",
  "maxClaimsPerSummary": 50,
  "maxSubclaimDepth": 3,
  "minConfidence": 0.7,
  "modelId": "gpt-4"
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| extractionStrategy | enum | Yes | `sentence-based`, `semantic-units`, or `hierarchical` |
| maxClaimsPerSummary | number | No | Max root claims (default: 50) |
| maxSubclaimDepth | number | No | Max nesting depth (default: 3) |
| minConfidence | number | No | Filter threshold (default: 0.5) |
| modelId | string | No | Specific LLM to use |

#### Response

```json
{
  "jobId": "claim-extraction-123456",
  "status": "queued"
}
```

---

### Check Extraction Job Status

Get the status of a claim extraction job.

```http
GET /api/jobs/claims/:jobId
```

#### Response

```json
{
  "jobId": "claim-extraction-123456",
  "status": "completed",
  "progress": 100,
  "result": {
    "claimsExtracted": 15,
    "subclaimsExtracted": 42
  },
  "error": null
}
```

**Status values**: `queued`, `processing`, `completed`, `failed`

---

## Claim Synthesis

### Synthesize Summary from Claims

Generate a summary from existing claims.

```http
POST /api/summaries/:summaryId/synthesize
```

#### Request Body

```json
{
  "synthesis_strategy": "hierarchical",
  "include_confidence": false,
  "model_id": "gpt-4"
}
```

#### Response

```json
{
  "jobId": "synthesis-789012",
  "status": "queued"
}
```

---

## Claim Relations

### Create Claim Relation

Create a typed relationship between two claims.

```http
POST /api/summaries/:summaryId/claims/:claimId/relations
```

#### Request Body

```json
{
  "targetClaimId": "uuid-of-target-claim",
  "relationTypeId": "conflicts-with",
  "confidence": 0.85,
  "notes": "These claims provide contradictory information about the launch date",
  "sourceSpans": [
    { "charStart": 10, "charEnd": 25 }
  ],
  "targetSpans": [
    { "charStart": 5, "charEnd": 20 }
  ]
}
```

#### Response

```json
{
  "id": "relation-uuid",
  "sourceClaimId": "uuid",
  "targetClaimId": "uuid",
  "relationTypeId": "conflicts-with",
  "confidence": 0.85,
  "notes": "...",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### Get Claim Relations

Get all relations for a claim (both incoming and outgoing).

```http
GET /api/summaries/:summaryId/claims/:claimId/relations
```

#### Response

```json
{
  "asSource": [
    {
      "id": "relation-uuid",
      "targetClaimId": "uuid",
      "relationTypeId": "supports",
      "confidence": 0.9
    }
  ],
  "asTarget": [
    {
      "id": "relation-uuid-2",
      "sourceClaimId": "uuid",
      "relationTypeId": "conflicts-with",
      "confidence": 0.8
    }
  ]
}
```

---

### Delete Claim Relation

Remove a claim relation.

```http
DELETE /api/summaries/:summaryId/claims/relations/:relationId
```

#### Response

```json
{
  "success": true
}
```

---

## Error Responses

All endpoints may return standard error responses:

### 400 Bad Request

```json
{
  "error": "Invalid relation type: must be defined in persona's ontology"
}
```

### 404 Not Found

```json
{
  "error": "Summary not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

---

## Data Models

### Claim

```typescript
interface Claim {
  id: string
  summaryId: string
  summaryType: 'video' | 'collection'
  text: string
  gloss: GlossItem[]
  sourceSpans: ClaimSpan[]
  confidence: number | null
  extractionStrategy?: string
  modelUsed?: string
  notes?: string
  parentClaimId?: string | null
  subclaims?: Claim[]
  createdAt: string
  updatedAt: string
}
```

### ClaimSpan

```typescript
interface ClaimSpan {
  charStart: number
  charEnd: number
}
```

### ClaimRelation

```typescript
interface ClaimRelation {
  id: string
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
  sourceSpans?: ClaimSpan[]
  targetSpans?: ClaimSpan[]
  confidence?: number
  notes?: string
  createdAt: string
  updatedAt: string
}
```

---

## Rate Limiting

- Extraction and synthesis endpoints: 10 requests per minute per user
- CRUD endpoints: 100 requests per minute per user

## Pagination

Currently, claims are returned without pagination. For summaries with >1000 claims, consider using filters to reduce the result set.

## See Also

- [Model Service Claims Documentation](/docs/model-service/claim-extraction.md)
- [User Guide: Claims Overview](/docs/user-guides/claims/overview.md)
- [Development Guide](/docs/development.md)
