"""Tests for ConfidenceScore value object."""

from __future__ import annotations

import math

import pytest

from src.domain.value_objects.confidence_score import ConfidenceScore


class TestConfidenceScoreConstruction:
    def test_valid_score(self) -> None:
        score = ConfidenceScore(0.75)
        assert score.value == 0.75

    def test_zero_is_valid(self) -> None:
        assert ConfidenceScore(0.0).value == 0.0

    def test_one_is_valid(self) -> None:
        assert ConfidenceScore(1.0).value == 1.0

    def test_negative_raises(self) -> None:
        with pytest.raises(ValueError, match="must be between"):
            ConfidenceScore(-0.01)

    def test_above_one_raises(self) -> None:
        with pytest.raises(ValueError, match="must be between"):
            ConfidenceScore(1.01)


class TestConfidenceScoreMethods:
    def test_as_percentage(self) -> None:
        assert ConfidenceScore(0.85).as_percentage() == pytest.approx(85.0)

    def test_as_percentage_zero(self) -> None:
        assert ConfidenceScore(0.0).as_percentage() == 0.0

    def test_is_high_default(self) -> None:
        assert ConfidenceScore(0.9).is_high()
        assert not ConfidenceScore(0.7).is_high()

    def test_is_high_custom_threshold(self) -> None:
        assert ConfidenceScore(0.6).is_high(threshold=0.5)
        assert not ConfidenceScore(0.4).is_high(threshold=0.5)

    def test_is_low_default(self) -> None:
        assert ConfidenceScore(0.2).is_low()
        assert not ConfidenceScore(0.5).is_low()

    def test_from_logit_zero(self) -> None:
        score = ConfidenceScore.from_logit(0.0)
        assert score.value == pytest.approx(0.5)

    def test_from_logit_large_positive(self) -> None:
        score = ConfidenceScore.from_logit(10.0)
        assert score.value == pytest.approx(1.0 / (1.0 + math.exp(-10.0)))
        assert score.value > 0.99

    def test_from_logit_large_negative(self) -> None:
        score = ConfidenceScore.from_logit(-10.0)
        assert score.value < 0.01


class TestConfidenceScoreComparison:
    def test_less_than(self) -> None:
        assert ConfidenceScore(0.3) < ConfidenceScore(0.7)

    def test_less_equal(self) -> None:
        assert ConfidenceScore(0.5) <= ConfidenceScore(0.5)
        assert ConfidenceScore(0.4) <= ConfidenceScore(0.5)

    def test_greater_than(self) -> None:
        assert ConfidenceScore(0.9) > ConfidenceScore(0.1)

    def test_greater_equal(self) -> None:
        assert ConfidenceScore(0.5) >= ConfidenceScore(0.5)
        assert ConfidenceScore(0.6) >= ConfidenceScore(0.5)

    def test_float_conversion(self) -> None:
        assert float(ConfidenceScore(0.42)) == 0.42

    def test_equality(self) -> None:
        assert ConfidenceScore(0.5) == ConfidenceScore(0.5)
        assert ConfidenceScore(0.5) != ConfidenceScore(0.6)

    def test_immutable(self) -> None:
        score = ConfidenceScore(0.5)
        with pytest.raises(AttributeError):
            score.value = 0.9  # type: ignore[misc]
