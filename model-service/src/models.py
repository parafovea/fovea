"""Pydantic models for API requests and responses.

This module defines the request and response schemas for the model service API
endpoints, including video summarization, ontology augmentation, and object detection.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    """Request model for video summarization endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    video_id: str = Field(..., description="Unique identifier for the video")
    persona_id: str = Field(..., description="Unique identifier for the persona")
    frame_sample_rate: int = Field(
        default=1, ge=1, le=10, description="Frames to sample per second"
    )
    max_frames: int = Field(
        default=30, ge=1, le=100, description="Maximum frames to process"
    )


class KeyFrame(BaseModel):
    """Key frame information from video analysis.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    frame_number: int = Field(..., description="Frame number in the video")
    timestamp: float = Field(..., description="Time in seconds from video start")
    description: str = Field(..., description="Frame description")
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Model confidence score"
    )


class SummarizeResponse(BaseModel):
    """Response model for video summarization endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    id: str = Field(..., description="Unique identifier for this summary")
    video_id: str = Field(..., description="Video identifier")
    persona_id: str = Field(..., description="Persona identifier")
    summary: str = Field(..., description="Text summary of video content")
    visual_analysis: str | None = Field(
        default=None, description="Detailed visual content analysis"
    )
    audio_transcript: str | None = Field(
        default=None, description="Transcribed audio content"
    )
    key_frames: list[KeyFrame] = Field(
        default_factory=list, description="Key frames with descriptions"
    )
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Overall confidence score"
    )


class OntologyType(BaseModel):
    """Suggested ontology type from augmentation.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    name: str = Field(..., description="Type name")
    description: str = Field(..., description="Type description")
    parent: str | None = Field(default=None, description="Parent type name")
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Confidence score"
    )
    examples: list[str] = Field(
        default_factory=list, description="Example instances"
    )


class AugmentRequest(BaseModel):
    """Request model for ontology augmentation endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    persona_id: str = Field(..., description="Unique identifier for the persona")
    domain: str = Field(..., description="Domain description for context")
    existing_types: list[str] = Field(
        default_factory=list, description="Existing type names"
    )
    target_category: Literal["entity", "event", "role", "relation"] = Field(
        ..., description="Category to augment"
    )
    max_suggestions: int = Field(
        default=10, ge=1, le=50, description="Maximum suggestions to return"
    )


class AugmentResponse(BaseModel):
    """Response model for ontology augmentation endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    id: str = Field(..., description="Unique identifier for this augmentation")
    persona_id: str = Field(..., description="Persona identifier")
    target_category: str = Field(..., description="Category that was augmented")
    suggestions: list[OntologyType] = Field(..., description="Suggested types")
    reasoning: str = Field(
        ..., description="Explanation of why these types were suggested"
    )


class BoundingBox(BaseModel):
    """Bounding box coordinates for object detection.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    x: float = Field(..., ge=0.0, le=1.0, description="X coordinate (normalized)")
    y: float = Field(..., ge=0.0, le=1.0, description="Y coordinate (normalized)")
    width: float = Field(..., ge=0.0, le=1.0, description="Box width (normalized)")
    height: float = Field(..., ge=0.0, le=1.0, description="Box height (normalized)")


class Detection(BaseModel):
    """Single object detection result.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    label: str = Field(..., description="Detected object label")
    bounding_box: BoundingBox = Field(..., description="Bounding box coordinates")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Detection confidence score"
    )
    track_id: str | None = Field(
        default=None, description="Tracking ID across frames"
    )


class DetectionRequest(BaseModel):
    """Request model for object detection endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    video_id: str = Field(..., description="Unique identifier for the video")
    query: str = Field(..., description="Text query describing objects to detect")
    frame_numbers: list[int] = Field(
        default_factory=list, description="Specific frames to process"
    )
    confidence_threshold: float = Field(
        default=0.3, ge=0.0, le=1.0, description="Minimum confidence for detections"
    )
    enable_tracking: bool = Field(
        default=True, description="Whether to enable object tracking"
    )


class FrameDetections(BaseModel):
    """Detections for a single video frame.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    frame_number: int = Field(..., description="Frame number in the video")
    timestamp: float = Field(..., description="Time in seconds from video start")
    detections: list[Detection] = Field(..., description="Detections in this frame")


class DetectionResponse(BaseModel):
    """Response model for object detection endpoint.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    id: str = Field(..., description="Unique identifier for this detection job")
    video_id: str = Field(..., description="Video identifier")
    query: str = Field(..., description="Query that was used")
    frames: list[FrameDetections] = Field(..., description="Frames with detections")
    total_detections: int = Field(
        ..., description="Total detections across all frames"
    )
    processing_time: float = Field(..., description="Processing time in seconds")


class ErrorResponse(BaseModel):
    """Error response model for API errors.

    Fields are validated using Pydantic. See Field descriptions for details.
    """

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any] | None = Field(
        default=None, description="Additional error details"
    )
