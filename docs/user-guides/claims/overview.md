# Claims and Subclaims - Overview

## Introduction

The Claims and Subclaims system in FOVEA allows you to extract, organize, and analyze factual assertions from video summaries. Claims provide a structured way to capture the key information in your videos, making it easier to:

- **Track Facts**: Document specific assertions made in the video
- **Build Evidence Chains**: Create hierarchical structures of claims and supporting subclaims
- **Detect Conflicts**: Identify contradictory claims across different summaries or perspectives
- **Enable Analysis**: Support cross-video reasoning and intelligence workflows

## What is a Claim?

A **claim** is a factual assertion extracted from or manually added to a video summary. Claims can represent:

- Events (e.g., "The rocket launched on December 25, 2021")
- Entities (e.g., "James Webb Space Telescope has a 6.5-meter primary mirror")
- Attributes (e.g., "The telescope is positioned at Lagrange Point L2")
- Temporal facts (e.g., "Launch occurred at 12:20 UTC")
- Relationships (e.g., "JWST is larger than Hubble")

### Subclaims

Claims can have **subclaims** - supporting or elaborating assertions that break down the parent claim into more specific parts. This creates a hierarchical tree structure:

```
Claim: The JWST was launched on December 25, 2021
├─ Subclaim: JWST was launched
├─ Subclaim: Launch date was December 25, 2021
└─ Subclaim: Launch vehicle was Ariane 5
```

## Key Features

### 1. Automatic Extraction

FOVEA can automatically extract claims from video summaries using large language models (LLMs). The system supports three extraction strategies:

- **Sentence-based**: Extract one claim per sentence with subclaims for details
- **Semantic units**: Extract claims from logical chunks of meaning
- **Hierarchical decomposition**: Top-down extraction with natural hierarchies

### 2. Manual Editing

You can manually:
- Create new claims
- Edit existing claims
- Add subclaims to any claim
- Delete claims (with automatic subclaim cascade)
- Adjust confidence scores
- Add notes and metadata

### 3. Gloss Syntax

Claims support FOVEA's rich text gloss syntax:
- `@object-name` - Reference to entity/event objects
- `#type-name` - Reference to ontology types
- `^annotation-id` - Reference to video annotations

Example:
```
The @`James Webb Space Telescope` is positioned at the #`Lagrange Point` L2
```

### 4. Filtering and Search

Find specific claims using:
- **Text search**: Search claim content
- **Confidence filter**: Show only high-confidence claims (50%+, 70%+, etc.)
- **Strategy filter**: Filter by extraction method
- **Model filter**: Filter by the LLM used for extraction

### 5. Claim Relations

Create typed relationships between claims:
- **conflicts-with**: Mark contradictory claims
- **supports**: Build evidence chains
- **elaborates-on**: Connect related claims
- **temporal**: Link temporally related claims

Relations help you:
- Detect inconsistencies across summaries
- Build chains of reasoning
- Track evidence and supporting facts
- Analyze cross-video relationships

## Typical Workflows

### Workflow 1: Automatic Extraction

1. Create or select a video summary
2. Navigate to the **Claims** tab
3. Click **Extract Claims**
4. Configure extraction settings (strategy, confidence threshold, etc.)
5. Review extracted claims
6. Edit or remove incorrect claims as needed

### Workflow 2: Manual Claim Creation

1. Navigate to the **Claims** tab in a summary
2. Click **Add Manual Claim**
3. Enter claim text or use gloss syntax for references
4. Set confidence score
5. Add subclaims if needed
6. Save the claim

### Workflow 3: Building Claim Relations

1. Select a claim in the Claims tab
2. Click the **Relations** icon
3. Click **Add Relation**
4. Choose relation type (conflicts-with, supports, etc.)
5. Select target claim
6. Set confidence and add notes
7. Save the relation

### Workflow 4: Cross-Summary Analysis

1. Extract claims from multiple video summaries
2. Use search and filtering to find related claims
3. Create relations between claims from different summaries
4. Analyze conflicts, supporting evidence, or temporal sequences

## Best Practices

### For Extraction
- Start with **hierarchical** strategy for complex summaries
- Use **sentence-based** for factual, structured content
- Set confidence threshold to 70%+ to reduce noise
- Review and edit extracted claims for accuracy

### For Manual Claims
- Keep claims atomic (one assertion per claim)
- Use gloss syntax to link to objects and types
- Add confidence scores based on source reliability
- Use subclaims to break down complex assertions

### For Relations
- Document why relations exist in the notes field
- Use confidence scores to indicate strength of relationships
- Create symmetric relations when appropriate
- Regularly review conflict relations to resolve inconsistencies

## Next Steps

- [Claim Extraction Guide](./extraction.md) - Learn how to extract claims
- [Editing Claims Guide](./editing.md) - Learn how to manually create and edit claims
- [Claim Relations Guide](./relations.md) - Learn how to create relationships between claims
- [API Reference](/docs/api/claims-endpoints.md) - Developer documentation for claims API

## Terminology

- **Claim**: A factual assertion from a video summary
- **Subclaim**: A supporting or elaborating claim beneath a parent claim
- **Extraction Strategy**: The method used by the LLM to extract claims
- **Confidence**: A score (0-100%) indicating the reliability of a claim
- **Gloss**: Rich text format with references to objects and types
- **Source Span**: Character range in the summary text where the claim originates
- **Claim Relation**: A typed relationship between two claims
- **Denormalized Structure**: Flattened JSON representation of the claim tree
