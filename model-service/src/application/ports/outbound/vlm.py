"""Vision-Language Model port definition.

This module defines the interface for vision-language model adapters.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray

    from src.application.dto.reasoning import ReasonedText


class IVisionLanguageModel(ABC):
    """Interface for vision-language model adapters.

    Implementors must provide methods for generating text from images
    and managing model lifecycle.
    """

    @abstractmethod
    def generate(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text from images and a prompt.

        Parameters
        ----------
        images : list[NDArray[np.uint8]]
            List of images as numpy arrays (H, W, C).
        prompt : str
            Text prompt for generation.
        max_tokens : int, default=512
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        str
            Generated text describing the images.

        Raises
        ------
        InferenceError
            If generation fails.
        """
        ...

    @abstractmethod
    def generate_reasoned_from_images(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> ReasonedText:
        """Vision-language variant of ``generate_reasoned``.

        For non-thinking VLMs the returned :class:`ReasonedText` has
        ``thinking=None``. Thinking-capable VLMs populate it from the
        underlying ``<think>...</think>`` blocks in the raw output.

        Parameters
        ----------
        images : list[NDArray[np.uint8]]
            Input images as numpy arrays (H, W, C).
        prompt : str
            Text prompt.
        max_tokens : int, default=1024
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        ReasonedText
            Visible text plus optional thinking trace.

        Raises
        ------
        InferenceError
            If generation fails.
        """
        ...

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory.

        Raises
        ------
        ModelLoadError
            If model loading fails.
        InsufficientMemoryError
            If not enough memory available.
        """
        ...

    @abstractmethod
    def unload(self) -> None:
        """Unload the model from memory."""
        ...

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is currently loaded.

        Returns
        -------
        bool
            True if model is loaded.
        """
        ...

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Get the model identifier.

        Returns
        -------
        str
            Model identifier string.
        """
        ...

    @property
    @abstractmethod
    def vram_gb(self) -> float:
        """Get VRAM requirement in GB.

        Returns
        -------
        float
            VRAM requirement.
        """
        ...
