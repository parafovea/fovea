"""Fake IVisionLanguageModel for use case testing."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.application.dto.reasoning import ReasonedText
from src.application.ports.outbound.vlm import IVisionLanguageModel

if TYPE_CHECKING:
    import numpy as np
    from numpy.typing import NDArray


class FakeVisionLanguageModel(IVisionLanguageModel):
    """In-memory vision-language model returning a canned response."""

    def __init__(
        self,
        *,
        canned_text: str = "1. Summary of video.\n2. Visual analysis: objects present.",
        model_id: str = "fake-vlm",
        vram_gb: float = 4.0,
        raise_on_generate: Exception | None = None,
        reasoned_response: ReasonedText | None = None,
    ) -> None:
        self._canned_text = canned_text
        self._model_id = model_id
        self._vram_gb = vram_gb
        self._raise_on_generate = raise_on_generate
        self._reasoned_response = reasoned_response
        self._loaded = False
        self.generate_calls: list[tuple[int, str]] = []
        self.generate_reasoned_calls: list[tuple[int, str]] = []

    def generate(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> str:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        self.generate_calls.append((len(images), prompt))
        return self._canned_text

    def generate_reasoned_from_images(
        self,
        images: list[NDArray[np.uint8]],
        prompt: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> ReasonedText:
        if self._raise_on_generate is not None:
            raise self._raise_on_generate
        self.generate_reasoned_calls.append((len(images), prompt))
        if self._reasoned_response is not None:
            return self._reasoned_response
        return ReasonedText(text=self._canned_text, thinking=None)

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

    @property
    def vram_gb(self) -> float:
        return self._vram_gb
