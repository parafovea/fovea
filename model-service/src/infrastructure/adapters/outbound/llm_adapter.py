"""Adapter exposing the concrete LLM loader via :class:`ILanguageModel`."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, TypeAlias

from src.application.dto.generation import GenerationConfigDTO, GenerationResultDTO
from src.application.ports.outbound.llm import ILanguageModel
from src.infrastructure.adapters.outbound.models.llm.loader import (
    GenerationConfig,
    LLMLoader,
)

if TYPE_CHECKING:
    from src.infrastructure.adapters.outbound.models.llama_cpp.llm import LlamaCppLLMLoader

LLMLoaderLike: TypeAlias = "LLMLoader | LlamaCppLLMLoader"  # noqa: UP040


class LLMLoaderAdapter(ILanguageModel):
    """Adapts an LLM loader to the :class:`ILanguageModel` port."""

    def __init__(self, loader: LLMLoaderLike) -> None:
        """Initialize with an already-constructed loader."""
        self._loader = loader
        self._loaded = False

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        """Generate text."""
        config = GenerationConfig(
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=float(kwargs.get("top_p", 0.9)),
        )
        result = await self._loader.generate(prompt=prompt, generation_config=config)
        return str(result.text)

    async def generate_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Structured generation is not supported; raises :class:`NotImplementedError`."""
        raise NotImplementedError("Structured generation is not implemented for local LLMs")

    async def generate_with_config(
        self,
        prompt: str,
        config: GenerationConfigDTO,
    ) -> GenerationResultDTO:
        """Generate text with a structured config."""
        internal = GenerationConfig(
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            top_p=config.top_p,
            stop_sequences=config.stop_sequences,
        )
        result = await self._loader.generate(prompt=prompt, generation_config=internal)
        return GenerationResultDTO(
            text=str(result.text),
            tokens_used=int(getattr(result, "tokens_used", 0) or 0),
            finish_reason=str(getattr(result, "finish_reason", "stop") or "stop"),
        )

    def load(self) -> None:
        """Load the underlying model synchronously via the event loop."""
        if self._loaded:
            return
        asyncio.get_event_loop().run_until_complete(self._loader.load())
        self._loaded = True

    def unload(self) -> None:
        """Unload the underlying model."""
        if not self._loaded:
            return
        asyncio.get_event_loop().run_until_complete(self._loader.unload())
        self._loaded = False

    async def aload(self) -> None:
        """Async load for use inside async contexts."""
        await self._loader.load()
        self._loaded = True

    async def aunload(self) -> None:
        """Async unload for use inside async contexts."""
        await self._loader.unload()
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        """Return True if the model has been loaded."""
        return self._loaded

    @property
    def model_id(self) -> str:
        """Return the identifier of the underlying model."""
        return str(self._loader.config.model_id)
