"""Claim extraction from video summaries using LLMs.

This module provides functions for extracting atomic factual claims from
summary text using language models. Supports multiple extraction strategies,
contextual enrichment from ontology and annotations, and hierarchical claim
decomposition.
"""

import json
import logging
import re
from typing import Any

from .llm_loader import GenerationConfig, LLMLoader
from .models import ExtractedClaim

logger = logging.getLogger(__name__)


async def extract_claims_from_summary(
    summary_text: str,
    sentences: list[str] | None,
    strategy: str,
    max_claims: int,
    min_confidence: float,
    llm_loader: LLMLoader,
    ontology_context: dict[str, Any] | None = None,
    annotation_context: list[dict[str, Any]] | None = None,
) -> list[ExtractedClaim]:
    """Extract atomic claims from summary text.

    Parameters
    ----------
    summary_text : str
        Full summary text to extract claims from.
    sentences : list[str] | None
        Pre-split sentences (if None, will split automatically).
    strategy : str
        Extraction strategy: "sentence-based", "semantic-units", or "hierarchical".
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
    """
    # Split into sentences if not provided
    if sentences is None:
        sentences = split_into_sentences(summary_text)

    # Build prompt based on strategy
    prompt = build_extraction_prompt(
        summary_text=summary_text,
        sentences=sentences,
        strategy=strategy,
        ontology_context=ontology_context,
        annotation_context=annotation_context,
        max_claims=max_claims,
    )

    # Generate claims using LLM
    generation_config = GenerationConfig(
        max_tokens=4096,
        temperature=0.7,
        top_p=0.9,
        stop_sequences=["---END---"],
    )

    logger.info("Extracting claims using strategy: %s", strategy)
    result = await llm_loader.generate(prompt=prompt, generation_config=generation_config)

    # Parse response
    claims = parse_claims_response(
        response=result.text,
        summary_text=summary_text,
        sentences=sentences,
        min_confidence=min_confidence,
    )

    # Limit to max_claims
    claims = claims[:max_claims]

    logger.info("Extracted %d claims", len(claims))
    return claims


def build_extraction_prompt(
    summary_text: str,
    sentences: list[str],
    strategy: str,
    ontology_context: dict[str, Any] | None,
    annotation_context: list[dict[str, Any]] | None,
    max_claims: int,
) -> str:
    """Build LLM prompt for claim extraction.

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
    """
    prompt_parts = [
        "You are an expert at analyzing text and extracting atomic factual claims.",
        "",
        "SUMMARY TEXT:",
        summary_text,
        "",
    ]

    # Add ontology context if provided
    if ontology_context and ontology_context.get("types"):
        prompt_parts.append("ONTOLOGY TYPES (for reference):")
        for type_def in ontology_context["types"][:20]:  # Limit to 20 types
            type_name = type_def.get("name")
            type_gloss = ontology_context.get("glosses", {}).get(type_def.get("id"), "")
            if type_gloss:
                prompt_parts.append(f"  - #{type_name}: {type_gloss}")
            else:
                prompt_parts.append(f"  - #{type_name}")
        prompt_parts.append("")

    # Add annotation context if provided
    if annotation_context:
        prompt_parts.append("ANNOTATED OBJECTS (for reference):")
        for ann in annotation_context[:15]:  # Limit to 15 annotations
            obj_name = ann.get("name", ann.get("label", "Unknown"))
            obj_type = ann.get("type", "")
            prompt_parts.append(f"  - @{obj_name} ({obj_type})")
        prompt_parts.append("")

    # Add strategy-specific instructions
    if strategy == "sentence-based":
        prompt_parts.extend(
            [
                "TASK: Extract atomic factual claims from the summary.",
                "",
                "INSTRUCTIONS:",
                "1. For each sentence, extract 1-5 atomic claims",
                "2. Each claim should express ONE verifiable fact",
                "3. Decompose complex sentences into subclaims",
                "4. Reference ontology types using # syntax (e.g., #Person, #Event)",
                "5. Reference annotated objects using @ syntax (e.g., @John, @Location)",
                f"6. Extract up to {max_claims} total claims",
                "",
                "OUTPUT FORMAT (JSON array):",
                "[",
                "  {",
                '    "text": "The JWST was launched",',
                '    "sentence_index": 0,',
                '    "char_start": 0,',
                '    "char_end": 25,',
                '    "subclaims": [',
                "      {",
                '        "text": "JWST is a telescope",',
                '        "confidence": 0.95,',
                '        "claim_type": "entity"',
                "      }",
                "    ],",
                '    "confidence": 0.92,',
                '    "claim_type": "event"',
                "  }",
                "]",
                "",
                "Extract claims now:",
            ]
        )

    elif strategy == "hierarchical":
        prompt_parts.extend(
            [
                "TASK: Extract claims using hierarchical decomposition.",
                "",
                "INSTRUCTIONS:",
                "1. Identify top-level claims (main facts)",
                "2. Decompose each top-level claim into 2-5 subclaims",
                "3. Each subclaim can have its own subclaims (max depth: 3)",
                "4. Use # for types and @ for objects",
                f"5. Extract up to {max_claims} top-level claims",
                "",
                "OUTPUT FORMAT: Same as sentence-based",
                "",
                "Extract claims now:",
            ]
        )

    else:  # semantic-units
        prompt_parts.extend(
            [
                "TASK: Extract claims from semantic units (not necessarily sentences).",
                "",
                "INSTRUCTIONS:",
                "1. Identify semantic boundaries (logical chunks)",
                "2. Extract atomic claims from each chunk",
                "3. Use # for types and @ for objects",
                f"4. Extract up to {max_claims} claims",
                "",
                "OUTPUT FORMAT: Same as sentence-based",
                "",
                "Extract claims now:",
            ]
        )

    return "\n".join(prompt_parts)


def parse_claims_response(
    response: str,
    summary_text: str,
    sentences: list[str],
    min_confidence: float,
) -> list[ExtractedClaim]:
    """Parse LLM response into structured claims.

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
    """
    # Extract JSON from response
    json_match = re.search(r"\[.*\]", response, re.DOTALL)
    if not json_match:
        logger.warning("No JSON array found in response")
        return []

    try:
        claims_data = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {e}")
        return []

    # Convert to ExtractedClaim objects
    claims = []
    for claim_data in claims_data:
        try:
            # Validate and filter by confidence
            confidence = claim_data.get("confidence", 0.5)
            if confidence < min_confidence:
                continue

            # Recursively parse subclaims
            subclaims = []
            for subclaim_data in claim_data.get("subclaims", []):
                subclaim = parse_single_claim(subclaim_data, min_confidence)
                if subclaim:
                    subclaims.append(subclaim)

            # Create claim
            claim = ExtractedClaim(
                text=claim_data["text"],
                sentence_index=claim_data.get("sentence_index"),
                char_start=claim_data.get("char_start"),
                char_end=claim_data.get("char_end"),
                subclaims=subclaims,
                confidence=confidence,
                claim_type=claim_data.get("claim_type"),
            )

            claims.append(claim)

        except Exception as e:
            logger.warning(f"Failed to parse claim: {e}")
            continue

    return claims


def parse_single_claim(claim_data: dict[str, Any], min_confidence: float) -> ExtractedClaim | None:
    """Parse single claim recursively.

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
    """
    confidence = claim_data.get("confidence", 0.5)
    if confidence < min_confidence:
        return None

    subclaims = []
    for subclaim_data in claim_data.get("subclaims", []):
        subclaim = parse_single_claim(subclaim_data, min_confidence)
        if subclaim:
            subclaims.append(subclaim)

    return ExtractedClaim(
        text=claim_data["text"],
        sentence_index=claim_data.get("sentence_index"),
        char_start=claim_data.get("char_start"),
        char_end=claim_data.get("char_end"),
        subclaims=subclaims,
        confidence=confidence,
        claim_type=claim_data.get("claim_type"),
    )


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences using simple heuristics.

    Parameters
    ----------
    text : str
        Text to split.

    Returns
    -------
    list[str]
        List of sentences.
    """
    # Simple sentence splitting (can be improved with spaCy/NLTK)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if s.strip()]
