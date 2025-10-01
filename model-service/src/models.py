"""
Pydantic models for API requests and responses.

This module defines the request and response schemas for the model service API
endpoints, including video summarization, ontology augmentation, and object detection.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    """
    Request model for video summarization.

    Attributes:
        video_id: Unique identifier for the video to summarize
        persona_id: Unique identifier for the persona perspective
        frame_sample_rate: Number of frames to sample per second (default: 1)
        max_frames: Maximum number of frames to process (default: 30)
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
    """
    Key frame information from video analysis.

    Attributes:
        frame_number: Frame number in the video
        timestamp: Time in seconds from video start
        description: Description of what is visible in this frame
        confidence: Model confidence score (0-1)
    """

    frame_number: int = Field(..., description="Frame number in the video")
    timestamp: float = Field(..., description="Time in seconds from video start")
    description: str = Field(..., description="Frame description")
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Model confidence score"
    )


class SummarizeResponse(BaseModel):
    """
    Response model for video summarization.

    Attributes:
        id: Unique identifier for this summary
        video_id: Video that was summarized
        persona_id: Persona perspective used
        summary: Text summary of the video content
        visual_analysis: Detailed visual content analysis
        audio_transcript: Transcribed audio content (if available)
        key_frames: List of key frames with descriptions
        confidence: Overall confidence score (0-1)
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
    """
    Suggested ontology type.

    Attributes:
        name: Type name
        description: Type description
        parent: Parent type name (if hierarchical)
        confidence: Model confidence in this suggestion (0-1)
        examples: Example instances of this type
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
    """
    Request model for ontology augmentation.

    Attributes:
        persona_id: Unique identifier for the persona
        domain: Domain description for context
        existing_types: List of existing type names for context
        target_category: Category to augment (entity, event, role, relation)
        max_suggestions: Maximum number of suggestions to return (default: 10)
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
    """
    Response model for ontology augmentation.

    Attributes:
        id: Unique identifier for this augmentation
        persona_id: Persona identifier
        target_category: Category that was augmented
        suggestions: List of suggested types
        reasoning: Explanation of why these types were suggested
    """

    id: str = Field(..., description="Unique identifier for this augmentation")
    persona_id: str = Field(..., description="Persona identifier")
    target_category: str = Field(..., description="Category that was augmented")
    suggestions: list[OntologyType] = Field(..., description="Suggested types")
    reasoning: str = Field(
        ..., description="Explanation of why these types were suggested"
    )


class BoundingBox(BaseModel):
    """
    Bounding box coordinates.

    Attributes:
        x: X coordinate (normalized 0-1)
        y: Y coordinate (normalized 0-1)
        width: Box width (normalized 0-1)
        height: Box height (normalized 0-1)
    """

    x: float = Field(..., ge=0.0, le=1.0, description="X coordinate (normalized)")
    y: float = Field(..., ge=0.0, le=1.0, description="Y coordinate (normalized)")
    width: float = Field(..., ge=0.0, le=1.0, description="Box width (normalized)")
    height: float = Field(..., ge=0.0, le=1.0, description="Box height (normalized)")


class Detection(BaseModel):
    """
    Single object detection result.

    Attributes:
        label: Detected object label
        bounding_box: Bounding box coordinates
        confidence: Detection confidence score (0-1)
        track_id: Tracking ID across frames (if tracking enabled)
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
    """
    Request model for object detection.

    Attributes:
        video_id: Unique identifier for the video
        query: Text query describing objects to detect
        frame_numbers: Specific frames to process (if empty, process all)
        confidence_threshold: Minimum confidence for detections (default: 0.3)
        enable_tracking: Whether to enable object tracking (default: True)
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
    """
    Detections for a single frame.

    Attributes:
        frame_number: Frame number in the video
        timestamp: Time in seconds from video start
        detections: List of detections in this frame
    """

    frame_number: int = Field(..., description="Frame number in the video")
    timestamp: float = Field(..., description="Time in seconds from video start")
    detections: list[Detection] = Field(..., description="Detections in this frame")


class DetectionResponse(BaseModel):
    """
    Response model for object detection.

    Attributes:
        id: Unique identifier for this detection job
        video_id: Video that was processed
        query: Query that was used
        frames: List of frames with detections
        total_detections: Total number of detections across all frames
        processing_time: Time taken to process (seconds)
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
    """
    Error response model.

    Attributes:
        error: Error type
        message: Human-readable error message
        details: Additional error details
    """

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any] | None = Field(
        default=None, description="Additional error details"
    )
