"""DTOs for the text-tokenization use case.

Framework-neutral data transfer objects consumed by the application layer.
They avoid any dependency on FastAPI, Pydantic web schemas, or the tokenizer
runtimes (spaCy, Stanza, py3langid).

Offset semantics are the load-bearing contract here. Every token carries two
independent offset pairs into the source ``text``:

- ``byte_start`` / ``byte_end`` are UTF-8 byte offsets, end-exclusive, and are
  authoritative. ``text.encode('utf-8')[byte_start:byte_end].decode('utf-8')``
  reconstructs the token text exactly.
- ``char_start`` / ``char_end`` are UTF-16 code-unit offsets (JavaScript's
  string indexing), NOT Python code points. They diverge from Python ``str``
  indices on any astral character (emoji, flags, some CJK extensions), so the
  loader computes them explicitly rather than reusing a code-point index.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TokenDTO:
    """One token with dual offset encodings into the source text.

    Parameters
    ----------
    token_index : int
        Zero-based position of the token in the emitted sequence.
    text : str
        The token's surface text.
    byte_start : int
        UTF-8 byte offset of the token start (inclusive, authoritative).
    byte_end : int
        UTF-8 byte offset of the token end (exclusive, authoritative).
    char_start : int
        UTF-16 code-unit offset of the token start (JavaScript-compatible).
    char_end : int
        UTF-16 code-unit offset of the token end (JavaScript-compatible).
    """

    token_index: int
    text: str
    byte_start: int
    byte_end: int
    char_start: int
    char_end: int


@dataclass
class TokenizationResultDTO:
    """Result of tokenizing one text.

    Parameters
    ----------
    tokens : list[TokenDTO]
        The emitted tokens in reading order.
    language : str
        The language used to tokenize: the caller's override when supplied,
        otherwise the code py3langid detected.
    language_confidence : float
        Normalized detection probability in [0.0, 1.0]. Set to 1.0 when the
        caller supplied a language override (langid is skipped).
    tokenization_kind : str
        The tokenization granularity label (``"custom"`` for the spaCy /
        Stanza engines, which produce linguistically-aware tokens).
    model_used : str
        The engine identifier, e.g. ``"spacy/blank:en"``, ``"spacy/blank:xx"``,
        or ``"stanza:zh"``.
    """

    tokens: list[TokenDTO] = field(default_factory=list)
    language: str = ""
    language_confidence: float = 0.0
    tokenization_kind: str = "custom"
    model_used: str = ""


@dataclass
class TokenizeRequest:
    """Request to tokenize one text.

    Parameters
    ----------
    text : str
        The text to tokenize.
    language : str | None
        Optional ISO-639-1 language override. When supplied, language
        identification is skipped and this code drives engine selection.
    """

    text: str
    language: str | None = None
