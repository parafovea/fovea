"""Parser utilities for reasoning traces embedded in model output.

Thinking-capable models (e.g., Qwen3-VL Thinking, DeepSeek-R1 Distill)
emit their chain of thought inside ``<think>...</think>`` blocks before
the final answer. This module extracts those blocks into structured
:class:`ThinkingStep` objects and returns a :class:`ReasonedText` wrapper.
"""

from __future__ import annotations

import re

from src.application.dto.reasoning import ReasonedText, ThinkingStep, ThinkingTrace

_THINK_OPEN = "<think>"
_THINK_CLOSE = "</think>"
_THINK_PATTERN = re.compile(r"<think>(.*?)</think>", re.DOTALL)


def parse_reasoned_output(
    raw: str,
    model_id: str = "",
    tokens_used: int | None = None,
) -> ReasonedText:
    """Split a raw model output into visible text and an optional thinking trace.

    Rules
    -----
    - If the raw output contains one or more ``<think>...</think>`` blocks,
      every block's inner text becomes a :class:`ThinkingStep`; the blocks
      are stripped from the visible text.
    - If no blocks are found, the entire raw output becomes the visible
      text with ``thinking=None``.
    - An unclosed ``<think>`` tag is treated as literal text; no partial
      parsing is attempted.
    - Content outside ``<think>`` tags is joined (whitespace-trimmed on
      ends) to form the final text.

    Parameters
    ----------
    raw : str
        Raw model output.
    model_id : str
        Identifier of the producing model, attached to the trace.
    tokens_used : int | None
        Optional total token count for the generation.

    Returns
    -------
    ReasonedText
        Structured output with visible text and optional trace.
    """
    if _THINK_OPEN not in raw:
        return ReasonedText(text=raw.strip(), thinking=None, tokens_used=tokens_used)

    matches = list(_THINK_PATTERN.finditer(raw))
    if not matches:
        # Unclosed or malformed <think> tag: treat entire output as literal.
        return ReasonedText(text=raw.strip(), thinking=None, tokens_used=tokens_used)

    steps = [ThinkingStep(content=match.group(1).strip()) for match in matches]
    visible = _THINK_PATTERN.sub("", raw).strip()
    trace = ThinkingTrace(steps=steps, model_id=model_id, total_tokens=None)
    return ReasonedText(text=visible, thinking=trace, tokens_used=tokens_used)
