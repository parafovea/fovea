# Claim Editing User Guide

## Overview

This guide explains how to manually create, edit, and manage claims. While automated extraction is useful, manual editing gives you precise control over your claim structure.

## Creating Manual Claims

### Adding a Root Claim

1. Navigate to the Claims tab
2. Click **Add Manual Claim**
3. Enter your claim text (required)
4. Set confidence (default: 90%) (required)
5. Select at least one modality metadata checkbox (required)
6. Optionally add claimer information, context, or comment
7. Click **Create**

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
2. Modify the claim text (required)
3. Adjust confidence if needed (required)
4. Ensure at least one modality metadata checkbox is selected (required)
5. Update claimer information, context, or comment as needed
6. Click **Save**

### What You Can Edit

- **Claim Text**: The core statement (required)
- **Confidence**: Your certainty level (0-100%) (required)
- **Modality Metadata**: What sources support the claim (audio, video, metadata) (required - at least one must be selected)
- **Claimer Information**: Who is making this claim
- **Context**: When and where the claim was made
- **Comment**: Additional commentary or notes about the claim

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

## Modality Metadata (Optional)

Modality metadata indicates what sources support a claim. This helps track where information comes from in the video.

### Audio Modality

Indicates if the claim is based at least in part on audio from the video:

- **speech**: The claim is based on spoken audio (dialogue, narration, etc.)
- **non-speech**: The claim is based on other audio (music, sound effects, ambient sounds, etc.)
- **None** (empty): No indication about audio sources - does NOT mean the claim is NOT based on audio

### Video Modality

Indicates if the claim is based at least in part on non-audio video information:

- **text**: The claim is based on text visible in the video (captions, signs, on-screen text, etc.)
- **non-text**: The claim is based on visual content (actions, objects, scenes, etc.)
- **None** (empty): No indication about video sources - does NOT mean the claim is NOT based on video

### Metadata Modality

Indicates if the claim is based on video metadata:

- **Yes**: The claim is based on information from video metadata (title, description, tags, etc.)
- **No**: The claim is explicitly NOT based on metadata
- **None** (empty): No indication about metadata sources

### Important Notes

- **Empty values are meaningful**: Leaving a field empty does NOT mean the claim is NOT based on that source
- **Multiple sources**: A claim can be based on multiple sources (e.g., both audio speech and visual text)
- **User-editable**: These fields are set manually during claim editing, not automatically extracted
- **Optional fields**: All three fields are optional - you can set none, some, or all of them

### Example Use Cases

**Audio-based claim**:
- Audio: "speech"
- Video: None
- Metadata: None
- Example: "The narrator states that the game was postponed"

**Visual text claim**:
- Audio: None
- Video: "text"
- Metadata: None
- Example: "The scoreboard shows 3-2"

**Metadata-based claim**:
- Audio: None
- Video: None
- Metadata: true
- Example: "The video title indicates this is a highlight reel"

**Multi-source claim**:
- Audio: "speech"
- Video: "non-text"
- Metadata: false
- Example: "The commentator describes the play while showing the action"

## Comment Field

The comment field allows you to add additional notes or commentary about a claim. This is useful for:

- **Documentation**: Explaining your reasoning for a claim
- **Collaboration**: Leaving notes for other annotators
- **Quality Control**: Flagging claims that need review
- **Context**: Adding information that doesn't fit in the claim text itself

### Using Comments

- Comments are optional - you can leave them empty
- Comments are saved with the claim and exported in JSON exports
- Comments can be edited at any time
- Comments appear in the claim editor dialog

### Example Comments

- "This claim needs verification from another source"
- "Based on timestamp 0:45-1:20"
- "Contradicts claim #123 - needs resolution"
- "High confidence based on multiple visual cues"

## Summary Preview on Claims Tab

When you switch to the Claims tab, a collapsible "Summary Preview" accordion appears at the top if the summary has content. This read-only preview shows the full summary text (with gloss references rendered) so you can reference it while reviewing or creating claims without switching back to the Summary tab.

The accordion starts expanded and can be collapsed by clicking its header. It does not appear when the summary is empty.

## Workspace Toggle from Claim Editor

While editing a claim, you may need to look up or create an entity type in the Ontology Builder, or an object in the Object Builder. Instead of losing your in-progress claim, you can use keyboard shortcuts to save a draft and switch workspaces:

- Press **W** to save the claim form as a draft and switch to the Object Builder.
- Press **O** to save the claim form as a draft and switch to the Ontology Builder.

These shortcuts only work when the Claim Editor dialog is open and no input field is focused (they will not interfere with typing in text fields).

All form fields are preserved in the draft: claim text, confidence, modality metadata, claimer information, context fields, and comment.

### Returning to Your Draft

After switching workspaces, a "Draft Claim" chip appears in the top toolbar with a warning color. Click the chip to navigate back to the video's annotation workspace. The summary dialog and claim editor re-open automatically with all your draft fields restored.

To discard the draft without returning, click the chip's delete (X) button.

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
- [API Reference](../../api-reference/claims.md)
