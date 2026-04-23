"""External generation service port definition.

Application-facing port for routing generation requests to external
provider APIs. Implementations live in the infrastructure layer and
translate between application DTOs and concrete provider clients.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO


class IExternalGenerator(ABC):
    """Port for external provider-based generation.

    Implementations handle provider selection and client lifecycle.
    """

    @abstractmethod
    async def generate_text(
        self,
        config: ExternalAPIConfigDTO,
        prompt: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate text via an external provider.

        Parameters
        ----------
        config : ExternalAPIConfigDTO
            Provider configuration (includes provider name).
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
        config: ExternalAPIConfigDTO,
        images: list[bytes],
        prompt: str,
        *,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Generate text from images via an external provider.

        Parameters
        ----------
        config : ExternalAPIConfigDTO
            Provider configuration.
        images : list[bytes]
            Image bytes to send to the provider.
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
    async def close(self) -> None:
        """Release underlying resources."""
        pass
