"""Pydantic schemas for ontology augmentation endpoints.

This module defines request and response schemas for the /api/ontology/augment endpoint.
"""

from typing import Literal

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    NonEmptyStr,
    StrictBaseModel,
)


class OntologyType(StrictBaseModel):
    """Suggested ontology type from augmentation.

    Attributes
    ----------
    name : str
        Type name.
    description : str
        Type description.
    parent : str | None
        Parent type name.
    confidence : float
        Confidence score.
    examples : list[str]
        Example instances.
    """

    name: NonEmptyStr = Field(..., description="Type name")
    description: str = Field(..., description="Type description")
    parent: str | None = Field(default=None, description="Parent type name")
    confidence: ConfidenceScore = Field(default=0.0, description="Confidence score")
    examples: list[str] = Field(default_factory=list, description="Example instances")


class AugmentRequest(StrictBaseModel):
    """Request model for ontology augmentation endpoint.

    Attributes
    ----------
    persona_id : str
        Unique identifier for the persona.
    domain : str
        Domain description for context.
    existing_types : list[str]
        Existing type names.
    target_category : str
        Category to augment (entity, event, role, relation).
    max_suggestions : int
        Maximum suggestions to return.
    """

    persona_id: NonEmptyStr = Field(..., description="Unique identifier for the persona")
    domain: NonEmptyStr = Field(..., description="Domain description for context")
    existing_types: list[str] = Field(default_factory=list, description="Existing type names")
    target_category: Literal["entity", "event", "role", "relation"] = Field(
        ..., description="Category to augment"
    )
    max_suggestions: int = Field(
        default=10, ge=1, le=50, description="Maximum suggestions to return"
    )


class AugmentResponse(StrictBaseModel):
    """Response model for ontology augmentation endpoint.

    Attributes
    ----------
    id : str
        Unique identifier for this augmentation.
    persona_id : str
        Persona identifier.
    target_category : str
        Category that was augmented.
    suggestions : list[OntologyType]
        Suggested types.
    reasoning : str
        Explanation of why these types were suggested.
    """

    id: NonEmptyStr = Field(..., description="Unique identifier for this augmentation")
    persona_id: NonEmptyStr = Field(..., description="Persona identifier")
    target_category: str = Field(..., description="Category that was augmented")
    suggestions: list[OntologyType] = Field(..., description="Suggested types")
    reasoning: str = Field(..., description="Explanation of why these types were suggested")
