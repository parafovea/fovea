"""Pydantic schemas for video tracking endpoints.

This module defines request and response schemas for the /api/track endpoint.
"""

from typing import Any

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import (
    ConfidenceScore,
    NonEmptyStr,
    PositiveInt,
    ProcessingTime,
    StrictBaseModel,
)


class TrackingMaskData(StrictBaseModel):
    """RLE-encoded segmentation mask for tracked object.

    Attributes
    ----------
    object_id : int
        Unique identifier for tracked object.
    mask_rle : dict[str, Any]
        RLE-encoded mask with 'size' and 'counts' keys.
    confidence : float
        Mask prediction confidence.
    is_occluded : bool
        Whether object is occluded in this frame.
    """

    object_id: int = Field(..., description="Unique identifier for tracked object")
    mask_rle: dict[str, Any] = Field(
        ..., description="RLE-encoded mask with 'size' and 'counts' keys"
    )
    confidence: ConfidenceScore = Field(..., description="Mask prediction confidence")
    is_occluded: bool = Field(default=False, description="Whether object is occluded in this frame")


class TrackingFrameResult(StrictBaseModel):
    """Tracking results for a single video frame.

    Attributes
    ----------
    frame_number : int
        Frame number in the video.
    timestamp : float
        Time in seconds from video start.
    masks : list[TrackingMaskData]
        Tracked object masks.
    processing_time : float
        Processing time for this frame in seconds.
    """

    frame_number: int = Field(..., ge=0, description="Frame number in the video")
    timestamp: float = Field(..., ge=0.0, description="Time in seconds from video start")
    masks: list[TrackingMaskData] = Field(..., description="Tracked object masks")
    processing_time: ProcessingTime = Field(
        ..., description="Processing time for this frame in seconds"
    )


class TrackingRequest(StrictBaseModel):
    """Request model for object tracking endpoint.

    Attributes
    ----------
    video_id : str
        Unique identifier for the video.
    initial_masks : list[str]
        Base64-encoded initial masks for frame 0 (numpy arrays).
    object_ids : list[int]
        Object IDs to track.
    frame_numbers : list[int]
        Specific frames to process (empty = all).
    """

    video_id: NonEmptyStr = Field(..., description="Unique identifier for the video")
    initial_masks: list[str] = Field(
        ..., description="Base64-encoded initial masks for frame 0 (numpy arrays)"
    )
    object_ids: list[int] = Field(..., description="Object IDs to track")
    frame_numbers: list[int] = Field(
        default_factory=list, description="Specific frames to process (empty = all)"
    )


class TrackingResponse(StrictBaseModel):
    """Response model for object tracking endpoint.

    Attributes
    ----------
    id : str
        Unique identifier for this tracking job.
    video_id : str
        Video identifier.
    frames : list[TrackingFrameResult]
        Frames with tracked masks.
    video_width : int
        Video frame width in pixels.
    video_height : int
        Video frame height in pixels.
    total_frames : int
        Total frames processed.
    processing_time : float
        Total processing time in seconds.
    fps : float
        Processing speed in frames per second.
    """

    id: NonEmptyStr = Field(..., description="Unique identifier for this tracking job")
    video_id: NonEmptyStr = Field(..., description="Video identifier")
    frames: list[TrackingFrameResult] = Field(..., description="Frames with tracked masks")
    video_width: PositiveInt = Field(..., description="Video frame width in pixels")
    video_height: PositiveInt = Field(..., description="Video frame height in pixels")
    total_frames: int = Field(..., ge=0, description="Total frames processed")
    processing_time: ProcessingTime = Field(..., description="Total processing time in seconds")
    fps: float = Field(..., ge=0.0, description="Processing speed in frames per second")
