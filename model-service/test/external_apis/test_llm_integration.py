"""Tests for LLM external API integration in ontology augmentation."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.dto.reasoning import ReasonedText
from src.application.use_cases.augment_ontology import (
    AugmentationContext,
    augment_ontology_with_external_api,
    extract_json_from_response,
)


class TestJSONExtraction:
    """Tests for JSON extraction from LLM responses."""

    def test_extract_json_from_plain_json(self) -> None:
        """Test extraction from plain JSON response."""
        response = '[{"name": "Test", "description": "A test type"}]'
        result = extract_json_from_response(response)
        assert result == response

    def test_extract_json_from_markdown_json_block(self) -> None:
        """Test extraction from markdown JSON code block."""
        response = """```json
[{"name": "Test", "description": "A test type"}]
```"""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'

    def test_extract_json_from_generic_code_block(self) -> None:
        """Test extraction from generic markdown code block."""
        response = """```
[{"name": "Test", "description": "A test type"}]
```"""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'

    def test_extract_json_with_whitespace(self) -> None:
        """Test that whitespace is properly handled."""
        response = """```json

[{"name": "Test", "description": "A test type"}]

```"""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'

    def test_extract_json_with_surrounding_text(self) -> None:
        """Test extraction with surrounding text."""
        response = """Here are the suggestions:

```json
[{"name": "Test", "description": "A test type"}]
```

I hope these help!"""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'


def _make_router(result: dict) -> MagicMock:
    """Build a mock IExternalAPIRouter returning a fixed result."""
    router = MagicMock()
    router.generate_text = AsyncMock(return_value=result)
    router.generate_reasoned_text = AsyncMock(
        return_value=ReasonedText(
            text=result["text"],
            thinking=None,
            tokens_used=result.get("usage", {}).get("total_tokens"),
        )
    )
    router.close = AsyncMock()
    return router


def _api_config() -> ExternalAPIConfigDTO:
    """Shared test API config."""
    return ExternalAPIConfigDTO(
        api_key="test_key",
        api_endpoint="https://api.test.com",
        model_id="test-model",
        provider="anthropic",
    )


class TestExternalAPIOntologyAugmentation:
    """Tests for external API ontology augmentation."""

    @pytest.mark.asyncio
    async def test_augment_ontology_with_external_api_success(self) -> None:
        """Test successful ontology augmentation with external API."""
        context = AugmentationContext(
            domain="Wildlife conservation",
            existing_types=["Animal", "Plant"],
            target_category="entity",
            persona_role="Wildlife Biologist",
            information_need="Track endangered species",
        )
        router = _make_router(
            {
                "text": """```json
[
  {
    "name": "Mammal",
    "description": "Warm-blooded vertebrates with fur or hair.",
    "parent": "Animal",
    "examples": ["Lion", "Elephant", "Dolphin"]
  },
  {
    "name": "Bird",
    "description": "Feathered vertebrates with beaks and wings.",
    "parent": "Animal",
    "examples": ["Eagle", "Penguin", "Sparrow"]
  }
]
```""",
                "usage": {"total_tokens": 200},
                "model": "test-model",
            }
        )

        suggestions = await augment_ontology_with_external_api(
            context=context,
            api_config=_api_config(),
            provider="anthropic",
            external_router=router,
            max_suggestions=10,
        )

        assert len(suggestions) == 2
        names = {s.name for s in suggestions}
        assert names == {"Mammal", "Bird"}
        router.generate_text.assert_called_once()
        router.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_with_plain_json_response(self) -> None:
        """Test handling of plain JSON response (no markdown)."""
        context = AugmentationContext(
            domain="Sports analytics",
            existing_types=["Player", "Team"],
            target_category="event",
        )
        router = _make_router(
            {
                "text": '[{"name": "Goal", "description": "A scoring event in soccer.", "parent": null, "examples": ["Penalty kick", "Free kick"]}]',
                "usage": {"total_tokens": 150},
                "model": "gpt-4o",
            }
        )

        suggestions = await augment_ontology_with_external_api(
            context=context,
            api_config=_api_config(),
            provider="openai",
            external_router=router,
            max_suggestions=5,
        )

        assert len(suggestions) == 1
        assert suggestions[0].name == "Goal"

    @pytest.mark.asyncio
    async def test_augment_ontology_respects_max_suggestions(self) -> None:
        """Test that max_suggestions limit is respected."""
        context = AugmentationContext(
            domain="E-commerce",
            existing_types=["Product", "Category"],
            target_category="entity",
        )
        payload = json.dumps(
            [
                {
                    "name": f"Type{i}",
                    "description": f"Description {i}",
                    "parent": None,
                    "examples": [],
                }
                for i in range(10)
            ]
        )
        router = _make_router(
            {"text": payload, "usage": {"total_tokens": 300}, "model": "test-model"}
        )

        suggestions = await augment_ontology_with_external_api(
            context=context,
            api_config=_api_config(),
            provider="google",
            external_router=router,
            max_suggestions=5,
        )

        assert len(suggestions) <= 5

    @pytest.mark.asyncio
    async def test_augment_ontology_handles_api_errors(self) -> None:
        """Test that API errors are propagated."""
        context = AugmentationContext(
            domain="Healthcare",
            existing_types=["Patient", "Doctor"],
            target_category="event",
        )
        router = MagicMock()
        router.generate_text = AsyncMock(side_effect=RuntimeError("API authentication failed"))
        router.generate_reasoned_text = AsyncMock(
            side_effect=RuntimeError("API authentication failed")
        )
        router.close = AsyncMock()

        with pytest.raises(RuntimeError, match="API authentication failed"):
            await augment_ontology_with_external_api(
                context=context,
                api_config=_api_config(),
                provider="anthropic",
                external_router=router,
                max_suggestions=10,
            )

        router.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_handles_invalid_json(self) -> None:
        """Test error handling for invalid JSON in response."""
        context = AugmentationContext(
            domain="Transportation",
            existing_types=["Vehicle", "Route"],
            target_category="entity",
        )
        router = _make_router(
            {
                "text": "This is not valid JSON at all!",
                "usage": {"total_tokens": 50},
                "model": "test-model",
            }
        )

        with pytest.raises(ValueError, match="Invalid JSON"):
            await augment_ontology_with_external_api(
                context=context,
                api_config=_api_config(),
                provider="openai",
                external_router=router,
                max_suggestions=10,
            )

        router.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_sorts_by_confidence(self) -> None:
        """Test that suggestions are sorted by confidence score."""
        context = AugmentationContext(
            domain="Manufacturing",
            existing_types=["Machine", "Worker"],
            target_category="event",
        )
        router = _make_router(
            {
                "text": """[
  {
    "name": "ShortDesc",
    "description": "Short",
    "parent": null,
    "examples": []
  },
  {
    "name": "DetailedDescription",
    "description": "This is a very detailed and thorough description of the manufacturing event type.",
    "parent": "Machine",
    "examples": ["Example1", "Example2", "Example3"]
  }
]""",
                "usage": {"total_tokens": 100},
                "model": "test-model",
            }
        )

        suggestions = await augment_ontology_with_external_api(
            context=context,
            api_config=_api_config(),
            provider="anthropic",
            external_router=router,
            max_suggestions=10,
        )

        assert len(suggestions) == 2
        assert suggestions[0].confidence >= suggestions[1].confidence

    @pytest.mark.asyncio
    async def test_augment_ontology_creates_valid_prompt(self) -> None:
        """Test that prompt passed to router includes context."""
        context = AugmentationContext(
            domain="Education",
            existing_types=["Student", "Teacher", "Course"],
            target_category="relation",
            persona_role="School Administrator",
            information_need="Track enrollment patterns",
        )
        router = _make_router({"text": "[]", "usage": {"total_tokens": 50}, "model": "test-model"})

        await augment_ontology_with_external_api(
            context=context,
            api_config=_api_config(),
            provider="google",
            external_router=router,
            max_suggestions=10,
        )

        call_kwargs = router.generate_text.call_args.kwargs
        prompt = call_kwargs["prompt"]
        assert "Education" in prompt
        assert "Student" in prompt
        assert "School Administrator" in prompt
