# Claim Extraction - Model Service Documentation

## Overview

The claim extraction module automatically extracts atomic factual statements (claims) from video summaries using large language models. This document details the technical architecture, prompt engineering, and implementation.

## Architecture

### Components

```
┌─────────────────────────────────────────────────┐
│ API Endpoint (/api/summaries/:id/claims/extract) │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ BullMQ Job Queue (claim-extraction)              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Claim Extraction Worker                          │
│ - Fetch summary and context                      │
│ - Build extraction prompt                        │
│ - Call LLM API                                   │
│ - Parse and validate response                    │
│ - Save claims to database                        │
└─────────────────────────────────────────────────┘
```

### Job Queue

**Queue**: `claim-extraction`
**Concurrency**: 3 jobs
**Timeout**: 5 minutes per job
**Retry**: 3 attempts with exponential backoff

### Database Schema

Claims are stored in the `Claim` table with:
- Hierarchical structure (parent/child via `parentClaimId`)
- Full-text search support (GIN index on text)
- Metadata (confidence, model, strategy)
- Relations (separate `ClaimRelation` table)

## Extraction Strategies

### 1. Sentence-Based

**Description**: Extracts one claim per sentence, with hierarchical decomposition for complex sentences.

**Prompt Template**:
```
Extract factual claims from the following summary. For each sentence:
1. Identify the main claim
2. If the sentence is complex, decompose into subclaims
3. Format as JSON with claim text, confidence, and subclaims array

Summary:
{summary_text}

Ontology Context:
{ontology_context}

Output Format:
[
  {
    "text": "Main claim text",
    "confidence": 0.9,
    "subclaims": [
      {"text": "Supporting detail", "confidence": 0.85}
    ]
  }
]
```

**Strengths**:
- Straightforward and predictable
- Good for structured content
- Preserves sentence-level organization

**Weaknesses**:
- May split naturally unified concepts
- Sentence boundaries may not align with claim boundaries

### 2. Semantic Units

**Description**: Extracts claims from logical/semantic chunks rather than sentences.

**Prompt Template**:
```
Extract factual claims from the following summary. Identify semantic units
of meaning that form complete, standalone claims. Claims may span multiple
sentences or be parts of sentences.

Guidelines:
- Extract claims that represent complete thoughts
- Maintain logical coherence
- Preserve domain-specific terminology
- Include confidence scores (0-1)

Summary:
{summary_text}

Context:
{context}

Output as JSON array of claim objects.
```

**Strengths**:
- Better semantic coherence
- Captures conceptual relationships
- Flexible claim boundaries

**Weaknesses**:
- More subjective
- Requires stronger language model
- May miss fine-grained details

### 3. Hierarchical

**Description**: Top-down decomposition creating multi-level claim hierarchies.

**Prompt Template**:
```
Extract claims using hierarchical decomposition:

Level 1: Extract main thesis/conclusions (2-5 claims)
Level 2: For each Level 1 claim, extract supporting arguments (2-4 each)
Level 3: For complex Level 2 claims, extract evidence/details (1-3 each)

Summary:
{summary_text}

Additional Context:
{context}

Create a tree structure with each node containing:
- claim text
- confidence score
- subclaims array (recursive)

Maximum depth: 3 levels
```

**Strengths**:
- Systematic organization
- Clear argument structure
- Good for complex topics

**Weaknesses**:
- May impose structure where none exists
- Can be over-engineered for simple content
- Requires careful prompt tuning

## Prompt Engineering

### Input Context

**Required**:
- Summary text (always included)

**Optional**:
- Annotations (enables @references)
- Ontology (enables #references)
  - Names only
  - Names + glosses
  - Full definitions

### Context Assembly

```python
def build_context(config):
    context = {
        "summary": summary.text,
    }

    if config.includeAnnotations:
        context["annotations"] = fetch_annotations()

    if config.includeOntology:
        if config.ontologyDepth == "names-only":
            context["ontology"] = fetch_entity_names()
        elif config.ontologyDepth == "names-and-glosses":
            context["ontology"] = fetch_entities_with_glosses()
        else:  # full-definitions
            context["ontology"] = fetch_full_ontology()

    return context
```

### Response Parsing

The LLM returns JSON in this format:

```json
[
  {
    "text": "Baseball is a popular sport",
    "confidence": 0.9,
    "textSpans": [{"charStart": 0, "charEnd": 30}],
    "subclaims": [
      {
        "text": "Baseball has professional leagues",
        "confidence": 0.85,
        "textSpans": [{"charStart": 32, "charEnd": 65}],
        "subclaims": []
      }
    ]
  }
]
```

**Validation**:
1. Check JSON structure
2. Validate required fields (text, confidence)
3. Verify confidence range (0-1)
4. Validate textSpan indices
5. Recursively validate subclaims
6. Check max depth (default: 3)
7. Check max claims (configurable, default: 50)

### Error Handling

**Parsing Errors**:
- Log full response
- Attempt partial recovery
- Fall back to text extraction only
- Set confidence to 0.5 for recovered claims

**API Errors**:
- Retry with exponential backoff
- Try alternative model if available
- Save error details to job metadata

**Validation Errors**:
- Filter invalid claims
- Save valid subset
- Log validation failures

## Model Configuration

### Supported Models

- **GPT-4**: Best quality, slower, more expensive
- **GPT-3.5-turbo**: Good balance, faster
- **Claude 3**: Alternative, good for nuanced content
- **Llama 3 70B**: Open-source option
- **Qwen 2.5**: Multilingual support

### Model Selection

```python
def select_model(config):
    if config.modelId:
        return config.modelId

    # Auto-select based on content
    if summary.length > 10000:
        return "gpt-4"  # Better for long content
    elif summary.has_technical_content():
        return "claude-3"  # Better for complex reasoning
    else:
        return "gpt-3.5-turbo"  # Default
```

### API Parameters

```json
{
  "temperature": 0.3,
  "max_tokens": 4000,
  "top_p": 0.9,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "response_format": {"type": "json_object"}
}
```

## Post-Processing

### Deduplication

```python
def deduplicate_claims(claims):
    seen = set()
    unique = []

    for claim in claims:
        # Normalize text
        normalized = normalize_text(claim.text)

        # Check for duplicates using edit distance
        if not any(edit_distance(normalized, seen_text) < threshold
                   for seen_text in seen):
            seen.add(normalized)
            unique.append(claim)

    return unique
```

### Merging Similar Claims

```python
def merge_similar_claims(claims, threshold=0.85):
    clusters = cluster_by_similarity(claims, threshold)

    merged = []
    for cluster in clusters:
        if len(cluster) == 1:
            merged.append(cluster[0])
        else:
            # Merge cluster into single claim
            merged_claim = merge_cluster(cluster)
            merged.append(merged_claim)

    return merged
```

### Confidence Adjustment

```python
def adjust_confidence(claim, factors):
    base_confidence = claim.confidence

    # Adjust based on source reliability
    if factors.has_strong_source:
        base_confidence *= 1.1

    # Adjust based on evidence count
    evidence_factor = min(1.2, 1.0 + factors.evidence_count * 0.05)
    base_confidence *= evidence_factor

    # Adjust based on contradictions
    if factors.has_contradiction:
        base_confidence *= 0.7

    # Clamp to [0, 1]
    return max(0, min(1, base_confidence))
```

## API Endpoints

### Start Extraction

```http
POST /api/summaries/:summaryId/claims/extract
Content-Type: application/json

{
  "config": {
    "inputSources": {
      "includeSummaryText": true,
      "includeAnnotations": true,
      "includeOntology": true,
      "ontologyDepth": "names-and-glosses"
    },
    "extractionStrategy": "sentence-based",
    "maxClaimsPerSummary": 50,
    "minConfidence": 0.5,
    "modelId": "gpt-4"
  }
}
```

**Response**:
```json
{
  "jobId": "job_abc123",
  "status": "queued",
  "summaryId": "summary-1",
  "summaryType": "video"
}
```

### Check Status

```http
GET /api/jobs/:jobId/status
```

**Response**:
```json
{
  "jobId": "job_abc123",
  "status": "completed",
  "progress": 100,
  "result": {
    "claimsExtracted": 23,
    "subclaimsExtracted": 47,
    "maxDepth": 2,
    "modelUsed": "gpt-4"
  }
}
```

## Performance Optimization

### Caching

- Cache ontology context (TTL: 1 hour)
- Cache entity definitions (TTL: 24 hours)
- Cache LLM responses for identical prompts (TTL: 7 days)

### Batch Processing

- Process multiple summaries in parallel
- Group similar summaries for context sharing
- Reuse model instances across jobs

### Cost Management

- Track token usage per extraction
- Implement rate limiting
- Use cheaper models for simple content
- Cache and reuse results when possible

## Monitoring and Logging

### Metrics

- Extraction success rate
- Average claims per summary
- Average processing time
- Model API latency
- Token usage per extraction
- Error rates by type

### Logging

```python
logger.info("claim_extraction_started", {
    "summary_id": summary.id,
    "strategy": config.strategy,
    "model": model_id
})

logger.info("claim_extraction_completed", {
    "summary_id": summary.id,
    "claims_count": len(claims),
    "duration_ms": duration,
    "tokens_used": tokens
})
```

## Testing

### Unit Tests

- Test prompt template generation
- Test response parsing
- Test validation logic
- Test deduplication
- Test error handling

### Integration Tests

- Test full extraction pipeline
- Test with various models
- Test with different strategies
- Test error scenarios

### Evaluation Metrics

- Precision: % of extracted claims that are valid
- Recall: % of valid claims extracted
- F1 Score: Harmonic mean of precision/recall
- User satisfaction: Manual review ratings

## See Also

- [Claim Synthesis](./claim-synthesis.md)
- [Claims API Reference](/docs/api/claims-endpoints.md)
- [User Guide: Extraction](/docs/user-guides/claims/extraction.md)
