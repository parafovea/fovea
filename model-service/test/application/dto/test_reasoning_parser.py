"""Tests for :func:`parse_reasoned_output`."""

from __future__ import annotations

from src.application.dto.reasoning_parser import parse_reasoned_output


class TestParseReasonedOutput:
    """Edge cases for the ``<think>`` block parser."""

    def test_no_think_tags_pass_through(self) -> None:
        result = parse_reasoned_output("Just the answer.")
        assert result.text == "Just the answer."
        assert result.thinking is None

    def test_single_think_block_produces_one_step(self) -> None:
        raw = "<think>let me reason</think>Final answer."
        result = parse_reasoned_output(raw, model_id="m1")
        assert result.text == "Final answer."
        assert result.thinking is not None
        assert len(result.thinking.steps) == 1
        assert result.thinking.steps[0].content == "let me reason"
        assert result.thinking.model_id == "m1"

    def test_multiple_think_blocks_produce_multiple_steps(self) -> None:
        raw = "<think>step one</think>mid<think>step two</think>final"
        result = parse_reasoned_output(raw)
        assert result.thinking is not None
        assert len(result.thinking.steps) == 2
        assert result.thinking.steps[0].content == "step one"
        assert result.thinking.steps[1].content == "step two"
        assert "step one" not in result.text
        assert "step two" not in result.text
        assert "mid" in result.text
        assert "final" in result.text

    def test_nested_text_around_blocks_preserved(self) -> None:
        raw = "prefix <think>reason</think> suffix"
        result = parse_reasoned_output(raw)
        assert result.thinking is not None
        assert result.text == "prefix  suffix"

    def test_unclosed_think_treated_as_literal(self) -> None:
        raw = "<think>no close tag here"
        result = parse_reasoned_output(raw)
        assert result.text == "<think>no close tag here"
        assert result.thinking is None

    def test_empty_string(self) -> None:
        result = parse_reasoned_output("")
        assert result.text == ""
        assert result.thinking is None

    def test_whitespace_stripped_from_outer_text(self) -> None:
        raw = "   \n<think>x</think>\n answer \n"
        result = parse_reasoned_output(raw)
        assert result.text == "answer"

    def test_multiline_think_content_preserved(self) -> None:
        raw = "<think>line1\nline2\nline3</think>answer"
        result = parse_reasoned_output(raw)
        assert result.thinking is not None
        assert result.thinking.steps[0].content == "line1\nline2\nline3"

    def test_think_content_is_trimmed(self) -> None:
        raw = "<think>  padded  </think>out"
        result = parse_reasoned_output(raw)
        assert result.thinking is not None
        assert result.thinking.steps[0].content == "padded"

    def test_tokens_used_preserved(self) -> None:
        result = parse_reasoned_output("answer", tokens_used=42)
        assert result.tokens_used == 42

    def test_tokens_used_preserved_with_thinking(self) -> None:
        result = parse_reasoned_output("<think>r</think>answer", model_id="m", tokens_used=99)
        assert result.tokens_used == 99
        assert result.thinking is not None
        assert result.thinking.model_id == "m"

    def test_only_think_block_produces_empty_text(self) -> None:
        result = parse_reasoned_output("<think>only reasoning</think>")
        assert result.text == ""
        assert result.thinking is not None
        assert len(result.thinking.steps) == 1

    def test_combined_text_across_multiple_steps(self) -> None:
        raw = "<think>a</think><think>b</think>answer"
        result = parse_reasoned_output(raw)
        assert result.thinking is not None
        assert result.thinking.combined_text == "a\n\nb"
