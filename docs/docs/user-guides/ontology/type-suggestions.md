---
title: AI Type Suggestions
sidebar_position: 3
---

# AI-Powered Type Suggestions

FOVEA can suggest entity types and event types for your ontology using AI models. This feature helps you quickly expand your ontology with relevant types based on your domain and use case.

## Overview

The type suggestion feature uses large language models to:

- Suggest relevant entity types for your domain
- Suggest relevant event types for your domain
- Provide definitions and attributes for suggested types
- Help bootstrap ontologies for new analysis projects

Type suggestions are context-aware, considering your existing ontology and persona information.

## Accessing Type Suggestions

### Via Ontology Workspace

1. Navigate to **Ontology** workspace
2. Select your **persona**
3. Click **Suggest Types** button (or similar UI element)
4. Configure suggestion parameters
5. Review and accept suggested types

## Suggestion Parameters

### Domain Description

Provide a brief description of your analysis domain:

**Examples**:
- "Sports analytics for professional baseball"
- "Surveillance analysis for urban security"
- "Wildlife tracking in marine environments"
- "Manufacturing quality control inspection"

The model uses this to understand what types are relevant.

### Entity vs. Event Types

Specify whether you want:

- **Entity Types**: Things that exist (people, objects, locations)
- **Event Types**: Actions or occurrences (movements, interactions, events)
- **Both**: Suggestions for both categories

### Number of Suggestions

Control how many suggestions to generate:

- **1-5**: Highly focused, specific types
- **6-10**: Balanced variety
- **11-20**: Comprehensive coverage

More suggestions provide breadth but may include less relevant types.

### Existing Ontology Context

The model considers your existing ontology:

- **Existing types**: Avoids duplicates
- **Naming conventions**: Matches your naming style
- **Complexity level**: Matches the detail level of your existing types

## Using Type Suggestions

### Step-by-Step Workflow

1. **Describe your domain** in the suggestion dialog
2. **Choose type category** (entity, event, or both)
3. **Set number of suggestions** (5-10 recommended)
4. **Click Generate Suggestions**
5. **Review suggestions** in a list view
6. **Accept or reject** each suggestion:
   - ✅ Accept: Adds type to your ontology
   - ❌ Reject: Ignores suggestion
   - ✏️ Edit: Modify before accepting
7. **Save accepted types** to your ontology

### Example: Sports Analytics

**Domain**: "Professional basketball game analysis"

**Entity Type Suggestions**:
- **Player**: A person participating in the basketball game
- **Ball**: The basketball used in the game
- **Referee**: An official monitoring game rules
- **Coach**: A team's coaching staff member
- **Court**: The basketball court playing surface

**Event Type Suggestions**:
- **Shot**: An attempt to score by throwing the ball
- **Pass**: Transfer of ball between teammates
- **Foul**: A rule violation by a player
- **Rebound**: Retrieval of the ball after a missed shot
- **Substitution**: Replacement of one player with another

## Reviewing Suggestions

### What's Included

Each suggestion includes:

- **Type Name**: The suggested type identifier
- **Definition**: A clear description of the type
- **Attributes**: Suggested properties or characteristics
- **Examples**: Concrete instances of the type

### Evaluating Quality

Good suggestions should:

✅ Be relevant to your analysis domain
✅ Have clear, concise definitions
✅ Be distinct from existing types
✅ Match your ontology's level of detail
✅ Use appropriate terminology for your field

Poor suggestions might:

❌ Duplicate existing types
❌ Be too generic or vague
❌ Use inappropriate terminology
❌ Be irrelevant to your domain
❌ Lack sufficient detail

## Customizing Suggestions

### Editing Before Accepting

1. **Click Edit** on a suggestion
2. **Modify fields**:
   - Name: Adjust to match your naming conventions
   - Definition: Refine for clarity or specificity
   - Attributes: Add, remove, or modify attributes
3. **Accept edited suggestion**

**Example edit**:
```
Original:
Name: Player
Definition: A person participating in the game

Edited:
Name: BasketballPlayer
Definition: An athlete actively participating in a basketball game,
  including starters and substitutes on the active roster
```

### Combining Suggestions

You can combine multiple suggestions into one type:

1. **Accept first suggestion** (e.g., "Offensive Player")
2. **Reject similar suggestion** (e.g., "Defensive Player")
3. **Manually edit** the accepted type to encompass both concepts

## Best Practices

### 1. Start with Clear Domain Description

**Good descriptions**:
- "Urban traffic monitoring for congestion analysis"
- "Medical procedure documentation in operating rooms"
- "Retail customer behavior analysis in stores"

**Poor descriptions**:
- "Video analysis" (too vague)
- "Stuff happening in videos" (not specific)
- "Things" (no context)

### 2. Iterate Incrementally

- Start with 5-7 suggestions
- Review and accept high-quality ones
- Generate more suggestions if needed
- Avoid overwhelming yourself with 20+ suggestions at once

### 3. Match Your Existing Ontology

If your ontology uses:
- **Simple names**: "Player", "Ball"
- **Detailed names**: "ProfessionalBasketballPlayer", "RegulationBasketball"

Keep suggestions consistent with your style.

### 4. Refine Definitions

AI-generated definitions are starting points:
- Customize for your specific use case
- Add domain-specific terminology
- Clarify ambiguities
- Add constraints or requirements

### 5. Validate with Domain Experts

- Review suggestions with subject matter experts
- Ensure terminology matches domain standards
- Verify definitions are accurate
- Check for missing types

## Advanced Usage

### Context-Aware Suggestions

The AI considers:

- **Existing types**: Won't suggest "Player" if you already have it
- **Persona role**: Suggests types relevant to your analyst role
- **Persona information need**: Aligns with your analysis goals
- **Related types**: Suggests complementary types (e.g., if you have "Ball", might suggest "Goal")

### Multi-Persona Ontologies

For teams with multiple personas:

1. **Generate suggestions per persona**: Each persona gets domain-specific suggestions
2. **Share common types**: Accept universal types across personas
3. **Keep specialized types**: Let personas maintain unique types

## Limitations

### What Type Suggestions Can't Do

- **Domain expertise**: AI doesn't replace subject matter experts
- **Organization standards**: May not match your organization's terminology
- **Completeness**: Won't generate every possible type
- **Accuracy**: Definitions may need refinement

### When to Skip Suggestions

Use manual type creation when:

- You have a well-defined ontology standard
- Your domain uses highly specialized terminology
- You need very specific type definitions
- Suggestions consistently miss the mark

## Troubleshooting

### Suggestions Are Too Generic

**Problem**: Suggestions like "Person", "Object", "Action"

**Solution**:
- Provide more specific domain description
- Mention concrete examples in your description
- Specify the granularity level you need

### Suggestions Don't Match Domain

**Problem**: Irrelevant types suggested

**Solution**:
- Revise domain description to be more precise
- Check spelling and clarity of description
- Try generating again with refined parameters

### Too Many Similar Suggestions

**Problem**: 5 variations of "Player" suggested

**Solution**:
- Reduce number of suggestions
- Accept one and manually generalize it
- Provide more diverse domain description

### Suggestions Duplicate Existing Types

**Problem**: AI suggests types you already have

**Solution**:
- This shouldn't happen; AI should see existing types
- Try refreshing the ontology workspace
- Check that your ontology is properly loaded

## API Access

Developers can access type suggestions programmatically:

### Request Type Suggestions

```bash
POST /api/ontology/suggest-types
Content-Type: application/json

{
  "personaId": "persona-uuid",
  "domain": "Professional baseball analytics",
  "category": "entity",  // or "event"
  "count": 10
}

# Response
{
  "suggestions": [
    {
      "name": "Pitcher",
      "definition": "A player who throws the baseball to the batter",
      "category": "entity",
      "attributes": [
        {"name": "handedness", "type": "string"},
        {"name": "pitchCount", "type": "number"}
      ]
    },
    // ... more suggestions
  ]
}
```

## Integration with Ontology Workflow

Type suggestions integrate with the standard ontology workflow:

1. **Start**: Create persona
2. **Bootstrap**: Generate type suggestions
3. **Refine**: Edit and accept suggestions
4. **Extend**: Manually add specialized types
5. **Validate**: Review with domain experts
6. **Use**: Annotate videos using your ontology

## See Also

- [Personas](../../concepts/personas.md): Understanding persona-based ontologies
- [Model Service: Ontology Augmentation](../../model-service/ontology-augmentation.md): Technical details on AI suggestions
