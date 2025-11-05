# Claim Synthesis - Model Service Documentation

## Overview

The claim synthesis module generates coherent summaries from extracted claims, enabling reverse transformation from structured claim data back to natural language text. This document details the synthesis process, prompt strategies, and implementation.

## Purpose

Claim synthesis serves multiple use cases:
- Generate alternative summary versions
- Create targeted summaries from claim subsets
- Produce explanatory text from claim networks
- Generate reports with claim-based evidence
- Create multi-perspective narratives

## Architecture

```
┌─────────────────────────────────────────────────┐
│ API Endpoint (/api/summaries/:id/claims/synthesize) │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ BullMQ Job Queue (claim-synthesis)               │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Claim Synthesis Worker                           │
│ - Fetch claims and relations                     │
│ - Build synthesis prompt                         │
│ - Call LLM API                                   │
│ - Post-process generated text                    │
│ - Save synthesized summary                       │
└─────────────────────────────────────────────────┘
```

## Synthesis Strategies

### 1. Hierarchical Synthesis (Default)

**Description**: Synthesize text by traversing claim hierarchy top-down.

**Process**:
1. Start with root claims
2. Generate paragraph for each root claim
3. Integrate subclaims as supporting sentences
4. Maintain hierarchical flow
5. Add transitions between paragraphs

**Prompt Template**:
```
Generate a coherent summary from the following hierarchical claims.
Maintain the logical structure and relationships.

Root Claims and Subclaims:
{hierarchical_claims_json}

Guidelines:
- Each root claim should become a paragraph
- Subclaims should be integrated as supporting sentences
- Use appropriate transitions
- Maintain factual accuracy
- Preserve confidence levels (mention only high-confidence claims)

Target length: {word_count} words
Writing style: {style}

Output the synthesized summary as natural prose.
```

### 2. Relation-Based Synthesis

**Description**: Synthesize text following claim relationships (supports, causes, etc.).

**Process**:
1. Identify central claims
2. Follow relation paths (supports, causes, implies)
3. Generate text that explains relationships
4. Create argumentative or explanatory structure
5. Highlight key connections

**Prompt Template**:
```
Generate a summary that explains the relationships between these claims.

Claims:
{claims_list}

Relations:
{relations_list}

Focus on explaining:
- How claims support each other
- Causal relationships
- Conflicts and contradictions
- Logical implications

Create a flowing narrative that makes these relationships clear.
```

### 3. Filtered Synthesis

**Description**: Synthesize from a subset of claims matching specific criteria.

**Use Cases**:
- High-confidence claims only
- Claims from specific time period
- Claims about specific entities
- Claims with particular attributes

**Prompt Template**:
```
Generate a focused summary using only these filtered claims.

Filter criteria: {filter_description}

Selected Claims:
{filtered_claims}

Create a coherent summary that:
- Covers the filtered claims comprehensively
- Maintains logical flow despite gaps
- Indicates scope limitations where appropriate
- Preserves factual accuracy

Target audience: {audience}
```

### 4. Multi-Perspective Synthesis

**Description**: Generate multiple summaries representing different viewpoints.

**Process**:
1. Group claims by claimer or perspective
2. Generate separate summary for each perspective
3. Optional: Generate comparative synthesis
4. Highlight agreements and disagreements

**Prompt Template**:
```
Generate {n} different summaries representing distinct perspectives.

Claims by Perspective:
Perspective 1: {claims_p1}
Perspective 2: {claims_p2}
...

For each perspective:
1. Generate a summary using only those claims
2. Maintain that perspective's viewpoint
3. Include attribution where appropriate
4. Indicate confidence levels

Then create a brief comparative analysis highlighting key differences.
```

## Input Processing

### Claim Preparation

```python
def prepare_claims_for_synthesis(claims, config):
    """
    Transform claims into LLM-friendly format
    """
    prepared = []

    for claim in claims:
        # Resolve references
        text = resolve_references(claim.text, claim.gloss)

        # Include metadata if configured
        claim_obj = {
            "text": text,
            "confidence": claim.confidence
        }

        if config.includeMetadata:
            claim_obj.update({
                "strategy": claim.extractionStrategy,
                "model": claim.modelUsed
            })

        if config.includeSubclaims:
            claim_obj["subclaims"] = prepare_claims_for_synthesis(
                claim.subclaims, config
            )

        prepared.append(claim_obj)

    return prepared
```

### Relation Preparation

```python
def prepare_relations_for_synthesis(claims, relations):
    """
    Format relations for LLM consumption
    """
    formatted_relations = []

    for relation in relations:
        source = find_claim(claims, relation.sourceClaimId)
        target = find_claim(claims, relation.targetClaimId)
        rel_type = get_relation_type_name(relation.relationTypeId)

        formatted_relations.append({
            "source": abbreviate_claim(source.text),
            "relation": rel_type,
            "target": abbreviate_claim(target.text),
            "confidence": relation.confidence
        })

    return formatted_relations
```

## Synthesis Configuration

### Parameters

```typescript
interface SynthesisConfig {
  // Claims selection
  claimIds?: string[]              // Specific claims (null = all)
  minConfidence?: number           // Filter by confidence
  includeSubclaims: boolean        // Include hierarchical structure

  // Relations
  includeRelations: boolean        // Use relations in synthesis
  relationTypes?: string[]         // Specific relation types

  // Output control
  targetWordCount?: number         // Desired length (approx)
  style: "formal" | "casual" | "technical" | "narrative"
  audience: "general" | "expert" | "student"

  // Model settings
  modelId?: string                 // LLM to use
  temperature: number              // Creativity (0.3-0.8)

  // Post-processing
  includeAttributions: boolean     // Add claimer info
  includeCitations: boolean        // Reference claim IDs
  preserveStructure: boolean       // Maintain hierarchy
}
```

### Default Settings

```python
DEFAULT_SYNTHESIS_CONFIG = {
    "includeSubclaims": True,
    "includeRelations": False,
    "targetWordCount": 500,
    "style": "formal",
    "audience": "general",
    "temperature": 0.5,
    "includeAttributions": False,
    "includeCitations": False,
    "preserveStructure": True
}
```

## Post-Processing

### Citation Insertion

```python
def insert_citations(synthesized_text, claims):
    """
    Add claim references to generated text
    """
    # Match sentences to claims
    sentences = segment_sentences(synthesized_text)
    annotated = []

    for sentence in sentences:
        matching_claims = find_matching_claims(sentence, claims)

        if matching_claims:
            # Add citation
            claim_ids = [c.id[:8] for c in matching_claims]
            citation = f" [Claims: {', '.join(claim_ids)}]"
            annotated.append(sentence + citation)
        else:
            annotated.append(sentence)

    return " ".join(annotated)
```

### Fact Checking

```python
def verify_synthesis(synthesized_text, source_claims):
    """
    Verify synthesized text against source claims
    """
    issues = []

    # Check for unsupported statements
    sentences = segment_sentences(synthesized_text)

    for sentence in sentences:
        if not has_claim_support(sentence, source_claims):
            issues.append({
                "sentence": sentence,
                "issue": "unsupported_statement",
                "severity": "warning"
            })

    # Check for contradictions
    for claim in source_claims:
        if contradicts_claim(synthesized_text, claim):
            issues.append({
                "claim": claim.text,
                "issue": "contradiction",
                "severity": "error"
            })

    return issues
```

### Quality Scoring

```python
def score_synthesis_quality(synthesized_text, source_claims):
    """
    Assign quality score to synthesis
    """
    scores = {
        "coverage": calculate_claim_coverage(synthesized_text, source_claims),
        "coherence": calculate_coherence(synthesized_text),
        "fluency": calculate_fluency(synthesized_text),
        "factuality": calculate_factuality(synthesized_text, source_claims),
        "conciseness": calculate_conciseness(synthesized_text, target_length)
    }

    # Weighted average
    weights = {"coverage": 0.3, "coherence": 0.2, "fluency": 0.2,
               "factuality": 0.2, "conciseness": 0.1}

    overall_score = sum(scores[k] * weights[k] for k in scores)

    return {
        "overall": overall_score,
        "component_scores": scores
    }
```

## API Endpoints

### Start Synthesis

```http
POST /api/summaries/:summaryId/claims/synthesize
Content-Type: application/json

{
  "config": {
    "claimIds": null,
    "minConfidence": 0.7,
    "includeSubclaims": true,
    "includeRelations": true,
    "targetWordCount": 500,
    "style": "formal",
    "audience": "general",
    "modelId": "gpt-4",
    "includeAttributions": true
  }
}
```

**Response**:
```json
{
  "jobId": "job_xyz789",
  "status": "queued",
  "summaryId": "summary-1"
}
```

### Get Result

```http
GET /api/jobs/:jobId/result
```

**Response**:
```json
{
  "jobId": "job_xyz789",
  "status": "completed",
  "result": {
    "synthesizedText": "Baseball is widely recognized as...",
    "wordCount": 487,
    "claimsUsed": 23,
    "qualityScore": 0.87,
    "metadata": {
      "modelUsed": "gpt-4",
      "strategy": "hierarchical",
      "tokensUsed": 1234
    }
  }
}
```

## Use Cases

### 1. Generate Executive Summary

```python
config = {
    "minConfidence": 0.8,
    "includeSubclaims": False,  # Top-level only
    "targetWordCount": 200,
    "style": "formal",
    "audience": "expert"
}
```

### 2. Create Student-Friendly Version

```python
config = {
    "minConfidence": 0.6,
    "includeSubclaims": True,
    "targetWordCount": 800,
    "style": "casual",
    "audience": "student",
    "includeAttributions": True  # Show sources
}
```

### 3. Generate Evidence-Based Report

```python
config = {
    "minConfidence": 0.7,
    "includeRelations": True,
    "includeCitations": True,  # Reference claims
    "style": "technical",
    "audience": "expert"
}
```

### 4. Compare Multiple Perspectives

```python
config = {
    "strategy": "multi-perspective",
    "groupBy": "claimer",
    "includeComparison": True,
    "style": "narrative"
}
```

## Performance Optimization

### Prompt Optimization

- Minimize prompt length while maintaining clarity
- Cache common prompt components
- Use few-shot examples efficiently
- Optimize token usage

### Model Selection

```python
def select_synthesis_model(config, claims):
    if config.modelId:
        return config.modelId

    # Auto-select based on requirements
    if config.style == "creative":
        return "claude-3-opus"
    elif len(claims) > 100:
        return "gpt-4-turbo"  # Better for long context
    elif config.targetWordCount < 200:
        return "gpt-3.5-turbo"  # Faster for short synthesis
    else:
        return "gpt-4"  # Default
```

### Caching

- Cache synthesis results for identical claim sets
- Store intermediate representations
- Reuse model outputs for similar requests

## Monitoring

### Metrics

- Synthesis success rate
- Average generation time
- Token usage per synthesis
- Quality scores distribution
- User satisfaction ratings

### Quality Assurance

- Automatic fact-checking against claims
- Coherence scoring
- Coverage analysis
- Manual spot-checking

## Testing

### Automated Tests

```python
def test_hierarchical_synthesis():
    claims = create_test_claims_hierarchy()
    config = {"strategy": "hierarchical"}

    result = synthesize_claims(claims, config)

    assert result.wordCount > 100
    assert result.qualityScore > 0.7
    assert all_claims_mentioned(result.text, claims)

def test_relation_based_synthesis():
    claims, relations = create_test_claim_network()
    config = {"strategy": "relation-based", "includeRelations": True}

    result = synthesize_claims(claims, config)

    assert relations_explained(result.text, relations)
    assert logical_flow(result.text)
```

### Evaluation Criteria

- **Coverage**: Do all input claims appear in synthesis?
- **Accuracy**: Is synthesized text faithful to claims?
- **Coherence**: Does text flow logically?
- **Fluency**: Is text natural and readable?
- **Completeness**: Are all important aspects covered?

## Future Enhancements

- Multi-lingual synthesis
- Custom style templates
- Interactive refinement
- Claim-to-text alignment visualization
- Automated citation formatting
- Integration with knowledge graphs

## See Also

- [Claim Extraction](./claim-extraction.md)
- [Claims API Reference](/docs/api/claims-endpoints.md)
- [User Guide: Claims Overview](/docs/user-guides/claims/overview.md)
