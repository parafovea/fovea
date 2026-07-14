"""Object detection domain entities.

This module defines entities for representing object detections, tracking
results, and detection aggregations.
"""

from dataclasses import dataclass, field
from typing import Any

from src.domain.value_objects import ConfidenceScore, NormalizedBBox, Timestamp


@dataclass
class Detection:
    """A single object detection in an image.

    Parameters
    ----------
    label : str
        Detected object class label.
    bounding_box : NormalizedBBox
        Normalized bounding box coordinates.
    confidence : ConfidenceScore
        Detection confidence score.
    track_id : str | None
        Tracking ID if object is being tracked.
    attributes : dict
        Additional detection attributes.
    """

    label: str
    bounding_box: NormalizedBBox
    confidence: ConfidenceScore
    track_id: str | None = None
    attributes: dict[str, str | int | float | bool] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Detection:
        """Create detection from dictionary representation.

        Parameters
        ----------
        data : dict[str, Any]
            Dictionary with detection data.

        Returns
        -------
        Detection
            New detection instance.
        """
        bbox_data = data["bounding_box"]
        return cls(
            label=data["label"],
            bounding_box=NormalizedBBox(
                x=bbox_data["x"],
                y=bbox_data["y"],
                width=bbox_data["width"],
                height=bbox_data["height"],
            ),
            confidence=ConfidenceScore(data["confidence"]),
            track_id=data.get("track_id"),
            attributes=data.get("attributes", {}),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation of detection.
        """
        return {
            "label": self.label,
            "bounding_box": self.bounding_box.to_dict(),
            "confidence": self.confidence.value,
            "track_id": self.track_id,
        }


@dataclass
class FrameDetections:
    """Detections for a single video frame.

    Parameters
    ----------
    frame_number : int
        Frame index in the video.
    timestamp : Timestamp
        Time position in the video.
    detections : list[Detection]
        List of detections in this frame.
    """

    frame_number: int
    timestamp: Timestamp
    detections: list[Detection] = field(default_factory=list)

    @property
    def count(self) -> int:
        """Number of detections in frame."""
        return len(self.detections)

    def filter_by_label(self, label: str) -> list[Detection]:
        """Get detections matching a label.

        Parameters
        ----------
        label : str
            Label to filter by.

        Returns
        -------
        list[Detection]
            Detections with matching label.
        """
        return [d for d in self.detections if d.label == label]

    def filter_by_confidence(self, min_confidence: float = 0.0) -> list[Detection]:
        """Get detections above confidence threshold.

        Parameters
        ----------
        min_confidence : float, default=0.0
            Minimum confidence threshold.

        Returns
        -------
        list[Detection]
            Detections above threshold.
        """
        return [d for d in self.detections if d.confidence.value >= min_confidence]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "frame_number": self.frame_number,
            "timestamp": self.timestamp.seconds,
            "detections": [d.to_dict() for d in self.detections],
        }


@dataclass
class DetectionResult:
    """Complete detection result for a video.

    Parameters
    ----------
    result_id : str
        Unique result identifier.
    video_id : str
        Video identifier.
    query : str
        Detection query text.
    frames : list[FrameDetections]
        Detections per frame.
    processing_time : float
        Total processing time in seconds.
    """

    result_id: str
    video_id: str
    query: str
    frames: list[FrameDetections]
    processing_time: float

    @property
    def total_detections(self) -> int:
        """Total detections across all frames."""
        return sum(f.count for f in self.frames)

    @property
    def frame_count(self) -> int:
        """Number of processed frames."""
        return len(self.frames)

    def get_unique_labels(self) -> set[str]:
        """Get all unique detection labels.

        Returns
        -------
        set[str]
            Set of unique labels.
        """
        labels = set()
        for frame in self.frames:
            for detection in frame.detections:
                labels.add(detection.label)
        return labels

    def get_tracks(self) -> dict[str, list[Detection]]:
        """Group detections by track ID.

        Returns
        -------
        dict[str, list[Detection]]
            Detections grouped by track ID.
        """
        tracks: dict[str, list[Detection]] = {}
        for frame in self.frames:
            for detection in frame.detections:
                if detection.track_id:
                    if detection.track_id not in tracks:
                        tracks[detection.track_id] = []
                    tracks[detection.track_id].append(detection)
        return tracks


@dataclass
class TrackingMask:
    """Segmentation mask for a tracked object.

    Parameters
    ----------
    object_id : int
        Tracked object identifier.
    mask_rle : dict[str, Any]
        RLE-encoded mask with 'size' and 'counts' keys.
    confidence : ConfidenceScore
        Mask prediction confidence.
    is_occluded : bool
        Whether object is occluded in this frame.
    """

    object_id: int
    mask_rle: dict[str, Any]
    confidence: ConfidenceScore
    is_occluded: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation.

        Returns
        -------
        dict[str, Any]
            Dictionary representation.
        """
        return {
            "object_id": self.object_id,
            "mask_rle": self.mask_rle,
            "confidence": self.confidence.value,
            "is_occluded": self.is_occluded,
        }


@dataclass
class TrackingFrameResult:
    """Tracking results for a single frame.

    Parameters
    ----------
    frame_number : int
        Frame index in the video.
    timestamp : Timestamp
        Time position in the video.
    masks : list[TrackingMask]
        Tracked object masks.
    processing_time : float
        Processing time for this frame.
    """

    frame_number: int
    timestamp: Timestamp
    masks: list[TrackingMask]
    processing_time: float

    @property
    def object_count(self) -> int:
        """Number of tracked objects in frame."""
        return len(self.masks)

    def get_mask(self, object_id: int) -> TrackingMask | None:
        """Get mask for specific object.

        Parameters
        ----------
        object_id : int
            Object ID to find.

        Returns
        -------
        TrackingMask | None
            Mask for object, or None if not found.
        """
        for mask in self.masks:
            if mask.object_id == object_id:
                return mask
        return None


@dataclass
class TrackingResult:
    """Complete tracking result for a video.

    Parameters
    ----------
    result_id : str
        Unique result identifier.
    video_id : str
        Video identifier.
    frames : list[TrackingFrameResult]
        Tracking results per frame.
    video_width : int
        Video frame width.
    video_height : int
        Video frame height.
    processing_time : float
        Total processing time in seconds.
    """

    result_id: str
    video_id: str
    frames: list[TrackingFrameResult]
    video_width: int
    video_height: int
    processing_time: float

    @property
    def total_frames(self) -> int:
        """Total frames processed."""
        return len(self.frames)

    @property
    def fps(self) -> float:
        """Processing speed in frames per second."""
        if self.processing_time > 0:
            return self.total_frames / self.processing_time
        return 0.0

    def get_object_trajectory(self, object_id: int) -> list[tuple[int, TrackingMask]]:
        """Get trajectory for a specific object.

        Parameters
        ----------
        object_id : int
            Object ID to track.

        Returns
        -------
        list[tuple[int, TrackingMask]]
            List of (frame_number, mask) tuples.
        """
        trajectory = []
        for frame in self.frames:
            mask = frame.get_mask(object_id)
            if mask:
                trajectory.append((frame.frame_number, mask))
        return trajectory
