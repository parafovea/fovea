"""DTOs for object detection use cases.

Framework-neutral data transfer objects used by detection use cases.
No dependencies on FastAPI, Pydantic schemas, or ML frameworks.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BoundingBoxDTO:
    """Axis-aligned bounding box in normalized coordinates.

    Parameters
    ----------
    x : float
        Left edge (0.0 to 1.0).
    y : float
        Top edge (0.0 to 1.0).
    width : float
        Width (0.0 to 1.0).
    height : float
        Height (0.0 to 1.0).
    """

    x: float
    y: float
    width: float
    height: float


@dataclass
class DetectionDTO:
    """A single detected object.

    Parameters
    ----------
    label : str
        Object class label.
    bounding_box : BoundingBoxDTO
        Normalized bounding box.
    confidence : float
        Confidence score in [0.0, 1.0].
    track_id : str | None
        Optional tracking identifier.
    """

    label: str
    bounding_box: BoundingBoxDTO
    confidence: float
    track_id: str | None = None


@dataclass
class FrameDetectionsDTO:
    """Detections for a single video frame."""

    frame_number: int
    timestamp: float
    detections: list[DetectionDTO] = field(default_factory=list)


@dataclass
class DetectObjectsRequestDTO:
    """Request parameters for detection over a video.

    Parameters
    ----------
    video_id : str
        Video identifier.
    query : str
        Text query describing objects to detect.
    video_path : str
        Resolved local path to the video.
    frame_numbers : list[int]
        Frames to process (empty means default selection).
    confidence_threshold : float
        Minimum detection confidence.
    enable_tracking : bool
        Whether to enable tracking.
    """

    video_id: str
    query: str
    video_path: str
    frame_numbers: list[int] = field(default_factory=list)
    confidence_threshold: float = 0.3
    enable_tracking: bool = True


@dataclass
class DetectObjectsResponseDTO:
    """Aggregated detection result.

    ``video_width`` and ``video_height`` are the source frame dimensions in
    pixels, needed to convert normalized bounding boxes to the pixel-integer
    coordinates the layers ``boundingBox`` model requires.
    """

    id: str
    video_id: str
    query: str
    frames: list[FrameDetectionsDTO]
    total_detections: int
    processing_time: float
    video_width: int
    video_height: int
