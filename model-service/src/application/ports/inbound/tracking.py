"""Tracking Service port definition.

This module defines the interface for video object tracking services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TrackingMaskOutput:
    """Tracking mask in output."""

    object_id: int
    mask_rle: dict[str, Any]
    confidence: float
    is_occluded: bool = False


@dataclass
class TrackingFrameOutput:
    """Tracking results for a single frame."""

    frame_number: int
    timestamp: float
    masks: list[TrackingMaskOutput]
    processing_time: float


@dataclass
class TrackingInput:
    """Input for object tracking.

    Parameters
    ----------
    video_id : str
        Unique identifier for the video.
    initial_masks : list[str]
        Base64-encoded initial masks for frame 0.
    object_ids : list[int]
        Object IDs to track.
    frame_numbers : list[int]
        Specific frames to process (empty = all).
    """

    video_id: str
    initial_masks: list[str]
    object_ids: list[int]
    frame_numbers: list[int] = field(default_factory=list)


@dataclass
class TrackingServiceOutput:
    """Output from object tracking.

    Parameters
    ----------
    result_id : str
        Unique identifier for this tracking job.
    video_id : str
        Video identifier.
    frames : list[TrackingFrameOutput]
        Frames with tracked masks.
    video_width : int
        Video frame width.
    video_height : int
        Video frame height.
    total_frames : int
        Total frames processed.
    processing_time : float
        Total processing time in seconds.
    fps : float
        Processing speed in frames per second.
    """

    result_id: str
    video_id: str
    frames: list[TrackingFrameOutput]
    video_width: int
    video_height: int
    total_frames: int
    processing_time: float
    fps: float


class ITrackingService(ABC):
    """Interface for video object tracking services.

    Implementors provide object tracking across video frames.
    """

    @abstractmethod
    async def track(self, input: TrackingInput) -> TrackingServiceOutput:
        """Track objects in video frames.

        Parameters
        ----------
        input : TrackingInput
            Tracking parameters.

        Returns
        -------
        TrackingServiceOutput
            Tracking results with metadata.

        Raises
        ------
        VideoNotFoundError
            If video cannot be found.
        InferenceError
            If tracking fails.
        """
        ...
