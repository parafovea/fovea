# Claim Relations User Guide

## Overview

Claim relations create typed connections between claims, allowing you to model complex relationships like support, contradiction, causation, and more. This guide explains how to create and manage these relationships.

## What Are Claim Relations?

A claim relation connects two claims with a specific relationship type:
- **Source Claim**: The claim making the assertion
- **Relation Type**: How they're related (supports, conflicts, causes, etc.)
- **Target Claim**: The claim being referenced
- **Confidence**: How certain you are about this relationship (optional)
- **Notes**: Additional context (optional)

## Viewing Relations

### Accessing the Relations View

1. Navigate to any claim in the tree view
2. Click the **Relations** icon (network/tree icon)
3. The relations panel expands below the claim

### Understanding the Display

**Outgoing Relations**
- Relations where this claim is the source
- Shows: Relation type → Target claim
- Example: "Baseball is popular" **supports** → "Sports attract audiences"

**Incoming Relations**
- Relations where this claim is the target
- Shows: Source claim → Relation type
- Example: "MLB exists" → **supports** "Baseball is popular"

## Creating Relations

### Step-by-Step Process

1. Select the source claim
2. Open its relations view
3. Click **Add Relation**
4. The relation editor dialog opens:
   - **Source Claim** (read-only): The claim you started from
   - **Relation Type**: Choose from available types
   - **Target Claim**: Select the target from dropdown
   - **Confidence**: Set your certainty (default: 80%)
   - **Notes**: Add optional explanation

5. Click **Save Relation**

### Choosing a Relation Type

Your available relation types come from your ontology. Common types include:

**Epistemic Relations** (about knowledge/belief)
- `supports`: Provides evidence for
- `conflicts`: Contradicts or opposes
- `refutes`: Directly disproves
- `questions`: Raises doubt about

**Logical Relations**
- `implies`: Logically entails
- `presupposes`: Assumes as prerequisite
- `follows_from`: Is a consequence of

**Causal Relations**
- `causes`: Brings about
- `enables`: Makes possible
- `prevents`: Stops from happening

**Temporal Relations**
- `precedes`: Comes before
- `follows`: Comes after
- `coincides_with`: Happens at same time

### Creating Compatible Relations

⚠️ Not all relation types work with claims. The system filters to show only claim-compatible types.

**If you see "No compatible relation types":**
1. Go to Ontology Workspace
2. Create or edit relation types
3. Ensure `sourceTypes` includes "claim"
4. Ensure `targetTypes` includes "claim"

## Setting Confidence

Confidence indicates how certain you are about the relationship:

- **90-100%**: Very strong connection, well-established
- **70-89%**: Strong connection, good evidence
- **50-69%**: Moderate connection, some uncertainty
- **30-49%**: Weak connection, tentative
- **0-29%**: Very weak, speculative

### When to Use Lower Confidence

- Indirect or complex relationships
- Interpretative connections
- Preliminary analysis
- Debatable associations

### When to Use Higher Confidence

- Direct logical implications
- Clear causal relationships
- Well-documented connections
- Unambiguous support/conflict

## Adding Context Notes

Notes help explain non-obvious relationships:

### Good Note Examples

✅ "This supports the main thesis because..."
✅ "Conflicts on the basis that X assumes Y, but..."
✅ "Causal connection demonstrated by studies A, B, C"
✅ "Temporal ordering established by video timestamps"

### When Notes Are Helpful

- Complex or subtle relationships
- Multiple competing interpretations
- Relationships requiring domain knowledge
- Collaborative work (explain reasoning to others)

## Managing Relations

### Deleting a Relation

1. Open the relations view for a claim
2. Find the relation to delete
3. Click the **Delete** icon (trash)
4. Confirm deletion

*Note: This only deletes the relationship, not the claims themselves.*

### Reviewing Relations

Use the relations view to:
- Audit claim networks
- Find contradictions
- Identify support structures
- Trace logical chains
- Verify relationship validity

## Relation Patterns

### Support Chains

```
Claim A supports Claim B supports Claim C
```
Build evidential hierarchies where each claim supports the next.

### Mutual Support

```
Claim A supports Claim B
Claim B supports Claim A
```
Useful for reciprocal relationships, but watch for circular reasoning.

### Conflict Networks

```
Claim A conflicts Claim B
Claim A conflicts Claim C
Claim B conflicts Claim C
```
Model mutually exclusive alternatives or contradictory viewpoints.

### Causal Chains

```
Claim A causes Claim B causes Claim C
```
Map cause-effect relationships through multiple steps.

## Best Practices

### Relationship Quality

**Do:**
- Create specific, meaningful relations
- Use appropriate relation types
- Add notes for complex relationships
- Set realistic confidence scores
- Review relations periodically

**Don't:**
- Create relations just because claims mention similar topics
- Use generic "related_to" for everything (be specific)
- Set maximum confidence without strong justification
- Create circular reasoning loops
- Leave ambiguous relations without notes

### Organizing Relations

**Start Simple**
- Begin with obvious support/conflict relations
- Add more nuanced relations later
- Focus on key claims first

**Work Systematically**
- Process one claim at a time
- Check both incoming and outgoing relations
- Look for missing connections

**Maintain Consistency**
- Use relation types consistently
- Apply similar confidence standards
- Follow team conventions

## Advanced Use Cases

### Argument Mapping

Use relations to model complete arguments:
1. Main conclusion (root claim)
2. Premises (supporting claims)
3. Objections (conflicting claims)
4. Rebuttals (conflicts to objections)

### Belief Networks

Model how evidence accumulates:
- Multiple weak supports = moderate confidence
- Single strong support = high confidence
- Conflicting evidence = uncertainty

### Comparative Analysis

Compare multiple viewpoints:
- Claims from different sources
- Relations show agreements/disagreements
- Build neutral claim network

### Temporal Narratives

Track how claims evolve:
- Use `precedes`/`follows` relations
- Model belief changes over time
- Show historical development

## Troubleshooting

**Can't Find Target Claim**
- Verify the claim exists
- Check you're not trying to relate to the source itself
- Use search/filter in the claim dropdown

**Relation Type Unavailable**
- Check ontology settings
- Verify relation type supports claim↔claim
- Create new relation type if needed

**Confidence Scores Unclear**
- Review your confidence criteria
- Consult with team members
- Use notes to explain your reasoning

**Too Many Relations**
- Focus on most important connections
- Remove redundant relations
- Use hierarchy instead of many flat relations

## Integration with Other Features

### With Subclaims

- Parent-child is structural (not a relation)
- Relations are semantic connections
- Can relate claims at different hierarchy levels

### With Annotations

- Relate claims that reference same objects
- Build networks around key events
- Connect temporal claims

### With Ontology

- Relation types come from ontology
- Customize types for your domain
- Define clear semantics

## Next Steps

- Build argument maps with your claims
- Analyze claim networks for insights
- Export relation graphs
- Integrate with analysis tools

## See Also

- [Claims Overview](./overview.md)
- [Claim Extraction](./extraction.md)
- [Editing Claims](./editing.md)
- [Ontology Workspace](/docs/user-guides/ontology-workspace.md)
- [API Reference](/docs/api/claims-endpoints.md)
