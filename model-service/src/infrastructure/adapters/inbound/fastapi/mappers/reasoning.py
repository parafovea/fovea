"""Mappers between reasoning schemas and reasoning DTOs."""

from __future__ import annotations

from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.infrastructure.adapters.inbound.fastapi.schemas.reasoning import (
    ThinkingStepSchema,
    ThinkingTraceSchema,
)


def thinking_trace_dto_to_schema(dto: ThinkingTrace) -> ThinkingTraceSchema:
    """Convert a :class:`ThinkingTrace` DTO into its schema."""
    return ThinkingTraceSchema(
        steps=[
            ThinkingStepSchema(content=step.content, tokens_used=step.tokens_used)
            for step in dto.steps
        ],
        model_id=dto.model_id,
        total_tokens=dto.total_tokens,
    )


def thinking_trace_schema_to_dto(schema: ThinkingTraceSchema) -> ThinkingTrace:
    """Convert a :class:`ThinkingTraceSchema` into a DTO."""
    return ThinkingTrace(
        steps=[ThinkingStep(content=s.content, tokens_used=s.tokens_used) for s in schema.steps],
        model_id=schema.model_id,
        total_tokens=schema.total_tokens,
    )
