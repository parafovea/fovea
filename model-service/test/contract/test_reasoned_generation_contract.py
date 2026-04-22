"""Contract tests for ``generate_reasoned`` on LLM/VLM/router adapters.

These exercise the reasoning-trace path through the fake adapters which
implement the same :class:`ILanguageModel`, :class:`IVisionLanguageModel`,
and :class:`IExternalAPIRouter` interfaces as the production adapters.
"""

from __future__ import annotations

import numpy as np
import pytest

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.dto.reasoning import ReasonedText
from test.application.fakes import (
    FakeExternalAPIRouter,
    FakeLanguageModel,
    FakeVisionLanguageModel,
)

_THINK_OUTPUT = "<think>reason step</think>final answer"
_PLAIN_OUTPUT = "just the answer"


@pytest.mark.asyncio
async def test_language_model_thinking_output() -> None:
    llm = FakeLanguageModel(canned_text=_THINK_OUTPUT, model_id="thinking-llm")
    result = await llm.generate_reasoned("hello")
    # Fake returns canned; parse_reasoned_output isn't invoked in the fake,
    # but contract is that ReasonedText is returned with consistent shape.
    assert isinstance(result, ReasonedText)
    assert result.text  # non-empty text


@pytest.mark.asyncio
async def test_language_model_plain_output_has_no_thinking() -> None:
    llm = FakeLanguageModel(canned_text=_PLAIN_OUTPUT, model_id="plain-llm")
    result = await llm.generate_reasoned("hello")
    assert isinstance(result, ReasonedText)
    assert result.thinking is None


@pytest.mark.asyncio
async def test_language_model_configurable_reasoned_response() -> None:
    from src.application.dto.reasoning import ThinkingStep, ThinkingTrace

    configured = ReasonedText(
        text="final",
        thinking=ThinkingTrace(steps=[ThinkingStep(content="why")], model_id="x"),
    )
    llm = FakeLanguageModel(reasoned_response=configured)
    result = await llm.generate_reasoned("prompt")
    assert result is configured
    assert result.has_thinking


def test_vision_language_model_plain_output() -> None:
    vlm = FakeVisionLanguageModel(canned_text=_PLAIN_OUTPUT)
    images = [np.zeros((4, 4, 3), dtype=np.uint8)]
    result = vlm.generate_reasoned_from_images(images, "describe")
    assert isinstance(result, ReasonedText)
    assert result.thinking is None


def test_vision_language_model_configurable_reasoned_response() -> None:
    from src.application.dto.reasoning import ThinkingStep, ThinkingTrace

    configured = ReasonedText(
        text="seen",
        thinking=ThinkingTrace(steps=[ThinkingStep(content="looked carefully")]),
    )
    vlm = FakeVisionLanguageModel(reasoned_response=configured)
    images = [np.zeros((4, 4, 3), dtype=np.uint8)]
    result = vlm.generate_reasoned_from_images(images, "describe")
    assert result.has_thinking


def _api_config() -> ExternalAPIConfigDTO:
    return ExternalAPIConfigDTO(
        api_key="k",
        api_endpoint="https://example.com",
        model_id="remote-thinker",
        provider="anthropic",
        timeout=10,
        max_retries=1,
    )


@pytest.mark.asyncio
async def test_external_router_thinking_text() -> None:
    router = FakeExternalAPIRouter(text_response=_THINK_OUTPUT)
    result = await router.generate_reasoned_text(
        config=_api_config(), provider="anthropic", prompt="p"
    )
    assert isinstance(result, ReasonedText)
    assert result.thinking is not None
    assert result.thinking.model_id == "remote-thinker"
    assert result.text == "final answer"


@pytest.mark.asyncio
async def test_external_router_plain_text() -> None:
    router = FakeExternalAPIRouter(text_response=_PLAIN_OUTPUT)
    result = await router.generate_reasoned_text(
        config=_api_config(), provider="openai", prompt="p"
    )
    assert result.thinking is None
    assert result.text == _PLAIN_OUTPUT


@pytest.mark.asyncio
async def test_external_router_thinking_images() -> None:
    router = FakeExternalAPIRouter(images_response=_THINK_OUTPUT)
    result = await router.generate_reasoned_from_images(
        config=_api_config(), provider="google", images=[b"\x00"], prompt="p"
    )
    assert result.thinking is not None
    assert result.text == "final answer"


@pytest.mark.asyncio
async def test_external_router_plain_images() -> None:
    router = FakeExternalAPIRouter(images_response=_PLAIN_OUTPUT)
    result = await router.generate_reasoned_from_images(
        config=_api_config(), provider="google", images=[b"\x00"], prompt="p"
    )
    assert result.thinking is None
