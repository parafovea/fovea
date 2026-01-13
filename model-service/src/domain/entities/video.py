"""Video-related domain entities.

This module defines entities for representing videos, frames, and video
segments within the domain layer.
"""

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from src.domain.value_objects import TimeRange, Timestamp


@dataclass
class VideoInfo:
    """Metadata about a video file.

    Parameters
    ----------
    video_id : str
        Unique identifier for the video.
    path : str
        File system path to the video.
    width : int
        Frame width in pixels.
    height : int
        Frame height in pixels.
    fps : float
        Frames per second.
    total_frames : int
        Total number of frames.
    duration : float
        Video duration in seconds.
    codec : str | None
        Video codec identifier.
    """

    video_id: str
    path: str
    width: int
    height: int
    fps: float
    total_frames: int
    duration: float
    codec: str | None = None

    @property
    def aspect_ratio(self) -> float:
        """Calculate aspect ratio (width / height)."""
        return self.width / self.height if self.height > 0 else 0.0

    @property
    def resolution(self) -> tuple[int, int]:
        """Get resolution as (width, height) tuple."""
        return (self.width, self.height)

    def frame_to_timestamp(self, frame_number: int) -> Timestamp:
        """Convert frame number to timestamp.

        Parameters
        ----------
        frame_number : int
            Frame number to convert.

        Returns
        -------
        Timestamp
            Timestamp for the frame.
        """
        return Timestamp.from_frame(frame_number, self.fps)

    def timestamp_to_frame(self, timestamp: Timestamp) -> int:
        """Convert timestamp to frame number.

        Parameters
        ----------
        timestamp : Timestamp
            Timestamp to convert.

        Returns
        -------
        int
            Frame number for the timestamp.
        """
        return timestamp.to_frame(self.fps)


@dataclass
class Frame:
    """A single video frame with metadata.

    Parameters
    ----------
    frame_number : int
        Frame index in the video.
    timestamp : Timestamp
        Time position in the video.
    image : NDArray[np.uint8]
        Image data as numpy array (H, W, C).
    video_id : str | None
        Associated video identifier.
    """

    frame_number: int
    timestamp: Timestamp
    image: NDArray[np.uint8]
    video_id: str | None = None

    @property
    def height(self) -> int:
        """Image height in pixels."""
        return self.image.shape[0]

    @property
    def width(self) -> int:
        """Image width in pixels."""
        return self.image.shape[1]

    @property
    def channels(self) -> int:
        """Number of color channels."""
        return self.image.shape[2] if len(self.image.shape) > 2 else 1

    @property
    def shape(self) -> tuple[int, ...]:
        """Image shape (H, W, C)."""
        return self.image.shape


@dataclass
class VideoSegment:
    """A contiguous segment of a video.

    Parameters
    ----------
    video_id : str
        Parent video identifier.
    time_range : TimeRange
        Time range of the segment.
    frames : list[Frame]
        Frames within this segment.
    label : str | None
        Optional label for the segment.
    metadata : dict
        Additional metadata.
    """

    video_id: str
    time_range: TimeRange
    frames: list[Frame] = field(default_factory=list)
    label: str | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def duration(self) -> float:
        """Segment duration in seconds."""
        return self.time_range.duration

    @property
    def frame_count(self) -> int:
        """Number of frames in segment."""
        return len(self.frames)

    @property
    def start_timestamp(self) -> Timestamp:
        """Start timestamp of segment."""
        return self.time_range.start

    @property
    def end_timestamp(self) -> Timestamp:
        """End timestamp of segment."""
        return self.time_range.end

    def contains_frame(self, frame: Frame) -> bool:
        """Check if a frame belongs to this segment.

        Parameters
        ----------
        frame : Frame
            Frame to check.

        Returns
        -------
        bool
            True if frame timestamp is within segment range.
        """
        return frame.timestamp in self.time_range

    def add_frame(self, frame: Frame) -> None:
        """Add a frame to the segment.

        Parameters
        ----------
        frame : Frame
            Frame to add.

        Raises
        ------
        ValueError
            If frame timestamp is outside segment range.
        """
        if not self.contains_frame(frame):
            raise ValueError(
                f"Frame timestamp {frame.timestamp.seconds}s is outside segment "
                f"range [{self.time_range.start.seconds}s, {self.time_range.end.seconds}s]"
            )
        self.frames.append(frame)
        self.frames.sort(key=lambda f: f.frame_number)
