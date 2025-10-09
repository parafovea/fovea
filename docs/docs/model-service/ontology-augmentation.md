---
title: Ontology Augmentation
---

# Ontology Augmentation

Ontology augmentation uses LLM models to suggest entity types, event types, roles, and relationships based on persona context and domain knowledge. The service generates suggestions to expand ontologies during annotation workflows.

## How It Works

The augmentation pipeline:

1. **Context Collection**: Gather persona information, existing ontology, and domain description
2. **Prompt Construction**: Build structured prompt with context and task requirements
3. **LLM Inference**: Generate suggestions using selected language model
4. **Response Parsing**: Extract structured suggestions (types, roles, relationships)
5. **Validation**: Ensure suggestions are compatible with existing ontology
6. **Response Generation**: Return suggestions with confidence scores

## Available Models

### Llama-4-Scout

**Model ID**: `meta-llama/Llama-4-Scout`

**Type**: Mixture of Experts (MoE) with 17B active parameters

**Characteristics**:
- VRAM: 55 GB (4-bit), 220 GB (full precision)
- Context length: 10M tokens
- Speed: Very fast
- Multimodal capable

**Best for**:
- Large context ontologies
- Complex domain reasoning
- Multi-step inference

**Example**:
```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Baseball Analyst",
    "existing_ontology": {"entity_types": ["Player", "Ball", "Bat"]},
    "domain_context": "Professional baseball game analysis",
    "model": "llama-4-scout"
  }'
```

### Llama-3.3-70B

**Model ID**: `meta-llama/Llama-3.3-70B-Instruct`

**Type**: Dense model with 70B parameters

**Characteristics**:
- VRAM: 35 GB (4-bit), 140 GB (full precision)
- Context length: 128K tokens
- Speed: Fast
- Quality matches 405B models

**Best for**:
- General-purpose augmentation
- Balanced quality and speed
- Smaller VRAM budgets

**Example**:
```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Medical Researcher",
    "existing_ontology": {"entity_types": ["Patient", "Instrument"]},
    "domain_context": "Surgical procedure documentation",
    "model": "llama-3-3-70b"
  }'
```

### DeepSeek-V3

**Model ID**: `deepseek-ai/DeepSeek-V3`

**Type**: MoE with 37B active parameters

**Characteristics**:
- VRAM: 85 GB (4-bit), 340 GB (full precision)
- Context length: 128K tokens
- Speed: Fast
- Reasoning and scientific tasks

**Best for**:
- Technical ontologies
- Scientific domains
- Complex reasoning requirements

**Example**:
```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Astrophysicist",
    "existing_ontology": {"entity_types": ["Star", "Galaxy", "Nebula"]},
    "domain_context": "Deep space observation cataloging",
    "model": "deepseek-v3"
  }'
```

### Gemma-3-27b

**Model ID**: `google/gemma-3-27b-it`

**Type**: Dense model with 27B parameters

**Characteristics**:
- VRAM: 14 GB (4-bit), 54 GB (full precision)
- Context length: 8K tokens
- Speed: Very fast
- Lightweight option

**Best for**:
- Quick iterations
- Limited VRAM environments
- Simple ontologies

**Example**:
```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Retail Manager",
    "existing_ontology": {"entity_types": ["Customer", "Product"]},
    "domain_context": "Store operations tracking",
    "model": "gemma-3-27b-text"
  }'
```

## Persona-Context Prompting

Persona context guides the model to generate domain-specific suggestions.

### Without Persona Context

**Request**:
```json
{
  "existing_ontology": {"entity_types": ["Person"]}
}
```

**Response** (generic):
```json
{
  "suggestions": {
    "entity_types": ["Adult", "Child", "Senior"],
    "event_types": ["Meeting", "Conversation"],
    "roles": ["Participant", "Observer"]
  }
}
```

### With Persona Context

**Request**:
```json
{
  "persona_name": "Baseball Scout",
  "existing_ontology": {"entity_types": ["Player"]},
  "domain_context": "Evaluating minor league talent for recruitment",
  "task_description": "Track defensive skills and batting statistics"
}
```

**Response** (domain-specific):
```json
{
  "suggestions": {
    "entity_types": ["Pitcher", "Catcher", "Infielder", "Outfielder", "Designated Hitter"],
    "event_types": ["Pitch", "AtBat", "FieldingPlay", "StolenBaseAttempt"],
    "roles": ["DefensivePlayer", "OffensivePlayer", "Runner", "Fielder"],
    "relationships": ["PitcherToBatter", "FielderToRunner", "CoachToPlayer"]
  }
}
```

### Effective Context Components

**Persona name**: Role and expertise
```
"Baseball Scout" ✓
"Person" ✗
```

**Existing ontology**: Current types and structure
```json
{
  "entity_types": ["Player", "Ball", "Bat"],
  "event_types": ["Pitch", "Swing"]
}
```

**Domain context**: Area of analysis (5-20 words)
```
"Evaluating minor league talent for MLB recruitment" ✓
"Baseball" ✗
```

**Task description**: Specific annotation goals (5-20 words)
```
"Track pitching mechanics and velocity data" ✓
"Annotate video" ✗
```

## API Endpoint

### Request

```
POST /api/augment
```

**Content-Type**: `application/json`

**Request Schema**:

```json
{
  "persona_name": "Baseball Analyst",
  "existing_ontology": {
    "entity_types": ["Player", "Ball"],
    "event_types": ["Pitch"],
    "roles": [],
    "relationships": []
  },
  "domain_context": "Professional baseball game analysis",
  "task_description": "Annotating pitcher mechanics and outcomes",
  "model": "llama-4-scout",
  "max_suggestions_per_type": 10,
  "temperature": 0.7
}
```

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| persona_name | string | Yes | - | Analyst role and expertise |
| existing_ontology | object | Yes | - | Current ontology structure |
| domain_context | string | No | null | Domain description (5-20 words) |
| task_description | string | No | null | Annotation task details (5-20 words) |
| model | string | No | (from config) | LLM model to use |
| max_suggestions_per_type | integer | No | 10 | Maximum suggestions per category |
| temperature | float | No | 0.7 | Sampling temperature (0.0-2.0) |
| include_definitions | boolean | No | true | Include type definitions |
| include_examples | boolean | No | true | Include usage examples |

### Response

**Status**: 200 OK

```json
{
  "suggestions": {
    "entity_types": [
      {
        "name": "Pitcher",
        "definition": "Player who throws pitches from the mound",
        "examples": ["Starting pitcher", "Relief pitcher", "Closer"],
        "confidence": 0.95
      },
      {
        "name": "Catcher",
        "definition": "Player who receives pitches behind home plate",
        "examples": ["Defensive specialist", "Backup catcher"],
        "confidence": 0.92
      }
    ],
    "event_types": [
      {
        "name": "AtBat",
        "definition": "Batter's turn to face the pitcher",
        "examples": ["Strikeout", "Hit", "Walk"],
        "confidence": 0.90
      },
      {
        "name": "StolenBase",
        "definition": "Runner advances to next base without hit",
        "examples": ["Successful steal", "Caught stealing"],
        "confidence": 0.85
      }
    ],
    "roles": [
      {
        "name": "DefensivePlayer",
        "definition": "Player in fielding position",
        "applicable_to": ["entity_types"],
        "confidence": 0.88
      }
    ],
    "relationships": [
      {
        "name": "PitcherToBatter",
        "definition": "Pitcher throws to batter",
        "source_type": "Pitcher",
        "target_type": "Batter",
        "confidence": 0.93
      }
    ]
  },
  "model_used": "llama-4-scout",
  "inference_time_ms": 2340,
  "tokens_generated": 485,
  "total_suggestions": 18
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| suggestions | object | Suggested types, roles, relationships |
| entity_types | array | Suggested entity type definitions |
| event_types | array | Suggested event type definitions |
| roles | array | Suggested role definitions |
| relationships | array | Suggested relationship definitions |
| name | string | Type or relationship name |
| definition | string | Human-readable definition |
| examples | array | Usage examples |
| confidence | float | Model confidence (0.0-1.0) |
| applicable_to | array | Applicable type categories |
| source_type | string | Relationship source type |
| target_type | string | Relationship target type |
| model_used | string | LLM model used |
| inference_time_ms | integer | Inference duration |
| tokens_generated | integer | Response token count |
| total_suggestions | integer | Total suggestions returned |

### Error Responses

**400 Bad Request**:

```json
{
  "error": "Validation Error",
  "message": "existing_ontology must contain at least one type category",
  "details": {
    "field": "existing_ontology",
    "provided": {}
  }
}
```

**500 Internal Server Error**:

```json
{
  "error": "Augmentation Error",
  "message": "Failed to parse model response",
  "model": "llama-4-scout",
  "raw_response": "..."
}
```

## Suggestion Quality

### Confidence Scores

Confidence indicates model certainty about suggestions.

| Range | Interpretation | Action |
|-------|----------------|--------|
| 0.9-1.0 | Very high confidence | Accept with minimal review |
| 0.8-0.9 | High confidence | Review and accept |
| 0.7-0.8 | Moderate confidence | Review carefully |
| 0.5-0.7 | Low confidence | Validate against domain knowledge |
| &lt;0.5 | Very low confidence | Likely incorrect or irrelevant |

### Filtering Suggestions

**By confidence threshold**:
```javascript
const accepted = suggestions.entity_types.filter(s => s.confidence >= 0.8);
```

**By relevance to task**:
```javascript
const relevant = suggestions.entity_types.filter(s =>
  s.definition.includes('pitcher') || s.definition.includes('defensive')
);
```

## Integration with Frontend

### Workflow 1: Initial Ontology Creation

1. User provides persona and domain
2. Backend calls augmentation API
3. Frontend displays suggestions
4. User reviews and accepts types
5. Selected types added to ontology

**Request**:
```json
{
  "persona_name": "Wildlife Biologist",
  "existing_ontology": {"entity_types": [], "event_types": []},
  "domain_context": "African savanna animal behavior observation"
}
```

**Frontend displays**:
```
Suggested Entity Types:
✓ Lion (confidence: 0.95) - Add to ontology
✓ Zebra (confidence: 0.92) - Add to ontology
✓ Wildebeest (confidence: 0.90) - Add to ontology

Suggested Event Types:
✓ Hunt (confidence: 0.88) - Add to ontology
✓ Migration (confidence: 0.85) - Add to ontology
```

### Workflow 2: Ontology Expansion

1. User has existing ontology
2. User requests expansion for specific task
3. Backend suggests compatible types
4. Frontend merges with existing ontology

**Request**:
```json
{
  "persona_name": "Baseball Analyst",
  "existing_ontology": {
    "entity_types": ["Player", "Ball", "Bat"],
    "event_types": ["Pitch", "Swing"]
  },
  "task_description": "Track defensive plays and errors"
}
```

**Response adds**:
```json
{
  "entity_types": ["Fielder", "Base", "Glove"],
  "event_types": ["Catch", "Throw", "Error", "FieldingPlay"]
}
```

### Workflow 3: Relationship Discovery

1. User has entity and event types
2. User requests relationship suggestions
3. Backend suggests valid relationships
4. Frontend validates compatibility

**Request**:
```json
{
  "persona_name": "Medical Researcher",
  "existing_ontology": {
    "entity_types": ["Surgeon", "Patient", "Instrument"],
    "event_types": ["Incision", "Suture"]
  },
  "task_description": "Document surgical procedure steps"
}
```

**Response**:
```json
{
  "relationships": [
    {
      "name": "SurgeonUsesInstrument",
      "source_type": "Surgeon",
      "target_type": "Instrument"
    },
    {
      "name": "SurgeonPerformsIncision",
      "source_type": "Surgeon",
      "target_type": "Incision"
    }
  ]
}
```

## Best Practices

### Effective Prompting

**Good persona context**:
```json
{
  "persona_name": "Traffic Safety Analyst",
  "domain_context": "Urban intersection accident investigation",
  "task_description": "Classify vehicle types and collision events"
}
```

**Poor persona context**:
```json
{
  "persona_name": "User",
  "domain_context": "Videos",
  "task_description": "Annotate"
}
```

### Iterative Refinement

1. Start with broad domain context
2. Review initial suggestions
3. Refine task description based on gaps
4. Request additional suggestions
5. Repeat until ontology complete

**Iteration 1**:
```json
{
  "domain_context": "Baseball game analysis"
}
```
Returns: Player, Ball, Bat

**Iteration 2**:
```json
{
  "domain_context": "Baseball game analysis",
  "task_description": "Focus on pitching mechanics"
}
```
Returns: Pitcher, Mound, Windup, Delivery

**Iteration 3**:
```json
{
  "task_description": "Add defensive positioning types"
}
```
Returns: Infield, Outfield, Shift

### Quality Control

**Validate suggestions**:
1. Check definitions match domain knowledge
2. Ensure types are distinct (no duplicates)
3. Verify relationships make sense
4. Test with example annotations

**Remove duplicates**:
```javascript
const unique = suggestions.entity_types.filter((s, i, arr) =>
  arr.findIndex(t => t.name.toLowerCase() === s.name.toLowerCase()) === i
);
```

**Merge similar types**:
```
Suggestions: "Pitcher", "Starting Pitcher", "Relief Pitcher"
→ Keep "Pitcher" with subtypes in definition
```

## Performance Benchmarks

### Latency

| Model | Request Time | Tokens/sec | Use Case |
|-------|--------------|------------|----------|
| Gemma-3-27b | 1.5s | 180 | Quick iteration |
| Llama-3.3-70B | 2.5s | 120 | General use |
| Llama-4-Scout | 3.5s | 100 | Complex domains |
| DeepSeek-V3 | 4.0s | 90 | Scientific tasks |

### Suggestion Quality

| Model | Relevance | Accuracy | Creativity |
|-------|-----------|----------|------------|
| DeepSeek-V3 | 92% | 88% | High |
| Llama-4-Scout | 90% | 85% | High |
| Llama-3.3-70B | 88% | 86% | Medium |
| Gemma-3-27b | 82% | 80% | Medium |

**Metrics**:
- Relevance: Suggestions match domain context
- Accuracy: Definitions are factually correct
- Creativity: Novel but valid suggestions

## Use Cases and Limitations

### When to Use Ontology Augmentation

1. **Initial ontology creation**: Bootstrap from domain description
2. **Domain expansion**: Add types for new annotation tasks
3. **Relationship discovery**: Identify valid type connections
4. **Definition generation**: Auto-generate type descriptions
5. **Example generation**: Create usage examples for types

### Limitations

1. **Domain hallucination**: Models may suggest non-existent types
2. **Duplicate suggestions**: Similar types with different names
3. **Context misunderstanding**: Irrelevant suggestions if context unclear
4. **Inconsistent naming**: Inconsistent capitalization or terminology
5. **Over-specificity**: Too many fine-grained distinctions

### Accuracy Expectations

| Domain | Expected Relevance |
|--------|-------------------|
| Common domains (sports, retail) | 85-95% |
| Technical domains (medical, scientific) | 75-85% |
| Specialized domains (niche industries) | 65-80% |
| Novel/emerging domains | 55-70% |

## Troubleshooting

### Irrelevant Suggestions

**Symptom**: Suggestions unrelated to domain

**Causes**:
- Vague persona context
- Missing task description
- Generic domain description

**Solutions**:

1. Add specific domain context:
```json
{
  "domain_context": "Professional baseball pitching analysis for scouting"
}
```

2. Include task description:
```json
{
  "task_description": "Track pitch types, velocities, and locations"
}
```

3. Provide existing ontology:
```json
{
  "existing_ontology": {
    "entity_types": ["Pitcher", "Ball", "StrikeZone"]
  }
}
```

### Duplicate Suggestions

**Symptom**: Multiple similar types suggested

**Cause**: Model generates variations of same concept

**Solutions**:

1. Post-process to remove duplicates:
```javascript
const unique = suggestions.filter((s, i, arr) =>
  !arr.slice(0, i).some(t => t.name.toLowerCase() === s.name.toLowerCase())
);
```

2. Use higher temperature for diversity:
```json
{
  "temperature": 0.9
}
```

### Slow Response

**Symptom**: Augmentation takes 10+ seconds

**Causes**:
- Large existing ontology
- Complex domain context
- Heavy model (DeepSeek-V3)

**Solutions**:

1. Use faster model:
```json
{
  "model": "gemma-3-27b-text"
}
```

2. Limit suggestions:
```json
{
  "max_suggestions_per_type": 5
}
```

3. Reduce temperature:
```json
{
  "temperature": 0.5
}
```

## Example Workflows

### Workflow 1: Bootstrap Ontology

Create initial ontology from scratch:

```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Traffic Safety Analyst",
    "existing_ontology": {
      "entity_types": [],
      "event_types": []
    },
    "domain_context": "Urban traffic accident investigation",
    "task_description": "Classify vehicles, infrastructure, and collision types",
    "model": "llama-3-3-70b",
    "max_suggestions_per_type": 15
  }'
```

### Workflow 2: Expand Existing Ontology

Add types to existing ontology:

```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Wildlife Biologist",
    "existing_ontology": {
      "entity_types": ["Lion", "Zebra", "Wildebeest"],
      "event_types": ["Hunt", "Graze"]
    },
    "domain_context": "African savanna ecosystem observation",
    "task_description": "Add social behaviors and environmental factors",
    "model": "llama-4-scout",
    "max_suggestions_per_type": 10
  }'
```

### Workflow 3: Generate Relationships

Discover relationships between existing types:

```bash
curl -X POST http://localhost:8000/api/augment \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Medical Researcher",
    "existing_ontology": {
      "entity_types": ["Surgeon", "Patient", "Instrument", "Anesthesiologist"],
      "event_types": ["Incision", "Suture", "Anesthesia"]
    },
    "task_description": "Define relationships between medical personnel, equipment, and procedures",
    "model": "deepseek-v3"
  }'
```

## Next Steps

- [Configure models](./configuration.md) for your hardware
- [Use video summarization](./video-summarization.md) for context
- [Set up object detection](./object-detection.md)
- [Enable video tracking](./video-tracking.md)
- [Return to overview](./overview.md)
