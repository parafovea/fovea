"""DTOs for object tracking use cases.

Framework-neutral data transfer objects used by tracking use cases.
No dependencies on FastAPI, Pydantic schemas, or ML frameworks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TrackingMaskDTO:
    """RLE-encoded mask for a tracked object."""

    object_id: int
    mask_rle: dict[str, Any]
    confidence: float
    is_occluded: bool = False


@dataclass
class TrackingFrameDTO:
    """Tracking results for a single video frame."""

    frame_number: int
    timestamp: float
    masks: list[TrackingMaskDTO]
    processing_time: float


@dataclass
class TrackObjectsRequestDTO:
    """Request parameters for tracking over a video.

    Parameters
    ----------
    video_id : str
        Video identifier.
    video_path : str
        Resolved local path to the video.
    initial_masks_b64 : list[str]
        Base64-encoded initial masks for frame 0 (uint8 byte buffers).
    object_ids : list[int]
        Unique IDs for objects to track.
    frame_numbers : list[int]
        Frames to process (empty means all).
    """

    video_id: str
    video_path: str
    initial_masks_b64: list[str]
    object_ids: list[int]
    frame_numbers: list[int] = field(default_factory=list)


@dataclass
class TrackObjectsResponseDTO:
    """Aggregated tracking result."""

    id: str
    video_id: str
    frames: list[TrackingFrameDTO]
    video_width: int
    video_height: int
    total_frames: int
    processing_time: float
    fps: float


@dataclass
class TrackingResultDTO:
    """Alias-style DTO representing a per-frame tracking outcome.

    Provided as a convenience name for downstream mappers; equivalent to
    :class:`TrackingFrameDTO`.
    """

    frame_number: int
    timestamp: float
    masks: list[TrackingMaskDTO]
    processing_time: float
