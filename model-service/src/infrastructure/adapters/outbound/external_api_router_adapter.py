"""Infrastructure adapter implementing :class:`IExternalAPIRouter`.

Wraps the concrete :class:`ExternalModelRouter` and translates between the
framework-neutral :class:`ExternalAPIConfigDTO` and the infrastructure
:class:`ExternalAPIConfig` dataclass.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.application.ports.outbound.external_api_router import IExternalAPIRouter
from src.infrastructure.adapters.outbound.external_apis.base import ExternalAPIConfig
from src.infrastructure.adapters.outbound.external_apis.router import ExternalModelRouter

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO


def _to_internal(config: ExternalAPIConfigDTO) -> ExternalAPIConfig:
    """Convert a DTO to the infrastructure config dataclass."""
    return ExternalAPIConfig(
        api_key=config.api_key,
        api_endpoint=config.api_endpoint,
        model_id=config.model_id,
        timeout=config.timeout,
        max_retries=config.max_retries,
    )


class ExternalAPIRouterAdapter(IExternalAPIRouter):
    """Adapter exposing :class:`ExternalModelRouter` via the application port."""

    def __init__(self, router: ExternalModelRouter | None = None) -> None:
        """Initialize the adapter.

        Parameters
        ----------
        router : ExternalModelRouter | None
            Optional router instance. A new one is created if not supplied.
        """
        self._router = router or ExternalModelRouter()

    async def generate_text(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate text via the underlying router."""
        result: dict[str, Any] = await self._router.generate_text(
            config=_to_internal(config),
            provider=provider,
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return result

    async def generate_from_images(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        images: list[bytes],
        prompt: str,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Generate text from images via the underlying router."""
        result: dict[str, Any] = await self._router.generate_from_images(
            config=_to_internal(config),
            provider=provider,
            images=images,
            prompt=prompt,
            max_tokens=max_tokens,
        )
        return result

    async def close(self) -> None:
        """Close pooled clients."""
        await self._router.close_all()
