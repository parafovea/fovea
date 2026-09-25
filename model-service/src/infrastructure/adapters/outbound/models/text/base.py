"""Shared base types and offset helpers for text-tokenization loaders.

Extracted from ``loader.py`` so the offset math and the registry can be
imported without pulling in the spaCy / Stanza runtimes. The offset helpers
here are the single implementation of the dual-encoding contract every
tokenizer emits:

- UTF-8 byte offsets (authoritative, end-exclusive), and
- UTF-16 code-unit offsets (JavaScript-compatible), which diverge from Python
  code-point indices on any astral character.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.application.dto.tokenization import TokenDTO, TokenizationResultDTO
from src.application.ports.outbound.tokenizer import ITokenizer
from src.infrastructure.adapters.outbound.models.registry import LoaderRegistry

if TYPE_CHECKING:
    from src.domain.entities.architectures import TokenizerArchitecture

logger = logging.getLogger(__name__)

#: No-whitespace scripts that route to Stanza rather than a spaCy blank
#: pipeline. Chinese, Japanese, and Thai are not whitespace-delimited, so a
#: whitespace tokenizer would collapse a whole sentence into one token.
STANZA_LANGUAGES: frozenset[str] = frozenset({"zh", "ja", "th"})

#: spaCy's multilingual blank pipeline, used when a detected language has no
#: dedicated blank pipeline and is not a no-whitespace script.
MULTILINGUAL_FALLBACK: str = "xx"


@dataclass
class TokenizerConfig:
    """Framework-level configuration for a tokenizer loader.

    Parameters
    ----------
    model_id : str
        The configured model identifier (e.g. ``"spacy/blank:multi"``); carried
        for telemetry and admin display. Engine selection does not depend on it.
    device : str
        Compute device. Tokenization is CPU-only, so this is informational.
    stanza_resources_dir : str | None
        Directory holding the baked Stanza tokenize models. When ``None`` the
        loader reads ``STANZA_RESOURCES_DIR`` from the environment.
    """

    model_id: str
    device: str = "cpu"
    stanza_resources_dir: str | None = None


def utf16_units(text: str, index: int) -> int:
    """Return the UTF-16 code-unit offset of a Python code-point ``index``.

    Python ``str`` indexing counts code points; JavaScript counts UTF-16 code
    units. The two agree on the Basic Multilingual Plane and diverge by one per
    astral character (which occupies a surrogate pair, i.e. two code units).
    Encoding the prefix as UTF-16-LE and halving the byte length yields the
    JavaScript-compatible offset directly.
    """
    return len(text[:index].encode("utf-16-le")) // 2


def build_tokens(text: str, spans: list[tuple[int, int]]) -> list[TokenDTO]:
    """Build ``TokenDTO`` objects from code-point ``(start, end)`` spans.

    Parameters
    ----------
    text : str
        The source text the spans index into (by Python code point).
    spans : list[tuple[int, int]]
        Half-open ``(start, end)`` code-point spans, in reading order.

    Returns
    -------
    list[TokenDTO]
        One token per span, each carrying UTF-8 byte offsets and UTF-16
        code-unit offsets. The invariant
        ``text.encode('utf-8')[byte_start:byte_end].decode('utf-8') == token.text``
        holds for every token.
    """
    tokens: list[TokenDTO] = []
    encoded = text.encode("utf-8")
    for token_index, (cp_start, cp_end) in enumerate(spans):
        byte_start = len(text[:cp_start].encode("utf-8"))
        byte_end = len(text[:cp_end].encode("utf-8"))
        tokens.append(
            TokenDTO(
                token_index=token_index,
                text=encoded[byte_start:byte_end].decode("utf-8"),
                byte_start=byte_start,
                byte_end=byte_end,
                char_start=utf16_units(text, cp_start),
                char_end=utf16_units(text, cp_end),
            )
        )
    return tokens


def select_engine(language: str, spacy_supported: frozenset[str]) -> tuple[str, str, str]:
    """Pick the tokenization engine for a language.

    Routing is deterministic: no-whitespace scripts go to Stanza; a language
    with a dedicated spaCy blank goes to that blank; anything else falls back
    to spaCy's ``xx`` multilingual blank.

    Parameters
    ----------
    language : str
        The resolved ISO-639-1 language code (override or detected).
    spacy_supported : frozenset[str]
        Languages that have a dedicated spaCy blank pipeline.

    Returns
    -------
    tuple[str, str, str]
        ``(engine, effective_language, model_used)`` where ``engine`` is
        ``"stanza"`` or ``"spacy"``, ``effective_language`` is the code passed
        to that engine, and ``model_used`` is the reported engine identifier.
    """
    if language in STANZA_LANGUAGES:
        return ("stanza", language, f"stanza:{language}")
    if language in spacy_supported:
        return ("spacy", language, f"spacy/blank:{language}")
    return ("spacy", MULTILINGUAL_FALLBACK, f"spacy/blank:{MULTILINGUAL_FALLBACK}")


class TokenizerLoader(ITokenizer, ABC):
    """Abstract base for text-tokenization loaders.

    Subclasses register against their concrete
    :class:`TokenizerArchitecture` Pydantic subclass via
    ``@tokenizer_registry.register(ArchitectureClass)`` so the tokenizer
    factory dispatches by architecture. The architecture instance is the first
    positional argument to the constructor, matching the registry's
    ``create(architecture, *extras)`` contract.

    The base owns the shared tokenize flow: resolve the language (override or
    py3langid), route to the selected engine, and build offset-annotated
    tokens. Subclasses supply the spaCy-supported language set and decide what
    to pre-warm at boot.
    """

    def __init__(self, arch: TokenizerArchitecture, config: TokenizerConfig) -> None:
        """Initialize the loader with its architecture and framework config."""
        self.arch = arch
        self.config = config

    @property
    @abstractmethod
    def spacy_supported(self) -> frozenset[str]:
        """Languages this loader hands to a dedicated spaCy blank pipeline."""

    @abstractmethod
    def load(self) -> None:
        """Pre-warm the engines this loader is responsible for at boot."""

    @abstractmethod
    def _detect_language(self, text: str) -> tuple[str, float]:
        """Return ``(language_code, normalized_confidence)`` for ``text``."""

    @abstractmethod
    def _spacy_spans(self, text: str, language: str) -> list[tuple[int, int]]:
        """Tokenize with a spaCy blank pipeline; return code-point spans."""

    @abstractmethod
    def _stanza_spans(self, text: str, language: str) -> list[tuple[int, int]]:
        """Tokenize with a Stanza pipeline; return code-point spans."""

    def tokenize(self, text: str, language: str | None = None) -> TokenizationResultDTO:
        """Tokenize ``text`` and return offset-annotated tokens.

        A non-empty ``language`` override skips language identification and
        drives engine selection directly with confidence 1.0.
        """
        if not text:
            return TokenizationResultDTO(
                tokens=[],
                language=language or "und",
                language_confidence=1.0 if language else 0.0,
                tokenization_kind="custom",
                model_used=f"spacy/blank:{MULTILINGUAL_FALLBACK}",
            )

        if language:
            resolved, confidence = language, 1.0
        else:
            resolved, confidence = self._detect_language(text)

        engine, effective, model_used = select_engine(resolved, self.spacy_supported)
        spans = (
            self._stanza_spans(text, effective)
            if engine == "stanza"
            else self._spacy_spans(text, effective)
        )

        return TokenizationResultDTO(
            tokens=build_tokens(text, spans),
            language=resolved,
            language_confidence=confidence,
            tokenization_kind="custom",
            model_used=model_used,
        )

    def unload(self) -> None:
        """Drop cached engines. Tokenizers hold no GPU state."""
        logger.info("Tokenizer unloaded")


tokenizer_registry: LoaderRegistry[TokenizerArchitecture, TokenizerLoader] = LoaderRegistry(
    family="tokenizer"
)
"""Architecture-keyed registry of tokenizer loader classes.

Lives in ``base.py`` (not ``loader.py``) so that offset helpers and the
registry can be imported without the spaCy / Stanza runtimes.
"""
