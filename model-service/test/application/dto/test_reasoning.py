"""Tests for reasoning DTO invariants."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from src.application.dto.reasoning import ReasonedText, ThinkingStep, ThinkingTrace


class TestThinkingTrace:
    """Invariants for :class:`ThinkingTrace`."""

    def test_is_empty_true_when_no_steps(self) -> None:
        trace = ThinkingTrace()
        assert trace.is_empty is True

    def test_is_empty_false_when_steps_present(self) -> None:
        trace = ThinkingTrace(steps=[ThinkingStep(content="a")])
        assert trace.is_empty is False

    def test_combined_text_joins_with_blank_line(self) -> None:
        trace = ThinkingTrace(steps=[ThinkingStep(content="first"), ThinkingStep(content="second")])
        assert trace.combined_text == "first\n\nsecond"

    def test_combined_text_empty_for_no_steps(self) -> None:
        assert ThinkingTrace().combined_text == ""

    def test_frozen_dataclass(self) -> None:
        trace = ThinkingTrace(model_id="x")
        with pytest.raises(FrozenInstanceError):
            trace.model_id = "y"  # type: ignore[misc]


class TestReasonedText:
    """Invariants for :class:`ReasonedText`."""

    def test_has_thinking_false_when_none(self) -> None:
        rt = ReasonedText(text="answer")
        assert rt.has_thinking is False

    def test_has_thinking_false_when_empty_trace(self) -> None:
        rt = ReasonedText(text="answer", thinking=ThinkingTrace())
        assert rt.has_thinking is False

    def test_has_thinking_true_when_non_empty_trace(self) -> None:
        rt = ReasonedText(
            text="answer",
            thinking=ThinkingTrace(steps=[ThinkingStep(content="reason")]),
        )
        assert rt.has_thinking is True

    def test_frozen_dataclass(self) -> None:
        rt = ReasonedText(text="a")
        with pytest.raises(FrozenInstanceError):
            rt.text = "b"  # type: ignore[misc]


class TestThinkingStep:
    """Invariants for :class:`ThinkingStep`."""

    def test_defaults(self) -> None:
        step = ThinkingStep(content="c")
        assert step.content == "c"
        assert step.tokens_used is None

    def test_frozen(self) -> None:
        step = ThinkingStep(content="c")
        with pytest.raises(FrozenInstanceError):
            step.content = "d"  # type: ignore[misc]
