"""Video Tracking Model port definition.

This module defines the interface for video object tracking model adapters.
"""

from abc import ABC, abstractmethod

import numpy as np
from numpy.typing import NDArray

from src.domain.entities import TrackingMask


class ITrackingModel(ABC):
    """Interface for video object tracking model adapters.

    Implementors must provide methods for initializing tracking,
    tracking objects across frames, and managing model lifecycle.
    """

    @abstractmethod
    def initialize(
        self,
        frame: NDArray[np.uint8],
        masks: list[NDArray[np.bool_]],
        object_ids: list[int],
    ) -> None:
        """Initialize tracking with first frame and masks.

        Parameters
        ----------
        frame : NDArray[np.uint8]
            First frame as numpy array (H, W, C).
        masks : list[NDArray[np.bool_]]
            Initial segmentation masks (H, W) for each object.
        object_ids : list[int]
            IDs for tracked objects.

        Raises
        ------
        ValueError
            If masks and object_ids lengths don't match.
        InferenceError
            If initialization fails.
        """
        pass

    @abstractmethod
    def track(
        self,
        frame: NDArray[np.uint8],
    ) -> dict[int, TrackingMask]:
        """Track objects in a frame.

        Parameters
        ----------
        frame : NDArray[np.uint8]
            Current frame as numpy array (H, W, C).

        Returns
        -------
        dict[int, TrackingMask]
            Mapping of object IDs to tracking masks.

        Raises
        ------
        InferenceError
            If tracking fails.
        """
        pass

    @abstractmethod
    def track_batch(
        self,
        frames: list[NDArray[np.uint8]],
    ) -> list[dict[int, TrackingMask]]:
        """Track objects across multiple frames.

        Parameters
        ----------
        frames : list[NDArray[np.uint8]]
            List of frames to process.

        Returns
        -------
        list[dict[int, TrackingMask]]
            Tracking results for each frame.

        Raises
        ------
        InferenceError
            If tracking fails.
        """
        pass

    @abstractmethod
    def reset(self) -> None:
        """Reset tracking state for new video."""
        pass

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory."""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory."""
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded."""
        pass

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Get the model identifier."""
        pass

    @property
    @abstractmethod
    def is_initialized(self) -> bool:
        """Check if tracking has been initialized with a video."""
        pass
