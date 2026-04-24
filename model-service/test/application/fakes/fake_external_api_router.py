"""Fake IExternalAPIRouter for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.application.dto.reasoning_parser import parse_reasoned_output
from src.application.ports.outbound.external_api_router import IExternalAPIRouter

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO
    from src.application.dto.reasoning import ReasonedText


class FakeExternalAPIRouter(IExternalAPIRouter):
    """In-memory external API router returning canned provider responses."""

    def __init__(
        self,
        *,
        text_response: str = "external text response",
        images_response: str = "external image response",
        tokens_used: int = 123,
        raise_on_text: Exception | None = None,
        raise_on_images: Exception | None = None,
    ) -> None:
        self._text_response = text_response
        self._images_response = images_response
        self._tokens_used = tokens_used
        self._raise_on_text = raise_on_text
        self._raise_on_images = raise_on_images
        self.closed = False
        self.text_calls: list[tuple[str, str]] = []
        self.image_calls: list[tuple[str, int]] = []

    async def generate_text(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        if self._raise_on_text is not None:
            raise self._raise_on_text
        self.text_calls.append((provider, prompt))
        return {
            "text": self._text_response,
            "usage": {"total_tokens": self._tokens_used},
        }

    async def generate_from_images(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        images: list[bytes],
        prompt: str,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        if self._raise_on_images is not None:
            raise self._raise_on_images
        self.image_calls.append((provider, len(images)))
        return {
            "text": self._images_response,
            "usage": {"total_tokens": self._tokens_used},
        }

    async def generate_reasoned_text(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> ReasonedText:
        result = await self.generate_text(
            config=config,
            provider=provider,
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return parse_reasoned_output(
            str(result["text"]),
            model_id=config.model_id,
            tokens_used=self._tokens_used,
        )

    async def generate_reasoned_from_images(
        self,
        *,
        config: ExternalAPIConfigDTO,
        provider: str,
        images: list[bytes],
        prompt: str,
        max_tokens: int = 1024,
    ) -> ReasonedText:
        result = await self.generate_from_images(
            config=config,
            provider=provider,
            images=images,
            prompt=prompt,
            max_tokens=max_tokens,
        )
        return parse_reasoned_output(
            str(result["text"]),
            model_id=config.model_id,
            tokens_used=self._tokens_used,
        )

    async def close(self) -> None:
        self.closed = True
