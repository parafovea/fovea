"""Mappers between ontology schemas and ontology DTOs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.infrastructure.adapters.inbound.fastapi.mappers.reasoning import (
    thinking_trace_dto_to_schema,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.ontology import OntologyType

if TYPE_CHECKING:
    from src.application.dto.ontology import OntologyTypeDTO


def ontology_type_dto_to_schema(dto: OntologyTypeDTO) -> OntologyType:
    """Convert an :class:`OntologyTypeDTO` into an :class:`OntologyType` schema."""
    return OntologyType(
        name=dto.name,
        description=dto.description,
        parent=dto.parent,
        confidence=dto.confidence,
        examples=list(dto.examples),
        thinking=(
            thinking_trace_dto_to_schema(dto.reasoning_trace)
            if dto.reasoning_trace is not None
            else None
        ),
    )
