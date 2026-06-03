"""Shared base types for LLM loaders.

Extracted so the llama_cpp loader (and any other LLM backend) can import
``GenerationConfig`` / ``GenerationResult`` / ``LLMFramework`` / ``LLMConfig``
without creating a runtime cycle with the top-level loader factory in
``loader.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class LLMFramework(StrEnum):
    """Inference framework options for LLM models."""

    SGLANG = "sglang"
    TRANSFORMERS = "transformers"
    LLAMA_CPP = "llama_cpp"


@dataclass
class LLMConfig:
    """Configuration for a language model."""

    model_id: str
    quantization: str
    framework: LLMFramework
    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    context_length: int = 131072


@dataclass
class GenerationConfig:
    """Configuration for text generation.

    ``json_schema`` carries an optional JSON Schema to compile into a
    grammar-constrained decoder when the backend supports it. See
    :class:`GenerationConfigDTO` for the rationale and per-backend
    integration notes.
    """

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    stop_sequences: list[str] | None = None
    json_schema: dict[str, Any] | None = None


@dataclass
class GenerationResult:
    """Result from text generation."""

    text: str
    tokens_used: int
    finish_reason: str
