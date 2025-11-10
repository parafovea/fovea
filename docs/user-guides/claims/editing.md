# Claim Editing User Guide

## Overview

This guide explains how to manually create, edit, and manage claims. While automated extraction is useful, manual editing gives you precise control over your claim structure.

## Creating Manual Claims

### Adding a Root Claim

1. Navigate to the Claims tab
2. Click **Add Manual Claim**
3. Enter your claim text
4. Optionally adjust confidence (default: 90%)
5. Add notes if needed
6. Click **Create**

### Adding a Subclaim

1. Find the parent claim in the tree view
2. Click the **Add Subclaim** button (+ icon)
3. Enter the subclaim text
4. Configure settings
5. Click **Create**

Subclaims appear nested under their parent and help break down complex claims into simpler components.

## Editing Existing Claims

### Basic Editing

1. Click the **Edit** button (pencil icon) on any claim
2. Modify the claim text
3. Adjust confidence if needed
4. Update notes
5. Click **Save**

### What You Can Edit

- **Claim Text**: The core statement
- **Confidence**: Your certainty level (0-100%)
- **Claimer Information**: Who is making this claim
- **Context**: When and where the claim was made
- **Notes**: Additional commentary

## Using Gloss Syntax

Claims support special reference syntax for linking to entities and objects:

### Reference Types

**Entity Types** (#reference)
```
#Baseball is played professionally
```
Links to the "Baseball" entity type in your ontology.

**Objects** (@reference)
```
@player-1 throws @baseball-52
```
Links to specific annotated objects in your video.

**Annotations** (^reference)
```
The pitch occurred at ^timestamp-1
```
Links to specific annotations.

**Other Claims** ($reference)
```
This supports $claim-abc123
```
Links to another claim (also see Relations).

### Best Practices

- Use #references for general concepts
- Use @references for specific instances in the video
- Be consistent with your reference style
- Verify references actually exist

## Setting Confidence Scores

Confidence represents how certain you are that the claim is accurate:

- **90-100%**: Very confident, well-established fact
- **70-89%**: Confident, solid evidence
- **50-69%**: Moderate confidence, some uncertainty
- **30-49%**: Low confidence, speculative
- **0-29%**: Very uncertain, questionable

### When to Adjust Confidence

- **Increase**: When you verify a claim with additional sources
- **Decrease**: When you find contradictory evidence
- **Extracted claims**: Review and adjust AI-generated scores
- **Manual claims**: Start high (90%) and adjust as needed

## Claimer Information (Optional)

Specify *who* is making the claim if it's not a neutral observation:

### Claimer Types

**Entity**: A specific person or organization
- Example: "John Doe claims that baseball is popular"
- Select an entity from your world state

**Entity Type**: A category of people/organizations
- Example: "Sports analysts believe..."
- Select from your ontology

**Author**: The video creator explicitly states this
- Used when the video maker is asserting something
- No additional input needed

**Mixed**: Combination of text and references
- Complex attribution scenarios
- Full gloss editing available

### Claim Relation

Describes how the claimer relates to the claim:
- "believes", "claims", "denies", "questions", etc.
- Captures the epistemic stance

## Context Fields (Optional)

Specify when and where the claim was made:

**Claiming Event**
- The event during which this claim was stated
- Example: "During the 2023 World Series"

**Claiming Time**
- Temporal context for the claim
- Example: "On March 15, 2023"

**Claiming Location**
- Spatial context for the claim
- Example: "At Yankee Stadium"

*Note: These fields link to your world state. Create relevant entities first.*

## Deleting Claims

### Single Claim

1. Click the **Delete** button (trash icon)
2. Confirm the deletion
3. Claim is permanently removed

### Cascade Deletion

When you delete a claim with subclaims:
- All subclaims are automatically deleted
- Relations involving the claim are removed
- This action cannot be undone

**Warning**: Always review subclaims before deleting parent claims.

## Claim Hierarchies

### Best Practices for Structure

**Good Hierarchy**:
```
├─ Baseball is a popular sport
   ├─ Baseball has professional leagues
   ├─ Baseball is played worldwide
   └─ Baseball attracts large audiences
```

**Poor Hierarchy**:
```
├─ Baseball is popular
   ├─ Cricket is also popular  ❌ (unrelated)
   └─ I like sports  ❌ (opinion, not factual)
```

### Hierarchy Guidelines

- Subclaims should support or explain the parent
- Each level should be more specific than the previous
- Aim for 2-3 levels deep (rarely more)
- Each claim should stand alone as a statement
- Avoid mixing topics within a hierarchy

## Validation and Quality

### Good Claims

✅ Specific and concrete
✅ Factually verifiable
✅ Properly attributed (if needed)
✅ Self-contained statement
✅ Consistent with evidence

### Poor Claims

❌ Too vague or general
❌ Subjective opinions
❌ Multiple statements combined
❌ Lacks necessary context
❌ Contradicts known facts

## Keyboard Shortcuts

(If implemented in your version)
- `Ctrl+N`: New claim
- `Ctrl+E`: Edit selected claim
- `Delete`: Delete selected claim
- `Ctrl+S`: Save current edit
- `Escape`: Cancel edit

## Common Workflows

### Refining Extracted Claims

1. Review all extracted claims
2. Edit inaccurate or unclear claims
3. Delete low-quality claims
4. Add missing subclaims
5. Adjust confidence scores
6. Add context and notes

### Building a Claim Set from Scratch

1. Watch video and take notes
2. Create main claims (root level)
3. Add supporting subclaims
4. Link to annotations/entities
5. Establish relations between claims
6. Review for completeness

### Collaborative Editing

1. Use high confidence for verified facts
2. Use lower confidence for interpretations
3. Add notes explaining your reasoning
4. Use claimer attribution for attributed statements
5. Review others' edits before accepting

## Next Steps

- [Create relationships between claims](./relations.md)
- [Learn about claim extraction](./extraction.md)
- Export claims for analysis
- Integrate claims with world state

## See Also

- [Claims Overview](./overview.md)
- [Claim Extraction](./extraction.md)
- [Claim Relations](./relations.md)
- [Gloss Syntax Reference](/docs/user-guides/gloss-syntax.md)
