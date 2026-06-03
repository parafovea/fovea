"""DTOs for text generation configuration.

Domain-level view of generation parameters. Mirrors the infrastructure
GenerationConfig but lives in the application layer so use cases do not
depend on infrastructure.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class GenerationConfigDTO:
    """Parameters controlling text generation.

    Parameters
    ----------
    max_tokens : int
        Maximum tokens to generate.
    temperature : float
        Sampling temperature.
    top_p : float
        Nucleus sampling parameter.
    stop_sequences : list[str] | None
        Sequences that halt generation.
    json_schema : dict[str, Any] | None
        Optional JSON Schema (draft-07-compatible). When set, adapters
        that support grammar-constrained decoding (llama-cpp-python via
        GBNF, vLLM via guided_json, sglang via regex/JSON guidance,
        transformers via the ``outlines`` integration) compile this
        schema into a constrained-decoding grammar so the model is
        physically prevented from emitting invalid JSON. This is the
        right tool for any structured-output use case (claim
        extraction, ontology augmentation, synthesis) — small models
        in particular cannot be trusted to free-form-emit valid JSON,
        and prompt-engineering around the failure mode is strictly
        worse than constraining the decoder. Adapters that don't
        support grammar-constrained decoding ignore this field and
        the use case falls back to lenient parsing of the raw output.
    """

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    stop_sequences: list[str] | None = None
    json_schema: dict[str, Any] | None = None


@dataclass
class GenerationResultDTO:
    """Result from text generation.

    Parameters
    ----------
    text : str
        Generated text.
    tokens_used : int
        Number of tokens used.
    finish_reason : str
        Reason generation stopped.
    """

    text: str
    tokens_used: int = 0
    finish_reason: str = "stop"
