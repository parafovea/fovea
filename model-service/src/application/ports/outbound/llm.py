"""Language Model port definition.

This module defines the interface for language model adapters.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.application.dto.generation import GenerationConfigDTO, GenerationResultDTO
    from src.application.dto.reasoning import ReasonedText


class ILanguageModel(ABC):
    """Interface for language model adapters.

    Implementors must provide methods for generating text and managing
    model lifecycle.
    """

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text from a prompt.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        max_tokens : int, default=512
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        str
            Generated text.

        Raises
        ------
        InferenceError
            If generation fails.
        """
        pass

    @abstractmethod
    async def generate_reasoned(
        self,
        prompt: str,
        *,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> ReasonedText:
        """Generate text and return its optional reasoning trace.

        For non-thinking models the returned :class:`ReasonedText` has
        ``thinking=None``. Thinking-capable models populate it from the
        underlying ``<think>...</think>`` blocks in the raw output.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        max_tokens : int, default=512
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
        pass

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Generate structured output matching a schema.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        schema : dict[str, Any]
            JSON schema for structured output.
        max_tokens : int, default=512
            Maximum tokens to generate.
        **kwargs : Any
            Additional generation parameters.

        Returns
        -------
        dict[str, Any]
            Structured output matching schema.

        Raises
        ------
        InferenceError
            If generation fails.
        ValueError
            If output doesn't match schema.
        """
        pass

    @abstractmethod
    async def generate_with_config(
        self,
        prompt: str,
        config: GenerationConfigDTO,
    ) -> GenerationResultDTO:
        """Generate text using a structured generation config.

        Parameters
        ----------
        prompt : str
            Input prompt.
        config : GenerationConfigDTO
            Generation parameters.

        Returns
        -------
        GenerationResultDTO
            Generated text with usage metadata.

        Raises
        ------
        InferenceError
            If generation fails.
        """
        pass

    @abstractmethod
    def load(self) -> None:
        """Load the model into memory.

        Raises
        ------
        ModelLoadError
            If model loading fails.
        """
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
