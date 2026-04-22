"""Fake ILanguageModel for use case testing."""

from __future__ import annotations

from typing import Any

from src.application.dto.generation import GenerationConfigDTO, GenerationResultDTO
from src.application.dto.reasoning import ReasonedText
from src.application.ports.outbound.llm import ILanguageModel


class FakeLanguageModel(ILanguageModel):
    """In-memory language model returning configured canned responses."""

    def __init__(
        self,
        *,
        canned_text: str = "",
        model_id: str = "fake-llm",
        structured_response: dict[str, Any] | None = None,
        raise_on_generate: Exception | None = None,
        reasoned_response: ReasonedText | None = None,
    ) -> None:
        self._canned_text = canned_text
        self._model_id = model_id
        self._structured_response = structured_response if structured_response is not None else {}
        self._raise_on_generate = raise_on_generate
        self._reasoned_response = reasoned_response
        self._loaded = False
        self.generate_calls: list[str] = []
        self.generate_reasoned_calls: list[str] = []
        self.generate_with_config_calls: list[tuple[str, GenerationConfigDTO]] = []

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        self.generate_calls.append(prompt)
        return self._canned_text

    async def generate_reasoned(
        self,
        prompt: str,
        *,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> ReasonedText:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        self.generate_reasoned_calls.append(prompt)
        if self._reasoned_response is not None:
            return self._reasoned_response
        return ReasonedText(text=self._canned_text, thinking=None)

    async def generate_structured(
        self,
        prompt: str,
        schema: dict[str, Any],
        max_tokens: int = 512,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        return dict(self._structured_response)

    async def generate_with_config(
        self,
        prompt: str,
        config: GenerationConfigDTO,
    ) -> GenerationResultDTO:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        self.generate_with_config_calls.append((prompt, config))
        return GenerationResultDTO(
            text=self._canned_text,
            tokens_used=len(self._canned_text.split()),
            finish_reason="stop",
        )

    def load(self) -> None:
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def model_id(self) -> str:
        return self._model_id
