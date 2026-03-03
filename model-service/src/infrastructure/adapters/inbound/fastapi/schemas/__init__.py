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
common
    Shared schemas and base classes.
"""

from src.infrastructure.adapters.inbound.fastapi.schemas.claims import (
    ClaimExtractionRequest,
    ClaimExtractionResponse,
    ClaimRelationship,
    ClaimSource,
    ExtractedClaim,
    SummarySynthesisRequest,
    SummarySynthesisResponse,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    ErrorResponse,
    MutableStrictModel,
    NonEmptyStr,
    NonNegativeInt,
    NormalizedCoordinate,
    PositiveInt,
    ProcessingTime,
    StrictBaseModel,
    ThumbnailGenerateRequest,
    ThumbnailGenerateResponse,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.detection import (
    BoundingBox,
    Detection,
    DetectionRequest,
    DetectionResponse,
    FrameDetections,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.ontology import (
    AugmentRequest,
    AugmentResponse,
    OntologyType,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.summarization import (
    KeyFrame,
    SummarizeRequest,
    SummarizeResponse,
)
from src.infrastructure.adapters.inbound.fastapi.schemas.tracking import (
    TrackingFrameResult,
    TrackingMaskData,
    TrackingRequest,
    TrackingResponse,
)

__all__ = [
    # Ontology
    "AugmentRequest",
    "AugmentResponse",
    # Detection
    "BoundingBox",
    # Claims
    "ClaimExtractionRequest",
    "ClaimExtractionResponse",
    "ClaimRelationship",
    "ClaimSource",
    # Common
    "ConfidenceScore",
    "Detection",
    "DetectionRequest",
    "DetectionResponse",
    "ErrorResponse",
    "ExtractedClaim",
    "FrameDetections",
    # Summarization
    "KeyFrame",
    "MutableStrictModel",
    "NonEmptyStr",
    "NonNegativeInt",
    "NormalizedCoordinate",
    "OntologyType",
    "PositiveInt",
    "ProcessingTime",
    "StrictBaseModel",
    "SummarizeRequest",
    "SummarizeResponse",
    "SummarySynthesisRequest",
    "SummarySynthesisResponse",
    "ThumbnailGenerateRequest",
    "ThumbnailGenerateResponse",
    # Tracking
    "TrackingFrameResult",
    "TrackingMaskData",
    "TrackingRequest",
    "TrackingResponse",
]
