"""Tests for ontology augmentation functionality.

This module tests prompt generation, LLM response parsing, confidence scoring,
and end-to-end ontology augmentation across diverse domains.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.llm_loader import GenerationResult, LLMConfig, LLMFramework
from src.models import OntologyType
from src.ontology_augmentation import (
    AugmentationContext,
    augment_ontology_with_llm,
    calculate_confidence,
    create_augmentation_prompt,
    generate_augmentation_reasoning,
    parse_llm_response,
)

# Note: parse_llm_response signature changed - removed unused target_category parameter


@pytest.fixture
def wildlife_research_context() -> AugmentationContext:
    """Wildlife research context for marine mammal tracking."""
    return AugmentationContext(
        domain="Wildlife research tracking whale pod behavior and migration patterns",
        existing_types=["Whale", "Pod", "Vessel"],
        target_category="entity",
        persona_role="Marine Biologist",
        information_need="Track individual whale movements and social interactions",
    )


@pytest.fixture
def sports_analytics_context() -> AugmentationContext:
    """Sports analytics context for baseball game analysis."""
    return AugmentationContext(
        domain="Baseball game analysis tracking pitch types and player performance",
        existing_types=["Fastball", "Curveball", "Slider"],
        target_category="event",
        persona_role="Baseball Scout",
        information_need="Identify pitch mechanics and ball trajectory patterns",
    )


@pytest.fixture
def retail_analysis_context() -> AugmentationContext:
    """Retail analysis context for customer behavior tracking."""
    return AugmentationContext(
        domain="Retail store analysis of customer flow and product interactions",
        existing_types=["Customer", "Employee", "Product"],
        target_category="event",
        persona_role="Store Manager",
        information_need="Understand customer journey and product engagement",
    )


@pytest.fixture
def medical_training_context() -> AugmentationContext:
    """Medical training context for surgical procedure annotation."""
    return AugmentationContext(
        domain="Surgical training video annotation for laparoscopic procedures",
        existing_types=["Surgeon", "Patient", "Nurse"],
        target_category="role",
        persona_role="Surgical Resident",
        information_need="Track role assignments and task delegation during surgery",
    )


@pytest.fixture
def film_production_context() -> AugmentationContext:
    """Film production context for continuity tracking."""
    return AugmentationContext(
        domain="Film production continuity tracking props and costumes across takes",
        existing_types=["Prop", "Costume", "Actor"],
        target_category="relation",
        persona_role="Continuity Editor",
        information_need="Track relationships between objects and their states",
    )


@pytest.fixture
def mock_llm_config() -> LLMConfig:
    """Mock LLM configuration for testing."""
    return LLMConfig(
        model_id="test-model",
        quantization="4bit",
        framework=LLMFramework.TRANSFORMERS,
        max_tokens=2048,
        temperature=0.7,
        top_p=0.9,
    )


class TestPromptGeneration:
    """Test suite for prompt generation."""

    def test_create_prompt_entity_category(
        self, wildlife_research_context: AugmentationContext
    ) -> None:
        """Test prompt generation for entity category."""
        prompt = create_augmentation_prompt(wildlife_research_context, max_suggestions=5)

        assert "entity types" in prompt.lower()
        assert wildlife_research_context.domain in prompt
        assert "Whale" in prompt
        assert "Pod" in prompt
        assert "Vessel" in prompt
        assert "Marine Biologist" in prompt
        assert "JSON array" in prompt
        assert "5 new entity types" in prompt

    def test_create_prompt_event_category(
        self, sports_analytics_context: AugmentationContext
    ) -> None:
        """Test prompt generation for event category."""
        prompt = create_augmentation_prompt(sports_analytics_context, max_suggestions=10)

        assert "event types" in prompt.lower()
        assert sports_analytics_context.domain in prompt
        assert "Fastball" in prompt
        assert "Curveball" in prompt
        assert "Baseball Scout" in prompt

    def test_create_prompt_role_category(
        self, medical_training_context: AugmentationContext
    ) -> None:
        """Test prompt generation for role category."""
        prompt = create_augmentation_prompt(medical_training_context, max_suggestions=8)

        assert "role types" in prompt.lower()
        assert medical_training_context.domain in prompt
        assert "Surgeon" in prompt
        assert "Patient" in prompt

    def test_create_prompt_relation_category(
        self, film_production_context: AugmentationContext
    ) -> None:
        """Test prompt generation for relation category."""
        prompt = create_augmentation_prompt(film_production_context, max_suggestions=6)

        assert "relation types" in prompt.lower()
        assert film_production_context.domain in prompt
        assert "Prop" in prompt
        assert "Costume" in prompt

    def test_create_prompt_no_existing_types(self) -> None:
        """Test prompt generation with no existing types."""
        context = AugmentationContext(
            domain="Urban planning traffic pattern analysis",
            existing_types=[],
            target_category="entity",
        )

        prompt = create_augmentation_prompt(context, max_suggestions=5)

        assert "None" in prompt
        assert context.domain in prompt

    def test_create_prompt_no_persona_info(self) -> None:
        """Test prompt generation without persona information."""
        context = AugmentationContext(
            domain="Gaming esports match analysis",
            existing_types=["Player", "Champion"],
            target_category="event",
        )

        prompt = create_augmentation_prompt(context, max_suggestions=10)

        assert "Persona Role" not in prompt
        assert "Information Need" not in prompt
        assert context.domain in prompt


class TestResponseParsing:
    """Test suite for LLM response parsing."""

    def test_parse_valid_json_response(self) -> None:
        """Test parsing valid JSON response."""
        response_text = """
        [
          {
            "name": "Calf",
            "description": "Young whale traveling with pod.",
            "parent": "Whale",
            "examples": ["Humpback Calf", "Blue Whale Calf"]
          },
          {
            "name": "Tail Slap",
            "description": "Whale strikes water surface with tail fluke.",
            "parent": null,
            "examples": ["Surface Slap", "Warning Display"]
          }
        ]
        """

        parsed = parse_llm_response(response_text)

        assert len(parsed) == 2
        assert parsed[0]["name"] == "Calf"
        assert parsed[0]["description"] == "Young whale traveling with pod."
        assert parsed[0]["parent"] == "Whale"
        assert len(parsed[0]["examples"]) == 2

        assert parsed[1]["name"] == "Tail Slap"
        assert parsed[1]["parent"] is None

    def test_parse_response_with_extra_text(self) -> None:
        """Test parsing response with extra text around JSON."""
        response_text = """
        Here are the suggestions:

        [
          {
            "name": "Changeup",
            "description": "Off-speed pitch with fastball arm action.",
            "parent": null,
            "examples": ["Circle Change", "Vulcan Change"]
          }
        ]

        These suggestions are based on baseball pitching mechanics.
        """

        parsed = parse_llm_response(response_text)

        assert len(parsed) == 1
        assert parsed[0]["name"] == "Changeup"

    def test_parse_response_missing_optional_fields(self) -> None:
        """Test parsing response with missing optional fields."""
        response_text = """
        [
          {
            "name": "BrowseProduct",
            "description": "Customer examines product without picking it up."
          }
        ]
        """

        parsed = parse_llm_response(response_text)

        assert len(parsed) == 1
        assert parsed[0]["name"] == "BrowseProduct"
        assert parsed[0]["parent"] is None
        assert parsed[0]["examples"] == []

    def test_parse_invalid_json_raises_error(self) -> None:
        """Test that invalid JSON raises ValueError."""
        response_text = "This is not valid JSON at all"

        with pytest.raises(ValueError, match="Invalid JSON"):
            parse_llm_response(response_text)

    def test_parse_non_array_json_raises_error(self) -> None:
        """Test that non-array JSON raises ValueError."""
        response_text = '{"name": "Single Object", "description": "Not an array"}'

        with pytest.raises(ValueError, match="must be a JSON array"):
            parse_llm_response(response_text)

    def test_parse_skips_invalid_items(self) -> None:
        """Test that parser skips items missing required fields."""
        response_text = """
        [
          {
            "name": "ValidType",
            "description": "This is valid."
          },
          {
            "name": "MissingDescription"
          },
          {
            "description": "Missing name"
          },
          "not an object",
          {
            "name": "AnotherValid",
            "description": "Also valid."
          }
        ]
        """

        parsed = parse_llm_response(response_text)

        assert len(parsed) == 2
        assert parsed[0]["name"] == "ValidType"
        assert parsed[1]["name"] == "AnotherValid"


class TestConfidenceScoring:
    """Test suite for confidence score calculation."""

    def test_calculate_confidence_high_quality(
        self, wildlife_research_context: AugmentationContext
    ) -> None:
        """Test confidence for high-quality suggestion."""
        suggestion = {
            "name": "WhaleCalf",
            "description": "Young whale offspring traveling with the pod, typically observed near adult females.",
            "parent": "Whale",
            "examples": ["Humpback Calf", "Blue Whale Calf", "Orca Calf"],
        }

        confidence = calculate_confidence(suggestion, wildlife_research_context)

        assert confidence >= 0.7
        assert confidence <= 1.0

    def test_calculate_confidence_minimal_suggestion(
        self, sports_analytics_context: AugmentationContext
    ) -> None:
        """Test confidence for minimal suggestion."""
        suggestion = {
            "name": "Pitch",
            "description": "A pitch",
            "parent": None,
            "examples": [],
        }

        confidence = calculate_confidence(suggestion, sports_analytics_context)

        assert confidence < 0.7

    def test_calculate_confidence_valid_parent(
        self, retail_analysis_context: AugmentationContext
    ) -> None:
        """Test confidence boost for valid parent type."""
        suggestion_with_parent = {
            "name": "PickupProduct",
            "description": "Customer physically picks up and examines a product.",
            "parent": "Customer",
            "examples": ["Examine Package", "Check Price"],
        }

        suggestion_without_parent = {
            "name": "PickupProduct",
            "description": "Customer physically picks up and examines a product.",
            "parent": None,
            "examples": ["Examine Package", "Check Price"],
        }

        confidence_with = calculate_confidence(
            suggestion_with_parent, retail_analysis_context
        )
        confidence_without = calculate_confidence(
            suggestion_without_parent, retail_analysis_context
        )

        assert confidence_with > confidence_without

    def test_calculate_confidence_domain_relevance(
        self, medical_training_context: AugmentationContext
    ) -> None:
        """Test confidence boost for domain-relevant terms."""
        relevant_suggestion = {
            "name": "SurgicalAssistant",
            "description": "Medical professional assisting the primary surgeon.",
            "parent": "Surgeon",
            "examples": ["First Assistant", "Resident"],
        }

        irrelevant_suggestion = {
            "name": "RandomPerson",
            "description": "Someone not related to the domain.",
            "parent": None,
            "examples": ["Person A", "Person B"],
        }

        confidence_relevant = calculate_confidence(
            relevant_suggestion, medical_training_context
        )
        confidence_irrelevant = calculate_confidence(
            irrelevant_suggestion, medical_training_context
        )

        assert confidence_relevant > confidence_irrelevant

    def test_calculate_confidence_capped_at_one(
        self, wildlife_research_context: AugmentationContext
    ) -> None:
        """Test that confidence is capped at 1.0."""
        perfect_suggestion = {
            "name": "WhaleBreaching",
            "description": "Whale jumps completely or partially out of water, common behavior in pod migration.",
            "parent": "Whale",
            "examples": ["Full Breach", "Partial Breach", "Spy Hop", "Tail Slap"],
        }

        confidence = calculate_confidence(perfect_suggestion, wildlife_research_context)

        assert confidence <= 1.0


class TestReasoningGeneration:
    """Test suite for reasoning generation."""

    def test_generate_reasoning_with_suggestions(
        self, wildlife_research_context: AugmentationContext
    ) -> None:
        """Test reasoning generation with valid suggestions."""
        suggestions = [
            OntologyType(
                name="Calf",
                description="Young whale",
                parent="Whale",
                confidence=0.85,
                examples=["Humpback Calf"],
            ),
            OntologyType(
                name="Breach",
                description="Jumping behavior",
                parent=None,
                confidence=0.75,
                examples=["Full Breach"],
            ),
        ]

        reasoning = generate_augmentation_reasoning(
            suggestions, wildlife_research_context
        )

        assert wildlife_research_context.domain in reasoning
        assert "2 entity type suggestions" in reasoning
        assert "confidence" in reasoning.lower()
        assert "existing types" in reasoning.lower()

    def test_generate_reasoning_high_confidence(
        self, sports_analytics_context: AugmentationContext
    ) -> None:
        """Test reasoning mentions high confidence top suggestion."""
        suggestions = [
            OntologyType(
                name="Splitter",
                description="Split-finger pitch",
                parent=None,
                confidence=0.92,
                examples=["Hard Splitter"],
            ),
        ]

        reasoning = generate_augmentation_reasoning(
            suggestions, sports_analytics_context
        )

        assert "Splitter" in reasoning
        assert "high confidence" in reasoning.lower()

    def test_generate_reasoning_no_suggestions(
        self, retail_analysis_context: AugmentationContext
    ) -> None:
        """Test reasoning with no suggestions."""
        suggestions: list[OntologyType] = []

        reasoning = generate_augmentation_reasoning(
            suggestions, retail_analysis_context
        )

        assert "No suitable" in reasoning
        assert retail_analysis_context.domain in reasoning

    def test_generate_reasoning_no_existing_types(self) -> None:
        """Test reasoning when there are no existing types."""
        context = AugmentationContext(
            domain="Film production continuity tracking",
            existing_types=[],
            target_category="entity",
        )

        suggestions = [
            OntologyType(
                name="Prop",
                description="Physical object",
                parent=None,
                confidence=0.80,
                examples=["Coffee Cup"],
            ),
        ]

        reasoning = generate_augmentation_reasoning(suggestions, context)

        assert "foundational types" in reasoning.lower()


class TestEndToEndAugmentation:
    """Test suite for end-to-end augmentation."""

    @pytest.mark.asyncio
    async def test_augment_ontology_success(
        self,
        wildlife_research_context: AugmentationContext,
        mock_llm_config: LLMConfig,
    ) -> None:
        """Test successful ontology augmentation."""
        mock_response = GenerationResult(
            text=json.dumps(
                [
                    {
                        "name": "Calf",
                        "description": "Young whale offspring traveling with pod.",
                        "parent": "Whale",
                        "examples": ["Humpback Calf", "Orca Calf"],
                    },
                    {
                        "name": "ResearchVessel",
                        "description": "Scientific vessel observing whale behavior.",
                        "parent": "Vessel",
                        "examples": ["Research Ship", "Survey Boat"],
                    },
                ]
            ),
            tokens_used=250,
            finish_reason="eos",
        )

        with patch("src.ontology_augmentation.LLMLoader") as mock_loader_class:
            mock_loader = AsyncMock()
            mock_loader.load = AsyncMock()
            mock_loader.generate = AsyncMock(return_value=mock_response)
            mock_loader.unload = AsyncMock()
            mock_loader_class.return_value = mock_loader

            suggestions = await augment_ontology_with_llm(
                wildlife_research_context, mock_llm_config, max_suggestions=5
            )

            assert len(suggestions) == 2
            assert suggestions[0].name == "Calf"
            assert suggestions[0].description == "Young whale offspring traveling with pod."
            assert suggestions[0].parent == "Whale"
            assert len(suggestions[0].examples) == 2
            assert 0.0 <= suggestions[0].confidence <= 1.0

            assert suggestions[1].name == "ResearchVessel"
            assert suggestions[1].parent == "Vessel"

            mock_loader.load.assert_called_once()
            mock_loader.generate.assert_called_once()
            mock_loader.unload.assert_called_once()

    @pytest.mark.asyncio
    async def test_augment_ontology_sorts_by_confidence(
        self,
        sports_analytics_context: AugmentationContext,
        mock_llm_config: LLMConfig,
    ) -> None:
        """Test that suggestions are sorted by confidence."""
        mock_response = GenerationResult(
            text=json.dumps(
                [
                    {
                        "name": "MinimalPitch",
                        "description": "Low quality",
                        "parent": None,
                        "examples": [],
                    },
                    {
                        "name": "Changeup",
                        "description": "Off-speed pitch with deceptive arm action mimicking fastball delivery.",
                        "parent": "Fastball",
                        "examples": ["Circle Change", "Vulcan Change", "Palm Ball"],
                    },
                ]
            ),
            tokens_used=200,
            finish_reason="eos",
        )

        with patch("src.ontology_augmentation.LLMLoader") as mock_loader_class:
            mock_loader = AsyncMock()
            mock_loader.load = AsyncMock()
            mock_loader.generate = AsyncMock(return_value=mock_response)
            mock_loader.unload = AsyncMock()
            mock_loader_class.return_value = mock_loader

            suggestions = await augment_ontology_with_llm(
                sports_analytics_context, mock_llm_config, max_suggestions=10
            )

            assert suggestions[0].confidence >= suggestions[1].confidence

    @pytest.mark.asyncio
    async def test_augment_ontology_limits_suggestions(
        self,
        retail_analysis_context: AugmentationContext,
        mock_llm_config: LLMConfig,
    ) -> None:
        """Test that suggestions are limited to max_suggestions."""
        mock_response = GenerationResult(
            text=json.dumps(
                [
                    {"name": f"Event{i}", "description": f"Description {i}"}
                    for i in range(20)
                ]
            ),
            tokens_used=500,
            finish_reason="eos",
        )

        with patch("src.ontology_augmentation.LLMLoader") as mock_loader_class:
            mock_loader = AsyncMock()
            mock_loader.load = AsyncMock()
            mock_loader.generate = AsyncMock(return_value=mock_response)
            mock_loader.unload = AsyncMock()
            mock_loader_class.return_value = mock_loader

            suggestions = await augment_ontology_with_llm(
                retail_analysis_context, mock_llm_config, max_suggestions=5
            )

            assert len(suggestions) == 5

    @pytest.mark.asyncio
    async def test_augment_ontology_unloads_on_error(
        self,
        medical_training_context: AugmentationContext,
        mock_llm_config: LLMConfig,
    ) -> None:
        """Test that model is unloaded even if generation fails."""
        with patch("src.ontology_augmentation.LLMLoader") as mock_loader_class:
            mock_loader = AsyncMock()
            mock_loader.load = AsyncMock()
            mock_loader.generate = AsyncMock(
                side_effect=RuntimeError("Generation failed")
            )
            mock_loader.unload = AsyncMock()
            mock_loader_class.return_value = mock_loader

            with pytest.raises(RuntimeError, match="Generation failed"):
                await augment_ontology_with_llm(
                    medical_training_context, mock_llm_config, max_suggestions=10
                )

            mock_loader.unload.assert_called_once()


class TestDiverseDomainCoverage:
    """Test suite ensuring diverse domain examples."""

    def test_wildlife_research_domain(
        self, wildlife_research_context: AugmentationContext
    ) -> None:
        """Test wildlife research domain context."""
        assert "whale" in wildlife_research_context.domain.lower()
        assert wildlife_research_context.persona_role == "Marine Biologist"
        assert wildlife_research_context.target_category == "entity"

    def test_sports_analytics_domain(
        self, sports_analytics_context: AugmentationContext
    ) -> None:
        """Test sports analytics domain context."""
        assert "baseball" in sports_analytics_context.domain.lower()
        assert sports_analytics_context.persona_role == "Baseball Scout"
        assert sports_analytics_context.target_category == "event"

    def test_retail_analysis_domain(
        self, retail_analysis_context: AugmentationContext
    ) -> None:
        """Test retail analysis domain context."""
        assert "retail" in retail_analysis_context.domain.lower()
        assert retail_analysis_context.persona_role == "Store Manager"
        assert retail_analysis_context.target_category == "event"

    def test_medical_training_domain(
        self, medical_training_context: AugmentationContext
    ) -> None:
        """Test medical training domain context."""
        assert "surgical" in medical_training_context.domain.lower()
        assert medical_training_context.persona_role == "Surgical Resident"
        assert medical_training_context.target_category == "role"

    def test_film_production_domain(
        self, film_production_context: AugmentationContext
    ) -> None:
        """Test film production domain context."""
        assert "film" in film_production_context.domain.lower()
        assert film_production_context.persona_role == "Continuity Editor"
        assert film_production_context.target_category == "relation"
