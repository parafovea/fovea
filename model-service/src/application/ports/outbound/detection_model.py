"""Object Detection Model port definition.

This module defines the interface for object detection model adapters.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.domain.entities import Detection


class IDetectionModel(ABC):
    """Interface for object detection model adapters.

    Implementors must provide methods for detecting objects in images
    and managing model lifecycle.
    """

    @abstractmethod
    def detect(
        self,
        image: NDArray[np.uint8],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[Detection]:
        """Detect objects in an image.

        Parameters
        ----------
        image : NDArray[np.uint8]
            Input image as numpy array (H, W, C).
        query : str
            Text query describing objects to detect.
        confidence_threshold : float, default=0.3
            Minimum confidence for detections.

        Returns
        -------
        list[Detection]
            List of detected objects.

        Raises
        ------
        InferenceError
            If detection fails.
        """
        pass

    @abstractmethod
    def detect_batch(
        self,
        images: list[NDArray[np.uint8]],
        query: str,
        confidence_threshold: float = 0.3,
    ) -> list[list[Detection]]:
        """Detect objects in multiple images.

        Parameters
        ----------
        images : list[NDArray[np.uint8]]
            List of input images.
        query : str
            Text query describing objects to detect.
        confidence_threshold : float, default=0.3
            Minimum confidence for detections.

        Returns
        -------
        list[list[Detection]]
            List of detection lists per image.

        Raises
        ------
        InferenceError
            If detection fails.
        """
        pass

    @abstractmethod
    def set_classes(self, class_names: list[str]) -> None:
        """Set detection classes for open-vocabulary models.

        Parameters
        ----------
        class_names : list[str]
            List of class names to detect.
        """
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
    def supports_tracking(self) -> bool:
        """Check if model supports object tracking."""
        pass
