---
title: Claims API
sidebar_position: 9
---

# Claims API

The Claims API provides endpoints for creating, retrieving, updating, and deleting claims and subclaims, as well as creating and managing claim relations. Claims are atomic factual assertions extracted from or manually added to video summaries.

## Overview

Claims support:

- Hierarchical structure (claims with subclaims)
- Typed relations between claims
- Automatic and manual creation
- Rich text with gloss references
- Confidence scores and attribution
- Async extraction via job queues

## Data Model

### Claim Object

```typescript
{
  id: string                      // UUID
  summaryId: string               // Parent summary UUID
  summaryType: "video" | "collection"
  text: string                    // Plain text content
  gloss: GlossItem[]              // Rich text with references
  parentClaimId?: string | null   // Parent claim (if subclaim)
  textSpans?: ClaimTextSpan[]     // Source spans in summary text
  claimerType?: string | null     // Who made the claim
  claimerGloss?: GlossItem[]      // Rich text for claimer
  claimRelation?: GlossItem[]     // Claim relation (believes, states, etc.)
  claimEventId?: string | null    // Event context
  claimTimeId?: string | null     // Temporal context
  claimLocationId?: string | null // Spatial context
  confidence?: number | null      // 0-1 confidence score
  modelUsed?: string | null       // AI model ID (if extracted)
  extractionStrategy?: string | null // sentence-based, semantic-units, hierarchical
  createdBy?: string | null       // User ID
  createdAt: string               // ISO 8601 timestamp
  updatedAt: string               // ISO 8601 timestamp
  subclaims?: Claim[]             // Nested subclaims (recursive)
}
```

### GlossItem

```typescript
{
  type: "text" | "typeRef" | "objectRef" | "annotationRef" | "claimRef"
  content: string
  refType?: string                // For typeRef
  refPersonaId?: string | null    // For typeRef
  refClaimId?: string             // For claimRef
}
```

### ClaimTextSpan

```typescript
{
  sentenceIndex?: number          // Sentence index in source
  charStart: number               // Character start position
  charEnd: number                 // Character end position
}
```

### ClaimRelation

```typescript
{
  id: string                      // UUID
  sourceClaimId: string           // Source claim UUID
  targetClaimId: string           // Target claim UUID
  relationTypeId: string          // Relation type from ontology
  confidence?: number | null      // 0-1 confidence score
  notes?: string | null           // Optional notes
  createdAt: string               // ISO 8601 timestamp
  updatedAt: string               // ISO 8601 timestamp
}
```

## Endpoints

### List Claims for Summary

Get all root claims for a video summary.

```http
GET /api/summaries/:summaryId/claims
```

**Query Parameters:**
- `includeSubclaims` (boolean, optional): Include nested subclaims (default: true)

**Response 200:**
```json
[
  {
    "id": "claim-uuid",
    "summaryId": "summary-uuid",
    "summaryType": "video",
    "text": "The rocket launched on December 25, 2021",
    "gloss": [
      {"type": "text", "content": "The rocket launched on December 25, 2021"}
    ],
    "confidence": 0.95,
    "modelUsed": "qwen-2-5-7b",
    "extractionStrategy": "sentence-based",
    "createdAt": "2025-01-20T10:30:00Z",
    "updatedAt": "2025-01-20T10:30:00Z",
    "subclaims": [
      {
        "id": "subclaim-uuid",
        "parentClaimId": "claim-uuid",
        "text": "Rocket launched",
        "confidence": 0.98,
        "createdAt": "2025-01-20T10:30:00Z",
        "updatedAt": "2025-01-20T10:30:00Z"
      }
    ]
  }
]
```

### Get Single Claim

Retrieve a specific claim by ID.

```http
GET /api/claims/:claimId
```

**Response 200:**
```json
{
  "id": "claim-uuid",
  "summaryId": "summary-uuid",
  "text": "The rocket launched on December 25, 2021",
  "gloss": [...],
  "confidence": 0.95,
  "subclaims": [...]
}
```

**Response 404:**
```json
{
  "error": "Claim not found"
}
```

### Create Claim

Create a new claim or subclaim.

```http
POST /api/summaries/:summaryId/claims
Content-Type: application/json
```

**Request Body:**
```json
{
  "summaryType": "video",
  "text": "The rocket launched on December 25, 2021",
  "gloss": [
    {"type": "text", "content": "The rocket launched on December 25, 2021"}
  ],
  "parentClaimId": null,              // Optional: UUID of parent (for subclaims)
  "textSpans": [                      // Optional
    {"sentenceIndex": 0, "charStart": 0, "charEnd": 42}
  ],
  "claimerType": "author",            // Optional
  "confidence": 0.9                   // Optional, 0-1
}
```

**Response 201:**
```json
{
  "id": "claim-uuid",
  "summaryId": "summary-uuid",
  "text": "The rocket launched on December 25, 2021",
  "gloss": [...],
  "confidence": 0.9,
  "createdAt": "2025-01-20T10:30:00Z",
  "updatedAt": "2025-01-20T10:30:00Z"
}
```

### Update Claim

Update an existing claim.

```http
PUT /api/claims/:claimId
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Updated claim text",
  "gloss": [...],                     // Optional
  "confidence": 0.85,                 // Optional
  "claimerType": "entity",            // Optional
  "notes": "Updated based on new evidence"
}
```

**Response 200:**
```json
{
  "id": "claim-uuid",
  "text": "Updated claim text",
  "confidence": 0.85,
  "updatedAt": "2025-01-20T11:00:00Z"
}
```

### Delete Claim

Delete a claim and all its subclaims (cascade).

```http
DELETE /api/claims/:claimId
```

**Response 200:**
```json
{
  "message": "Claim and 3 subclaims deleted successfully"
}
```

**Response 404:**
```json
{
  "error": "Claim not found"
}
```

## Claim Extraction

### Start Claim Extraction Job

Extract claims from a video summary using AI.

```http
POST /api/summaries/:summaryId/claims/extract
Content-Type: application/json
```

**Request Body:**
```json
{
  "strategy": "sentence-based",       // sentence-based, semantic-units, hierarchical
  "maxClaims": 50,                    // Max claims to extract
  "minConfidence": 0.5,               // Minimum confidence threshold (0-1)
  "includeAnnotations": true,         // Include @object references
  "includeOntology": true,            // Include #type references
  "ontologyDepth": "names-only"       // names-only, names-and-glosses, full
}
```

**Response 202:**
```json
{
  "jobId": "job-uuid",
  "status": "queued",
  "message": "Claim extraction job started"
}
```

### Check Extraction Job Status

Poll job status until completion.

```http
GET /api/jobs/:jobId
```

**Response 200 (queued/active):**
```json
{
  "jobId": "job-uuid",
  "state": "active",
  "progress": 65,
  "createdAt": "2025-01-20T10:30:00Z",
  "startedAt": "2025-01-20T10:30:15Z"
}
```

**Response 200 (completed):**
```json
{
  "jobId": "job-uuid",
  "state": "completed",
  "progress": 100,
  "result": {
    "claimIds": ["claim-1", "claim-2", "claim-3"],
    "count": 3,
    "extractionTime": 45.2
  },
  "createdAt": "2025-01-20T10:30:00Z",
  "completedAt": "2025-01-20T10:31:15Z"
}
```

**Response 200 (failed):**
```json
{
  "jobId": "job-uuid",
  "state": "failed",
  "error": "Model service timeout",
  "failedReason": "Connection timeout after 60s",
  "createdAt": "2025-01-20T10:30:00Z",
  "failedAt": "2025-01-20T10:31:00Z"
}
```

## Claim Relations

### List Relations for Claim

Get all outgoing and incoming relations for a claim.

```http
GET /api/claims/:claimId/relations
```

**Response 200:**
```json
{
  "outgoing": [
    {
      "id": "relation-uuid",
      "sourceClaimId": "claim-uuid",
      "targetClaimId": "target-claim-uuid",
      "relationTypeId": "supports",
      "confidence": 0.85,
      "notes": "Supporting evidence",
      "createdAt": "2025-01-20T10:30:00Z"
    }
  ],
  "incoming": [
    {
      "id": "relation-uuid-2",
      "sourceClaimId": "source-claim-uuid",
      "targetClaimId": "claim-uuid",
      "relationTypeId": "conflicts-with",
      "confidence": 0.7,
      "createdAt": "2025-01-20T10:35:00Z"
    }
  ]
}
```

### Create Claim Relation

Create a typed relation between two claims.

```http
POST /api/claims/:sourceClaimId/relations
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetClaimId": "target-claim-uuid",
  "relationTypeId": "supports",       // From ontology
  "confidence": 0.85,                 // Optional, 0-1
  "notes": "This claim provides supporting evidence"
}
```

**Response 201:**
```json
{
  "id": "relation-uuid",
  "sourceClaimId": "source-claim-uuid",
  "targetClaimId": "target-claim-uuid",
  "relationTypeId": "supports",
  "confidence": 0.85,
  "notes": "This claim provides supporting evidence",
  "createdAt": "2025-01-20T10:30:00Z",
  "updatedAt": "2025-01-20T10:30:00Z"
}
```

### Delete Claim Relation

Remove a relation between two claims.

```http
DELETE /api/claims/relations/:relationId
```

**Response 200:**
```json
{
  "message": "Claim relation deleted successfully"
}
```

## Filtering and Search

### Filter Claims by Confidence

```http
GET /api/summaries/:summaryId/claims?minConfidence=0.7
```

Returns only claims with confidence ≥ 0.7.

### Search Claim Text

```http
GET /api/summaries/:summaryId/claims?search=rocket
```

Returns claims containing "rocket" in text or gloss.

### Filter by Extraction Strategy

```http
GET /api/summaries/:summaryId/claims?strategy=sentence-based
```

Returns only claims extracted with "sentence-based" strategy.

### Filter by Model

```http
GET /api/summaries/:summaryId/claims?model=qwen-2-5-7b
```

Returns claims extracted by specific AI model.

## Batch Operations

### Delete All Claims for Summary

```http
DELETE /api/summaries/:summaryId/claims
```

**Response 200:**
```json
{
  "message": "Deleted 25 claims successfully"
}
```

### Bulk Create Claims

```http
POST /api/summaries/:summaryId/claims/bulk
Content-Type: application/json
```

**Request Body:**
```json
{
  "claims": [
    {
      "text": "Claim 1",
      "confidence": 0.9
    },
    {
      "text": "Claim 2",
      "confidence": 0.85
    }
  ]
}
```

**Response 201:**
```json
{
  "created": 2,
  "claimIds": ["claim-1", "claim-2"]
}
```

## Error Responses

### 400 Bad Request

Invalid request data.

```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "confidence",
      "message": "must be between 0 and 1"
    }
  ]
}
```

### 401 Unauthorized

Not authenticated.

```json
{
  "error": "Authentication required"
}
```

### 404 Not Found

Resource not found.

```json
{
  "error": "Claim not found"
}
```

### 409 Conflict

Conflicting operation.

```json
{
  "error": "Claim relation already exists between these claims"
}
```

### 500 Internal Server Error

Server error.

```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

## Examples

### Complete Workflow: Extract and Edit Claims

```typescript
// 1. Start extraction
const extractResponse = await fetch(
  `/api/summaries/${summaryId}/claims/extract`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: 'hierarchical',
      maxClaims: 20,
      minConfidence: 0.7,
      includeAnnotations: true
    })
  }
)
const { jobId } = await extractResponse.json()

// 2. Poll job status
let jobComplete = false
while (!jobComplete) {
  const statusResponse = await fetch(`/api/jobs/${jobId}`)
  const status = await statusResponse.json()

  if (status.state === 'completed') {
    jobComplete = true
    console.log(`Extracted ${status.result.count} claims`)
  } else if (status.state === 'failed') {
    throw new Error(status.error)
  }

  await new Promise(resolve => setTimeout(resolve, 1000))
}

// 3. Get extracted claims
const claimsResponse = await fetch(`/api/summaries/${summaryId}/claims`)
const claims = await claimsResponse.json()

// 4. Update a claim
const claimId = claims[0].id
await fetch(`/api/claims/${claimId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Updated claim text',
    confidence: 0.95
  })
})

// 5. Create a relation
await fetch(`/api/claims/${claimId}/relations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    targetClaimId: claims[1].id,
    relationTypeId: 'supports',
    confidence: 0.85
  })
})
```

## Rate Limiting

Claims API endpoints are rate-limited:

- **Extraction jobs**: 10 per minute per user
- **CRUD operations**: 100 per minute per user
- **Relation operations**: 50 per minute per user

Exceeded limits return HTTP 429:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 30
}
```

## See Also

- [User Guide: Claims Overview](../user-guides/claims/overview.md)
- [User Guide: Claim Extraction](../user-guides/claims/extraction.md)
- [User Guide: Editing Claims](../user-guides/claims/editing.md)
- [User Guide: Claim Relations](../user-guides/claims/relations.md)
- [Model Service: Claim Extraction](./model-service/claim_extraction.md)
- [Concepts: Job Queues](../concepts/job-queues.md)
