"""External API router port definition.

Application-facing port for routing generation requests to external provider
APIs. Implementations translate between application DTOs and concrete
provider clients.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO
    from src.application.dto.reasoning import ReasonedText


class IExternalAPIRouter(ABC):
    """Port for routing requests to external provider APIs."""

    @abstractmethod
    async def generate_text(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate text using the external provider.

        Parameters
        ----------
        config : ExternalAPIConfigDTO
            Provider configuration.
        provider : str
            Provider name (anthropic, openai, google).
        prompt : str
            Prompt text.
        max_tokens : int
            Maximum tokens to generate.
        temperature : float
            Sampling temperature.

        Returns
        -------
        dict[str, Any]
            Result with keys ``text`` (str) and ``usage`` (dict).
        """
        pass

    @abstractmethod
    async def generate_from_images(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        images: list[bytes],
        prompt: str,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Generate text from images using the external provider.

        Parameters
        ----------
        config : ExternalAPIConfigDTO
            Provider configuration.
        provider : str
            Provider name.
        images : list[bytes]
            Image bytes to send.
        prompt : str
            Prompt text.
        max_tokens : int
            Maximum tokens to generate.

        Returns
        -------
        dict[str, Any]
            Result with keys ``text`` (str) and ``usage`` (dict).
        """
        pass

    @abstractmethod
    async def generate_reasoned_text(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> ReasonedText:
        """Generate text and split any ``<think>`` blocks into a reasoning trace."""
        pass

    @abstractmethod
    async def generate_reasoned_from_images(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        images: list[bytes],
        prompt: str,
        max_tokens: int = 1024,
    ) -> ReasonedText:
        """Generate text from images with optional reasoning trace."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Release underlying resources."""
        pass
