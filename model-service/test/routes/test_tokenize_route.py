"""Tests for the ``POST /api/tokenize`` route.

Uses FastAPI's ``TestClient`` with ``dependency_overrides`` to swap in a fake
model manager whose loaded model is a fake tokenizer. The route owns:
task-config lookup, model loading, the inference lock, use-case invocation, and
the DTO-to-wire mapping (including snake_case offset fields).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient

from src.application.dto.tokenization import TokenDTO, TokenizationResultDTO
from src.main import app


@pytest.fixture(autouse=True)
def _clear_overrides() -> object:
    """Ensure each test starts and ends with no dependency overrides."""
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


class _FakeTokenizer:
    """A stand-in tokenizer returning a canned result and recording calls."""

    def __init__(self, result: TokenizationResultDTO) -> None:
        self._result = result
        self.calls: list[tuple[str, str | None]] = []

    def tokenize(self, text: str, language: str | None = None) -> TokenizationResultDTO:
        self.calls.append((text, language))
        return self._result


def _manager_with_tokenizer(tokenizer: object | None) -> Mock:
    """Build a mock ModelManager exposing the text_tokenization task."""
    manager = Mock()
    if tokenizer is None:
        manager.tasks = {}
    else:
        manager.tasks = {"text_tokenization": Mock()}
        manager.load_model = AsyncMock(return_value=tokenizer)
    return manager


def _client(tokenizer: object | None) -> TestClient:
    from src.infrastructure.adapters.inbound.fastapi.dependencies import get_model_manager

    manager = _manager_with_tokenizer(tokenizer)
    app.dependency_overrides[get_model_manager] = lambda: manager
    return TestClient(app, base_url="http://testserver")


@pytest.fixture
def emoji_result() -> TokenizationResultDTO:
    """A result whose offsets exercise the astral divergence on the wire."""
    return TokenizationResultDTO(
        tokens=[
            TokenDTO(token_index=0, text="Hi", byte_start=0, byte_end=2, char_start=0, char_end=2),
            TokenDTO(token_index=1, text="👍", byte_start=3, byte_end=7, char_start=3, char_end=5),
        ],
        language="en",
        language_confidence=0.97,
        tokenization_kind="custom",
        model_used="spacy/blank:en",
    )


class TestTokenizeRoute:
    """Coverage of ``POST /api/tokenize``."""

    def test_success_returns_tokens_and_metadata(self, emoji_result: TokenizationResultDTO) -> None:
        tokenizer = _FakeTokenizer(emoji_result)
        client = _client(tokenizer)

        response = client.post("/api/tokenize", json={"text": "Hi 👍"})

        assert response.status_code == 200
        body = response.json()
        assert body["language"] == "en"
        assert body["language_confidence"] == pytest.approx(0.97)
        assert body["tokenization_kind"] == "custom"
        assert body["model_used"] == "spacy/blank:en"
        assert len(body["tokens"]) == 2
        first, emoji = body["tokens"]
        assert first == {
            "token_index": 0,
            "text": "Hi",
            "byte_start": 0,
            "byte_end": 2,
            "char_start": 0,
            "char_end": 2,
        }
        # UTF-16 code-unit offsets trail the UTF-8 byte offsets on the emoji.
        assert emoji["byte_start"] == 3
        assert emoji["byte_end"] == 7
        assert emoji["char_start"] == 3
        assert emoji["char_end"] == 5
        # Detection ran (no override passed through).
        assert tokenizer.calls == [("Hi 👍", None)]

    def test_language_override_is_threaded(self, emoji_result: TokenizationResultDTO) -> None:
        tokenizer = _FakeTokenizer(emoji_result)
        client = _client(tokenizer)

        response = client.post("/api/tokenize", json={"text": "Hi 👍", "language": "en"})

        assert response.status_code == 200
        assert tokenizer.calls == [("Hi 👍", "en")]

    def test_missing_task_returns_500(self) -> None:
        client = _client(None)
        response = client.post("/api/tokenize", json={"text": "hello"})
        assert response.status_code == 500
        assert "text_tokenization" in response.json()["detail"]

    def test_missing_text_returns_422(self, emoji_result: TokenizationResultDTO) -> None:
        client = _client(_FakeTokenizer(emoji_result))
        response = client.post("/api/tokenize", json={})
        assert response.status_code == 422
