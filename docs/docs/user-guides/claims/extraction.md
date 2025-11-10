# Claim Extraction User Guide

## Overview

Claim extraction uses large language models to automatically identify and extract factual statements (claims) from video summaries. This guide explains how to configure and run claim extraction, and how to work with the extracted results.

## What Are Claims?

Claims are atomic factual statements extracted from your video summaries. Each claim represents a single assertion that can be independently verified or analyzed. Claims can be hierarchically organized with subclaims that break down complex statements into simpler components.

## Starting an Extraction

1. Navigate to your video's annotation workspace
2. Click on the **Claims** tab
3. Click the **Extract Claims** button
4. Configure your extraction settings (see below)
5. Click **Extract Claims** to start the process

## Extraction Strategies

Choose the strategy that best fits your content and analysis needs:

### Sentence-Based (Default)
- Extracts one claim per sentence
- Automatically creates subclaims for complex sentences
- Best for: Structured content with clear statements
- Example: "Baseball is popular" → Main claim with subclaims about why

### Semantic Units
- Extracts claims from logical chunks of meaning
- Groups related concepts together
- Best for: Conceptual content, philosophical discussions
- Example: Identifies complete arguments or reasoning chains

### Hierarchical
- Top-down decomposition of content
- Creates multi-level claim hierarchies
- Best for: Complex topics requiring systematic breakdown
- Example: Main thesis → supporting arguments → evidence

## Configuration Options

### Input Sources

**Summary Text** (required)
- Always included as the primary source
- The main text of your video summary

**Annotations** (optional)
- Include annotation references (@references)
- Useful when claims relate to specific annotated objects
- Example: "@pitcher throws @baseball" preserves entity relationships

**Ontology** (optional)
- Include entity type references (#references)
- Choose depth level:
  - **Names only**: Just type names (e.g., "#Person")
  - **Names + Glosses**: Includes short descriptions
  - **Full definitions**: Complete ontology information

### Parameters

**Max Claims** (1-200, default: 50)
- Maximum number of claims to extract
- Higher values capture more detail but take longer
- Start with default and adjust based on results

**Min Confidence** (0-1, default: 0.5)
- Filter out low-confidence claims
- Higher values = fewer but more certain claims
- Recommended: 0.5 for exploratory work, 0.7+ for final analysis

## Monitoring Extraction

- **Progress Bar**: Shows extraction progress (0-100%)
- **Status Updates**: Indicates current stage (queued, processing, completed)
- **Estimated Time**: Typically 30-90 seconds depending on summary length

## Reviewing Results

After extraction completes:

1. Claims appear in a hierarchical tree view
2. Each claim shows:
   - Claim text with entity/object references
   - Confidence score (percentage)
   - Extraction strategy used
   - Model that generated it
   - Number of subclaims (if any)

3. Use the filter controls to:
   - Search claims by text
   - Filter by confidence level
   - Filter by extraction strategy
   - Filter by AI model used

## Best Practices

### Before Extraction
- Ensure your video summary is complete and accurate
- Add relevant annotations if you'll include them
- Define your ontology if using entity type references

### Choosing Settings
- Start with **sentence-based** strategy for most content
- Use **semantic-units** for abstract or philosophical content
- Use **hierarchical** for systematic analysis of complex topics
- Enable **annotations** if your claims reference specific objects
- Enable **ontology** if working with a defined domain model

### After Extraction
- Review high-confidence claims (>70%) first
- Look for claims that need manual correction
- Check that subclaim hierarchies make sense
- Delete or edit low-quality extractions
- Consider re-extracting with different settings if needed

## Common Issues

**Too Many Claims**
- Solution: Increase min confidence threshold
- Solution: Reduce max claims parameter
- Solution: Use more selective extraction strategy

**Missing Important Claims**
- Solution: Decrease min confidence threshold
- Solution: Try different extraction strategy
- Solution: Check if summary text contains the information

**Low-Quality Claims**
- Solution: Ensure summary is well-written
- Solution: Try different AI model (if available)
- Solution: Manually create important claims instead

**Claims Lack Context**
- Solution: Enable ontology references
- Solution: Enable annotation references
- Solution: Add manual notes to claims after extraction

## Next Steps

After extracting claims:
- [Edit and refine claims](./editing.md)
- [Create relationships between claims](./relations.md)
- Use claims for analysis and reporting
- Export claims for external tools

## See Also

- [Claims Overview](./overview.md)
- [Editing Claims](./editing.md)
- [Claim Relations](./relations.md)
- [API Reference](../../api-reference/claims.md)
