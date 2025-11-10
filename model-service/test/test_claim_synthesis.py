"""
Tests for claim synthesis module.
Tests the synthesis of narrative summaries from claim hierarchies.
"""

from unittest.mock import AsyncMock, Mock

import pytest

from src.claim_synthesis import (
    _format_claims_hierarchy,
    build_synthesis_prompt,
    synthesize_summary_from_claims,
)
from src.models import ClaimRelationship, ClaimSource


@pytest.fixture
def sample_claims():
    """Sample claim hierarchy for testing."""
    return [
        {
            "id": "claim-1",
            "text": "The rocket was launched successfully",
            "confidence": 0.95,
            "subclaims": [
                {
                    "id": "claim-1-1",
                    "text": "The rocket was launched",
                    "confidence": 0.98,
                    "subclaims": [],
                },
                {
                    "id": "claim-1-2",
                    "text": "The launch was successful",
                    "confidence": 0.92,
                    "subclaims": [],
                },
            ],
        },
        {
            "id": "claim-2",
            "text": "The rocket reached orbit",
            "confidence": 0.9,
            "subclaims": [],
        },
    ]


@pytest.fixture
def sample_claim_source(sample_claims):
    """Sample ClaimSource for testing."""
    return ClaimSource(
        source_id="video-123",
        source_type="video",
        claims=sample_claims,
        metadata={"title": "Rocket Launch Video", "date": "2024-01-15"},
    )


@pytest.fixture
def sample_claim_relations():
    """Sample claim relations for testing."""
    return [
        ClaimRelationship(
            source_claim_id="claim-3",
            target_claim_id="claim-4",
            relation_type="conflicts_with",
            confidence=0.85,
            notes="Launch time discrepancy",
        )
    ]


@pytest.fixture
def sample_ontology_context():
    """Sample ontology context for testing."""
    return {
        "types": [
            {"id": "type-1", "name": "Rocket"},
            {"id": "type-2", "name": "Launch"},
        ],
        "glosses": {
            "type-1": "A vehicle designed for space travel",
            "type-2": "The act of propelling a vehicle into space",
        },
    }


@pytest.fixture
def sample_persona_context():
    """Sample persona context for testing."""
    return {
        "role": "Aerospace Analyst",
        "information_need": "Analyzing rocket launch events for mission success",
    }


class TestFormatClaimsHierarchy:
    """Tests for _format_claims_hierarchy function."""

    def test_format_flat_claims(self, sample_claims):
        """Test formatting claims without subclaims."""
        flat_claims = [sample_claims[1]]  # "The rocket reached orbit"
        result = _format_claims_hierarchy(flat_claims, indent=0)

        assert len(result) == 1
        assert "The rocket reached orbit" in result[0]
        assert "[id: claim-2]" in result[0]
        assert "(confidence: 0.90)" in result[0]

    def test_format_hierarchical_claims(self, sample_claims):
        """Test formatting claims with subclaims."""
        result = _format_claims_hierarchy(sample_claims, indent=0)

        # Should have parent + 2 children + 1 other
        assert len(result) == 4
        # Check parent
        assert "The rocket was launched successfully" in result[0]
        # Check children are indented
        assert result[1].startswith("  ")
        assert "The rocket was launched" in result[1]

    def test_format_with_indentation(self, sample_claims):
        """Test that indentation increases for subclaims."""
        result = _format_claims_hierarchy(sample_claims, indent=1)

        # Base claims should have 1 indent level
        assert result[0].startswith("  ")
        # Subclaims should have 2 indent levels
        assert result[1].startswith("    ")


class TestBuildSynthesisPrompt:
    """Tests for build_synthesis_prompt function."""

    def test_basic_prompt_structure(self, sample_claim_source):
        """Test that basic prompt structure is correct."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=True,
            include_citations=False,
        )

        assert "synthesizing coherent narratives" in prompt.lower()
        assert "CLAIMS TO SYNTHESIZE" in prompt
        assert "video-123" in prompt or "Rocket Launch Video" in prompt
        assert "hierarchical claim structure" in prompt.lower()

    def test_prompt_with_persona_context(self, sample_claim_source, sample_persona_context):
        """Test prompt includes persona context."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=sample_persona_context,
            max_length=500,
            include_conflicts=True,
            include_citations=False,
        )

        assert "PERSONA ROLE: Aerospace Analyst" in prompt
        assert "INFORMATION NEED: Analyzing rocket launch" in prompt

    def test_prompt_with_ontology_context(self, sample_claim_source, sample_ontology_context):
        """Test prompt includes ontology types."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=sample_ontology_context,
            persona_context=None,
            max_length=500,
            include_conflicts=True,
            include_citations=False,
        )

        assert "ONTOLOGY TYPES" in prompt
        assert "#Rocket:" in prompt
        assert "vehicle designed for space travel" in prompt

    def test_prompt_with_conflicts(self, sample_claim_source, sample_claim_relations):
        """Test prompt includes conflict information."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=sample_claim_relations,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=True,
            include_citations=False,
        )

        assert "CONFLICTS DETECTED" in prompt
        assert "conflicts_with" in prompt
        assert "Launch time discrepancy" in prompt

    def test_hierarchical_strategy_instructions(self, sample_claim_source):
        """Test hierarchical strategy includes correct instructions."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        assert "hierarchical claim structure" in prompt.lower()
        assert "top-level claims" in prompt.lower()

    def test_chronological_strategy_instructions(self, sample_claim_source):
        """Test chronological strategy includes correct instructions."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="chronological",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        assert "chronological narrative" in prompt.lower()
        assert "temporal" in prompt.lower()

    def test_narrative_strategy_instructions(self, sample_claim_source):
        """Test narrative strategy includes correct instructions."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="narrative",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        assert "engaging narrative" in prompt.lower()
        assert "story-like flow" in prompt.lower()

    def test_analytical_strategy_instructions(self, sample_claim_source):
        """Test analytical strategy includes correct instructions."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="analytical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        assert "analytical summary" in prompt.lower()
        assert "evidence" in prompt.lower()

    def test_prompt_with_citations(self, sample_claim_source):
        """Test prompt includes citation instructions."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=True,
        )

        prompt_lower = prompt.lower()
        assert "claim id" in prompt_lower and "inline citation" in prompt_lower
        assert "[claim-" in prompt_lower

    def test_max_length_included(self, sample_claim_source):
        """Test that max_length is mentioned in prompt."""
        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=750,
            include_conflicts=False,
            include_citations=False,
        )

        assert "750 words" in prompt

    def test_multiple_sources(self, sample_claim_source):
        """Test prompt with multiple claim sources."""
        source2 = ClaimSource(
            source_id="video-456",
            source_type="video",
            claims=[{"id": "claim-10", "text": "Another claim", "confidence": 0.88}],
            metadata={"title": "Second Video"},
        )

        prompt = build_synthesis_prompt(
            claim_sources=[sample_claim_source, source2],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        assert "Source 1:" in prompt
        assert "Source 2:" in prompt
        assert "Rocket Launch Video" in prompt
        assert "Second Video" in prompt


class TestSynthesizeSummaryFromClaims:
    """Tests for synthesize_summary_from_claims function."""

    @pytest.mark.asyncio
    async def test_basic_synthesis(self, sample_claim_source):
        """Test basic synthesis without errors."""
        # Mock LLM loader
        mock_loader = Mock()
        mock_result = Mock()
        mock_result.text = "The rocket was launched successfully and reached orbit."
        mock_loader.generate = AsyncMock(return_value=mock_result)

        result = await synthesize_summary_from_claims(
            claim_sources=[sample_claim_source],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            llm_loader=mock_loader,
            max_length=500,
            include_conflicts=True,
            include_citations=False,
        )

        # Should return GlossItem array
        assert isinstance(result, list)
        assert len(result) > 0
        assert result[0]["type"] == "text"
        assert "launched successfully" in result[0]["content"]

    @pytest.mark.asyncio
    async def test_synthesis_with_all_options(
        self,
        sample_claim_source,
        sample_claim_relations,
        sample_ontology_context,
        sample_persona_context,
    ):
        """Test synthesis with all configuration options."""
        mock_loader = Mock()
        mock_result = Mock()
        mock_result.text = "A comprehensive analysis of the rocket launch."
        mock_loader.generate = AsyncMock(return_value=mock_result)

        result = await synthesize_summary_from_claims(
            claim_sources=[sample_claim_source],
            claim_relations=sample_claim_relations,
            synthesis_strategy="analytical",
            ontology_context=sample_ontology_context,
            persona_context=sample_persona_context,
            llm_loader=mock_loader,
            max_length=750,
            include_conflicts=True,
            include_citations=True,
        )

        # Verify generate was called
        assert mock_loader.generate.called
        call_args = mock_loader.generate.call_args

        # Check that prompt includes all contexts
        prompt = call_args[1]["prompt"]
        assert "Aerospace Analyst" in prompt
        assert "ONTOLOGY TYPES" in prompt
        assert "CONFLICTS DETECTED" in prompt

        # Check generation config
        config = call_args[1]["generation_config"]
        assert config.max_tokens == 8192
        assert config.temperature == 0.8

        # Check result
        assert isinstance(result, list)
        assert "comprehensive" in result[0]["content"]

    @pytest.mark.asyncio
    async def test_synthesis_multiple_sources(self, sample_claim_source):
        """Test synthesis with multiple claim sources."""
        source2 = ClaimSource(
            source_id="video-789",
            source_type="video",
            claims=[{"id": "claim-20", "text": "Follow-up observation"}],
        )

        mock_loader = Mock()
        mock_result = Mock()
        mock_result.text = "Multi-source analysis."
        mock_loader.generate = AsyncMock(return_value=mock_result)

        result = await synthesize_summary_from_claims(
            claim_sources=[sample_claim_source, source2],
            claim_relations=None,
            synthesis_strategy="hierarchical",
            ontology_context=None,
            persona_context=None,
            llm_loader=mock_loader,
            max_length=500,
            include_conflicts=False,
            include_citations=False,
        )

        # Verify multiple sources mentioned in prompt
        call_args = mock_loader.generate.call_args
        prompt = call_args[1]["prompt"]
        assert "Source 1:" in prompt
        assert "Source 2:" in prompt

        assert isinstance(result, list)
