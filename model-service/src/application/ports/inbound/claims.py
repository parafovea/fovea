"""Claims Service port definitions.

This module defines interfaces for claim extraction and synthesis services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExtractedClaimOutput:
    """Extracted claim in output."""

    text: str
    confidence: float
    sentence_index: int | None = None
    char_start: int | None = None
    char_end: int | None = None
    claim_type: str | None = None
    subclaims: list["ExtractedClaimOutput"] = field(default_factory=list)


@dataclass
class ClaimExtractionInput:
    """Input for claim extraction.

    Parameters
    ----------
    summary_id : str
        Unique identifier for the summary.
    summary_text : str
        Full summary text to extract claims from.
    sentences : list[str] | None
        Pre-split sentences.
    annotations : list[dict] | None
        Annotation data for context.
    ontology_types : list[dict] | None
        Ontology type definitions.
    ontology_glosses : dict[str, str] | None
        Map of type ID to gloss text.
    extraction_strategy : ClaimExtractionStrategy
        Strategy for extracting claims.
    max_claims : int
        Maximum claims to extract.
    min_confidence : float
        Minimum confidence threshold.
    """

    summary_id: str
    summary_text: str
    sentences: list[str] | None = None
    annotations: list[dict[str, Any]] | None = None
    ontology_types: list[dict[str, Any]] | None = None
    ontology_glosses: dict[str, str] | None = None
    extraction_strategy: str = "sentence-based"
    max_claims: int = 50
    min_confidence: float = 0.5


@dataclass
class ClaimExtractionOutput:
    """Output from claim extraction.

    Parameters
    ----------
    summary_id : str
        Summary identifier.
    claims : list[ExtractedClaimOutput]
        Extracted claims.
    model_used : str
        LLM model used.
    processing_time : float
        Processing time in seconds.
    """

    summary_id: str
    claims: list[ExtractedClaimOutput]
    model_used: str
    processing_time: float


class IClaimExtractionService(ABC):
    """Interface for claim extraction services.

    Implementors extract claims from summary text.
    """

    @abstractmethod
    async def extract(self, input: ClaimExtractionInput) -> ClaimExtractionOutput:
        """Extract claims from summary.

        Parameters
        ----------
        input : ClaimExtractionInput
            Extraction parameters.

        Returns
        -------
        ClaimExtractionOutput
            Extracted claims with metadata.

        Raises
        ------
        ClaimExtractionError
            If extraction fails.
        """
        ...


@dataclass
class ClaimSourceInput:
    """Source of claims for synthesis."""

    source_id: str
    source_type: str
    claims: list[dict[str, Any]]
    metadata: dict[str, Any] | None = None


@dataclass
class ClaimRelationInput:
    """Relationship between claims."""

    source_claim_id: str
    target_claim_id: str
    relation_type: str
    confidence: float = 0.8
    notes: str | None = None


@dataclass
class ClaimSynthesisInput:
    """Input for claim synthesis.

    Parameters
    ----------
    summary_id : str
        Target summary identifier.
    claim_sources : list[ClaimSourceInput]
        Claim hierarchies from sources.
    claim_relations : list[ClaimRelationInput] | None
        Relationships between claims.
    ontology_context : dict | None
        Ontology types and glosses.
    persona_context : dict | None
        Persona information.
    synthesis_strategy : SynthesisStrategy
        Strategy for organizing summary.
    max_length : int
        Maximum summary length in words.
    include_conflicts : bool
        Mention informational conflicts.
    include_citations : bool
        Include inline citations.
    """

    summary_id: str
    claim_sources: list[ClaimSourceInput]
    claim_relations: list[ClaimRelationInput] | None = None
    ontology_context: dict[str, Any] | None = None
    persona_context: dict[str, Any] | None = None
    synthesis_strategy: str = "hierarchical"
    max_length: int = 500
    include_conflicts: bool = True
    include_citations: bool = False


@dataclass
class ClaimSynthesisOutput:
    """Output from claim synthesis.

    Parameters
    ----------
    summary_id : str
        Summary identifier.
    summary_gloss : list[dict]
        Generated summary as GlossItem array.
    model_used : str
        LLM model used.
    processing_time : float
        Processing time in seconds.
    claims_used : int
        Total claims synthesized.
    synthesis_metadata : dict
        Metadata about synthesis.
    """

    summary_id: str
    summary_gloss: list[dict[str, Any]]
    model_used: str
    processing_time: float
    claims_used: int
    synthesis_metadata: dict[str, Any] = field(default_factory=dict)


class IClaimSynthesisService(ABC):
    """Interface for claim synthesis services.

    Implementors synthesize summaries from claims.
    """

    @abstractmethod
    async def synthesize(self, input: ClaimSynthesisInput) -> ClaimSynthesisOutput:
        """Synthesize summary from claims.

        Parameters
        ----------
        input : ClaimSynthesisInput
            Synthesis parameters.

        Returns
        -------
        ClaimSynthesisOutput
            Synthesized summary with metadata.

        Raises
        ------
        ClaimSynthesisError
            If synthesis fails.
        """
        ...
