"""Mappers between claims schemas and claims DTOs."""

from __future__ import annotations

from src.application.dto.claims import (
    ClaimRelationshipDTO,
    ClaimSourceDTO,
    ExtractedClaimDTO,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.claims import (
    ClaimRelationship,
    ClaimSource,
    ExtractedClaim,
)


def claim_source_schema_to_dto(schema: ClaimSource) -> ClaimSourceDTO:
    """Convert a :class:`ClaimSource` schema into a DTO."""
    return ClaimSourceDTO(
        source_id=schema.source_id,
        source_type=schema.source_type,
        claims=list(schema.claims),
        metadata=dict(schema.metadata) if schema.metadata is not None else None,
    )


def claim_relationship_schema_to_dto(schema: ClaimRelationship) -> ClaimRelationshipDTO:
    """Convert a :class:`ClaimRelationship` schema into a DTO."""
    return ClaimRelationshipDTO(
        source_claim_id=schema.source_claim_id,
        target_claim_id=schema.target_claim_id,
        relation_type=schema.relation_type,
        confidence=schema.confidence,
        notes=schema.notes,
    )


def extracted_claim_dto_to_schema(dto: ExtractedClaimDTO) -> ExtractedClaim:
    """Convert an :class:`ExtractedClaimDTO` into a :class:`ExtractedClaim` schema."""
    return ExtractedClaim(
        text=dto.text,
        sentence_index=dto.sentence_index,
        char_start=dto.char_start,
        char_end=dto.char_end,
        subclaims=[extracted_claim_dto_to_schema(sc) for sc in dto.subclaims],
        confidence=dto.confidence,
        claim_type=dto.claim_type,
    )
