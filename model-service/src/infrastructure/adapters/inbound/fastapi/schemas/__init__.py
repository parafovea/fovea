"""Pydantic request/response schemas.

This package contains Pydantic models for API request validation
and response serialization.

Modules
-------
summarization
    Schemas for summarization endpoints.
detection
    Schemas for detection endpoints.
tracking
    Schemas for tracking endpoints.
ontology
    Schemas for ontology endpoints.
claims
    Schemas for claim extraction/synthesis endpoints.
models
    Schemas for model management endpoints.
common
    Shared schemas and base classes.
"""

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    MutableStrictModel,
    NonEmptyStr,
    NonNegativeInt,
    NormalizedCoordinate,
    PositiveInt,
    ProcessingTime,
    StrictBaseModel,
)

__all__ = [
    "ConfidenceScore",
    "MutableStrictModel",
    "NonEmptyStr",
    "NonNegativeInt",
    "NormalizedCoordinate",
    "PositiveInt",
    "ProcessingTime",
    "StrictBaseModel",
]
