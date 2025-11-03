"""Base class for external API clients.

This module provides abstract base classes for external model provider API clients,
including Anthropic Claude, OpenAI GPT, and Google Gemini. Handles authentication,
retries, and error handling for API requests.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class ExternalAPIConfig:
    """Configuration for external API client.

    Attributes
    ----------
    api_key : str
        Authentication key for the provider.
    api_endpoint : str
        Base URL for API requests.
    model_id : str
        Model identifier to use.
    timeout : int, default=60
        Request timeout in seconds.
    max_retries : int, default=3
        Maximum number of retry attempts.
    """

    api_key: str
    api_endpoint: str
    model_id: str
    timeout: int = 60
    max_retries: int = 3


class ExternalAPIClient(ABC):
    """Base class for external API clients.

    Provides common interface for all external model providers.
    Handles authentication, retries, and error handling.
    """

    def __init__(self, config: ExternalAPIConfig) -> None:
        """Initialize API client with configuration.

        Parameters
        ----------
        config : ExternalAPIConfig
            Client configuration including API key and endpoints.
        """
        self.config = config
        self.client = httpx.AsyncClient(timeout=config.timeout)

    async def close(self) -> None:
        """Close HTTP client connection."""
        await self.client.aclose()

    @abstractmethod
    async def generate_text(  # type: ignore[no-untyped-def]
        self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7, **kwargs
    ) -> dict[str, Any]:
        """Generate text from prompt.

        Parameters
        ----------
        prompt : str
            Input text prompt.
        max_tokens : int, default=1024
            Maximum tokens to generate.
        temperature : float, default=0.7
            Sampling temperature (0.0-1.0).
        **kwargs
            Provider-specific parameters.

        Returns
        -------
        dict[str, Any]
            Dict containing 'text', 'usage', 'model' fields.

        Raises
        ------
        httpx.HTTPStatusError
            On API request failure.
        ValueError
            On invalid parameters.
        """
        pass

    @abstractmethod
    async def generate_from_images(  # type: ignore[no-untyped-def]
        self, images: list[bytes], prompt: str, max_tokens: int = 1024, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images and prompt.

        Parameters
        ----------
        images : list[bytes]
            List of image data as bytes.
        prompt : str
            Text prompt for analysis.
        max_tokens : int, default=1024
            Maximum tokens to generate.
        **kwargs
            Provider-specific parameters.

        Returns
        -------
        dict[str, Any]
            Dict containing 'text', 'usage', 'model' fields.

        Raises
        ------
        httpx.HTTPStatusError
            On API request failure.
        ValueError
            On invalid parameters.
        """
        pass

    @abstractmethod
    async def validate_key(self) -> bool:
        """Validate API key with minimal API call.

        Returns
        -------
        bool
            True if key is valid, False otherwise.
        """
        pass
