"""Tests for the text-tokenization use case.

The use case is a thin, framework-neutral wrapper over the :class:`ITokenizer`
port: it opens a tracer span and offloads the blocking tokenize call to a
worker thread. A fake tokenizer stands in for the spaCy / Stanza loaders so the
use case is tested without the ML runtimes.
"""

from __future__ import annotations

from src.application.dto.tokenization import (
    TokenDTO,
    TokenizationResultDTO,
    TokenizeRequest,
)
from src.application.ports.outbound.tokenizer import ITokenizer
from src.application.use_cases.tokenize_text import TokenizeTextUseCase


class _FakeTokenizer(ITokenizer):
    """Records the last call and returns a canned result."""

    def __init__(self, result: TokenizationResultDTO) -> None:
        self._result = result
        self.calls: list[tuple[str, str | None]] = []

    def tokenize(self, text: str, language: str | None = None) -> TokenizationResultDTO:
        self.calls.append((text, language))
        return self._result


def _result() -> TokenizationResultDTO:
    return TokenizationResultDTO(
        tokens=[TokenDTO(0, "hi", 0, 2, 0, 2)],
        language="en",
        language_confidence=0.99,
        tokenization_kind="custom",
        model_used="spacy/blank:en",
    )


class TestTokenizeTextUseCase:
    """execute() delegates to the port and returns its result."""

    async def test_returns_tokenizer_result(self) -> None:
        tokenizer = _FakeTokenizer(_result())
        use_case = TokenizeTextUseCase(tokenizer)

        result = await use_case.execute(TokenizeRequest(text="hi", language=None))

        assert result.language == "en"
        assert result.model_used == "spacy/blank:en"
        assert [t.text for t in result.tokens] == ["hi"]

    async def test_threads_text_and_language_override(self) -> None:
        tokenizer = _FakeTokenizer(_result())
        use_case = TokenizeTextUseCase(tokenizer)

        await use_case.execute(TokenizeRequest(text="hola", language="es"))

        assert tokenizer.calls == [("hola", "es")]

    async def test_language_none_passed_through(self) -> None:
        tokenizer = _FakeTokenizer(_result())
        use_case = TokenizeTextUseCase(tokenizer)

        await use_case.execute(TokenizeRequest(text="hello"))

        assert tokenizer.calls == [("hello", None)]
