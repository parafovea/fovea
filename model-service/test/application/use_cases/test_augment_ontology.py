"""Tests for AugmentOntologyUseCase."""

from __future__ import annotations

import pytest

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.use_cases.augment_ontology import (
    AugmentationContext,
    AugmentOntologyUseCase,
    calculate_confidence,
    create_augmentation_prompt,
    extract_json_from_response,
    generate_augmentation_reasoning,
    parse_llm_response,
)
from test.application.fakes import FakeExternalAPIRouter, FakeLanguageModel

CANNED_JSON = """[
  {"name": "Customer", "description": "A buyer of goods in a store setting.", "parent": "Person", "examples": ["Walk-in", "Online"]},
  {"name": "Employee", "description": "Worker at the store.", "parent": null, "examples": ["Cashier", "Manager"]}
]"""


def _context() -> AugmentationContext:
    return AugmentationContext(
        domain="retail",
        existing_types=["Person", "Product"],
        target_category="entity",
        persona_role="Analyst",
        information_need="Understand shoppers",
    )


@pytest.mark.asyncio
async def test_execute_local_happy_path() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_JSON)
    use_case = AugmentOntologyUseCase(language_model=llm)

    results = await use_case.execute_local(context=_context(), max_suggestions=5)

    assert len(results) == 2
    names = {r.name for r in results}
    assert names == {"Customer", "Employee"}
    assert all(0.0 <= r.confidence <= 1.0 for r in results)
    assert results[0].confidence >= results[1].confidence


@pytest.mark.asyncio
async def test_execute_local_without_llm_raises() -> None:
    use_case = AugmentOntologyUseCase()
    with pytest.raises(RuntimeError, match="Local language model"):
        await use_case.execute_local(context=_context())


@pytest.mark.asyncio
async def test_execute_local_propagates_llm_error() -> None:
    llm = FakeLanguageModel(raise_on_generate=RuntimeError("llm fail"))
    use_case = AugmentOntologyUseCase(language_model=llm)
    with pytest.raises(RuntimeError, match="llm fail"):
        await use_case.execute_local(context=_context())


@pytest.mark.asyncio
async def test_execute_external_happy_path() -> None:
    router = FakeExternalAPIRouter(text_response=CANNED_JSON)
    use_case = AugmentOntologyUseCase(external_router=router)
    config = ExternalAPIConfigDTO(
        api_key="k",
        api_endpoint="http://x",
        model_id="m",
        provider="anthropic",
    )

    results = await use_case.execute_external(
        context=_context(), api_config=config, provider="anthropic", max_suggestions=5
    )

    assert len(results) == 2
    assert router.closed


@pytest.mark.asyncio
async def test_execute_external_without_router_raises() -> None:
    use_case = AugmentOntologyUseCase()
    config = ExternalAPIConfigDTO(
        api_key="k", api_endpoint="http://x", model_id="m", provider="anthropic"
    )
    with pytest.raises(RuntimeError, match="External API router"):
        await use_case.execute_external(
            context=_context(), api_config=config, provider="anthropic"
        )


@pytest.mark.asyncio
async def test_execute_local_respects_max_suggestions() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_JSON)
    use_case = AugmentOntologyUseCase(language_model=llm)
    results = await use_case.execute_local(context=_context(), max_suggestions=1)
    assert len(results) == 1


def test_parse_llm_response_valid() -> None:
    parsed = parse_llm_response(CANNED_JSON)
    assert len(parsed) == 2
    assert parsed[0]["name"] == "Customer"


def test_parse_llm_response_invalid_raises() -> None:
    with pytest.raises(ValueError):
        parse_llm_response("not json at all")


def test_parse_llm_response_skips_invalid_items() -> None:
    text = '[{"name": "A", "description": "d"}, "not a dict", {"name": "B"}]'
    parsed = parse_llm_response(text)
    assert len(parsed) == 1
    assert parsed[0]["name"] == "A"


def test_calculate_confidence_ranges() -> None:
    suggestion = {
        "name": "Customer",
        "description": "A buyer of goods in a store setting.",
        "parent": "Person",
        "examples": ["Walk-in", "Online"],
    }
    score = calculate_confidence(suggestion, _context())
    assert 0.0 <= score <= 1.0


def test_extract_json_from_response_code_block() -> None:
    text = "```json\n[1, 2]\n```"
    assert extract_json_from_response(text) == "[1, 2]"


def test_extract_json_from_response_plain() -> None:
    assert extract_json_from_response("[1, 2]") == "[1, 2]"


def test_create_augmentation_prompt_contains_domain() -> None:
    prompt = create_augmentation_prompt(_context(), max_suggestions=5)
    assert "retail" in prompt
    assert "entity" in prompt


def test_generate_augmentation_reasoning_non_empty() -> None:
    llm = FakeLanguageModel(canned_text=CANNED_JSON)
    _ = llm  # satisfy "use" contract
    from src.application.dto.ontology import OntologyTypeDTO

    suggestions = [
        OntologyTypeDTO(name="A", description="d", confidence=0.9),
        OntologyTypeDTO(name="B", description="d", confidence=0.6),
    ]
    text = generate_augmentation_reasoning(suggestions, _context())
    assert "retail" in text


def test_generate_augmentation_reasoning_empty_suggestions() -> None:
    text = generate_augmentation_reasoning([], _context())
    assert "No suitable" in text
