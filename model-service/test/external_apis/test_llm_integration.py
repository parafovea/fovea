"""Tests for LLM external API integration in ontology augmentation."""

from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.external_apis.base import ExternalAPIConfig
from src.ontology_augmentation import (
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
        """Test extraction when JSON is embedded in text."""
        response = """Here are some suggestions:
```json
[{"name": "Test", "description": "A test type"}]
```
These are my recommendations."""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'

    def test_extract_json_case_insensitive(self) -> None:
        """Test that JSON code block detection is case insensitive."""
        response = """```JSON
[{"name": "Test", "description": "A test type"}]
```"""
        result = extract_json_from_response(response)
        assert result == '[{"name": "Test", "description": "A test type"}]'


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

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_router_result = {
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

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            suggestions = await augment_ontology_with_external_api(
                context=context,
                api_config=api_config,
                provider="anthropic",
                max_suggestions=10,
            )

            assert len(suggestions) == 2
            assert suggestions[0].name == "Mammal"
            assert suggestions[0].parent == "Animal"
            assert len(suggestions[0].examples) == 3
            assert suggestions[0].confidence > 0

            assert suggestions[1].name == "Bird"
            assert "vertebrates" in suggestions[1].description.lower()

            mock_router.generate_text.assert_called_once()
            mock_router.close_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_with_plain_json_response(self) -> None:
        """Test handling of plain JSON response (no markdown)."""
        context = AugmentationContext(
            domain="Sports analytics",
            existing_types=["Player", "Team"],
            target_category="event",
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.openai.com",
            model_id="gpt-4o",
        )

        mock_router_result = {
            "text": '[{"name": "Goal", "description": "A scoring event in soccer.", "parent": null, "examples": ["Penalty kick", "Free kick"]}]',
            "usage": {"total_tokens": 150},
            "model": "gpt-4o",
        }

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            suggestions = await augment_ontology_with_external_api(
                context=context,
                api_config=api_config,
                provider="openai",
                max_suggestions=5,
            )

            assert len(suggestions) == 1
            assert suggestions[0].name == "Goal"
            assert suggestions[0].parent is None
            assert len(suggestions[0].examples) == 2

    @pytest.mark.asyncio
    async def test_augment_ontology_respects_max_suggestions(self) -> None:
        """Test that max_suggestions limit is respected."""
        context = AugmentationContext(
            domain="E-commerce",
            existing_types=["Product", "Category"],
            target_category="entity",
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_suggestions = [
            {"name": f"Type{i}", "description": f"Description {i}", "parent": None, "examples": []}
            for i in range(10)
        ]

        import json

        mock_router_result = {
            "text": json.dumps(mock_suggestions),
            "usage": {"total_tokens": 300},
            "model": "test-model",
        }

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            suggestions = await augment_ontology_with_external_api(
                context=context,
                api_config=api_config,
                provider="google",
                max_suggestions=5,
            )

            assert len(suggestions) <= 5

    @pytest.mark.asyncio
    async def test_augment_ontology_handles_api_errors(self) -> None:
        """Test that API errors are properly handled."""
        context = AugmentationContext(
            domain="Healthcare",
            existing_types=["Patient", "Doctor"],
            target_category="event",
        )

        api_config = ExternalAPIConfig(
            api_key="invalid_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(
                side_effect=Exception("API authentication failed")
            )
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            with pytest.raises(RuntimeError, match="External API augmentation failed"):
                await augment_ontology_with_external_api(
                    context=context,
                    api_config=api_config,
                    provider="anthropic",
                    max_suggestions=10,
                )

            mock_router.close_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_handles_invalid_json(self) -> None:
        """Test error handling for invalid JSON in response."""
        context = AugmentationContext(
            domain="Transportation",
            existing_types=["Vehicle", "Route"],
            target_category="entity",
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_router_result = {
            "text": "This is not valid JSON at all!",
            "usage": {"total_tokens": 50},
            "model": "test-model",
        }

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            with pytest.raises(RuntimeError, match="External API augmentation failed"):
                await augment_ontology_with_external_api(
                    context=context,
                    api_config=api_config,
                    provider="openai",
                    max_suggestions=10,
                )

            mock_router.close_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_sorts_by_confidence(self) -> None:
        """Test that suggestions are sorted by confidence score."""
        context = AugmentationContext(
            domain="Manufacturing",
            existing_types=["Machine", "Worker"],
            target_category="event",
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_router_result = {
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

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            suggestions = await augment_ontology_with_external_api(
                context=context,
                api_config=api_config,
                provider="anthropic",
                max_suggestions=10,
            )

            assert len(suggestions) == 2
            assert suggestions[0].confidence >= suggestions[1].confidence

    @pytest.mark.asyncio
    async def test_augment_ontology_creates_valid_prompt(self) -> None:
        """Test that created prompt includes context information."""
        context = AugmentationContext(
            domain="Education",
            existing_types=["Student", "Teacher", "Course"],
            target_category="relation",
            persona_role="School Administrator",
            information_need="Track enrollment patterns",
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_router_result = {
            "text": "[]",
            "usage": {"total_tokens": 50},
            "model": "test-model",
        }

        with patch("src.ontology_augmentation.ExternalModelRouter") as mock_router_class:
            mock_router = Mock()
            mock_router.generate_text = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            await augment_ontology_with_external_api(
                context=context,
                api_config=api_config,
                provider="google",
                max_suggestions=10,
            )

            call_args = mock_router.generate_text.call_args
            prompt = call_args[1]["prompt"]

            assert "Education" in prompt
            assert "relation" in prompt
            assert "Student" in prompt
            assert "School Administrator" in prompt
