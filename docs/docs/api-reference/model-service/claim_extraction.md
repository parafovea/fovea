---
sidebar_label: claim_extraction
title: claim_extraction
---

Claim extraction from video summaries using LLMs.

This module provides functions for extracting atomic factual claims from
summary text using language models. Supports multiple extraction strategies,
contextual enrichment from ontology and annotations, and hierarchical claim
decomposition.

## json

## logging

## re

## Any

## GenerationConfig

## LLMLoader

## ExtractedClaim

#### logger

#### extract\_claims\_from\_summary

```python
async def extract_claims_from_summary(
    summary_text: str,
    sentences: list[str] | None,
    strategy: str,
    max_claims: int,
    min_confidence: float,
    llm_loader: LLMLoader,
    ontology_context: dict[str, Any] | None = None,
    annotation_context: list[dict[str, Any]] | None = None
) -> list[ExtractedClaim]
```

Extract atomic claims from summary text.

Parameters
----------
summary_text : str
    Full summary text to extract claims from.
sentences : list[str] | None
    Pre-split sentences (if None, will split automatically).
strategy : str
    Extraction strategy: &quot;sentence-based&quot;, &quot;semantic-units&quot;, or &quot;hierarchical&quot;.
max_claims : int
    Maximum number of claims to extract.
min_confidence : float
    Minimum confidence threshold.
llm_loader : LLMLoader
    Loaded LLM for generation.
ontology_context : dict[str, Any] | None
    Ontology types and glosses for context.
annotation_context : list[dict[str, Any]] | None
    Annotation data for context.

Returns
-------
list[ExtractedClaim]
    List of extracted claims with subclaims.

#### build\_extraction\_prompt

```python
def build_extraction_prompt(summary_text: str, sentences: list[str],
                            strategy: str,
                            ontology_context: dict[str, Any] | None,
                            annotation_context: list[dict[str, Any]] | None,
                            max_claims: int) -> str
```

Build LLM prompt for claim extraction.

Parameters
----------
summary_text : str
    Full summary text.
sentences : list[str]
    Split sentences.
strategy : str
    Extraction strategy.
ontology_context : dict[str, Any] | None
    Ontology types and glosses.
annotation_context : list[dict[str, Any]] | None
    Annotation data.
max_claims : int
    Maximum claims to extract.

Returns
-------
str
    Formatted prompt for LLM.

#### parse\_claims\_response

```python
def parse_claims_response(response: str, summary_text: str,
                          sentences: list[str],
                          min_confidence: float) -> list[ExtractedClaim]
```

Parse LLM response into structured claims.

Parameters
----------
response : str
    Raw LLM response text.
summary_text : str
    Original summary text.
sentences : list[str]
    Split sentences.
min_confidence : float
    Minimum confidence threshold.

Returns
-------
list[ExtractedClaim]
    Parsed and validated claims.

#### parse\_single\_claim

```python
def parse_single_claim(claim_data: dict[str, Any],
                       min_confidence: float) -> ExtractedClaim | None
```

Parse single claim recursively.

Parameters
----------
claim_data : dict[str, Any]
    Claim data dictionary.
min_confidence : float
    Minimum confidence threshold.

Returns
-------
ExtractedClaim | None
    Parsed claim or None if below threshold.

#### split\_into\_sentences

```python
def split_into_sentences(text: str) -> list[str]
```

Split text into sentences using simple heuristics.

Parameters
----------
text : str
    Text to split.

Returns
-------
list[str]
    List of sentences.

