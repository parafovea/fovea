"""Pydantic schemas for claim extraction and synthesis endpoints.

This module defines request and response schemas for the /api/claims/* endpoints.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    NonEmptyStr,
    PositiveInt,
    ProcessingTime,
    StrictBaseModel,
)


class ExtractedClaim(StrictBaseModel):
    """Single extracted claim with metadata.

    Attributes
    ----------
    text : str
        Claim text.
    sentence_index : int | None
        Index of source sentence (if sentence-based).
    char_start : int | None
        Character offset in summary text.
    char_end : int | None
        Character offset end in summary text.
    subclaims : list[ExtractedClaim]
        Nested subclaims.
    confidence : float
        Model confidence in claim extraction.
    claim_type : str | None
        Semantic type of claim.
    """

    text: NonEmptyStr = Field(..., description="Claim text")
    sentence_index: int | None = Field(
        default=None, ge=0, description="Index of source sentence (if sentence-based)"
    )
    char_start: int | None = Field(
        default=None, ge=0, description="Character offset in summary text"
    )
    char_end: int | None = Field(
        default=None, ge=0, description="Character offset end in summary text"
    )
    subclaims: list[ExtractedClaim] = Field(
        default_factory=list, description="Nested subclaims"
    )
    confidence: ConfidenceScore = Field(
        ..., description="Model confidence in claim extraction"
    )
    claim_type: str | None = Field(default=None, description="Semantic type of claim")


class ClaimExtractionRequest(StrictBaseModel):
    """Request model for claim extraction endpoint.

    Attributes
    ----------
    summary_id : str
        Unique identifier for the summary.
    summary_text : str
        Full summary text to extract claims from.
    sentences : list[str] | None
        Pre-split sentences (optional).
    annotations : list[dict[str, Any]] | None
        Annotation data for context.
    ontology_types : list[dict[str, Any]] | None
        Ontology type definitions for context.
    ontology_glosses : dict[str, str] | None
        Map of type ID to gloss text.
    extraction_strategy : str
        Strategy for extracting claims.
    max_claims : int
        Maximum number of claims to extract.
    min_confidence : float
        Minimum confidence threshold for claims.
    """

    summary_id: NonEmptyStr = Field(..., description="Unique identifier for the summary")
    summary_text: NonEmptyStr = Field(..., description="Full summary text to extract claims from")
    sentences: list[str] | None = Field(
        default=None, description="Pre-split sentences (optional, will split if not provided)"
    )

    # Optional context sources
    annotations: list[dict[str, Any]] | None = Field(
        default=None, description="Annotation data for context (object names, times, etc.)"
    )
    ontology_types: list[dict[str, Any]] | None = Field(
        default=None, description="Ontology type definitions for context"
    )
    ontology_glosses: dict[str, str] | None = Field(
        default=None, description="Map of type ID to gloss text"
    )

    # Extraction configuration
    extraction_strategy: Literal["sentence-based", "semantic-units", "hierarchical"] = Field(
        default="sentence-based", description="Strategy for extracting claims"
    )
    max_claims: int = Field(
        default=50, ge=1, le=200, description="Maximum number of claims to extract"
    )
    min_confidence: ConfidenceScore = Field(
        default=0.5, description="Minimum confidence threshold for claims"
    )


class ClaimExtractionResponse(StrictBaseModel):
    """Response model for claim extraction endpoint.

    Attributes
    ----------
    summary_id : str
        Summary identifier.
    claims : list[ExtractedClaim]
        Extracted claims.
    model_used : str
        LLM model used for extraction.
    processing_time : float
        Processing time in seconds.
    """

    summary_id: NonEmptyStr = Field(..., description="Summary identifier")
    claims: list[ExtractedClaim] = Field(..., description="Extracted claims")
    model_used: NonEmptyStr = Field(..., description="LLM model used for extraction")
    processing_time: ProcessingTime = Field(..., description="Processing time in seconds")


class ClaimSource(StrictBaseModel):
    """Source of claims for synthesis (single video or collection).

    Attributes
    ----------
    source_id : str
        Video ID or collection ID.
    source_type : str
        Type of source (video or collection).
    claims : list[dict[str, Any]]
        Hierarchical claim structure.
    metadata : dict[str, Any] | None
        Source metadata (video title, date, etc.).
    """

    source_id: NonEmptyStr = Field(..., description="Video ID or collection ID")
    source_type: Literal["video", "collection"] = Field(..., description="Type of source")
    claims: list[dict[str, Any]] = Field(..., description="Hierarchical claim structure")
    metadata: dict[str, Any] | None = Field(
        default=None, description="Source metadata (video title, date, etc.)"
    )


class ClaimRelationship(StrictBaseModel):
    """Relationship between claims across sources.

    Attributes
    ----------
    source_claim_id : str
        Source claim ID.
    target_claim_id : str
        Target claim ID.
    relation_type : str
        Type of relationship.
    confidence : float
        Confidence score.
    notes : str | None
        Optional notes.
    """

    source_claim_id: NonEmptyStr = Field(..., description="Source claim ID")
    target_claim_id: NonEmptyStr = Field(..., description="Target claim ID")
    relation_type: Literal[
        "supports",
        "conflicts_with",
        "contradicts",
        "refines",
        "generalizes",
        "duplicates",
    ] = Field(..., description="Type of relationship")
    confidence: ConfidenceScore = Field(default=0.8, description="Confidence score")
    notes: str | None = Field(default=None, description="Optional notes")


class SummarySynthesisRequest(StrictBaseModel):
    """Request model for summary synthesis endpoint.

    Attributes
    ----------
    summary_id : str
        Target summary identifier.
    claim_sources : list[ClaimSource]
        Claim hierarchies from one or more sources.
    claim_relations : list[ClaimRelationship] | None
        Relationships between claims.
    ontology_context : dict[str, Any] | None
        Ontology types and glosses for references.
    persona_context : dict[str, Any] | None
        Persona information for perspective.
    synthesis_strategy : str
        Strategy for organizing summary.
    max_length : int
        Maximum summary length in words.
    include_conflicts : bool
        Explicitly mention informational conflicts.
    include_citations : bool
        Include inline citations to source claims.
    """

    summary_id: NonEmptyStr = Field(..., description="Target summary identifier")

    # Input sources (single or multiple)
    claim_sources: list[ClaimSource] = Field(
        ..., min_length=1, description="Claim hierarchies from one or more sources"
    )

    # Inter-claim relationships
    claim_relations: list[ClaimRelationship] | None = Field(
        default=None, description="Relationships between claims (conflicts, support, etc.)"
    )

    # Context for synthesis
    ontology_context: dict[str, Any] | None = Field(
        default=None, description="Ontology types and glosses for # references"
    )
    persona_context: dict[str, Any] | None = Field(
        default=None, description="Persona information for perspective"
    )

    # Synthesis configuration
    synthesis_strategy: Literal[
        "hierarchical",
        "chronological",
        "narrative",
        "analytical",
    ] = Field(default="hierarchical", description="Strategy for organizing summary")

    max_length: int = Field(
        default=500, ge=100, le=2000, description="Maximum summary length in words"
    )

    include_conflicts: bool = Field(
        default=True, description="Explicitly mention informational conflicts"
    )

    include_citations: bool = Field(
        default=False, description="Include inline citations to source claims"
    )


class SummarySynthesisResponse(StrictBaseModel):
    """Response model for summary synthesis endpoint.

    Attributes
    ----------
    summary_id : str
        Summary identifier.
    summary_gloss : list[dict[str, Any]]
        Generated summary as GlossItem array with references.
    model_used : str
        LLM model used for synthesis.
    processing_time : float
        Processing time in seconds.
    claims_used : int
        Total claims synthesized.
    synthesis_metadata : dict[str, Any]
        Metadata about synthesis.
    """

    summary_id: NonEmptyStr = Field(..., description="Summary identifier")
    summary_gloss: list[dict[str, Any]] = Field(
        ..., description="Generated summary as GlossItem array with # and @ references"
    )
    model_used: NonEmptyStr = Field(..., description="LLM model used for synthesis")
    processing_time: ProcessingTime = Field(..., description="Processing time in seconds")
    claims_used: int = Field(..., ge=0, description="Total claims synthesized")
    synthesis_metadata: dict[str, Any] = Field(
        ..., description="Metadata about synthesis (strategy, conflicts, etc.)"
    )
