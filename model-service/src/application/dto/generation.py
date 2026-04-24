"""DTOs for text generation configuration.

Domain-level view of generation parameters. Mirrors the infrastructure
GenerationConfig but lives in the application layer so use cases do not
depend on infrastructure.
"""

from __future__ import annotations

from dataclasses import dataclass


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
    """

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    stop_sequences: list[str] | None = None


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
