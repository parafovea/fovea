"""External API port definition.

This module defines the interface for external API client adapters.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ExternalAPIResponse:
    """Response from an external API call.

    Parameters
    ----------
    content : str
        Generated content.
    input_tokens : int
        Number of input tokens.
    output_tokens : int
        Number of output tokens.
    model : str
        Model used.
    latency_ms : float
        Request latency in milliseconds.
    """

    content: str
    input_tokens: int
    output_tokens: int
    model: str
    latency_ms: float

    @property
    def total_tokens(self) -> int:
        """Total tokens used."""
        return self.input_tokens + self.output_tokens


class IExternalAPIClient(ABC):
    """Interface for external API client adapters.

    Implementors must provide async methods for generating content
    through external APIs (Anthropic, OpenAI, Google, etc.).
    """

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> ExternalAPIResponse:
        """Generate text from a prompt.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        system_prompt : str | None, default=None
            System prompt for context.
        max_tokens : int, default=512
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature.
        **kwargs : Any
            Additional API parameters.

        Returns
        -------
        ExternalAPIResponse
            API response with content and usage.

        Raises
        ------
        ExternalAPIError
            If API call fails.
        """
        ...

    @abstractmethod
    async def generate_with_images(
        self,
        prompt: str,
        images: list[str],
        system_prompt: str | None = None,
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> ExternalAPIResponse:
        """Generate text from a prompt and images.

        Parameters
        ----------
        prompt : str
            Input prompt for generation.
        images : list[str]
            Base64-encoded images.
        system_prompt : str | None, default=None
            System prompt for context.
        max_tokens : int, default=512
            Maximum tokens to generate.
        **kwargs : Any
            Additional API parameters.

        Returns
        -------
        ExternalAPIResponse
            API response with content and usage.

        Raises
        ------
        ExternalAPIError
            If API call fails.
        """
        ...

    @property
    @abstractmethod
    def provider(self) -> str:
        """Get the API provider name.

        Returns
        -------
        str
            Provider name (anthropic, openai, google, etc.).
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
    def supports_vision(self) -> bool:
        """Check if model supports vision/images.

        Returns
        -------
        bool
            True if model accepts images.
        """
        ...
