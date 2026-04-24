"""Pydantic schemas for object detection endpoints.

This module defines request and response schemas for the /api/detect endpoint.
"""

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    NonEmptyStr,
    NormalizedCoordinate,
    ProcessingTime,
    StrictBaseModel,
)


class BoundingBox(StrictBaseModel):
    """Bounding box coordinates for object detection.

    All coordinates are normalized to [0, 1] range.

    Attributes
    ----------
    x : float
        X coordinate (normalized).
    y : float
        Y coordinate (normalized).
    width : float
        Box width (normalized).
    height : float
        Box height (normalized).
    """

    x: NormalizedCoordinate = Field(..., description="X coordinate (normalized)")
    y: NormalizedCoordinate = Field(..., description="Y coordinate (normalized)")
    width: NormalizedCoordinate = Field(..., description="Box width (normalized)")
    height: NormalizedCoordinate = Field(..., description="Box height (normalized)")


class Detection(StrictBaseModel):
    """Single object detection result.

    Attributes
    ----------
    label : str
        Detected object label.
    bounding_box : BoundingBox
        Bounding box coordinates.
    confidence : float
        Detection confidence score.
    track_id : str | None
        Tracking ID across frames.
    """

    label: NonEmptyStr = Field(..., description="Detected object label")
    bounding_box: BoundingBox = Field(..., description="Bounding box coordinates")
    confidence: ConfidenceScore = Field(..., description="Detection confidence score")
    track_id: str | None = Field(default=None, description="Tracking ID across frames")


class FrameDetections(StrictBaseModel):
    """Detections for a single video frame.

    Attributes
    ----------
    frame_number : int
        Frame number in the video.
    timestamp : float
        Time in seconds from video start.
    detections : list[Detection]
        Detections in this frame.
    """

    frame_number: int = Field(..., ge=0, description="Frame number in the video")
    timestamp: float = Field(..., ge=0.0, description="Time in seconds from video start")
    detections: list[Detection] = Field(..., description="Detections in this frame")


class DetectionRequest(StrictBaseModel):
    """Request model for object detection endpoint.

    Attributes
    ----------
    video_id : str
        Unique identifier for the video.
    query : str
        Text query describing objects to detect.
    video_path : str | None
        Optional full path to video file.
    frame_numbers : list[int]
        Specific frames to process.
    confidence_threshold : float
        Minimum confidence for detections.
    enable_tracking : bool
        Whether to enable object tracking.
    """

    video_id: NonEmptyStr = Field(..., description="Unique identifier for the video")
    query: NonEmptyStr = Field(..., description="Text query describing objects to detect")
    video_path: str | None = Field(default=None, description="Optional full path to video file")
    frame_numbers: list[int] = Field(default_factory=list, description="Specific frames to process")
    confidence_threshold: ConfidenceScore = Field(
        default=0.3, description="Minimum confidence for detections"
    )
    enable_tracking: bool = Field(default=True, description="Whether to enable object tracking")


class DetectionResponse(StrictBaseModel):
    """Response model for object detection endpoint.

    Attributes
    ----------
    id : str
        Unique identifier for this detection job.
    video_id : str
        Video identifier.
    query : str
        Query that was used.
    frames : list[FrameDetections]
        Frames with detections.
    total_detections : int
        Total detections across all frames.
    processing_time : float
        Processing time in seconds.
    """

    id: NonEmptyStr = Field(..., description="Unique identifier for this detection job")
    video_id: NonEmptyStr = Field(..., description="Video identifier")
    query: NonEmptyStr = Field(..., description="Query that was used")
    frames: list[FrameDetections] = Field(..., description="Frames with detections")
    total_detections: int = Field(..., ge=0, description="Total detections across all frames")
    processing_time: ProcessingTime = Field(..., description="Processing time in seconds")
