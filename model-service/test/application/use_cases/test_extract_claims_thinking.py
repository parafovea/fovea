"""Tests that ExtractClaimsUseCase preserves reasoning traces."""

from __future__ import annotations

import pytest

from src.application.use_cases.extract_claims import ExtractClaimsRequest, ExtractClaimsUseCase
from test.application.fakes import FakeLanguageModel

RESPONSE_WITH_THINKING = """<think>
I need to extract atomic claims from the summary.
</think>[
  {
    "text": "Water boils at 100C",
    "confidence": 0.95,
    "claim_type": "fact",
    "subclaims": [
      {"text": "Boiling depends on pressure", "confidence": 0.9}
    ]
  }
]"""

RESPONSE_WITHOUT_THINKING = """[
  {"text": "Water boils at 100C", "confidence": 0.95}
]"""


@pytest.mark.asyncio
async def test_thinking_trace_attached_to_claims() -> None:
    """Claims carry the reasoning trace when the model emits <think>."""
    llm = FakeLanguageModel(canned_text=RESPONSE_WITH_THINKING, model_id="qwen-thinking")
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="Water boils at 100C.",
            sentences=None,
            strategy="sentence-based",
            max_claims=10,
            min_confidence=0.5,
        )
    )

    assert len(claims) == 1
    assert claims[0].reasoning_trace is not None
    assert claims[0].reasoning_trace.model_id == "qwen-thinking"
    assert len(claims[0].reasoning_trace.steps) == 1
    assert "atomic claims" in claims[0].reasoning_trace.steps[0].content

    # Subclaims also carry the trace.
    assert claims[0].subclaims[0].reasoning_trace is not None
    assert claims[0].subclaims[0].reasoning_trace.model_id == "qwen-thinking"


@pytest.mark.asyncio
async def test_no_trace_when_model_emits_no_thinking() -> None:
    """Non-thinking model output leaves reasoning_trace as None."""
    llm = FakeLanguageModel(canned_text=RESPONSE_WITHOUT_THINKING, model_id="plain-llm")
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="Water boils at 100C.",
            sentences=None,
            strategy="sentence-based",
            max_claims=10,
            min_confidence=0.5,
        )
    )

    assert len(claims) == 1
    assert claims[0].reasoning_trace is None
