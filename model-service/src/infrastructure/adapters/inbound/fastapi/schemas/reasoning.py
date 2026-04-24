"""Pydantic schemas for reasoning traces.

These mirror :class:`ThinkingStep` / :class:`ThinkingTrace` DTOs for JSON
serialization on thinking-capable model responses.
"""

from __future__ import annotations

from pydantic import Field

from src.infrastructure.adapters.inbound.fastapi.schemas.common import StrictBaseModel


class ThinkingStepSchema(StrictBaseModel):
    """One step of a chain-of-thought trace."""

    content: str = Field(..., description="Reasoning step text")
    tokens_used: int | None = Field(default=None, ge=0, description="Optional token count")


class ThinkingTraceSchema(StrictBaseModel):
    """Captured reasoning trace from a thinking-capable model."""

    steps: list[ThinkingStepSchema] = Field(
        default_factory=list, description="Reasoning steps in order"
    )
    model_id: str = Field(default="", description="Producing model identifier")
    total_tokens: int | None = Field(
        default=None, ge=0, description="Optional total tokens across steps"
    )
