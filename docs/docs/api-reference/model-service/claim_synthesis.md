---
sidebar_label: claim_synthesis
title: claim_synthesis
---

Summary synthesis from claim hierarchies.

This module provides functions for generating coherent narrative summaries
from structured claim hierarchies. Supports:
- Single-source synthesis (one video&#x27;s claims)
- Multi-source synthesis (multiple videos&#x27; claims for collections)
- Conflict detection and resolution
- Hierarchical claim structure preservation
- Claim relation integration (supports, conflicts, etc.)

## logging

## Any

## GenerationConfig

## LLMLoader

## ClaimRelationship

## ClaimSource

#### logger

#### synthesize\_summary\_from\_claims

```python
async def synthesize_summary_from_claims(
        claim_sources: list[ClaimSource],
        claim_relations: list[ClaimRelationship] | None,
        synthesis_strategy: str, ontology_context: dict[str, Any] | None,
        persona_context: dict[str, Any] | None, llm_loader: LLMLoader,
        max_length: int, include_conflicts: bool,
        include_citations: bool) -> list[dict[str, Any]]
```

Synthesize narrative summary from claim hierarchies.

Parameters
----------
claim_sources : list[ClaimSource]
    Claim hierarchies from one or more videos/collections.
claim_relations : list[ClaimRelationship] | None
    Relationships between claims (conflicts, support, etc.).
synthesis_strategy : str
    Strategy: &quot;hierarchical&quot;, &quot;chronological&quot;, &quot;narrative&quot;, &quot;analytical&quot;.
ontology_context : dict[str, Any] | None
    Ontology types and glosses for context.
persona_context : dict[str, Any] | None
    Persona information for perspective.
llm_loader : LLMLoader
    Loaded LLM for generation.
max_length : int
    Maximum summary length in words.
include_conflicts : bool
    Whether to explicitly mention conflicts.
include_citations : bool
    Whether to include claim citations.

Returns
-------
list[dict[str, Any]]
    Summary as GlossItem array with # and @ references.

#### build\_synthesis\_prompt

```python
def build_synthesis_prompt(claim_sources: list[ClaimSource],
                           claim_relations: list[ClaimRelationship] | None,
                           synthesis_strategy: str,
                           ontology_context: dict[str, Any] | None,
                           persona_context: dict[str, Any] | None,
                           max_length: int, include_conflicts: bool,
                           include_citations: bool) -> str
```

Build LLM prompt for summary synthesis.

Parameters
----------
claim_sources : list[ClaimSource]
    Claim hierarchies from sources.
claim_relations : list[ClaimRelationship] | None
    Relationships between claims.
synthesis_strategy : str
    Synthesis strategy.
ontology_context : dict[str, Any] | None
    Ontology types and glosses.
persona_context : dict[str, Any] | None
    Persona information.
max_length : int
    Maximum summary length.
include_conflicts : bool
    Explicitly mention conflicts.
include_citations : bool
    Include citations.

Returns
-------
str
    Formatted prompt for LLM.

