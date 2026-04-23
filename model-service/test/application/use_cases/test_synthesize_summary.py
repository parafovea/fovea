"""Tests for SynthesizeSummaryUseCase."""

from __future__ import annotations

import pytest

from src.application.dto.claims import ClaimRelationshipDTO, ClaimSourceDTO
from src.application.use_cases.synthesize_summary import (
    SynthesizeSummaryUseCase,
    build_synthesis_prompt,
    parse_reference_markers,
)
from test.application.fakes import FakeLanguageModel


def _source() -> ClaimSourceDTO:
    return ClaimSourceDTO(
        source_id="v1",
        source_type="video",
        claims=[
            {"id": "c1", "text": "Claim one", "confidence": 0.9, "subclaims": []},
            {"id": "c2", "text": "Claim two", "confidence": 0.85, "subclaims": []},
        ],
        metadata={"title": "Test Video"},
    )


@pytest.mark.asyncio
async def test_synthesize_happy_path() -> None:
    llm = FakeLanguageModel(canned_text="Overview of #Person who met @JohnDoe yesterday.")
    use_case = SynthesizeSummaryUseCase(language_model=llm)

    items = await use_case.execute(
        claim_sources=[_source()],
        claim_relations=None,
        synthesis_strategy="hierarchical",
        ontology_context=None,
        persona_context=None,
        max_length=500,
        include_conflicts=False,
        include_citations=False,
    )

    types = [item["type"] for item in items]
    assert "text" in types
    assert "typeRef" in types
    assert "objectRef" in types


@pytest.mark.asyncio
async def test_synthesize_empty_sources() -> None:
    llm = FakeLanguageModel(canned_text="No claims to synthesize.")
    use_case = SynthesizeSummaryUseCase(language_model=llm)

    items = await use_case.execute(
        claim_sources=[],
        claim_relations=None,
        synthesis_strategy="narrative",
        ontology_context=None,
        persona_context=None,
        max_length=100,
        include_conflicts=False,
        include_citations=False,
    )
    assert items == [{"type": "text", "content": "No claims to synthesize."}]


@pytest.mark.asyncio
async def test_synthesize_with_relations_and_conflicts() -> None:
    llm = FakeLanguageModel(canned_text="Conflicting claims analyzed.")
    use_case = SynthesizeSummaryUseCase(language_model=llm)

    relations = [
        ClaimRelationshipDTO(
            source_claim_id="c1",
            target_claim_id="c2",
            relation_type="conflicts_with",
            confidence=0.9,
            notes="direct conflict",
        )
    ]
    items = await use_case.execute(
        claim_sources=[_source()],
        claim_relations=relations,
        synthesis_strategy="analytical",
        ontology_context={"types": [{"id": "t1", "name": "Person"}], "glosses": {}},
        persona_context={"role": "Analyst", "information_need": "Understand conflicts"},
        max_length=200,
        include_conflicts=True,
        include_citations=True,
    )
    assert len(items) >= 1
    assert items[0]["content"] == "Conflicting claims analyzed."


@pytest.mark.asyncio
async def test_synthesize_propagates_llm_error() -> None:
    llm = FakeLanguageModel(raise_on_generate=RuntimeError("llm failure"))
    use_case = SynthesizeSummaryUseCase(language_model=llm)
    with pytest.raises(RuntimeError, match="llm failure"):
        await use_case.execute(
            claim_sources=[_source()],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=100,
            include_conflicts=False,
            include_citations=False,
        )


def test_parse_reference_markers_mixed() -> None:
    items = parse_reference_markers("Hello #Person and @Alice plus ^ann1 end")
    types = [item["type"] for item in items]
    assert "typeRef" in types
    assert "objectRef" in types
    assert "annotationRef" in types


def test_parse_reference_markers_empty() -> None:
    assert parse_reference_markers("") == []


def test_parse_reference_markers_no_markers() -> None:
    items = parse_reference_markers("plain text with no markers")
    assert items == [{"type": "text", "content": "plain text with no markers"}]


def test_build_synthesis_prompt_contains_strategy() -> None:
    prompt = build_synthesis_prompt(
        claim_sources=[_source()],
        claim_relations=None,
        synthesis_strategy="hierarchical",
        ontology_context=None,
        persona_context=None,
        max_length=100,
        include_conflicts=False,
        include_citations=False,
    )
    assert "hierarchical" in prompt.lower()
    assert "Claim one" in prompt
