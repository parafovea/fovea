"""Tests for ExtractClaimsUseCase."""

from __future__ import annotations

import pytest

from src.application.use_cases.extract_claims import (
    ExtractClaimsRequest,
    ExtractClaimsUseCase,
    build_extraction_prompt,
    parse_claims_response,
    split_into_sentences,
)
from test.application.fakes import FakeLanguageModel

CANNED_RESPONSE = """[
  {
    "text": "The JWST was launched",
    "sentence_index": 0,
    "char_start": 0,
    "char_end": 21,
    "confidence": 0.95,
    "claim_type": "event",
    "subclaims": [
      {"text": "JWST is a telescope", "confidence": 0.9, "claim_type": "entity"}
    ]
  },
  {
    "text": "It orbits L2",
    "confidence": 0.8,
    "subclaims": []
  }
]"""


@pytest.mark.asyncio
async def test_extract_claims_happy_path() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_RESPONSE)
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="The JWST was launched. It orbits L2.",
            sentences=None,
            strategy="sentence-based",
            max_claims=10,
            min_confidence=0.5,
        )
    )

    assert len(claims) == 2
    assert claims[0].text == "The JWST was launched"
    assert claims[0].confidence == 0.95
    assert len(claims[0].subclaims) == 1
    assert claims[1].text == "It orbits L2"


@pytest.mark.asyncio
async def test_extract_claims_filters_by_min_confidence() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_RESPONSE)
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="Summary",
            sentences=None,
            strategy="sentence-based",
            max_claims=10,
            min_confidence=0.9,
        )
    )

    assert len(claims) == 1
    assert claims[0].text == "The JWST was launched"


@pytest.mark.asyncio
async def test_extract_claims_respects_max_claims() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_RESPONSE)
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="text",
            sentences=None,
            strategy="sentence-based",
            max_claims=1,
            min_confidence=0.0,
        )
    )
    assert len(claims) == 1


@pytest.mark.asyncio
async def test_extract_claims_empty_response() -> None:
    llm = FakeLanguageModel(canned_text="no json here")
    use_case = ExtractClaimsUseCase(language_model=llm)

    claims = await use_case.execute(
        ExtractClaimsRequest(
            summary_text="text",
            sentences=None,
            strategy="sentence-based",
            max_claims=10,
            min_confidence=0.0,
        )
    )
    assert claims == []


@pytest.mark.asyncio
async def test_extract_claims_propagates_llm_error() -> None:
    llm = FakeLanguageModel(raise_on_generate=RuntimeError("llm down"))
    use_case = ExtractClaimsUseCase(language_model=llm)

    with pytest.raises(RuntimeError, match="llm down"):
        await use_case.execute(
            ExtractClaimsRequest(
                summary_text="text",
                sentences=None,
                strategy="sentence-based",
                max_claims=10,
                min_confidence=0.0,
            )
        )


def test_split_into_sentences() -> None:
    assert split_into_sentences("Hello world. This is a test.") == [
        "Hello world.",
        "This is a test.",
    ]
    assert split_into_sentences("") == []


def test_build_extraction_prompt_contains_summary() -> None:
    prompt = build_extraction_prompt(
        summary_text="a summary here",
        sentences=["a summary here"],
        strategy="sentence-based",
        ontology_context=None,
        annotation_context=None,
        max_claims=5,
    )
    assert "a summary here" in prompt
    assert "5" in prompt


def test_parse_claims_response_invalid_json() -> None:
    assert parse_claims_response("[not json", "s", [], 0.0) == []


def test_parse_claims_response_missing_json() -> None:
    assert parse_claims_response("plain text", "s", [], 0.0) == []
