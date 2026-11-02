"""Video Processor port definition.

This module defines the interface for video processing adapters.
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterator

    from src.domain.entities import Frame, VideoInfo
    from src.domain.value_objects import TimeRange


class IVideoProcessor(ABC):
    """Interface for video processing adapters.

    Implementors must provide methods for extracting frames, metadata,
    and audio from video files.
    """

    @abstractmethod
    def get_video_info(self, video_path: str) -> VideoInfo:
        """Get video metadata.

        Parameters
        ----------
        video_path : str
            Path to video file.

        Returns
        -------
        VideoInfo
            Video metadata including dimensions, fps, duration.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If video cannot be read.
        """
        pass

    @abstractmethod
    def extract_frames(
        self,
        video_path: str,
        frame_indices: list[int] | None = None,
        sample_rate: int = 1,
        max_frames: int = 30,
    ) -> list[Frame]:
        """Extract frames from a video.

        Parameters
        ----------
        video_path : str
            Path to video file.
        frame_indices : list[int] | None, default=None
            Specific frame indices to extract (overrides sample_rate).
        sample_rate : int, default=1
            Frames to sample per second.
        max_frames : int, default=30
            Maximum frames to extract.

        Returns
        -------
        list[Frame]
            List of extracted frames with metadata.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If frame extraction fails.
        """
        pass

    @abstractmethod
    def iterate_frames(
        self,
        video_path: str,
        start_frame: int = 0,
        end_frame: int | None = None,
        step: int = 1,
    ) -> Iterator[Frame]:
        """Iterate over video frames.

        Parameters
        ----------
        video_path : str
            Path to video file.
        start_frame : int, default=0
            Starting frame index.
        end_frame : int | None, default=None
            Ending frame index (inclusive). None = end of video.
        step : int, default=1
            Step size between frames.

        Yields
        ------
        Frame
            Video frames with metadata.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If frame iteration fails.
        """
        pass

    @abstractmethod
    def extract_audio(
        self,
        video_path: str,
        output_path: str,
        sample_rate: int = 16000,
    ) -> str:
        """Extract audio from video.

        Parameters
        ----------
        video_path : str
            Path to video file.
        output_path : str
            Path for output audio file.
        sample_rate : int, default=16000
            Audio sample rate in Hz.

        Returns
        -------
        str
            Path to extracted audio file.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If audio extraction fails.
        """
        pass

    @abstractmethod
    def generate_thumbnail(
        self,
        video_path: str,
        output_path: str,
        timestamp: float = 1.0,
        width: int | None = None,
        height: int | None = None,
    ) -> str:
        """Generate thumbnail from video.

        Parameters
        ----------
        video_path : str
            Path to video file.
        output_path : str
            Path for output thumbnail.
        timestamp : float, default=1.0
            Time in seconds to capture.
        width : int | None, default=None
            Thumbnail width (aspect ratio preserved if only one dimension).
        height : int | None, default=None
            Thumbnail height.

        Returns
        -------
        str
            Path to generated thumbnail.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If thumbnail generation fails.
        """
        pass

    @abstractmethod
    def extract_segment(
        self,
        video_path: str,
        output_path: str,
        time_range: TimeRange,
    ) -> str:
        """Extract a segment of video.

        Parameters
        ----------
        video_path : str
            Path to video file.
        output_path : str
            Path for output segment.
        time_range : TimeRange
            Time range to extract.

        Returns
        -------
        str
            Path to extracted segment.

        Raises
        ------
        VideoNotFoundError
            If video file doesn't exist.
        VideoProcessingError
            If segment extraction fails.
        """
        pass
