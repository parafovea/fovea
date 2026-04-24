"""DTOs for chain-of-thought reasoning traces.

Framework-neutral data transfer objects representing reasoning traces
produced by thinking-capable language and vision-language models.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ThinkingStep:
    """One step of a chain-of-thought trace.

    Parameters
    ----------
    content : str
        Text of the reasoning step.
    tokens_used : int | None
        Optional token count for this step.
    """

    content: str
    tokens_used: int | None = None


@dataclass(frozen=True)
class ThinkingTrace:
    """Captured reasoning trace from a thinking-capable model.

    Parameters
    ----------
    steps : list[ThinkingStep]
        Ordered reasoning steps.
    total_tokens : int | None
        Optional total token count across steps.
    model_id : str
        Identifier of the model that produced the trace.
    """

    steps: list[ThinkingStep] = field(default_factory=list)
    total_tokens: int | None = None
    model_id: str = ""

    @property
    def is_empty(self) -> bool:
        """Return True when the trace has no steps."""
        return len(self.steps) == 0

    @property
    def combined_text(self) -> str:
        """Join every step's content with blank lines between."""
        return "\n\n".join(step.content for step in self.steps)


@dataclass(frozen=True)
class ReasonedText:
    """Text output paired with its optional reasoning trace.

    Parameters
    ----------
    text : str
        Visible text returned by the model.
    thinking : ThinkingTrace | None
        Optional reasoning trace (``None`` for non-thinking models).
    tokens_used : int | None
        Optional total token count for the generation.
    """

    text: str
    thinking: ThinkingTrace | None = None
    tokens_used: int | None = None

    @property
    def has_thinking(self) -> bool:
        """Return True when a non-empty thinking trace is present."""
        return self.thinking is not None and not self.thinking.is_empty
