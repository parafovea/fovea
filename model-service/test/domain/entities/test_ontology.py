"""Tests for ontology domain entities."""

from __future__ import annotations

from src.domain.entities.ontology import AugmentationResult, OntologyType
from src.domain.value_objects import ConfidenceScore


def _make_type(name: str, confidence: float = 0.8, parent: str | None = None) -> OntologyType:
    return OntologyType(
        name=name,
        description=f"desc of {name}",
        confidence=ConfidenceScore(confidence),
        parent=parent,
        examples=[f"{name}-ex1", f"{name}-ex2"],
    )


class TestOntologyType:
    def test_construction(self) -> None:
        t = _make_type("Actor", 0.9, parent="Person")
        assert t.name == "Actor"
        assert t.has_parent
        assert t.example_count == 2

    def test_has_parent_false(self) -> None:
        t = _make_type("Root")
        assert not t.has_parent

    def test_default_examples_empty(self) -> None:
        t = OntologyType(name="X", description="d", confidence=ConfidenceScore(0.5))
        assert t.examples == []
        assert t.example_count == 0

    def test_to_dict(self) -> None:
        t = _make_type("Actor", 0.9, parent="Person")
        d = t.to_dict()
        assert d["name"] == "Actor"
        assert d["confidence"] == 0.9
        assert d["parent"] == "Person"
        assert d["examples"] == ["Actor-ex1", "Actor-ex2"]

    def test_from_dict_roundtrip(self) -> None:
        t = _make_type("A", 0.7)
        restored = OntologyType.from_dict(t.to_dict())
        assert restored.name == t.name
        assert restored.confidence.value == t.confidence.value
        assert restored.examples == t.examples

    def test_from_dict_minimal(self) -> None:
        t = OntologyType.from_dict({"name": "n", "description": "d"})
        assert t.confidence.value == 0.0
        assert t.parent is None
        assert t.examples == []


class TestAugmentationResult:
    def _result(self, *confidences: float) -> AugmentationResult:
        return AugmentationResult(
            result_id="r",
            persona_id="p",
            target_category="entity",
            suggestions=[_make_type(f"T{i}", c) for i, c in enumerate(confidences)],
            reasoning="because",
            model_used="m",
            processing_time=0.5,
        )

    def test_suggestion_count(self) -> None:
        r = self._result(0.1, 0.5, 0.9)
        assert r.suggestion_count == 3

    def test_filter_by_confidence(self) -> None:
        r = self._result(0.1, 0.5, 0.9)
        assert len(r.filter_by_confidence(0.5)) == 2
        assert len(r.filter_by_confidence(0.0)) == 3
        assert len(r.filter_by_confidence(0.95)) == 0

    def test_get_top_suggestions(self) -> None:
        r = self._result(0.3, 0.9, 0.6, 0.1)
        top = r.get_top_suggestions(2)
        assert len(top) == 2
        assert top[0].confidence.value == 0.9
        assert top[1].confidence.value == 0.6

    def test_get_top_suggestions_exceeds_size(self) -> None:
        r = self._result(0.5, 0.7)
        top = r.get_top_suggestions(10)
        assert len(top) == 2

    def test_empty_suggestions(self) -> None:
        r = AugmentationResult(
            result_id="r",
            persona_id="p",
            target_category="entity",
            suggestions=[],
            reasoning="",
            model_used="m",
            processing_time=0.0,
        )
        assert r.suggestion_count == 0
        assert r.get_top_suggestions(5) == []
        assert r.filter_by_confidence(0.5) == []
