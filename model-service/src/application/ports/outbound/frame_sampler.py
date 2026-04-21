"""Frame sampler port definition.

Narrow application-facing interface for extracting uniformly sampled
frames and reading basic video metadata. Implementations live in the
infrastructure layer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray


@dataclass(frozen=True)
class VideoMetadataDTO:
    """Minimal video metadata needed by application use cases.

    Parameters
    ----------
    frame_count : int
        Total number of frames in the video.
    fps : float
        Frames per second.
    duration : float
        Duration in seconds.
    """

    frame_count: int
    fps: float
    duration: float


class IFrameSampler(ABC):
    """Samples frames and reads metadata from videos."""

    @abstractmethod
    def get_video_metadata(self, video_path: str) -> VideoMetadataDTO:
        """Get minimal video metadata.

        Parameters
        ----------
        video_path : str
            Path to video file.

        Returns
        -------
        VideoMetadataDTO
            Video metadata.
        """
        ...

    @abstractmethod
    def extract_frames_uniform(
        self,
        video_path: str,
        num_frames: int,
        *,
        max_dimension: int = 1024,
    ) -> list[tuple[int, NDArray[np.uint8]]]:
        """Extract uniformly sampled frames.

        Parameters
        ----------
        video_path : str
            Path to the video.
        num_frames : int
            Number of frames to extract.
        max_dimension : int
            Maximum image dimension (preserves aspect ratio).

        Returns
        -------
        list[tuple[int, NDArray[np.uint8]]]
            List of (frame_index, frame_array) tuples in RGB order.
        """
        ...
