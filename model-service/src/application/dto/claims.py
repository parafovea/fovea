"""DTOs for claim extraction and synthesis use cases.

These are framework-neutral data transfer objects used by application-layer
use cases. They intentionally avoid any dependency on FastAPI, Pydantic
web schemas, or infrastructure types.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExtractedClaimDTO:
    """Single extracted claim with metadata.

    Parameters
    ----------
    text : str
        Claim text.
    confidence : float
        Model confidence in claim extraction in [0.0, 1.0].
    sentence_index : int | None
        Index of source sentence (if sentence-based).
    char_start : int | None
        Character offset in summary text.
    char_end : int | None
        Character offset end in summary text.
    subclaims : list[ExtractedClaimDTO]
        Nested subclaims.
    claim_type : str | None
        Semantic type of claim.
    """

    text: str
    confidence: float
    sentence_index: int | None = None
    char_start: int | None = None
    char_end: int | None = None
    subclaims: list[ExtractedClaimDTO] = field(default_factory=list)
    claim_type: str | None = None


@dataclass
class ClaimSourceDTO:
    """Source of claims for synthesis (single video or collection).

    Parameters
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

    source_id: str
    source_type: str
    claims: list[dict[str, Any]]
    metadata: dict[str, Any] | None = None


@dataclass
class ClaimRelationshipDTO:
    """Relationship between claims across sources.

    Parameters
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

    source_claim_id: str
    target_claim_id: str
    relation_type: str
    confidence: float = 0.8
    notes: str | None = None
