"""External API router for routing requests to appropriate clients.

This module provides a router that creates and manages external API clients
based on provider configuration, routing requests to Anthropic, OpenAI, or
Google clients as appropriate.
"""

import logging
from typing import Any

from .anthropic_client import AnthropicClient
from .base import ExternalAPIClient, ExternalAPIConfig
from .google_client import GoogleClient
from .openai_client import OpenAIClient

logger = logging.getLogger(__name__)


class ExternalModelRouter:
    """Routes requests to appropriate external API clients.

    This class handles client creation and lifecycle management for
    external model providers, routing requests based on the provider
    specified in the configuration.
    """

    def __init__(self) -> None:
        """Initialize the router with empty client cache."""
        self._clients: dict[str, ExternalAPIClient] = {}

    def get_client(self, config: ExternalAPIConfig, provider: str) -> ExternalAPIClient:
        """Get or create client for the specified provider.

        Parameters
        ----------
        config : ExternalAPIConfig
            Configuration for the external API client.
        provider : str
            Provider name (anthropic, openai, google).

        Returns
        -------
        ExternalAPIClient
            Client instance for the provider.

        Raises
        ------
        ValueError
            If provider is not supported.
        """
        cache_key = f"{provider}:{config.model_id}"

        if cache_key in self._clients:
            return self._clients[cache_key]

        client: ExternalAPIClient
        if provider == "anthropic":
            client = AnthropicClient(config)
        elif provider == "openai":
            client = OpenAIClient(config)
        elif provider == "google":
            client = GoogleClient(config)
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        self._clients[cache_key] = client
        logger.info(f"Created {provider} client for model {config.model_id}")

        return client

    async def generate_text(  # type: ignore[no-untyped-def]
        self, config: ExternalAPIConfig, provider: str, prompt: str, **kwargs
    ) -> dict[str, Any]:
        """Generate text using external API.

        Parameters
        ----------
        config : ExternalAPIConfig
            Configuration for the external API client.
        provider : str
            Provider name (anthropic, openai, google).
        prompt : str
            Input text prompt.
        **kwargs
            Additional parameters (max_tokens, temperature, etc).

        Returns
        -------
        dict[str, Any]
            Dict with 'text', 'usage', 'model' keys.
        """
        client = self.get_client(config, provider)
        return await client.generate_text(prompt, **kwargs)

    async def generate_from_images(  # type: ignore[no-untyped-def]
        self, config: ExternalAPIConfig, provider: str, images: list[bytes], prompt: str, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images using external API.

        Parameters
        ----------
        config : ExternalAPIConfig
            Configuration for the external API client.
        provider : str
            Provider name (anthropic, openai, google).
        images : list[bytes]
            List of image data as bytes.
        prompt : str
            Text prompt for analysis.
        **kwargs
            Additional parameters (max_tokens, etc).

        Returns
        -------
        dict[str, Any]
            Dict with 'text', 'usage', 'model' keys.
        """
        client = self.get_client(config, provider)
        return await client.generate_from_images(images, prompt, **kwargs)

    async def validate_key(self, config: ExternalAPIConfig, provider: str) -> bool:
        """Validate API key for a provider.

        Parameters
        ----------
        config : ExternalAPIConfig
            Configuration for the external API client.
        provider : str
            Provider name (anthropic, openai, google).

        Returns
        -------
        bool
            True if key is valid, False otherwise.
        """
        client = self.get_client(config, provider)
        return await client.validate_key()

    async def close_all(self) -> None:
        """Close all active clients and clean up resources."""
        logger.info("Closing all external API clients")
        for cache_key, client in self._clients.items():
            try:
                await client.close()
            except Exception as e:
                logger.error(f"Error closing client {cache_key}: {e}")

        self._clients.clear()
