"""Common Pydantic schemas and base classes.

This module provides strict base model classes and common field types
for API request/response validation.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictBaseModel(BaseModel):
    """Strict base model with enhanced validation.

    All API schemas should inherit from this class to ensure
    consistent validation behavior across the codebase.

    Configuration
    -------------
    - strict: Enables strict type coercion
    - frozen: Makes instances immutable
    - validate_default: Validates default values
    - validate_assignment: Validates on attribute assignment
    - extra: Forbids extra fields not defined in the model
    """

    model_config = ConfigDict(
        strict=True,
        frozen=True,
        validate_default=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class MutableStrictModel(BaseModel):
    """Mutable strict model for request bodies that need modification.

    Use this for request models where mutation is needed during processing.
    """

    model_config = ConfigDict(
        strict=True,
        frozen=False,
        validate_default=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


# Common annotated types for reuse
ConfidenceScore = Annotated[
    float,
    Field(ge=0.0, le=1.0, description="Confidence score between 0 and 1"),
]

NormalizedCoordinate = Annotated[
    float,
    Field(ge=0.0, le=1.0, description="Normalized coordinate between 0 and 1"),
]

PositiveInt = Annotated[
    int,
    Field(gt=0, description="Positive integer"),
]

NonNegativeInt = Annotated[
    int,
    Field(ge=0, description="Non-negative integer"),
]

NonEmptyStr = Annotated[
    str,
    Field(min_length=1, description="Non-empty string"),
]

ProcessingTime = Annotated[
    float,
    Field(ge=0.0, description="Processing time in seconds"),
]


class ErrorResponse(StrictBaseModel):
    """Error response model for API errors.

    Attributes
    ----------
    error : str
        Error type.
    message : str
        Human-readable error message.
    details : dict[str, Any] | None
        Additional error details.
    """

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any] | None = Field(default=None, description="Additional error details")


class ThumbnailGenerateRequest(StrictBaseModel):
    """Request model for thumbnail generation endpoint.

    Attributes
    ----------
    video_id : str
        Unique identifier for the video.
    video_path : str
        Path to video file.
    timestamp : float
        Timestamp to extract (seconds).
    size : str
        Thumbnail size preset.
    """

    video_id: NonEmptyStr = Field(..., description="Unique identifier for the video")
    video_path: NonEmptyStr = Field(..., description="Path to video file")
    timestamp: float = Field(default=1.0, ge=0.0, description="Timestamp to extract (seconds)")
    size: Literal["small", "medium", "large"] = Field(
        default="medium", description="Thumbnail size preset"
    )


class ThumbnailGenerateResponse(StrictBaseModel):
    """Response model for thumbnail generation endpoint.

    Attributes
    ----------
    video_id : str
        Video identifier.
    thumbnail_path : str
        Path to generated thumbnail.
    timestamp : float
        Timestamp used for extraction.
    size : str
        Size preset used.
    """

    video_id: NonEmptyStr = Field(..., description="Video identifier")
    thumbnail_path: NonEmptyStr = Field(..., description="Path to generated thumbnail")
    timestamp: float = Field(..., ge=0.0, description="Timestamp used for extraction")
    size: str = Field(..., description="Size preset used")
