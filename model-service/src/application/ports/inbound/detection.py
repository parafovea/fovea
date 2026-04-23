"""Detection Service port definition.

This module defines the interface for object detection services.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class BoundingBoxOutput:
    """Bounding box in detection output."""

    x: float
    y: float
    width: float
    height: float


@dataclass
class DetectionOutput:
    """Single detection result."""

    label: str
    bounding_box: BoundingBoxOutput
    confidence: float
    track_id: str | None = None


@dataclass
class FrameDetectionsOutput:
    """Detections for a single frame."""

    frame_number: int
    timestamp: float
    detections: list[DetectionOutput]


@dataclass
class DetectionInput:
    """Input for object detection.

    Parameters
    ----------
    video_id : str
        Unique identifier for the video.
    query : str
        Text query describing objects to detect.
    video_path : str | None
        Optional full path to video file.
    frame_numbers : list[int]
        Specific frames to process (empty = all).
    confidence_threshold : float
        Minimum confidence for detections.
    enable_tracking : bool
        Whether to enable object tracking.
    """

    video_id: str
    query: str
    video_path: str | None = None
    frame_numbers: list[int] = field(default_factory=list)
    confidence_threshold: float = 0.3
    enable_tracking: bool = True


@dataclass
class DetectionServiceOutput:
    """Output from object detection.

    Parameters
    ----------
    result_id : str
        Unique identifier for this detection job.
    video_id : str
        Video identifier.
    query : str
        Query that was used.
    frames : list[FrameDetectionsOutput]
        Frames with detections.
    total_detections : int
        Total detections across all frames.
    processing_time : float
        Processing time in seconds.
    """

    result_id: str
    video_id: str
    query: str
    frames: list[FrameDetectionsOutput]
    total_detections: int
    processing_time: float


class IDetectionService(ABC):
    """Interface for object detection services.

    Implementors provide object detection in video frames.
    """

    @abstractmethod
    async def detect(self, input: DetectionInput) -> DetectionServiceOutput:
        """Detect objects in video frames.

        Parameters
        ----------
        input : DetectionInput
            Detection parameters.

        Returns
        -------
        DetectionServiceOutput
            Detection results with metadata.

        Raises
        ------
        VideoNotFoundError
            If video cannot be found.
        InferenceError
            If detection fails.
        """
        pass
